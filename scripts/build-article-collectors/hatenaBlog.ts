import type { AppMeta, PokemonEntry } from "../../types/pokemon";
import type { BuildArticleThumbnail } from "../../types/buildArticle";
import { isBuildArticleThumbnailSafe } from "../../lib/buildArticleThumbnail";
import { extractArticleFromHtml } from "./extract";
import {
  decodeHtml,
  hashText,
  normalizeComparableText,
  normalizeUrl,
  sourceArticleIdFromUrl,
  stripHtml
} from "./normalize";
import type {
  ArticleCandidate,
  ExtractionOutcome
} from "./types";

const HATENA_PLATFORM_SUFFIXES = [
  ".hatenablog.com",
  ".hatenablog.jp",
  ".hatena.blog",
  ".hatenadiary.com"
] as const;

const POSITIVE_CANDIDATE_PATTERN =
  /(?:ポケモンチャンピオンズ|ポケチャン|Pok[eé]mon\s*Champions|構築|最終構築|使用構築|ランクバトル|シングル|ダブル|レギュレーション|シーズン\s*M[-‐‑‒–—ー]?\s*\d+|\bM[-‐‑‒–—ー]?\s*\d+\b|レート|最終順位)/i;
const NEGATIVE_CANDIDATE_PATTERN =
  /(?:ポケモン\s*GO|Pok[eé]mon\s*GO|ポケカ|カード(?:ゲーム|デッキ)?|ユナイト|UNITE|スカーレット|バイオレット|ポケモン\s*SV|剣盾|ソード|シールド|BDSP|レジェンズ|LEGENDS|ゼットエー|\bZ[-‐‑‒–—ー]?A\b|雑記|日記|イラスト|商品|グッズ|ニュース|育成論|単体考察)/i;

type ParsedFeedEntry = {
  title: string;
  url: string;
  authorName: string;
  publishedAt: string;
  updatedAt: string;
  tags: string[];
  thumbnailUrl: string | null;
};

