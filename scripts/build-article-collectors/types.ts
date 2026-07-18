import type {
  BuildArticle,
  BuildArticleSource,
  BuildArticleThumbnail,
  CollectionCompleteness,
  GeneratedBuildArticle,
  TeamExtractionMethod
} from "../../types/buildArticle";
import type { AppMeta, PokemonEntry } from "../../types/pokemon";

export const EXTRACTOR_VERSION = "1.2.0";

export type ArticleCandidate = {
  source: BuildArticleSource;
  url: string;
  sourceArticleId: string | null;
};

export type SourceConfig = {
  id: BuildArticleSource;
  label: string;
  allowedDomains: string[];
  discoveryUrls: string[];
  robotsUrl: string;
  termsUrl: string;
  automationAllowed: boolean;
  policyNote: string;
  maxCandidates: number;
  maxArticleFetches: number;
  requestDelayMs: number;
  timeoutMs: number;
  maxResponseBytes: number;
  retries: number;
};

export type ExtractedArticle = {
  canonicalUrl: string;
  sourceArticleId: string | null;
  title: string;
  authorName: string;
  publishedAt: string;
  battleFormat: "single" | "double";
  regulationId: string;
  builderSeasonId: string;
  result: string | null;
  pokemonSlugs: string[];
  tags: string[];
  summary: string;
  thumbnail: BuildArticleThumbnail | null;
  collectionCompleteness: CollectionCompleteness;
  extractionConfidence: number;
  missingFields: string[];
  teamExtractionMethod: TeamExtractionMethod | null;
  teamExtractionIssue: string | null;
  thumbnailExtraction: {
    rejectedCount: number;
    rejectionReasons: Record<string, number>;
  };
};

export type ExtractionOutcome =
  | { status: "accepted"; article: ExtractedArticle }
  | { status: "excluded"; reason: string };

export type SourceCollectionStatus =
  | "completed"
  | "partial"
  | "failed"
  | "disabled-by-policy"
  | "not-run";

export type SourceCollectionStats = {
  status: SourceCollectionStatus;
  candidateUrlCount: number;
  candidateCount: number;
  knownCandidateCount: number;
  fetchedCount: number;
  remainingCount: number;
  publishedCount: number;
  completePublishedCount: number;
  metadataOnlyPublishedCount: number;
  updatedCount: number;
  duplicateCount: number;
  excludedCount: number;
  fetchFailureCount: number;
  extractionSuccessCount?: number;
  completeCount: number;
  metadataOnlyCount: number;
  thumbnailFoundCount: number;
  thumbnailMissingCount: number;
  thumbnailUpdatedCount: number;
  thumbnailRejectedCount: number;
  fallbackCount: number;
  completePromotedCount: number;
  thumbnailDomains: Record<string, number>;
  teamExtractionMethods: Partial<Record<TeamExtractionMethod, number>>;
  metadataOnlyReasons: Record<string, number>;
  exclusionReasons: Record<string, number>;
};

export type CandidateCollectionState = {
  url: string;
  sourceArticleId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastCheckedAt: string | null;
};

export type SourceCollectionCursor = {
  nextIndex: number;
  candidates: CandidateCollectionState[];
};

export type CollectionStatus = {
  lastRunAt: string | null;
  durationMs: number;
  dryRun: boolean;
  sources: Record<BuildArticleSource, SourceCollectionStats>;
  cursors: Record<BuildArticleSource, SourceCollectionCursor>;
};

export type CollectionContext = {
  appMeta: AppMeta;
  pokemon: PokemonEntry[];
  manualArticles: BuildArticle[];
  generatedArticles: GeneratedBuildArticle[];
  now: Date;
};

export type FetchResult =
  | {
      ok: true;
      url: string;
      status: number;
      contentType: string;
      text: string;
    }
  | {
      ok: false;
      url: string;
      status: number | null;
      reason: string;
      permanent: boolean;
    };
