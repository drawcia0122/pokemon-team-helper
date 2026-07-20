import type {
  GeneratedPokemonContentItem,
  PokemonContentSource
} from "../../types/pokemonContent";

export const CONTENT_COLLECTOR_VERSION = "1.0.0";

export type ContentSourceConfig = {
  id: PokemonContentSource;
  label: string;
  feedUrl: string;
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
};

export type ContentSourceState = {
  feedFingerprint: string;
  articleIds: string[];
  itemFingerprints: Record<string, string>;
};

export type ContentCollectionState = {
  version: 1;
  collectorVersion: string;
  sources: Partial<Record<PokemonContentSource, ContentSourceState>>;
};

export type ContentSourceStats = {
  status: "success" | "failed" | "disabled-by-policy" | "empty-preserved";
  candidateCount: number;
  acceptedCount: number;
  excludedCount: number;
  duplicateCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  preservedCount: number;
  exclusionReasons: Record<string, number>;
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
  fetchText(value: string, expected: "xml" | "text"): Promise<HttpResult>;
};