function unwrapXml(value: string): string {
  return decodeHtml(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function elementValue(xml: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(":", "\\:");
    const match = xml.match(
      new RegExp(
        `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
        "i"
      )
    );
    if (match) return unwrapXml(match[1]);
  }
  return "";
}

function attributeValue(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`${escaped}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, "i")
  );
  return match ? decodeHtml(match[1] ?? match[2]).trim() : null;
}

function extractFeedLink(entry: string, feedUrl: string): string | null {
  const linkTags = [...entry.matchAll(/<link\b[^>]*>/gi)].map(
    (match) => match[0]
  );
  const atomLink =
    linkTags.find((tag) => {
      const relation = attributeValue(tag, "rel");
      return !relation || relation === "alternate";
    }) ?? linkTags[0];
  const raw =
    (atomLink ? attributeValue(atomLink, "href") : null) ??
    elementValue(entry, ["link"]);
  if (!raw) return null;
  try {
    return normalizeUrl(new URL(raw, feedUrl).toString());
  } catch {
    return null;
  }
}

function extractFeedTags(entry: string): string[] {
  const values = [
    ...[...entry.matchAll(/<category\b[^>]*>/gi)]
      .map((match) => attributeValue(match[0], "term"))
      .filter((value): value is string => Boolean(value)),
    ...[...entry.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
      .map((match) => unwrapXml(match[1]))
      .filter(Boolean)
  ];
  return [...new Set(values)].slice(0, 12);
}

function extractFeedThumbnail(entry: string): string | null {
  const tags = [
    ...entry.matchAll(/<(?:media:thumbnail|media:content|enclosure)\b[^>]*>/gi)
  ].map((match) => match[0]);
  for (const tag of tags) {
    const type = attributeValue(tag, "type");
    if (
      tag.toLocaleLowerCase("en").startsWith("<enclosure") &&
      type &&
      !type.toLocaleLowerCase("en").startsWith("image/")
    ) {
      continue;
    }
    const url = attributeValue(tag, "url");
    if (url) return url;
  }
  return null;
}

function parseEntries(xml: string, feedUrl: string): ParsedFeedEntry[] {
  const blocks = [
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)
  ].map((match) => match[1]);
  if (blocks.length === 0) {
    blocks.push(
      ...[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(
        (match) => match[1]
      )
    );
  }

  return blocks.flatMap((entry) => {
    const url = extractFeedLink(entry, feedUrl);
    const title = elementValue(entry, ["title"]);
    if (!url || !title) return [];
    const publishedAt = elementValue(entry, [
      "published",
      "pubDate",
      "dc:date"
    ]);
    const updatedAt =
      elementValue(entry, ["updated", "dc:date", "pubDate"]) || publishedAt;
    return [
      {
        title,
        url,
        authorName: elementValue(entry, [
          "name",
          "dc:creator",
          "author"
        ]),
        publishedAt,
        updatedAt,
        tags: extractFeedTags(entry),
        thumbnailUrl: extractFeedThumbnail(entry)
      }
    ];
  });
}

export function isHatenaPlatformDomain(domain: string): boolean {
  const normalized = domain.toLocaleLowerCase("en");
  return HATENA_PLATFORM_SUFFIXES.some(
    (suffix) =>
      normalized.endsWith(suffix) && normalized.length > suffix.length
  );
}

export function isHatenaFeed(xml: string): boolean {
  const generator = elementValue(xml, ["generator"]);
  return /はてなブログ|Hatena(?:::|\s+)Blog/i.test(generator) ||
    /(?:hatenablog:\/\/|https?:\/\/blog\.hatena\.ne\.jp\/|https?:\/\/(?:www\.)?hatenablog\.com)/i.test(
      xml
    );
}

export function isHatenaBuildCandidate(input: {
  title: string;
  tags: string[];
}): boolean {
  const scope = `${input.title} ${input.tags.join(" ")}`.normalize("NFKC");
  return (
    POSITIVE_CANDIDATE_PATTERN.test(scope) &&
    !NEGATIVE_CANDIDATE_PATTERN.test(scope)
  );
}

export function parseHatenaFeed(
  xml: string,
  feedUrl: string,
  maxCandidates = 100
): ArticleCandidate[] {
  const feedHost = new URL(feedUrl).hostname.toLocaleLowerCase("en");
  const candidates = new Map<string, ArticleCandidate>();
  for (const entry of parseEntries(xml, feedUrl)) {
    let hostname: string;
    try {
      hostname = new URL(entry.url).hostname.toLocaleLowerCase("en");
    } catch {
      continue;
    }
    if (hostname !== feedHost || !isHatenaBuildCandidate(entry)) continue;
    const contentFingerprint = hashText(
      JSON.stringify({
        title: normalizeComparableText(entry.title),
        url: entry.url,
        updatedAt: entry.updatedAt,
        tags: [...entry.tags].sort(),
        thumbnailUrl: entry.thumbnailUrl
      })
    );
    candidates.set(entry.url, {
      source: "hatena-blog",
      url: entry.url,
      sourceArticleId: sourceArticleIdFromUrl("hatena-blog", entry.url),
      title: entry.title,
      authorName: entry.authorName,
      publishedAt: entry.publishedAt,
      updatedAt: entry.updatedAt,
      tags: entry.tags,
      thumbnailUrl: entry.thumbnailUrl,
      contentFingerprint
    });
    if (candidates.size >= maxCandidates) break;
  }
  return [...candidates.values()];
}

export function createHatenaFeedThumbnail(
  url: string | null | undefined,
  title: string
): BuildArticleThumbnail | null {
  if (!url) return null;
  const thumbnail: BuildArticleThumbnail = {
    url,
    source: "cover-image",
    alt: `${stripHtml(title)}のサムネイル`,
    width: null,
    height: null
  };
  return isBuildArticleThumbnailSafe(thumbnail, "hatena-blog")
    ? thumbnail
    : null;
}

export function parseHatenaArticle(input: {
  html: string;
  url: string;
  appMeta: AppMeta;
  pokemon: PokemonEntry[];
}): ExtractionOutcome {
  return extractArticleFromHtml({
    source: "hatena-blog",
    allowedCanonicalDomains: [new URL(input.url).hostname],
    ...input
  });
}

export function extractHatenaBlogDomains(
  html: string,
  currentDomain: string
): string[] {
  const domains = new Set<string>();
  const bodyStart = html.search(
    /class=["'][^"']*\bentry-content\b[^"']*["']/i
  );
  const bodyEnd =
    bodyStart >= 0
      ? [
          html.indexOf("entry-footer", bodyStart),
          html.indexOf("</article>", bodyStart)
        ]
          .filter((index) => index > bodyStart)
          .sort((a, b) => a - b)[0] ?? html.length
      : html.length;
  const scope = bodyStart >= 0 ? html.slice(bodyStart, bodyEnd) : html;
  const infrastructureDomains = new Set([
    "blog.hatenablog.com",
    "staff.hatenablog.com"
  ]);
  for (const match of scope.matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  )) {
    const label = stripHtml(match[2]);
    if (
      !POSITIVE_CANDIDATE_PATTERN.test(label) ||
      NEGATIVE_CANDIDATE_PATTERN.test(label)
    ) {
      continue;
    }
    try {
      const domain = new URL(
        decodeHtml(match[1]),
        `https://${currentDomain}`
      ).hostname.toLocaleLowerCase("en");
      if (
        domain !== currentDomain &&
        !infrastructureDomains.has(domain) &&
        isHatenaPlatformDomain(domain)
      ) {
        domains.add(domain);
      }
    } catch {
      // 不正なリンクは無視する。
    }
  }
  return [...domains].slice(0, 20);
}
