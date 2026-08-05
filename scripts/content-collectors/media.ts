import { createHash } from "node:crypto";
import type { PokemonEntry } from "../../types/pokemon";
import type {
  ContentKind,
  GeneratedPokemonContentItem,
  PokemonContentSource,
  PokemonNewsContentType,
  PokemonNewsSourceId
} from "../../types/pokemonContent";
import {
  classifyPokemonNews,
  extractReliablePokemonNewsDates,
  inferPokemonNewsContentType,
  inferPokemonNewsImportance,
  scorePokemonNewsRelevance
} from "../../lib/pokemonNews";
import {
  GNEWS_SEARCH_QUERIES,
  POKEMON_NEWS_COLLECTION_WINDOW_DAYS
} from "../../lib/pokemonNewsSearchConfig";
import { POKEMON_NEWS_SOURCE_REGISTRY } from "../../lib/pokemonNewsSources";
import { CONTENT_COLLECTOR_VERSION } from "./types";
import { contentFingerprint, exactPokemonSlugs } from "./pokemonGo";

export type MediaFeedCandidate = {
  sourceArticleId: string;
  canonicalUrl: string;
  title: string;
  summary: string;
  publishedAt: string;
  imageUrl?: string;
  sourceName: string;
  sourceId: Extract<PokemonNewsSourceId, "4gamer-rss" | "inside-rss" | "gnews-api">;
  matchedQuery?: string;
  relevanceScore: number;
  relevanceEvidence: string[];
  contentType: PokemonNewsContentType;
};

type ParseFeedOptions = {
  sourceId: "4gamer-rss" | "inside-rss";
  sourceName: string;
  allowedHosts: string[];
  now: Date;
  limit: number;
};

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .trim();
}

function textValue(value: string): string {
  return decodeXml(value)
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(xml: string, tag: string): string | null {
  const escaped = tag.replace(":", "\\:");
  const match = xml.match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i")
  );
  return match ? textValue(match[1]) : null;
}

function attributeValue(xml: string, tag: string, attribute: string): string | null {
  const escaped = tag.replace(":", "\\:");
  const match = xml.match(
    new RegExp(`<${escaped}\\b[^>]*\\b${attribute}=["']([^"']+)["'][^>]*>`, "i")
  );
  return match ? decodeXml(match[1]) : null;
}

function canonicalizeMediaUrl(value: string, allowedHosts: string[]): string {
  const url = new URL(value);
  const host = url.hostname.toLocaleLowerCase("en");
  if (url.protocol !== "https:" || !allowedHosts.includes(host)) {
    throw new Error("invalid-article-url");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLocaleLowerCase("en").startsWith("utm_")) url.searchParams.delete(key);
  }
  return url.toString().replace(/\/$/, "");
}

function candidateId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 20);
}

