import type {
  BuildArticle,
  GeneratedBuildArticle,
  TeamExtractionMethod
} from "../../types/buildArticle";
import { validateBuildArticleThumbnail } from "../../lib/buildArticleThumbnail";
import type { AppMeta, PokemonEntry } from "../../types/pokemon";
import { createContentFingerprint } from "./deduplicate";
import { normalizeUrl } from "./normalize";
import { validatePokemonAliasDefinitions } from "./pokemonAliases";
import { EXTRACTOR_VERSION } from "./types";
import type {
  CollectionStatus,
  SourceConfig
} from "./types";

const TEAM_EXTRACTION_METHODS = new Set<TeamExtractionMethod>([
  "structured-data",
  "section-headings",
  "numbered-items",
  "table",
  "image-metadata",
  "section-paragraphs",
  "embedded-image-metadata"
]);

function isIsoDateTime(value: string): boolean {
  return (
    /T/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isAllowedSourceUrl(article: GeneratedBuildArticle): boolean {
  try {
    const canonicalUrl = new URL(article.canonicalUrl);
    const sourceUrl = new URL(article.sourceUrl);
    const expectedHost =
      article.source === "note" ? "note.com" : "pokesol.app";
    return (
      canonicalUrl.protocol === "https:" &&
      sourceUrl.protocol === "https:" &&
      canonicalUrl.hostname === expectedHost &&
      sourceUrl.hostname === expectedHost &&
      normalizeUrl(article.sourceUrl) === article.sourceUrl &&
      normalizeUrl(article.canonicalUrl) === article.canonicalUrl
    );
  } catch {
    return false;
  }
}

export function validateGeneratedBuildArticle(
  article: GeneratedBuildArticle,
  context: {
    appMeta: AppMeta;
    pokemon: PokemonEntry[];
  }
): string[] {
  const errors: string[] = [];
  const prefix = `generated:${article.id || "unknown"}`;
  const pokemonSlugs = new Set(context.pokemon.map((entry) => entry.slug));
  const season = context.appMeta.seasons.find(
    (entry) => entry.id === article.builderSeasonId
  );

  for (const [key, value] of Object.entries({
    id: article.id,
    sourceUrl: article.sourceUrl,
    canonicalUrl: article.canonicalUrl,
    title: article.title,
    authorName: article.authorName,
    publishedAt: article.publishedAt,
    regulationId: article.regulationId,
    builderSeasonId: article.builderSeasonId,
    summary: article.summary,
    firstCollectedAt: article.firstCollectedAt,
    lastCollectedAt: article.lastCollectedAt,
    contentFingerprint: article.contentFingerprint,
    extractorVersion: article.extractorVersion,
    lastSuccessfulFetchAt: article.lastSuccessfulFetchAt
  })) {
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${prefix}: ${key} が空です`);
    }
  }

  if (article.source !== "note" && article.source !== "pokesol") {
    errors.push(`${prefix}: source が不正です`);
  }
  if (!Object.prototype.hasOwnProperty.call(article, "thumbnail")) {
    errors.push(`${prefix}: thumbnailが未定義です`);
  } else {
    errors.push(
      ...validateBuildArticleThumbnail(article.thumbnail, article.source).map(
        (error) => `${prefix}: ${error}`
      )
    );
  }
  if (!isAllowedSourceUrl(article)) {
    errors.push(`${prefix}: URLまたは許可ドメインが不正です`);
  }
  if (
    !isIsoDateTime(article.publishedAt) ||
    !isIsoDateTime(article.firstCollectedAt) ||
    !isIsoDateTime(article.lastCollectedAt) ||
    !isIsoDateTime(article.lastSuccessfulFetchAt)
  ) {
    errors.push(`${prefix}: 日時はISO 8601 UTC形式にしてください`);
  }
  if (article.battleFormat !== "single" && article.battleFormat !== "double") {
    errors.push(`${prefix}: battleFormat が不正です`);
  }
  if (!season) {
    errors.push(`${prefix}: builderSeasonId が未定義です`);
  } else if (season.regulationId !== article.regulationId) {
    errors.push(`${prefix}: ルールとシーズンが矛盾しています`);
  }
  const complete = article.collectionCompleteness === "complete";
  const metadataOnly = article.collectionCompleteness === "metadata-only";
  if (!complete && !metadataOnly) {
    errors.push(`${prefix}: collectionCompleteness が不正です`);
  }
  if (
    complete &&
    (!Array.isArray(article.pokemonSlugs) ||
      article.pokemonSlugs.length !== 6 ||
      new Set(article.pokemonSlugs).size !== 6)
  ) {
    errors.push(`${prefix}: completeには重複のない6体が必要です`);
  } else if (
    metadataOnly &&
    (!Array.isArray(article.pokemonSlugs) ||
      article.pokemonSlugs.length !== 0)
  ) {
    errors.push(`${prefix}: metadata-onlyのpokemonSlugsは空配列が必要です`);
  } else {
    for (const slug of article.pokemonSlugs) {
      if (!pokemonSlugs.has(slug)) {
        errors.push(`${prefix}: 不正なpokemon slugです: ${slug}`);
      }
    }
  }
  if (
    !Array.isArray(article.missingFields) ||
    new Set(article.missingFields).size !== article.missingFields.length ||
    (complete && article.missingFields.length !== 0) ||
    (metadataOnly &&
      (article.missingFields.length !== 1 ||
        article.missingFields[0] !== "pokemonSlugs"))
  ) {
    errors.push(`${prefix}: missingFields が完全性と一致しません`);
  }
  if (
    typeof article.extractionConfidence !== "number" ||
    article.extractionConfidence < 0 ||
    article.extractionConfidence > 1 ||
    (complete && article.extractionConfidence < 0.95) ||
    (metadataOnly && article.extractionConfidence < 0.8)
  ) {
    errors.push(`${prefix}: extractionConfidence が不正です`);
  }
  if (
    (complete &&
      (article.teamExtractionMethod === null ||
        !TEAM_EXTRACTION_METHODS.has(article.teamExtractionMethod) ||
        article.teamExtractionIssue !== null)) ||
    (metadataOnly &&
      (article.teamExtractionMethod !== null ||
        typeof article.teamExtractionIssue !== "string" ||
        article.teamExtractionIssue.trim() === ""))
  ) {
    errors.push(`${prefix}: 6体抽出方法または理由が完全性と一致しません`);
  }
  if (
    !Array.isArray(article.tags) ||
    new Set(article.tags).size !== article.tags.length ||
    article.tags.some(
      (tag) => typeof tag !== "string" || tag.trim() === "" || tag.length > 40
    )
  ) {
    errors.push(`${prefix}: tags が不正です`);
  }
  if (article.summary.length > 120 || /<[^>]+>/.test(article.summary)) {
    errors.push(`${prefix}: summary はHTMLを含まない120文字以内にしてください`);
  }
  if (
    !/^[a-f0-9]{64}$/.test(article.contentFingerprint) ||
    !Number.isInteger(article.consecutiveFetchFailures) ||
    article.consecutiveFetchFailures < 0
  ) {
    errors.push(`${prefix}: 指紋または失敗回数が不正です`);
  } else if (
    createContentFingerprint({
      canonicalUrl: article.canonicalUrl,
      sourceArticleId: article.sourceArticleId,
      title: article.title,
      authorName: article.authorName,
      publishedAt: article.publishedAt,
      battleFormat: article.battleFormat,
      regulationId: article.regulationId,
      builderSeasonId: article.builderSeasonId,
      result: article.result,
      pokemonSlugs: article.pokemonSlugs,
      tags: article.tags,
      summary: article.summary,
      thumbnail: article.thumbnail,
      collectionCompleteness: article.collectionCompleteness,
      extractionConfidence: article.extractionConfidence,
      missingFields: article.missingFields,
      teamExtractionMethod: article.teamExtractionMethod,
      teamExtractionIssue: article.teamExtractionIssue
    }) !== article.contentFingerprint
  ) {
    errors.push(`${prefix}: contentFingerprint が内容と一致しません`);
  }
  if (article.extractorVersion !== EXTRACTOR_VERSION) {
    errors.push(`${prefix}: extractorVersion が現行版と一致しません`);
  }
  if (
    article.status !== "active" &&
    article.status !== "temporarily-unavailable" &&
    article.status !== "removed"
  ) {
    errors.push(`${prefix}: status が不正です`);
  }
  if (
    Object.prototype.hasOwnProperty.call(article, "html") ||
    Object.prototype.hasOwnProperty.call(article, "body")
  ) {
    errors.push(`${prefix}: 外部HTMLまたは本文を保存してはいけません`);
  }

  return errors;
}

export function validateCollectionStatus(
  status: CollectionStatus,
  sourceConfigs: SourceConfig[]
): string[] {
  const errors: string[] = [];
  if (
    status.lastRunAt !== null &&
    (typeof status.lastRunAt !== "string" || !isIsoDateTime(status.lastRunAt))
  ) {
    errors.push("collection-status: lastRunAt が不正です");
  }
  if (
    !Number.isInteger(status.durationMs) ||
    status.durationMs < 0 ||
    typeof status.dryRun !== "boolean"
  ) {
    errors.push("collection-status: 実行情報が不正です");
  }

  for (const config of sourceConfigs) {
    const stats = status.sources?.[config.id];
    const cursor = status.cursors?.[config.id];
    const prefix = `collection-status:${config.id}`;
    if (!stats) {
      errors.push(`${prefix}: 集計がありません`);
    } else {
      const countKeys = [
        "candidateUrlCount",
        "candidateCount",
        "knownCandidateCount",
        "fetchedCount",
        "remainingCount",
        "publishedCount",
        "completePublishedCount",
        "metadataOnlyPublishedCount",
        "updatedCount",
        "duplicateCount",
        "excludedCount",
        "fetchFailureCount",
        "extractionSuccessCount",
        "completeCount",
        "metadataOnlyCount",
        "thumbnailFoundCount",
        "thumbnailMissingCount",
        "thumbnailUpdatedCount",
        "thumbnailRejectedCount",
        "fallbackCount",
        "completePromotedCount"
      ] as const;
      for (const key of countKeys) {
        const value = stats[key];
        if (!Number.isInteger(value) || Number(value) < 0) {
          errors.push(`${prefix}: ${key} が不正です`);
        }
      }
      if (
        ![
          "completed",
          "partial",
          "failed",
          "disabled-by-policy",
          "not-run"
        ].includes(stats.status)
      ) {
        errors.push(`${prefix}: status が不正です`);
      }
      for (const counts of [
        stats.teamExtractionMethods,
        stats.metadataOnlyReasons,
        stats.thumbnailDomains,
        stats.exclusionReasons
      ]) {
        if (
          !counts ||
          Object.values(counts).some(
            (value) => !Number.isInteger(value) || value < 0
          )
        ) {
          errors.push(`${prefix}: 理由別集計が不正です`);
        }
      }
    }

    if (!cursor || !Array.isArray(cursor.candidates)) {
      errors.push(`${prefix}: 永続カーソルがありません`);
      continue;
    }
    if (
      !Number.isInteger(cursor.nextIndex) ||
      cursor.nextIndex < 0 ||
      (cursor.candidates.length === 0
        ? cursor.nextIndex !== 0
        : cursor.nextIndex >= cursor.candidates.length)
    ) {
      errors.push(`${prefix}: nextIndex が不正です`);
    }

    const urls = new Set<string>();
    for (const candidate of cursor.candidates) {
      let validUrl = false;
      try {
        const url = new URL(candidate.url);
        validUrl =
          url.protocol === "https:" &&
          config.allowedDomains.includes(url.hostname) &&
          normalizeUrl(candidate.url) === candidate.url;
      } catch {
        validUrl = false;
      }
      if (!validUrl) errors.push(`${prefix}: 候補URLが不正です`);
      if (urls.has(candidate.url)) {
        errors.push(`${prefix}: 候補URLが重複しています`);
      }
      urls.add(candidate.url);
      if (
        !isIsoDateTime(candidate.firstSeenAt) ||
        !isIsoDateTime(candidate.lastSeenAt) ||
        (candidate.lastCheckedAt !== null &&
          !isIsoDateTime(candidate.lastCheckedAt))
      ) {
        errors.push(`${prefix}: 候補日時が不正です`);
      }
      if (
        Date.parse(candidate.firstSeenAt) > Date.parse(candidate.lastSeenAt)
      ) {
        errors.push(`${prefix}: firstSeenAt が lastSeenAt より後です`);
      }
      if (
        candidate.sourceArticleId !== null &&
        typeof candidate.sourceArticleId !== "string"
      ) {
        errors.push(`${prefix}: sourceArticleId が不正です`);
      }
    }
  }

  return errors;
}

export function validateGeneratedCollection(
  articles: GeneratedBuildArticle[],
  manualArticles: BuildArticle[],
  context: {
    appMeta: AppMeta;
    pokemon: PokemonEntry[];
  }
): string[] {
  const errors = articles.flatMap((article) =>
    validateGeneratedBuildArticle(article, context)
  );
  errors.push(...validatePokemonAliasDefinitions(context.pokemon));
  const ids = new Set<string>();
  const urls = new Set<string>();
  const sourceArticleIds = new Set<string>();
  const manualIds = new Set(manualArticles.map((article) => article.id));
  const manualUrls = new Set(
    manualArticles.map((article) => normalizeUrl(article.url))
  );

  for (const article of articles) {
    if (ids.has(article.id)) {
      errors.push(`generated:${article.id}: IDが重複しています`);
    }
    if (urls.has(article.canonicalUrl)) {
      errors.push(`generated:${article.id}: canonical URLが重複しています`);
    }
    if (article.sourceArticleId) {
      const sourceArticleKey = `${article.source}:${article.sourceArticleId}`;
      if (sourceArticleIds.has(sourceArticleKey)) {
        errors.push(`generated:${article.id}: 収集元の記事IDが重複しています`);
      }
      sourceArticleIds.add(sourceArticleKey);
    }
    if (manualIds.has(article.id) || manualUrls.has(article.canonicalUrl)) {
      errors.push(`generated:${article.id}: 手動記事と重複しています`);
    }
    ids.add(article.id);
    urls.add(article.canonicalUrl);
  }

  return errors;
}
