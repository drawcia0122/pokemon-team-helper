import type {
  PokemonNewsImageOrigin,
  PokemonNewsSourceId
} from "../../types/pokemonContent";

export const RSS_IMAGE_FIELD_KEYS = [
  "media:content",
  "media:thumbnail",
  "enclosure",
  "content:encoded-img",
  "description-img",
  "image",
  "thumbnail"
] as const;

export type RssImageFieldKey = (typeof RSS_IMAGE_FIELD_KEYS)[number];

export type RssImageAudit = {
  feedUrl: string;
  detected: Record<RssImageFieldKey, number>;
  validCandidateCount: number;
  adoptedCount: number;
  smallImageExcludedCount: number;
  faviconExcludedCount: number;
  logoExcludedCount: number;
  advertisingOrTrackingExcludedCount: number;
  placeholderExcludedCount: number;
  invalidUrlCount: number;
};

export type ExtractedRssImage = {
  url: string;
  origin: Extract<
    PokemonNewsImageOrigin,
    | "rss-media-content"
    | "rss-media-thumbnail"
    | "rss-enclosure"
    | "rss-content-html"
    | "rss-description-html"
    | "rss-image-field"
  >;
  width?: number;
  height?: number;
  evidence: string[];
};

type ImageCandidate = Omit<ExtractedRssImage, "evidence"> & {
  priority: number;
  field: RssImageFieldKey;
};

type SourceAdapter = {
  homepageUrl: string;
  sourceLogoPatterns: RegExp[];
};

export const RSS_IMAGE_SOURCE_ADAPTERS: Record<
  Extract<PokemonNewsSourceId, "4gamer-rss" | "inside-rss">,
  SourceAdapter
> = {
  "4gamer-rss": {
    homepageUrl: "https://www.4gamer.net/",
    sourceLogoPatterns: [/4gamer[^/]*(?:logo|mark)|(?:logo|mark)[^/]*4gamer/i]
  },
  "inside-rss": {
    homepageUrl: "https://www.inside-games.jp/",
    sourceLogoPatterns: [/inside[^/]*(?:logo|mark)|(?:logo|mark)[^/]*inside/i]
  }
};

function emptyDetected(): Record<RssImageFieldKey, number> {
  return Object.fromEntries(RSS_IMAGE_FIELD_KEYS.map((key) => [key, 0])) as Record<
    RssImageFieldKey,
    number
  >;
}

export function createEmptyRssImageAudit(feedUrl: string): RssImageAudit {
  return {
    feedUrl,
    detected: emptyDetected(),
    validCandidateCount: 0,
    adoptedCount: 0,
    smallImageExcludedCount: 0,
    faviconExcludedCount: 0,
    logoExcludedCount: 0,
    advertisingOrTrackingExcludedCount: 0,
    placeholderExcludedCount: 0,
    invalidUrlCount: 0
  };
}

