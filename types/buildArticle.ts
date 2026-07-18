export type BattleFormat = "single" | "double";
export type BuildArticleSource = "pokesol" | "note";
export type CollectionCompleteness = "complete" | "metadata-only";
export type TeamExtractionMethod =
  | "structured-data"
  | "section-headings"
  | "numbered-items"
  | "table"
  | "image-metadata";
export type GeneratedArticleStatus =
  | "active"
  | "temporarily-unavailable"
  | "removed";

export type BuildArticle = {
  id: string;
  title: string;
  author: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  battleFormat: BattleFormat;
  regulation: string;
  season: string;
  builderSeasonId: string;
  result: string;
  pokemonSlugs: string[];
  tags: string[];
  summary: string;
  collectionCompleteness?: CollectionCompleteness;
  collection?: {
    source: BuildArticleSource;
    firstCollectedAt: string;
    lastCollectedAt: string;
  };
};

export type GeneratedBuildArticle = {
  id: string;
  source: BuildArticleSource;
  sourceArticleId: string | null;
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  authorName: string;
  publishedAt: string;
  battleFormat: BattleFormat;
  regulationId: string;
  builderSeasonId: string;
  result: string | null;
  pokemonSlugs: string[];
  tags: string[];
  summary: string;
  collectionCompleteness: CollectionCompleteness;
  extractionConfidence: number;
  missingFields: string[];
  teamExtractionMethod: TeamExtractionMethod | null;
  teamExtractionIssue: string | null;
  firstCollectedAt: string;
  lastCollectedAt: string;
  contentFingerprint: string;
  extractorVersion: string;
  status: GeneratedArticleStatus;
  consecutiveFetchFailures: number;
  lastSuccessfulFetchAt: string;
};

export type PokemonLabelMap = Record<string, string>;
