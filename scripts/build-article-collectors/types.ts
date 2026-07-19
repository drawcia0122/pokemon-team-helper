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
  publishedAt?: string;
  updatedAt?: string;
  title?: string;
  authorName?: string;
  tags?: string[];
  thumbnailUrl?: string | null;
  contentFingerprint?: string;
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
  updatedAt?: string | null;
  contentFingerprint?: string | null;
  consecutiveFetchFailures?: number;
};

export type SourceCollectionCursor = {
  nextIndex: number;
  candidates: CandidateCollectionState[];
};

export type HatenaFeedEntryState = {
  updatedAt: string | null;
  contentFingerprint: string;
};

export type HatenaFeedState = {
  domain: string;
  feedUrl: string;
  etag: string | null;
  lastModified: string | null;
  lastCheckedAt: string | null;
  lastSuccessfulFetchAt: string | null;
  consecutiveFetchFailures: number;
  entries: Record<string, HatenaFeedEntryState>;
};

export type HatenaBlogState = {
  domain: string;
  discoveredFrom: string | null;
  discoveredAt: string;
  feedUrl: string;
  automationAllowed: boolean;
  customDomain: boolean;
  platformVerified: boolean;
};

export type CollectionStatus = {
  lastRunAt: string | null;
  durationMs: number;
  dryRun: boolean;
  sources: Record<BuildArticleSource, SourceCollectionStats>;
  cursors: Record<BuildArticleSource, SourceCollectionCursor>;
  hatenaFeeds: Record<string, HatenaFeedState>;
  hatenaBlogs: HatenaBlogState[];
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
      headers?: {
        etag: string | null;
        lastModified: string | null;
      };
      notModified?: boolean;
    }
  | {
      ok: false;
      url: string;
      status: number | null;
      reason: string;
      permanent: boolean;
    };

export type FetchExpectedContent = "html" | "text" | "xml";

export type FetchRequestOptions = {
  headers?: Record<string, string>;
  allowNotModified?: boolean;
};
