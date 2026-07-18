import type { PokemonContentItem } from "@/types/pokemonContent";

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

export function validatePokemonContent(
  items: unknown[],
  knownPokemonSlugs: Set<string>
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const value of items) {
    const item = value as Partial<PokemonContentItem>;
    const context = `pokemonContent:${String(item.id ?? "unknown")}`;
    for (const key of ["id", "title", "summary", "sourceName", "url", "publishedAt"] as const) {
      if (typeof item[key] !== "string" || item[key]?.trim() === "") errors.push(`${context}: ${key} が空です`);
    }
    if (ids.has(String(item.id))) errors.push(`${context}: IDが重複しています`);
    ids.add(String(item.id));
    if (!httpsUrl(item.url)) errors.push(`${context}: URLが不正です`);
    if (!kinds.has(String(item.kind))) errors.push(`${context}: 種類が不正です`);
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
    }
    if (item.priceLabel && !/^\d{1,3}(?:,\d{3})*円(?:（税込）)?$/.test(item.priceLabel)) {
      errors.push(`${context}: 価格形式が不正です`);
    }
  }
  return errors;
}
