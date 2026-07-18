import {
  isBuildArticleThumbnailSafe,
  validateBuildArticleThumbnail,
  type BuildArticleThumbnailOrigin
} from "../../lib/buildArticleThumbnail";
import type {
  BuildArticleThumbnail,
  BuildArticleThumbnailSource
} from "../../types/buildArticle";
import { decodeHtml, stripHtml } from "./normalize";

type JsonRecord = Record<string, unknown>;

export type ThumbnailExtractionReport = {
  thumbnail: BuildArticleThumbnail | null;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
};

type ThumbnailCandidate = {
  url: string;
  source: BuildArticleThumbnailSource;
  alt: string | null;
  width: number | null;
  height: number | null;
};

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)(?:px)?$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseJsonScripts(html: string): unknown[] {
  const roots: unknown[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      roots.push(JSON.parse(decodeHtml(match[1])));
    } catch {
      // 壊れたJSON-LDは他の候補へフォールバックする。
    }
  }
  return roots;
}

function collectRecords(value: unknown, result: JsonRecord[] = []): JsonRecord[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectRecords(entry, result));
    return result;
  }
  if (!value || typeof value !== "object") return result;
  const record = value as JsonRecord;
  result.push(record);
  Object.values(record).forEach((entry) => collectRecords(entry, result));
  return result;
}

function imageCandidateFromValue(
  value: unknown,
  source: BuildArticleThumbnailSource,
  fallbackAlt: string
): ThumbnailCandidate | null {
  if (typeof value === "string") {
    return {
      url: decodeHtml(value).trim(),
      source,
      alt: fallbackAlt,
      width: null,
      height: null
    };
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = imageCandidateFromValue(entry, source, fallbackAlt);
      if (candidate) return candidate;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as JsonRecord;
  const url = String(record.url ?? record.contentUrl ?? "").trim();
  if (!url) return null;
  const caption = stripHtml(
    String(record.caption ?? record.description ?? record.name ?? "")
  ).trim();
  return {
    url: decodeHtml(url),
    source,
    alt: caption || fallbackAlt,
    width: parsePositiveInteger(record.width),
    height: parsePositiveInteger(record.height)
  };
}

function extractMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    )
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]).trim();
  }
  return null;
}

function metaCandidate(
  html: string,
  key: "og:image" | "twitter:image",
  title: string
): ThumbnailCandidate | null {
  const url = extractMetaContent(html, key);
  if (!url) return null;
  const prefix = key.split(":")[0];
  return {
    url,
    source: key === "og:image" ? "og-image" : "twitter-image",
    alt:
      extractMetaContent(html, `${prefix}:image:alt`) ??
      `${title}のサムネイル`,
    width: parsePositiveInteger(
      extractMetaContent(html, `${prefix}:image:width`)
    ),
    height: parsePositiveInteger(
      extractMetaContent(html, `${prefix}:image:height`)
    )
  };
}

function explicitCoverCandidate(
  html: string,
  title: string
): ThumbnailCandidate | null {
  const imageTags = [
    ...html.matchAll(/<img\b[^>]*>/gi)
  ].map((match) => match[0]);
  for (const tag of imageTags) {
    if (
      !/(?:eye-?catch|eyecatch|cover|header-image|見出し画像)/i.test(tag)
    ) {
      continue;
    }
    const url =
      tag.match(
        /(?:data-layzr|data-src|src)=["']([^"']+)["']/i
      )?.[1] ?? "";
    if (!url || /dummy\.(?:gif|png)/i.test(url)) continue;
    const alt = decodeHtml(
      tag.match(/alt=["']([^"']*)["']/i)?.[1] ?? ""
    ).trim();
    return {
      url: decodeHtml(url),
      source: "cover-image",
      alt: alt && alt !== "見出し画像" ? alt : `${title}のサムネイル`,
      width: parsePositiveInteger(
        tag.match(/\bwidth=["']?(\d+)/i)?.[1] ?? null
      ),
      height: parsePositiveInteger(
        tag.match(/\bheight=["']?(\d+)/i)?.[1] ?? null
      )
    };
  }
  return null;
}

function addReason(target: Record<string, number>, reason: string): void {
  target[reason] = (target[reason] ?? 0) + 1;
}

export function extractBuildArticleThumbnail(input: {
  html: string;
  origin: BuildArticleThumbnailOrigin;
  title: string;
}): ThumbnailExtractionReport {
  const fallbackAlt = `${input.title}のサムネイル`;
  const candidates: ThumbnailCandidate[] = [];
  for (const root of parseJsonScripts(input.html)) {
    const articleRecords = collectRecords(root).filter((record) =>
      /^(?:Article|BlogPosting)$/i.test(
        String(record["@type"] ?? "").trim()
      )
    );
    for (const record of articleRecords) {
      const candidate = imageCandidateFromValue(
        record.image ?? record.thumbnailUrl,
        "structured-data",
        fallbackAlt
      );
      if (candidate) candidates.push(candidate);
    }
  }
  const og = metaCandidate(input.html, "og:image", input.title);
  const twitter = metaCandidate(input.html, "twitter:image", input.title);
  const cover = explicitCoverCandidate(input.html, input.title);
  if (og) candidates.push(og);
  if (twitter) candidates.push(twitter);
  if (cover) candidates.push(cover);

  const rejectionReasons: Record<string, number> = {};
  let rejectedCount = 0;
  for (const candidate of candidates) {
    const errors = validateBuildArticleThumbnail(candidate, input.origin);
    if (
      errors.length === 0 &&
      isBuildArticleThumbnailSafe(candidate, input.origin)
    ) {
      return { thumbnail: candidate, rejectedCount, rejectionReasons };
    }
    rejectedCount += 1;
    errors.forEach((error) => addReason(rejectionReasons, error));
  }
  return { thumbnail: null, rejectedCount, rejectionReasons };
}
