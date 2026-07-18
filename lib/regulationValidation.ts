import type {
  AppMeta,
  RegulationDefinition,
  SeasonDefinition
} from "@/types/pokemon";

type ArticleRegulationReference = {
  id?: unknown;
  regulation?: unknown;
  season?: unknown;
  builderSeasonId?: unknown;
};

function isDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function validateSeason(
  season: SeasonDefinition,
  knownRegulationIds: Set<string>,
  errors: string[]
) {
  const context = `appMeta:season:${String(season?.id ?? "unknown")}`;

  if (typeof season?.id !== "string" || season.id.trim() === "") {
    errors.push(`${context}: id が空です`);
  }
  if (typeof season.label !== "string" || season.label.trim() === "") {
    errors.push(`${context}: label が空です`);
  }
  if (
    typeof season.articleLabel !== "string" ||
    season.articleLabel.trim() === ""
  ) {
    errors.push(`${context}: articleLabel が空です`);
  }
  if (!knownRegulationIds.has(season.regulationId)) {
    errors.push(`${context}: regulationId が定義されていません`);
  }
  if (!isDateTime(season.startAt)) {
    errors.push(`${context}: startAt はタイムゾーン付き日時にしてください`);
  }
  if (season.endAt !== null && !isDateTime(season.endAt)) {
    errors.push(`${context}: endAt はタイムゾーン付き日時かnullにしてください`);
  }
  if (
    isDateTime(season.startAt) &&
    isDateTime(season.endAt) &&
    Date.parse(season.endAt) < Date.parse(season.startAt)
  ) {
    errors.push(`${context}: endAt が startAt より前です`);
  }
  if (!Number.isInteger(season.displayOrder)) {
    errors.push(`${context}: displayOrder は整数にしてください`);
  }
}

export function validateRegulationDefinitions(
  appMeta: AppMeta,
  regulations: RegulationDefinition[],
  articles: ArticleRegulationReference[] = []
): string[] {
  const errors: string[] = [];
  const regulationIds = new Set<string>();
  const seasonIds = new Set<string>();
  const articleSeasonLabels = new Set<string>();

  if (!Array.isArray(regulations) || regulations.length === 0) {
    errors.push("regulations: ルール定義は1件以上必要です");
  }

  for (const regulation of regulations) {
    const context = `regulation:${String(regulation?.id ?? "unknown")}`;
    if (typeof regulation?.id !== "string" || regulation.id.trim() === "") {
      errors.push(`${context}: id が空です`);
      continue;
    }
    if (regulationIds.has(regulation.id)) {
      errors.push(`${context}: ルールIDが重複しています`);
    }
    regulationIds.add(regulation.id);

    if (typeof regulation.label !== "string" || regulation.label.trim() === "") {
      errors.push(`${context}: label が空です`);
    }
    if (
      !Array.isArray(regulation.allowedPokemonSlugs) ||
      regulation.allowedPokemonSlugs.length === 0
    ) {
      errors.push(`${context}: allowedPokemonSlugs は1件以上必要です`);
    } else if (
      new Set(regulation.allowedPokemonSlugs).size !==
      regulation.allowedPokemonSlugs.length
    ) {
      errors.push(`${context}: allowedPokemonSlugs が重複しています`);
    }
    if (!Array.isArray(regulation.bannedPokemonSlugs)) {
      errors.push(`${context}: bannedPokemonSlugs は配列にしてください`);
    }
    if (!isDateTime(regulation.startAt)) {
      errors.push(`${context}: startAt はタイムゾーン付き日時にしてください`);
    }
    if (regulation.endAt !== null && !isDateTime(regulation.endAt)) {
      errors.push(`${context}: endAt はタイムゾーン付き日時かnullにしてください`);
    }
    if (
      isDateTime(regulation.startAt) &&
      isDateTime(regulation.endAt) &&
      Date.parse(regulation.endAt) < Date.parse(regulation.startAt)
    ) {
      errors.push(`${context}: endAt が startAt より前です`);
    }
    if (typeof regulation.isAvailable !== "boolean") {
      errors.push(`${context}: isAvailable はbooleanにしてください`);
    }
    if (!Number.isInteger(regulation.displayOrder)) {
      errors.push(`${context}: displayOrder は整数にしてください`);
    }
    try {
      if (new URL(regulation.sourceUrl).protocol !== "https:") {
        errors.push(`${context}: sourceUrl はHTTPS URLにしてください`);
      }
    } catch {
      errors.push(`${context}: sourceUrl はHTTPS URLにしてください`);
    }
  }

  if (
    appMeta.regulationIds.length !== new Set(appMeta.regulationIds).size
  ) {
    errors.push("appMeta: regulationIds が重複しています");
  }
  for (const regulationId of appMeta.regulationIds) {
    if (!regulationIds.has(regulationId)) {
      errors.push(`appMeta: regulationIds の定義がありません: ${regulationId}`);
    }
  }

  if (!Array.isArray(appMeta.seasons) || appMeta.seasons.length === 0) {
    errors.push("appMeta: seasons は1件以上必要です");
  }
  for (const season of appMeta.seasons) {
    validateSeason(season, regulationIds, errors);
    if (seasonIds.has(season.id)) {
      errors.push(`appMeta: シーズンIDが重複しています: ${season.id}`);
    }
    seasonIds.add(season.id);
    if (articleSeasonLabels.has(season.articleLabel)) {
      errors.push(
        `appMeta: articleLabel が重複しています: ${season.articleLabel}`
      );
    }
    articleSeasonLabels.add(season.articleLabel);
  }

  if (appMeta.seasonIds.length !== new Set(appMeta.seasonIds).size) {
    errors.push("appMeta: seasonIds が重複しています");
  }
  for (const seasonId of appMeta.seasonIds) {
    if (!seasonIds.has(seasonId)) {
      errors.push(`appMeta: seasonIds の定義がありません: ${seasonId}`);
    }
  }
  for (const seasonId of seasonIds) {
    if (!appMeta.seasonIds.includes(seasonId)) {
      errors.push(`appMeta: seasons が seasonIds にありません: ${seasonId}`);
    }
  }
  for (const [legacyId, targetSeasonId] of Object.entries(
    appMeta.legacySeasonIdMap
  )) {
    if (legacyId.trim() === "" || !seasonIds.has(targetSeasonId)) {
      errors.push(`appMeta: legacySeasonIdMap が不正です: ${legacyId}`);
    }
  }

  for (const article of articles) {
    const context = `buildArticles:${String(article.id ?? "unknown")}`;
    const season = appMeta.seasons.find(
      (entry) => entry.id === String(article.builderSeasonId ?? "")
    );
    if (!season) {
      errors.push(`${context}: builderSeasonId が定義されていません`);
      continue;
    }
    if (String(article.season ?? "") !== season.articleLabel) {
      errors.push(`${context}: 記事のシーズン表示とシーズンIDが矛盾しています`);
    }
    if (String(article.regulation ?? "") !== season.regulationId) {
      errors.push(`${context}: 記事のルールとシーズンが矛盾しています`);
    }
  }

  return errors;
}
