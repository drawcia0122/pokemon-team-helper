import { createHash } from "node:crypto";
import type { BuildArticleSource } from "../../types/buildArticle";
import type { AppMeta } from "../../types/pokemon";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "yclid",
  "ref",
  "referrer",
  "source",
  "feature",
  "locale",
  "lang"
]);

export function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\""
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) => named[name] ?? entity);
}

export function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeComparableText(value: string): string {
  return decodeHtml(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/\s+/g, "");
}

export function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLocaleLowerCase("en").startsWith("utm_") ||
      TRACKING_PARAMETERS.has(key.toLocaleLowerCase("en"))
    ) {
      url.searchParams.delete(key);
    }
  }

  url.searchParams.sort();
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createStableArticleId(
  source: BuildArticleSource,
  canonicalUrl: string,
  sourceArticleId: string | null
): string {
  const stablePart = sourceArticleId ?? hashText(canonicalUrl).slice(0, 20);
  return `${source}-${stablePart.toLocaleLowerCase("en")}`;
}

export function createMetadataFingerprint(fields: {
  title: string;
  authorName: string;
  publishedAt: string;
}): string {
  return hashText(
    [
      normalizeComparableText(fields.title),
      normalizeComparableText(fields.authorName),
      fields.publishedAt.slice(0, 10)
    ].join("|")
  );
}

export function createTeamFingerprint(fields: {
  pokemonSlugs: string[];
  builderSeasonId: string;
  authorName: string;
}): string {
  return hashText(
    [
      [...fields.pokemonSlugs].sort().join(","),
      fields.builderSeasonId,
      normalizeComparableText(fields.authorName)
    ].join("|")
  );
}

export function normalizeSeasonId(
  value: string,
  appMeta: AppMeta
): string | null {
  const normalized = value.normalize("NFKC");
  const match = normalized.match(
    /(?:シーズン|season)?\s*M\s*[-‐‑‒–—ー]?\s*([1-9]\d*)/i
  );
  if (!match) {
    return null;
  }

  const id = `season-m${match[1]}`;
  return appMeta.seasonIds.includes(id) ? id : null;
}

export function normalizeRegulationId(value: string): string | null {
  const normalized = value.normalize("NFKC");
  const match = normalized.match(
    /(?:reg(?:ulation)?\.?|レギュレーション)\s*M\s*[-‐‑‒–—ー]?\s*([A-Z])|\bM\s*[-‐‑‒–—ー]\s*([A-Z])\b/i
  );
  const letter = match?.[1] ?? match?.[2];
  return letter ? `M-${letter.toUpperCase()}` : null;
}

export function sourceArticleIdFromUrl(
  source: BuildArticleSource,
  value: string
): string | null {
  const pathname = new URL(value).pathname;
  if (source === "note") {
    return pathname.match(/\/n\/(n[a-z0-9]+)$/i)?.[1] ?? null;
  }
  if (source === "hatena-blog") {
    const url = new URL(value);
    return hashText(`${url.hostname}${pathname}`).slice(0, 20);
  }
  return pathname.match(/\/articles\/([a-z0-9]+)$/i)?.[1] ?? null;
}