export function mergeRssImageAudit(target: RssImageAudit, source: RssImageAudit): void {
  for (const key of RSS_IMAGE_FIELD_KEYS) target.detected[key] += source.detected[key];
  target.validCandidateCount += source.validCandidateCount;
  target.adoptedCount += source.adoptedCount;
  target.smallImageExcludedCount += source.smallImageExcludedCount;
  target.faviconExcludedCount += source.faviconExcludedCount;
  target.logoExcludedCount += source.logoExcludedCount;
  target.advertisingOrTrackingExcludedCount += source.advertisingOrTrackingExcludedCount;
  target.placeholderExcludedCount += source.placeholderExcludedCount;
  target.invalidUrlCount += source.invalidUrlCount;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([a-f0-9]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function attribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(":", "\\:");
  const match = tag.match(
    new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i")
  );
  return match ? decodeHtmlEntities(match[1] ?? match[2] ?? "").trim() : undefined;
}

function numericAttribute(tag: string, name: string): number | undefined {
  const value = attribute(tag, name);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function openingTags(xml: string, tag: string): string[] {
  const escaped = tag.replace(":", "\\:");
  return [...xml.matchAll(new RegExp(`<${escaped}\\b[^>]*>`, "gi"))].map(
    (match) => match[0]
  );
}

function rawTagValues(xml: string, tag: string): string[] {
  const escaped = tag.replace(":", "\\:");
  return [...xml.matchAll(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi")
  )].map((match) => decodeHtmlEntities(match[1] ?? ""));
}

function normalizeImageUrl(value: string, baseUrl: string): string | null {
  const decoded = decodeHtmlEntities(value).trim().replace(/^['"]|['"]$/g, "");
  if (!decoded || /^data:/i.test(decoded)) return null;
  try {
    const url = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.protocol = "https:";
    url.hostname = url.hostname.toLocaleLowerCase("en");
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function imageIdentity(value: string): string {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:w|width|h|height|size|resize|quality|q)$/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.pathname = url.pathname.replace(/[-_](?:\d{2,4})x(?:\d{2,4})(?=\.[a-z]{2,5}$)/i, "");
  return url.toString();
}

function srcsetCandidate(value: string): { value: string; score: number } | undefined {
  return value
    .split(/\s*,\s*/)
    .map((part) => {
      const match = part.trim().match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)(w|x))?$/i);
      if (!match) return null;
      const magnitude = Number(match[2] ?? "1");
      return { value: match[1], score: match[3]?.toLocaleLowerCase("en") === "x" ? magnitude * 10_000 : magnitude };
    })
    .filter((candidate): candidate is { value: string; score: number } => Boolean(candidate))
    .sort((left, right) => right.score - left.score)[0];
}

function addHtmlImages(
  html: string,
  input: {
    field: Extract<RssImageFieldKey, "content:encoded-img" | "description-img">;
    origin: Extract<PokemonNewsImageOrigin, "rss-content-html" | "rss-description-html">;
    priority: number;
    baseUrl: string;
    candidates: ImageCandidate[];
    audit: RssImageAudit;
  }
): void {
  const decoded = decodeHtmlEntities(html);
  for (const imageTag of [...decoded.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0])) {
    input.audit.detected[input.field] += 1;
    const srcset = attribute(imageTag, "srcset");
    const selected = srcset ? srcsetCandidate(srcset)?.value : undefined;
    const rawUrl =
      selected ??
      attribute(imageTag, "data-original") ??
      attribute(imageTag, "data-src") ??
      attribute(imageTag, "src");
    if (!rawUrl) {
      input.audit.invalidUrlCount += 1;
      continue;
    }
    const url = normalizeImageUrl(rawUrl, input.baseUrl);
    if (!url) {
      input.audit.invalidUrlCount += 1;
      continue;
    }
    input.candidates.push({
      url,
      origin: input.origin,
      width: numericAttribute(imageTag, "width"),
      height: numericAttribute(imageTag, "height"),
      priority: input.priority,
      field: input.field
    });
  }
}

function rejectionReason(
  candidate: ImageCandidate,
  adapter: SourceAdapter
): "small" | "favicon" | "logo" | "tracking" | "placeholder" | null {
  const url = new URL(candidate.url);
  const text = `${url.hostname}${url.pathname}${url.search}`;
  if (/favicon|apple-touch-icon|(?:^|[\/_\.-])icon(?:[\/_\.-]|$)/i.test(text)) return "favicon";
  if (
    /(?:^|[\/_\.-])(?:site-?|header-?|brand-?)logo(?:[\/_\.-]|$)|logo\.(?:png|jpe?g|gif|webp|svg)(?:\?|$)/i.test(text) ||
    adapter.sourceLogoPatterns.some((pattern) => pattern.test(text))
  ) return "logo";
  if (/(?:^|[\/_\.-])(?:ads?|advert(?:isement)?|tracking|pixel|spacer|sns|social)(?:[\/_\.-]|$)|(?:doubleclick|googlesyndication)/i.test(text)) {
    return "tracking";
  }
  if (/(?:^|[\/_\.-])(?:transparent|blank|no-?image|placeholder|dummy)(?:[\/_\.-]|$)/i.test(text)) {
    return "placeholder";
  }
  if (candidate.width !== undefined && candidate.width < 200) return "small";
  if (candidate.height !== undefined && candidate.height < 120) return "small";
  return null;
}

function addDirectTagCandidates(
  xml: string,
  input: {
    tag: "media:content" | "media:thumbnail" | "enclosure";
    field: Extract<RssImageFieldKey, "media:content" | "media:thumbnail" | "enclosure">;
    origin: Extract<PokemonNewsImageOrigin, "rss-media-content" | "rss-media-thumbnail" | "rss-enclosure">;
    priority: number;
    baseUrl: string;
    candidates: ImageCandidate[];
    audit: RssImageAudit;
  }
): void {
  for (const tag of openingTags(xml, input.tag)) {
    if (input.tag === "enclosure") {
      const mime = attribute(tag, "type");
      if (!mime || !/^image\//i.test(mime)) continue;
    }
    if (input.tag === "media:content") {
      const mime = attribute(tag, "type");
      const medium = attribute(tag, "medium");
      if ((mime && !/^image\//i.test(mime)) || (medium && medium !== "image")) continue;
    }
    input.audit.detected[input.field] += 1;
    const rawUrl = attribute(tag, "url") ?? attribute(tag, "href") ?? attribute(tag, "src");
    const url = rawUrl ? normalizeImageUrl(rawUrl, input.baseUrl) : null;
    if (!url) {
      input.audit.invalidUrlCount += 1;
      continue;
    }
    input.candidates.push({
      url,
      origin: input.origin,
      width: numericAttribute(tag, "width"),
      height: numericAttribute(tag, "height"),
      priority: input.priority,
      field: input.field
    });
  }
}

function addImageFields(
  xml: string,
  baseUrl: string,
  candidates: ImageCandidate[],
  audit: RssImageAudit
): void {
  for (const field of ["image", "thumbnail"] as const) {
    const tags = openingTags(xml, field);
    const values = rawTagValues(xml, field);
    audit.detected[field] += Math.max(tags.length, values.length);
    for (const [index, tag] of tags.entries()) {
      const value = values[index] ?? "";
      const nestedUrl = rawTagValues(value, "url")[0];
      const rawUrl = attribute(tag, "url") ?? attribute(tag, "href") ?? attribute(tag, "src") ?? nestedUrl ?? value;
      const url = rawUrl ? normalizeImageUrl(rawUrl, baseUrl) : null;
      if (!url) {
        audit.invalidUrlCount += 1;
        continue;
      }
      candidates.push({ url, origin: "rss-image-field", priority: 7, field });
    }
  }
}

export function extractRssImage(
  itemXml: string,
  options: {
    sourceId: Extract<PokemonNewsSourceId, "4gamer-rss" | "inside-rss">;
    feedUrl: string;
  }
): { image?: ExtractedRssImage; audit: RssImageAudit } {
  const adapter = RSS_IMAGE_SOURCE_ADAPTERS[options.sourceId];
  const baseUrl = options.feedUrl || adapter.homepageUrl;
  const audit = createEmptyRssImageAudit(options.feedUrl);
  const candidates: ImageCandidate[] = [];
  addDirectTagCandidates(itemXml, { tag: "media:content", field: "media:content", origin: "rss-media-content", priority: 1, baseUrl, candidates, audit });
  addDirectTagCandidates(itemXml, { tag: "media:thumbnail", field: "media:thumbnail", origin: "rss-media-thumbnail", priority: 2, baseUrl, candidates, audit });
  addDirectTagCandidates(itemXml, { tag: "enclosure", field: "enclosure", origin: "rss-enclosure", priority: 3, baseUrl, candidates, audit });
  for (const html of rawTagValues(itemXml, "content:encoded")) {
    addHtmlImages(html, { field: "content:encoded-img", origin: "rss-content-html", priority: 5, baseUrl, candidates, audit });
  }
  for (const tag of ["description", "summary"] as const) {
    for (const html of rawTagValues(itemXml, tag)) {
      addHtmlImages(html, { field: "description-img", origin: "rss-description-html", priority: 6, baseUrl, candidates, audit });
    }
  }
  addImageFields(itemXml, baseUrl, candidates, audit);

  const deduplicated = new Map<string, ImageCandidate>();
  for (const candidate of candidates.sort((left, right) => left.priority - right.priority)) {
    const identity = imageIdentity(candidate.url);
    if (!deduplicated.has(identity)) deduplicated.set(identity, candidate);
  }
  const evidence: string[] = [];
  for (const candidate of deduplicated.values()) {
    const rejection = rejectionReason(candidate, adapter);
    if (rejection) {
      if (rejection === "small") audit.smallImageExcludedCount += 1;
      if (rejection === "favicon") audit.faviconExcludedCount += 1;
      if (rejection === "logo") audit.logoExcludedCount += 1;
      if (rejection === "tracking") audit.advertisingOrTrackingExcludedCount += 1;
      if (rejection === "placeholder") audit.placeholderExcludedCount += 1;
      evidence.push(`rejected:${candidate.origin}:${rejection}`);
      continue;
    }
    audit.validCandidateCount += 1;
    audit.adoptedCount += 1;
    evidence.push(`selected:${candidate.origin}`);
    return {
      image: {
        url: candidate.url,
        origin: candidate.origin,
        width: candidate.width,
        height: candidate.height,
        evidence
      },
      audit
    };
  }
  return { audit };
}
