export type BattleFormat = "single" | "double";
export type BuildArticleSource = "pokesol" | "note" | "hatena-blog";
export type CollectionCompleteness = "complete" | "metadata-only";
export type BuildArticleThumbnailSource =
  | "structured-data"
  | "og-image"
  | "twitter-image"
  | "cover-image"
  | "manual";
export type BuildArticleThumbnail = {
  url: string;
  source: BuildArticleThumbnailSource;
  alt: string | null;
  width: number | null;
  height: number | null;
};
export type TeamExtractionMethod =
  | "structured-data"
  | "section-headings"
  | "numbered-items"
  | "table"
  | "image-metadata"
  | "section-paragraphs"
  | "embedded-image-metadata"
  | "table-of-contents";
export type GeneratedArticleStatus =
  | "active"
  | "temporarily-unavailable"
  | "removed";
export type ArticleQualityScore = {
  targetGameConfidence: number;
  formatConfidence: number;
  seasonConfidence: number;
  teamConfidence: number;
  overallConfidence: number;
};
export type TeamExtractionEvidence = {
  extractionMethod: TeamExtractionMethod;
  sourceHeading: string;
  resolvedCount: 6;
  confidence: "high";
};
export type PokemonNameResolutionStats = {
  exact: number;
  alias: number;
  decorated: number;
  ambiguous: number;
  unresolved: number;
};

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
  thumbnail: BuildArticleThumbnail | null;
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
  thumbnail: BuildArticleThumbnail | null;
  collectionCompleteness: CollectionCompleteness;
  extractionConfidence: number;
  missingFields: string[];
  teamExtractionMethod: TeamExtractionMethod | null;
  teamExtractionIssue: string | null;
  extractionEvidence: TeamExtractionEvidence | null;
  qualityScore: ArticleQualityScore;
  pokemonNameResolutionStats: PokemonNameResolutionStats;
  firstCollectedAt: string;
  lastCollectedAt: string;
  contentFingerprint: string;
  extractorVersion: string;
  status: GeneratedArticleStatus;
  consecutiveFetchFailures: number;
  lastSuccessfulFetchAt: string;
};

export type PokemonLabelMap = Record<string, string>;
