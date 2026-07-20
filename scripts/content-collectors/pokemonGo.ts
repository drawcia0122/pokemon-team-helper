import { createHash } from "node:crypto";
import type { PokemonEntry } from "../../types/pokemon";
import type {
  ContentKind,
  GeneratedPokemonContentItem
} from "../../types/pokemonContent";
import { CONTENT_COLLECTOR_VERSION } from "./types";

export type PokemonGoFeedCandidate = {
  sourceArticleId: string;
  canonicalUrl: string;
  title: string;
  publishedAt: string;
};

function decodeXml(value: string): string {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

export function canonicalizePokemonGoUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("invalid-url");
  const host = url.hostname.toLocaleLowerCase("en");
  if (
    host !== "pokemongo.com" &&
    host !== "www.pokemongo.com" &&
    host !== "pokemongolive.com" &&
    host !== "www.pokemongolive.com"
  ) {
    throw new Error("invalid-url-host");
  }
  if (!/^\/post\/[^/]+\/?$/.test(url.pathname)) throw new Error("invalid-article-path");
  url.hostname = "pokemongo.com";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  const language = url.searchParams.get("hl");
  url.search = "";
  if (language) url.searchParams.set("hl", language);
  return url.toString();
}

export function parsePokemonGoRss(
  xml: string,
  limit: number
): { candidates: PokemonGoFeedCandidate[]; excludedReasons: string[] } {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml)) {
    throw new Error("invalid-rss");
  }
  const candidates: PokemonGoFeedCandidate[] = [];
  const excludedReasons: string[] = [];
  const seen = new Set<string>();
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  for (const match of items.slice(0, Math.max(0, limit))) {
    const title = tagValue(match[1], "title");
    const guid = tagValue(match[1], "guid") ?? tagValue(match[1], "link");
    const pubDate = tagValue(match[1], "pubDate");
    if (!title || !guid || !pubDate) {
      excludedReasons.push("missing-required-feed-field");
      continue;
    }
    const date = new Date(pubDate);
    if (Number.isNaN(date.getTime())) {
      excludedReasons.push("invalid-published-date");
      continue;
    }
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizePokemonGoUrl(guid);
    } catch {
      excludedReasons.push("invalid-article-url");
      continue;
    }
    if (seen.has(canonicalUrl)) {
      excludedReasons.push("duplicate-feed-url");
      continue;
    }
    seen.add(canonicalUrl);
    candidates.push({
      sourceArticleId: new URL(canonicalUrl).pathname.split("/").filter(Boolean).at(-1)!,
      canonicalUrl,
      title: title.slice(0, 200),
      publishedAt: date.toISOString().slice(0, 10)
    });
  }
  return { candidates, excludedReasons };
}

function classify(title: string): ContentKind {
  const normalized = title.toLocaleLowerCase("en");
  if (/maintenance|update|version|leveling|changes?|adjustment/.test(normalized)) {
    return "game-update";
  }
  if (/gift|giveaway|reward|bonus|distribution|celebration/.test(normalized)) {
    return "campaign";
  }
  if (/event|fest|festival|meetup|community|challenge|truck|techfest/.test(normalized)) {
    return "event";
  }
  return "news";
}

function exactPokemonSlugs(title: string, pokemon: PokemonEntry[]): string[] {
  const byName = new Map<string, Set<string>>();
  for (const entry of pokemon) {
    for (const name of [entry.nameEn, entry.nameJa]) {
      const key = name.normalize("NFKC").toLocaleLowerCase("en");
      if (!key) continue;
      const slugs = byName.get(key) ?? new Set<string>();
      slugs.add(entry.slug);
      byName.set(key, slugs);
    }
  }
  const normalizedTitle = title.normalize("NFKC").toLocaleLowerCase("en");
  const matched: string[] = [];
  for (const [name, slugs] of byName) {
    if (slugs.size !== 1) continue;
    const index = normalizedTitle.indexOf(name);
    if (index < 0) continue;
    const before = normalizedTitle[index - 1] ?? "";
    const after = normalizedTitle[index + name.length] ?? "";
    if (/[a-z0-9]/i.test(before) || /[a-z0-9]/i.test(after)) continue;
    matched.push([...slugs][0]);
  }
  return [...new Set(matched)];
}

function tagsFor(kind: ContentKind, title: string): string[] {
  const tags = ["Pokémon GO", "公式RSS"];
  if (kind === "game-update") tags.push("アップデート");
  if (kind === "event") tags.push("イベント");
  if (kind === "campaign") tags.push("キャンペーン");
  if (/EUIC/i.test(title)) tags.push("EUIC");
  return tags;
}

export function contentFingerprint(
  item: Pick<
    GeneratedPokemonContentItem,
    "kind" | "title" | "summary" | "url" | "publishedAt" | "pokemonSlugs" | "tags"
  >
): string {
  const normalized = {
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    url: item.url,
    publishedAt: item.publishedAt,
    pokemonSlugs: item.pokemonSlugs,
    tags: item.tags
  };
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export function createPokemonGoContentItem(input: {
  candidate: PokemonGoFeedCandidate;
  pokemon: PokemonEntry[];
  nowIso: string;
  existing?: GeneratedPokemonContentItem;
}): { item: GeneratedPokemonContentItem; change: "new" | "updated" | "unchanged" } {
  const kind = classify(input.candidate.title);
  const base = {
    kind,
    title: input.candidate.title,
    summary:
      "Pokémon GO公式RSSで案内された情報です。内容と最新の日程は元ページでご確認ください。",
    sourceName: "Pokémon GO公式",
    url: input.candidate.canonicalUrl,
    publishedAt: input.candidate.publishedAt,
    pokemonSlugs: exactPokemonSlugs(input.candidate.title, input.pokemon),
    tags: tagsFor(kind, input.candidate.title),
    targetGame: "Pokémon GO",
    platforms: ["iOS", "Android"]
  };
  const fingerprint = contentFingerprint(base);
  if (input.existing?.contentFingerprint === fingerprint) {
    return { item: input.existing, change: "unchanged" };
  }
  const item: GeneratedPokemonContentItem = {
    id: input.existing?.id ?? `pokemon-go-${input.candidate.sourceArticleId}`,
    ...base,
    source: "pokemon-go-official-rss",
    sourceArticleId: input.candidate.sourceArticleId,
    canonicalUrl: input.candidate.canonicalUrl,
    firstCollectedAt: input.existing?.firstCollectedAt ?? input.nowIso,
    lastCollectedAt: input.nowIso,
    contentFingerprint: fingerprint,
    collectorVersion: CONTENT_COLLECTOR_VERSION,
    status: "active"
  };
  return { item, change: input.existing ? "updated" : "new" };
}
