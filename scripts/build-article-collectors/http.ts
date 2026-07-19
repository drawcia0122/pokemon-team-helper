import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type {
  FetchExpectedContent,
  FetchRequestOptions,
  FetchResult,
  SourceConfig
} from "./types";

const USER_AGENT =
  "PokemonTeamNotesBuildCollector/1.0 (non-commercial metadata collector)";

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some(
      (part) => !Number.isInteger(part) || part < 0 || part > 255
    )
  ) {
    return true;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 192 && parts[1] === 0) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) ||
    (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
    parts[0] >= 224
  );
}

export function isPrivateIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;

  const normalized = address.toLocaleLowerCase("en");
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return (
    (mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false) ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("2001:db8")
  );
}

export function assertAllowedUrl(
  value: string,
  allowedDomains: string[]
): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLocaleLowerCase("en");
  if (
    url.protocol !== "https:" ||
    !allowedDomains.includes(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isIP(hostname) !== 0
  ) {
    throw new Error("blocked-url");
  }
  return url;
}

async function ensurePublicDns(hostname: string): Promise<void> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isPrivateIpAddress(entry.address))
  ) {
    throw new Error("blocked-private-address");
  }
}

async function readLimitedBody(
  response: Response,
  maxBytes: number
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) {
    throw new Error("response-too-large");
  }
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("response-too-large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function shouldRetry(status: number | null): boolean {
  return (
    status === null ||
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}

export class SafeHttpClient {
  private lastRequestAt = 0;

  constructor(
    private readonly config: SourceConfig,
    private readonly dependencies: {
      fetchImpl?: typeof fetch;
      sleep?: (milliseconds: number) => Promise<void>;
      ensurePublicHost?: (hostname: string) => Promise<void>;
    } = {}
  ) {}

  private async throttle(): Promise<void> {
    const wait = Math.max(
      0,
      this.config.requestDelayMs - (Date.now() - this.lastRequestAt)
    );
    if (wait > 0) {
      await (this.dependencies.sleep ??
        ((milliseconds) =>
          new Promise((resolve) => setTimeout(resolve, milliseconds))))(wait);
    }
    this.lastRequestAt = Date.now();
  }

  private async fetchOnce(
    value: string,
    expected: FetchExpectedContent,
    options: FetchRequestOptions = {}
  ): Promise<FetchResult> {
    let url: URL;
    try {
      url = assertAllowedUrl(value, this.config.allowedDomains);
      await (this.dependencies.ensurePublicHost ?? ensurePublicDns)(
        url.hostname
      );
    } catch (error) {
      return {
        ok: false,
        url: value,
        status: null,
        reason: error instanceof Error ? error.message : "blocked-url",
        permanent: true
      };
    }

    const fetchImpl = this.dependencies.fetchImpl ?? fetch;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      await this.throttle();
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs
      );

      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: {
            accept:
              expected === "html"
                ? "text/html,application/xhtml+xml"
                : expected === "xml"
                  ? "application/atom+xml,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.1"
                  : "text/plain,*/*;q=0.1",
            "user-agent": USER_AGENT,
            ...options.headers
          },
          redirect: "manual",
          signal: controller.signal
        });
      } catch (error) {
        clearTimeout(timeout);
        return {
          ok: false,
          url: url.toString(),
          status: null,
          reason:
            error instanceof Error && error.name === "AbortError"
              ? "request-timeout"
              : "network-error",
          permanent: false
        };
      }
      clearTimeout(timeout);

      if (response.status === 304 && options.allowNotModified) {
        return {
          ok: true,
          url: url.toString(),
          status: response.status,
          contentType:
            response.headers.get("content-type")?.toLocaleLowerCase("en") ??
            "",
          text: "",
          headers: {
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified")
          },
          notModified: true
        };
      }

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get("location")
      ) {
        try {
          url = assertAllowedUrl(
            new URL(response.headers.get("location")!, url).toString(),
            this.config.allowedDomains
          );
          await (this.dependencies.ensurePublicHost ?? ensurePublicDns)(
            url.hostname
          );
          continue;
        } catch {
          return {
            ok: false,
            url: url.toString(),
            status: response.status,
            reason: "blocked-redirect",
            permanent: true
          };
        }
      }

      if (!response.ok) {
        return {
          ok: false,
          url: url.toString(),
          status: response.status,
          reason: `http-${response.status}`,
          permanent: response.status === 404 || response.status === 410
        };
      }

      const contentType = response.headers
        .get("content-type")
        ?.toLocaleLowerCase("en") ?? "";
      const contentTypeAllowed =
        expected === "html"
          ? contentType.includes("text/html") ||
            contentType.includes("application/xhtml+xml")
          : expected === "xml"
            ? contentType.includes("application/atom+xml") ||
              contentType.includes("application/rss+xml") ||
              contentType.includes("application/xml") ||
              contentType.includes("text/xml")
            : contentType.includes("text/plain");
      if (!contentTypeAllowed) {
        return {
          ok: false,
          url: url.toString(),
          status: response.status,
          reason: "unsupported-content-type",
          permanent: true
        };
      }

      try {
        return {
          ok: true,
          url: url.toString(),
          status: response.status,
          contentType,
          text: await readLimitedBody(
            response,
            this.config.maxResponseBytes
          ),
          headers: {
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified")
          },
          notModified: false
        };
      } catch (error) {
        return {
          ok: false,
          url: url.toString(),
          status: response.status,
          reason:
            error instanceof Error ? error.message : "response-read-failed",
          permanent: true
        };
      }
    }

    return {
      ok: false,
      url: url.toString(),
      status: null,
      reason: "too-many-redirects",
      permanent: true
    };
  }

  async fetchText(
    value: string,
    expected: FetchExpectedContent,
    options: FetchRequestOptions = {}
  ): Promise<FetchResult> {
    let lastResult: FetchResult | null = null;
    for (let attempt = 0; attempt <= this.config.retries; attempt += 1) {
      const result = await this.fetchOnce(value, expected, options);
      if (result.ok || !shouldRetry(result.status) || result.permanent) {
        return result;
      }
      lastResult = result;
    }
    return (
      lastResult ?? {
        ok: false,
        url: value,
        status: null,
        reason: "request-failed",
        permanent: false
      }
    );
  }
}

type RobotsRule = {
  allow: boolean;
  path: string;
};

export function isAllowedByRobots(
  robotsText: string,
  targetUrl: string
): boolean {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let sawRule = false;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase("en");
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      current.agents.push(value.toLocaleLowerCase("en"));
    } else if ((key === "allow" || key === "disallow") && current) {
      sawRule = true;
      if (value) {
        current.rules.push({ allow: key === "allow", path: value });
      }
    }
  }

  const rules = groups
    .filter((group) => group.agents.includes("*"))
    .flatMap((group) => group.rules)
    .filter((rule) => new URL(targetUrl).pathname.startsWith(rule.path))
    .sort((a, b) => b.path.length - a.path.length);
  return rules[0]?.allow ?? true;
}
