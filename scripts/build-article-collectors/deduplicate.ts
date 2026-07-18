import type {
  BuildArticle,
  BuildArticleSource,
  GeneratedBuildArticle
} from "../../types/buildArticle";
import {
  createMetadataFingerprint,
  createStableArticleId,
  createTeamFingerprint,
  hashText,
  normalizeUrl
} from "./normalize";
import { EXTRACTOR_VERSION, type ExtractedArticle } from "./types";

function generatedMetadataFingerprint(article: GeneratedBuildArticle): string {
  return createMetadataFingerprint(article);
}

function generatedTeamFingerprint(article: GeneratedBuildArticle): string {
  return createTeamFingerprint(article);
}

function manualMetadataFingerprint(article: BuildArticle): string {
  return createMetadataFingerprint({
    title: article.title,
    authorName: article.author,
    publishedAt: article.publishedAt
  });
}

function manualTeamFingerprint(article: BuildArticle): string {
  return createTeamFingerprint({
    pokemonSlugs: article.pokemonSlugs,
    builderSeasonId: article.builderSeasonId,
    authorName: article.author
  });
}

export function createContentFingerprint(article: ExtractedArticle): string {
  return hashText(
    JSON.stringify({
      canonicalUrl: article.canonicalUrl,
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
      collectionCompleteness: article.collectionCompleteness,
      extractionConfidence: article.extractionConfidence,
      missingFields: article.missingFields,
      teamExtractionMethod: article.teamExtractionMethod,
      teamExtractionIssue: article.teamExtractionIssue
    })
  );
}

export function matchesManualArticle(
  article: ExtractedArticle,
  manualArticles: BuildArticle[]
): boolean {
  const canonicalUrl = normalizeUrl(article.canonicalUrl);
  const metadataFingerprint = createMetadataFingerprint(article);
  const teamFingerprint =
    article.collectionCompleteness === "complete"
      ? createTeamFingerprint(article)
      : null;

  return manualArticles.some(
    (manual) =>
      normalizeUrl(manual.url) === canonicalUrl ||
      manualMetadataFingerprint(manual) === metadataFingerprint ||
      (teamFingerprint !== null &&
        manualTeamFingerprint(manual) === teamFingerprint)
  );
}

export function findGeneratedMatch(
  article: ExtractedArticle,
  generatedArticles: GeneratedBuildArticle[]
): GeneratedBuildArticle | null {
  const canonicalUrl = normalizeUrl(article.canonicalUrl);
  const metadataFingerprint = createMetadataFingerprint(article);
  const teamFingerprint =
    article.collectionCompleteness === "complete"
      ? createTeamFingerprint(article)
      : null;

  return (
    generatedArticles.find(
      (existing) =>
        existing.canonicalUrl === canonicalUrl ||
        (article.sourceArticleId !== null &&
          existing.sourceArticleId === article.sourceArticleId) ||
        normalizeUrl(existing.sourceUrl) === canonicalUrl ||
        generatedMetadataFingerprint(existing) === metadataFingerprint ||
        (teamFingerprint !== null &&
          existing.collectionCompleteness === "complete" &&
          generatedTeamFingerprint(existing) === teamFingerprint)
    ) ?? null
  );
}

export function createOrUpdateGeneratedArticle(input: {
  source: BuildArticleSource;
  sourceUrl: string;
  article: ExtractedArticle;
  existing: GeneratedBuildArticle | null;
  nowIso: string;
}): {
  article: GeneratedBuildArticle;
  change: "new" | "updated" | "unchanged";
} {
  const canonicalUrl = normalizeUrl(input.article.canonicalUrl);
  const sourceUrl = normalizeUrl(input.sourceUrl);
  const contentFingerprint = createContentFingerprint(input.article);
  if (input.existing?.contentFingerprint === contentFingerprint) {
    const recovered =
      input.existing.status !== "active" ||
      input.existing.consecutiveFetchFailures !== 0;
    const extractorUpdated =
      input.existing.extractorVersion !== EXTRACTOR_VERSION;
    return {
      article: recovered || extractorUpdated
        ? {
            ...input.existing,
            lastCollectedAt: input.nowIso,
            extractorVersion: EXTRACTOR_VERSION,
            status: "active",
            consecutiveFetchFailures: 0,
            lastSuccessfulFetchAt: input.nowIso
          }
        : input.existing,
      change: recovered || extractorUpdated ? "updated" : "unchanged"
    };
  }

  const article: GeneratedBuildArticle = {
    id:
      input.existing?.id ??
      createStableArticleId(
        input.source,
        canonicalUrl,
        input.article.sourceArticleId
      ),
    source: input.source,
    sourceArticleId: input.article.sourceArticleId,
    sourceUrl,
    canonicalUrl,
    title: input.article.title,
    authorName: input.article.authorName,
    publishedAt: input.article.publishedAt,
    battleFormat: input.article.battleFormat,
    regulationId: input.article.regulationId,
    builderSeasonId: input.article.builderSeasonId,
    result: input.article.result,
    pokemonSlugs: input.article.pokemonSlugs,
    tags: input.article.tags,
    summary: input.article.summary,
    collectionCompleteness: input.article.collectionCompleteness,
    extractionConfidence: input.article.extractionConfidence,
    missingFields: input.article.missingFields,
    teamExtractionMethod: input.article.teamExtractionMethod,
    teamExtractionIssue: input.article.teamExtractionIssue,
    firstCollectedAt: input.existing?.firstCollectedAt ?? input.nowIso,
    lastCollectedAt: input.nowIso,
    contentFingerprint,
    extractorVersion: EXTRACTOR_VERSION,
    status: "active",
    consecutiveFetchFailures: 0,
    lastSuccessfulFetchAt: input.nowIso
  };

  return {
    article,
    change: input.existing ? "updated" : "new"
  };
}

export function applyFetchFailure(
  article: GeneratedBuildArticle,
  options: { permanent: boolean }
): GeneratedBuildArticle {
  const failures = article.consecutiveFetchFailures + 1;
  return {
    ...article,
    consecutiveFetchFailures: failures,
    status: options.permanent
      ? "removed"
      : failures >= 3
        ? "temporarily-unavailable"
        : article.status
  };
}