function publishedDay(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function withinCollectionWindow(value: string, now: Date): boolean {
  const age = (now.getTime() - new Date(`${value}T00:00:00Z`).getTime()) / 86_400_000;
  return age >= -1 && age <= POKEMON_NEWS_COLLECTION_WINDOW_DAYS;
}

function feedImage(xml: string): string | undefined {
  const candidate =
    attributeValue(xml, "media:content", "url") ??
    attributeValue(xml, "media:thumbnail", "url") ??
    attributeValue(xml, "enclosure", "url");
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseMediaRss(
  xml: string,
  options: ParseFeedOptions
): { candidates: MediaFeedCandidate[]; excludedReasons: string[]; rawCount: number } {
  if (!/<(?:rss|rdf:RDF)\b/i.test(xml)) throw new Error("invalid-rss");
  const entries = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  const candidates: MediaFeedCandidate[] = [];
  const excludedReasons: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries.slice(0, Math.max(0, options.limit))) {
    const itemXml = entry[1];
    const title = tagValue(itemXml, "title");
    const link = tagValue(itemXml, "link") ?? attributeValue(entry[0], "item", "rdf:about");
    const dateValue = tagValue(itemXml, "dc:date") ?? tagValue(itemXml, "pubDate");
    if (!title || !link || !dateValue) {
      excludedReasons.push("missing-required-feed-field");
      continue;
    }
    const publishedAt = publishedDay(dateValue);
    if (!publishedAt) {
      excludedReasons.push("invalid-published-date");
      continue;
    }
    if (!withinCollectionWindow(publishedAt, options.now)) {
      excludedReasons.push("outside-collection-window");
      continue;
    }
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeMediaUrl(link, options.allowedHosts);
    } catch {
      excludedReasons.push("invalid-article-url");
      continue;
    }
    if (seen.has(canonicalUrl)) {
      excludedReasons.push("duplicate-feed-url");
      continue;
    }
    seen.add(canonicalUrl);
    const description = tagValue(itemXml, "description") ?? "";
    const draft = {
      id: "relevance-draft",
      kind: "news" as const,
      title,
      summary: description,
      sourceName: options.sourceName,
      sourceKind: "media" as const,
      url: canonicalUrl,
      publishedAt,
      pokemonSlugs: [],
      tags: []
    };
    const relevance = scorePokemonNewsRelevance(draft);
    if (!relevance.relevant) {
      excludedReasons.push("pokemon-relevance-below-threshold");
      continue;
    }
    candidates.push({
      sourceArticleId: candidateId(canonicalUrl),
      canonicalUrl,
      title: title.slice(0, 200),
      summary: description.slice(0, 160),
      publishedAt,
      imageUrl: feedImage(itemXml),
      sourceName: options.sourceName,
      sourceId: options.sourceId,
      relevanceScore: relevance.score,
      relevanceEvidence: relevance.evidence,
      contentType: inferPokemonNewsContentType(title, description)
    });
  }
  return { candidates, excludedReasons, rawCount: entries.length };
}

type GNewsArticle = {
  title?: unknown;
  description?: unknown;
  url?: unknown;
  image?: unknown;
  publishedAt?: unknown;
  source?: { name?: unknown; url?: unknown };
};

export function parseGNewsResponse(
  json: string,
  matchedQuery: string,
  now: Date
): { candidates: MediaFeedCandidate[]; excludedReasons: string[]; rawCount: number } {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("invalid-json");
  }
  const articles = (value as { articles?: unknown }).articles;
  if (!Array.isArray(articles)) throw new Error("invalid-gnews-response");
  const candidates: MediaFeedCandidate[] = [];
  const excludedReasons: string[] = [];
  for (const article of articles as GNewsArticle[]) {
    if (
      typeof article.title !== "string" ||
      typeof article.description !== "string" ||
      typeof article.url !== "string" ||
      typeof article.publishedAt !== "string"
    ) {
      excludedReasons.push("missing-required-api-field");
      continue;
    }
    const publishedAt = publishedDay(article.publishedAt);
    if (!publishedAt || !withinCollectionWindow(publishedAt, now)) {
      excludedReasons.push(publishedAt ? "outside-collection-window" : "invalid-published-date");
      continue;
    }
    let canonicalUrl: string;
    try {
      const url = new URL(article.url);
      if (url.protocol !== "https:") throw new Error("invalid-url");
      url.hash = "";
      canonicalUrl = url.toString();
    } catch {
      excludedReasons.push("invalid-article-url");
      continue;
    }
    const sourceName =
      typeof article.source?.name === "string" && article.source.name.trim()
        ? article.source.name.trim()
        : "GNews掲載メディア";
    const draft = {
      id: "relevance-draft",
      kind: "news" as const,
      title: article.title,
      summary: article.description,
      sourceName,
      sourceKind: "media" as const,
      url: canonicalUrl,
      publishedAt,
      pokemonSlugs: [],
      tags: []
    };
    const relevance = scorePokemonNewsRelevance(draft, { matchedQuery });
    if (!relevance.relevant) {
      excludedReasons.push("pokemon-relevance-below-threshold");
      continue;
    }
    candidates.push({
      sourceArticleId: candidateId(canonicalUrl),
      canonicalUrl,
      title: article.title.slice(0, 200),
      summary: textValue(article.description).slice(0, 160),
      publishedAt,
      sourceName,
      sourceId: "gnews-api",
      matchedQuery,
      relevanceScore: relevance.score,
      relevanceEvidence: relevance.evidence,
      contentType: inferPokemonNewsContentType(article.title, article.description)
    });
  }
  return { candidates, excludedReasons, rawCount: articles.length };
}

