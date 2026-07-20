import type {
  GeneratedPokemonContentItem,
  PokemonContentItem
} from "@/types/pokemonContent";

const kinds = new Set(["news", "goods", "event", "campaign", "game-update"]);
const dateKeys = [
  "publishedAt",
  "releaseDate",
  "preorderStartDate",
  "preorderDeadlineDate",
  "eventStartDate",
  "eventEndDate"
] as const;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function httpsUrl(value: unknown): boolean {
  try {
    return typeof value === "string" && new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizedUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLocaleLowerCase("en");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  const entries = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLocaleLowerCase("en").startsWith("utm_"))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of entries) url.searchParams.append(key, value);
  return url.toString();
}

function validIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
}

export function validatePokemonContent(
  items: unknown[],
  knownPokemonSlugs: Set<string>
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const urls = new Set<string>();

  for (const value of items) {
    const item = value as Partial<PokemonContentItem>;
    const context = `pokemonContent:${String(item.id ?? "unknown")}`;
    for (const key of ["id", "title", "summary", "sourceName", "url", "publishedAt"] as const) {
      if (typeof item[key] !== "string" || item[key]?.trim() === "") errors.push(`${context}: ${key} が空です`);
    }
    if (ids.has(String(item.id))) errors.push(`${context}: IDが重複しています`);
    ids.add(String(item.id));
    if (!httpsUrl(item.url)) errors.push(`${context}: URLが不正です`);
    else {
      const url = normalizedUrl(item.url!);
      if (urls.has(url)) errors.push(`${context}: URLが重複しています`);
      urls.add(url);
    }
    if (!kinds.has(String(item.kind))) errors.push(`${context}: 種類が不正です`);
    if (typeof item.title === "string" && item.title.length > 200) {
      errors.push(`${context}: title が長すぎます`);
    }
    if (typeof item.summary === "string" && item.summary.length > 160) {
      errors.push(`${context}: summary が長すぎます`);
    }
    for (const key of dateKeys) {
      if (item[key] !== undefined && !validDate(item[key])) errors.push(`${context}: ${key} が不正です`);
    }
    if (item.eventStartDate && item.eventEndDate && item.eventStartDate > item.eventEndDate) {
      errors.push(`${context}: イベント終了日が開始日より前です`);
    }
    if (
      item.preorderStartDate &&
      item.preorderDeadlineDate &&
      item.preorderStartDate > item.preorderDeadlineDate
    ) {
      errors.push(`${context}: 予約締切日が開始日より前です`);
    }
    if (!Array.isArray(item.pokemonSlugs)) errors.push(`${context}: pokemonSlugs は配列です`);
    else {
      if (new Set(item.pokemonSlugs).size !== item.pokemonSlugs.length) errors.push(`${context}: 関連ポケモンが重複しています`);
      for (const slug of item.pokemonSlugs) if (!knownPokemonSlugs.has(slug)) errors.push(`${context}: 不正なslugです: ${slug}`);
    }
    if (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== "string" || tag.trim() === "")) {
      errors.push(`${context}: tags が不正です`);
    } else if (new Set(item.tags).size !== item.tags.length) {
      errors.push(`${context}: tags が重複しています`);
    }
    if (item.priceLabel && !/^\d{1,3}(?:,\d{3})*円(?:（税込）)?$/.test(item.priceLabel)) {
      errors.push(`${context}: 価格形式が不正です`);
    }

    if ("source" in item) {
      const generated = item as Partial<GeneratedPokemonContentItem>;
      if (generated.source !== "pokemon-go-official-rss") {
        errors.push(`${context}: 自動収集sourceが不正です`);
      }
      for (const key of ["sourceArticleId", "canonicalUrl", "contentFingerprint", "collectorVersion", "status"] as const) {
        if (typeof generated[key] !== "string" || generated[key]?.trim() === "") {
          errors.push(`${context}: ${key} が空です`);
        }
      }
      if (!httpsUrl(generated.canonicalUrl)) {
        errors.push(`${context}: canonicalUrl が不正です`);
      } else if (
        typeof item.url === "string" &&
        normalizedUrl(generated.canonicalUrl!) !== normalizedUrl(item.url)
      ) {
        errors.push(`${context}: canonicalUrl とurlが一致しません`);
      }
      if (!validIsoDateTime(generated.firstCollectedAt)) {
        errors.push(`${context}: firstCollectedAt が不正です`);
      }
      if (!validIsoDateTime(generated.lastCollectedAt)) {
        errors.push(`${context}: lastCollectedAt が不正です`);
      }
      if (
        validIsoDateTime(generated.firstCollectedAt) &&
        validIsoDateTime(generated.lastCollectedAt) &&
        generated.firstCollectedAt > generated.lastCollectedAt
      ) {
        errors.push(`${context}: lastCollectedAt が firstCollectedAt より前です`);
      }
      if (
        typeof generated.contentFingerprint === "string" &&
        !/^[a-f0-9]{64}$/.test(generated.contentFingerprint)
      ) {
        errors.push(`${context}: contentFingerprint が不正です`);
      }
      if (generated.status !== "active") {
        errors.push(`${context}: status が不正です`);
      }
    }
  }
  return errors;
}
