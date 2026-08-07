import type {
  GeneratedPokemonContentItem,
  PokemonContentSource
} from "../../types/pokemonContent";
import type { RssImageAudit } from "./rssImageExtraction";

export const CONTENT_COLLECTOR_VERSION = "2.2.0";

export type ContentSourceConfig = {
  id: PokemonContentSource;
  label: string;
  feedUrl: string;
  feedUrls?: string[];
  robotsUrl: string;
  termsUrl: string;
  allowedDomains: string[];
  automationAllowed: boolean;
  policyNote: string;
  requestDelayMs: number;
  timeoutMs: number;
  retries: number;
  maxResponseBytes: number;
  normalItemLimit: number;
  backfillItemLimit: number;
  requiresApiKey?: boolean;
};

export type ContentSourceState = {
  feedFingerprint: string;
  articleIds: string[];
  itemFingerprints: Record<string, string>;
  lastSuccessfulFetchAt?: string;
  lastArticlePublishedAt?: string | null;
  consecutiveFailures?: number;
  lastError?: string;
  lastStatus?: ContentSourceStats["status"];
  lastCandidateCount?: number;
  lastAcceptedCount?: number;
  lastExcludedCount?: number;
  lastDuplicateCount?: number;
  lastExclusionReasons?: Record<string, number>;
  lastImageAudits?: RssImageAudit[];
};

export type ContentCollectionState = {
  version: 1;
  collectorVersion: string;
  sources: Partial<Record<PokemonContentSource, ContentSourceState>>;
};

export type ContentSourceStats = {
  status:
    | "success"
    | "failed"
    | "disabled-by-policy"
    | "empty-preserved"
    | "no-matches"
    | "empty-feed"
    | "rate-limited"
    | "authentication-error"
    | "disabled";
  candidateCount: number;
  acceptedCount: number;
  excludedCount: number;
  duplicateCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  preservedCount: number;
  exclusionReasons: Record<string, number>;
  imageAudits?: RssImageAudit[];
  error?: string;
};

export type ContentCollectionResult = {
  generatedItems: GeneratedPokemonContentItem[];
  state: ContentCollectionState;
  sourceStats: Partial<Record<PokemonContentSource, ContentSourceStats>>;
  wroteFiles: boolean;
  failed: boolean;
  communicatedDomains: string[];
};

export type HttpResult =
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

export type ContentFetchClient = {
  fetchText(value: string, expected: "xml" | "text" | "json"): Promise<HttpResult>;
};