export function buildGNewsSearchUrls(apiKey: string | undefined, now: Date): string[] {
  if (!apiKey?.trim()) return [];
  const from = new Date(now.getTime() - POKEMON_NEWS_COLLECTION_WINDOW_DAYS * 86_400_000).toISOString();
  return GNEWS_SEARCH_QUERIES.map((query) => {
    const url = new URL("https://gnews.io/api/v4/search");
    url.searchParams.set("q", query);
    url.searchParams.set("lang", "ja");
    url.searchParams.set("country", "jp");
    url.searchParams.set("sortby", "publishedAt");
    url.searchParams.set("in", "title,description");
    url.searchParams.set("from", from);
    url.searchParams.set("max", "100");
    url.searchParams.set("apikey", apiKey.trim());
    return url.toString();
  });
}

export function isGNewsProductionPlanAllowed(plan: string | undefined): boolean {
  return /^(?:essential|business|enterprise|custom)$/i.test(plan?.trim() ?? "");
}

function kindFor(categories: string[]): ContentKind {
  if (categories.includes("goods")) return "goods";
  if (categories.includes("event") || categories.includes("competition")) return "event";
  if (categories.includes("collaboration")) return "campaign";
  return "news";
}

export function createMediaContentItem(input: {
  candidate: MediaFeedCandidate;
  pokemon: PokemonEntry[];
  nowIso: string;
  existing?: GeneratedPokemonContentItem;
}): { item: GeneratedPokemonContentItem; change: "new" | "updated" | "unchanged" } {
  const source = POKEMON_NEWS_SOURCE_REGISTRY[input.candidate.sourceId];
  const fallbackSummary = `${source.name}の公開${source.sourceType === "rss" ? "RSS" : "API"}に掲載された記事です。続きは元記事でご確認ください。`;
  const summary = input.candidate.summary || fallbackSummary;
  const draft = {
    id: input.existing?.id ?? `${input.candidate.sourceId}-${input.candidate.sourceArticleId}`,
    kind: "news" as ContentKind,
    title: input.candidate.title,
    summary: summary.slice(0, 160),
    sourceName: input.candidate.sourceName,
    sourceId: input.candidate.sourceId,
    sourceKind: "media" as const,
    contentType: input.candidate.contentType,
    relevanceScore: input.candidate.relevanceScore,
    url: input.candidate.canonicalUrl,
    publishedAt: input.candidate.publishedAt,
    pokemonSlugs: exactPokemonSlugs(input.candidate.title, input.pokemon),
    tags: [source.name],
    official: false,
    ...(input.candidate.imageUrl ? { imageUrl: input.candidate.imageUrl } : {}),
    ...extractReliablePokemonNewsDates(input.candidate.title, summary)
  };
  const classification = classifyPokemonNews(draft);
  const base = {
    ...draft,
    kind: kindFor(classification.categories),
    categories: classification.categories,
    gameTitles: classification.gameTitles,
    importance: Math.min(
      input.candidate.contentType === "editorial" ? 65 : 100,
      inferPokemonNewsImportance(draft, classification.categories)
    )
  };
  const fingerprint = contentFingerprint(base);
  if (input.existing?.contentFingerprint === fingerprint) {
    return { item: input.existing, change: "unchanged" };
  }
  return {
    item: {
      ...base,
      source: input.candidate.sourceId as PokemonContentSource,
      sourceArticleId: input.candidate.sourceArticleId,
      canonicalUrl: input.candidate.canonicalUrl,
      firstCollectedAt: input.existing?.firstCollectedAt ?? input.nowIso,
      lastCollectedAt: input.nowIso,
      contentFingerprint: fingerprint,
      collectorVersion: CONTENT_COLLECTOR_VERSION,
      status: "active"
    },
    change: input.existing ? "updated" : "new"
  };
}
