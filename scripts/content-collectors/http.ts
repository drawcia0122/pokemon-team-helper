import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type {
  ContentFetchClient,
  ContentSourceConfig,
  HttpResult
} from "./types";

const USER_AGENT =
  "PokemonTeamHelperContentCollector/1.0 (non-commercial RSS metadata collector)";

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 0) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) ||
    (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
    parts[0] >= 224
  );
}

export function isPrivateContentIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;
  const normalized = address.toLocaleLowerCase("en");
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return (
    (mapped ? isPrivateIpv4(mapped) : false) ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8")
  );
}

export function assertAllowedContentUrl(
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

async function ensurePublicHost(hostname: string): Promise<void> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some((entry) => isPrivateContentIp(entry.address))
  ) {
    throw new Error("blocked-private-address");
  }
}

async function readLimitedBody(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error("response-too-large");
  if (!response.body) return "";
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

function retryable(result: HttpResult): boolean {
  return (
    !result.ok &&
    !result.permanent &&
    (result.status === null ||
      result.status === 408 ||
      result.status === 429 ||
      (result.status >= 500 && result.status <= 599))
  );
}

export class SafeContentHttpClient implements ContentFetchClient {
  private lastRequestAt = 0;

  constructor(
    private readonly config: ContentSourceConfig,
    private readonly dependencies: {
      fetchImpl?: typeof fetch;
      sleep?: (milliseconds: number) => Promise<void>;
      ensurePublicHost?: (hostname: string) => Promise<void>;
    } = {}
  ) {}

  private async throttle() {
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
    expected: "xml" | "text"
  ): Promise<HttpResult> {
    let url: URL;
    try {
      url = assertAllowedContentUrl(value, this.config.allowedDomains);
      await (this.dependencies.ensurePublicHost ?? ensurePublicHost)(url.hostname);
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
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          redirect: "manual",
          signal: controller.signal,
          headers: {
            accept:
              expected === "xml"
                ? "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.1"
                : "text/plain,*/*;q=0.1",
            "user-agent": USER_AGENT
          }
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

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        try {
          url = assertAllowedContentUrl(
            new URL(location, url).toString(),
            this.config.allowedDomains
          );
          await (this.dependencies.ensurePublicHost ?? ensurePublicHost)(url.hostname);
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
      const allowed =
        expected === "xml"
          ? contentType.includes("application/rss+xml") ||
            contentType.includes("application/xml") ||
            contentType.includes("text/xml")
          : contentType.includes("text/plain");
      if (!allowed) {
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
          text: await readLimitedBody(response, this.config.maxResponseBytes)
        };
      } catch (error) {
        return {
          ok: false,
          url: url.toString(),
          status: response.status,
          reason: error instanceof Error ? error.message : "response-read-failed",
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

  async fetchText(value: string, expected: "xml" | "text") {
    let last: HttpResult | null = null;
    for (let attempt = 0; attempt <= this.config.retries; attempt += 1) {
      const result = await this.fetchOnce(value, expected);
      if (!retryable(result)) return result;
      last = result;
    }
    return (
      last ?? {
        ok: false as const,
        url: value,
        status: null,
        reason: "request-failed",
        permanent: false
      }
    );
  }
}

export function isContentPathAllowedByRobots(
  robotsText: string,
  targetUrl: string
): boolean {
  const path = new URL(targetUrl).pathname;
  const lines = robotsText
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  let applies = false;
  const rules: Array<{ allow: boolean; path: string }> = [];
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase("en");
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      applies = value === "*";
      continue;
    }
    if (applies && (key === "allow" || key === "disallow") && value) {
      rules.push({ allow: key === "allow", path: value });
    }
  }
  const matches = rules
    .filter((rule) => path.startsWith(rule.path))
    .sort((a, b) => b.path.length - a.path.length);
  return matches[0]?.allow ?? true;
}
