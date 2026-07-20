import type {
  BuildArticleSource,
  GeneratedBuildArticle
} from "../../types/buildArticle";
import { normalizeUrl } from "./normalize";
import { isNonConcreteBuildTitle } from "./classify";
import {
  EXTRACTOR_VERSION,
  type CandidateCollectionState
} from "./types";

export const MIGRATABLE_PREVIOUS_VERSION = "2.0.0";

export type ParserMigrationOutcome =
  | "complete-maintained"
  | "complete-promoted"
  | "metadata-only-maintained"
  | "metadata-only-promoted"
  | "public-demoted"
  | "excluded-maintained";

export type SavedParserMigrationPlan =
  | {
      method: "saved-state";
      outcome: ParserMigrationOutcome;
      reason: string;
      article: GeneratedBuildArticle | null;
    }
  | {
      method: "network";
      reason: string;
      article: GeneratedBuildArticle | null;
    };

export function findGeneratedForCandidate(input: {
  candidate: CandidateCollectionState;
  source: BuildArticleSource;
  generatedArticles: GeneratedBuildArticle[];
}): GeneratedBuildArticle | null {
  const normalized = normalizeUrl(input.candidate.url);
  return (
    input.generatedArticles.find(
      (article) =>
        article.source === input.source &&
        (normalizeUrl(article.sourceUrl) === normalized ||
          normalizeUrl(article.canonicalUrl) === normalized)
    ) ?? null
  );
}

export function planSavedParserMigration(input: {
  candidate: CandidateCollectionState;
  source: BuildArticleSource;
  generatedArticles: GeneratedBuildArticle[];
}): SavedParserMigrationPlan {
  const { candidate } = input;
  const article = findGeneratedForCandidate(input);

  if (candidate.parserVersion === EXTRACTOR_VERSION) {
    return {
      method: "saved-state",
      outcome:
        article?.collectionCompleteness === "complete"
          ? "complete-maintained"
          : article?.collectionCompleteness === "metadata-only"
            ? "metadata-only-maintained"
            : "excluded-maintained",
      reason: "already-current",
      article
    };
  }
  if (
    candidate.parserVersion !== MIGRATABLE_PREVIOUS_VERSION
  ) {
    return {
      method: "network",
      reason: "unsupported-previous-parser-version",
      article
    };
  }
  if ((candidate.consecutiveFetchFailures ?? 0) > 0) {
    return {
      method: "network",
      reason: "previous-fetch-failed",
      article
    };
  }
  if (!candidate.contentFingerprint) {
    return {
      method: "network",
      reason: "missing-content-fingerprint",
      article
    };
  }

  if (article) {
    if (article.status !== "active") {
      return {
        method: "network",
        reason: "published-article-not-active",
        article
      };
    }
    if (article.collectionCompleteness === "complete") {
      return {
        method: "saved-state",
        outcome: "complete-maintained",
        reason: "published-complete-data",
        article
      };
    }
    if (isNonConcreteBuildTitle(article.title)) {
      return {
        method: "saved-state",
        outcome: "public-demoted",
        reason: "not-concrete-build-article",
        article
      };
    }
    return {
      method: "saved-state",
      outcome: "metadata-only-maintained",
      reason: "published-metadata-title-safe",
      article
    };
  }

  if (
    candidate.teamResult === "excluded" &&
    typeof candidate.exclusionReason === "string" &&
    candidate.exclusionReason.length > 0
  ) {
    return {
      method: "saved-state",
      outcome: "excluded-maintained",
      reason: `stable-exclusion:${candidate.exclusionReason}`,
      article: null
    };
  }

  return {
    method: "network",
    reason: "insufficient-saved-outcome",
    article: null
  };
}
