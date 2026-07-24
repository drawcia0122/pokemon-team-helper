export type EnvironmentDataSource = "pokemon-showdown";

export type EnvironmentBattleFormat = "single" | "double";

export type InvestmentSystem = "ev" | "stat-points";

export type EnvironmentFieldAvailability =
  | "available"
  | "not-applicable"
  | "not-provided";

export type EnvironmentFormatDefinition = {
  sourceFormatId: string;
  gameId: "pokemon-champions";
  regulationId: "M-A" | "M-B";
  battleFormat: EnvironmentBattleFormat;
  investmentSystem: InvestmentSystem;
  enabled: boolean;
};

export type EnvironmentSourcePolicy = {
  source: string;
  automationAllowed: boolean;
  reason: string;
};

export type EnvironmentFormatRegistry = {
  schemaVersion: 1;
  source: EnvironmentDataSource;
  allowedHost: "www.smogon.com";
  allowedCutoffs: number[];
  allowedUnresolvedPokemonNames: string[];
  automaticUpdate: {
    sourceFormatId: string;
    cutoffs: number[];
    periodStrategy: "previous-complete-month";
  };
  formats: EnvironmentFormatDefinition[];
  sourcePolicies: EnvironmentSourcePolicy[];
};

export type EnvironmentPokemonAliases = {
  schemaVersion: 1;
  source: EnvironmentDataSource;
  aliases: Record<string, string>;
};

export type EnvironmentDatasetMetadata = {
  schemaVersion: 1;
  datasetId: string;
  source: "Pokemon Showdown";
  sourceUrl: string;
  fetchedAt: string;
  publishedAt: string;
  regulation: "M-A" | "M-B";
  season: string;
  cutoff: number;
  minimumUsageRate: number;
  checksum: string;
  pokemonCount: number;
};

export type EnvironmentUsage = {
  rank: number;
  rate: number;
  rawCount: number;
  rawWeight: number;
};

export type WeightedEnvironmentValue = {
  id: string;
  sourceName: string;
  share: number;
  rawWeight: number;
};

export type EnvironmentStatSpread = {
  natureId: string;
  natureSourceName: string;
  investmentSystem: InvestmentSystem;
  values: {
    hp: number;
    attack: number;
    defense: number;
    specialAttack: number;
    specialDefense: number;
    speed: number;
  };
  share: number;
  rawWeight: number;
};

export type EnvironmentPokemonReference = {
  slug: string | null;
  sourceName: string;
  share: number;
  rawWeight: number;
};

export type EnvironmentCheckCounter = EnvironmentPokemonReference & {
  sampleCount: number;
  score: number;
  uncertainty: number;
};

export type EnvironmentPokemon = {
  slug: string;
  sourceName: string;
  usage: EnvironmentUsage;
  moves: WeightedEnvironmentValue[];
  items: WeightedEnvironmentValue[];
  abilities: WeightedEnvironmentValue[];
  statSpreads: EnvironmentStatSpread[];
  teraTypes: WeightedEnvironmentValue[];
  teammates: EnvironmentPokemonReference[];
  checksAndCounters: EnvironmentCheckCounter[];
};

export type UnresolvedEnvironmentName = {
  sourceName: string;
  contexts: Array<"pokemon" | "teammate" | "check-and-counter">;
  occurrences: number;
};

export type EnvironmentSnapshot = {
  schemaVersion: 1;
  snapshotId: string;
  source: {
    id: EnvironmentDataSource;
    publisher: "Smogon";
    datasetKind: "simulator-aggregate";
    datasetLicense: "not-explicitly-stated";
    softwareLicense: "MIT";
  };
  sourceUrl: string;
  retrievedAt: string;
  contentHash: string;
  period: {
    kind: "month";
    value: string;
    startAt: string;
    endAt: string;
  };
  regulationId: "M-A" | "M-B";
  battleFormat: EnvironmentBattleFormat;
  sourceFormatId: string;
  ratingCutoff: number;
  battleCount: number;
  populationNote: string;
  fieldAvailability: {
    usage: EnvironmentFieldAvailability;
    moves: EnvironmentFieldAvailability;
    items: EnvironmentFieldAvailability;
    abilities: EnvironmentFieldAvailability;
    statSpreads: EnvironmentFieldAvailability;
    teraTypes: EnvironmentFieldAvailability;
    teammates: EnvironmentFieldAvailability;
    checksAndCounters: EnvironmentFieldAvailability;
  };
  pokemon: EnvironmentPokemon[];
  normalization: {
    normalizerVersion: "1.1.0";
    usageUnit: "ratio";
    distributionUnit: "share-and-source-weight";
    topK: null;
    investmentSystem: InvestmentSystem;
    unresolvedPokemonCount: number;
    unresolvedReferenceCount: number;
    unresolvedNames: UnresolvedEnvironmentName[];
  };
};

export type EnvironmentSnapshotIndexEntry = {
  snapshotId: string;
  source: EnvironmentDataSource;
  period: string;
  regulationId: "M-A" | "M-B";
  battleFormat: EnvironmentBattleFormat;
  sourceFormatId: string;
  ratingCutoff: number;
  status: "available";
  path: string;
  retrievedAt: string;
  contentHash: string;
  metadata: EnvironmentDatasetMetadata;
};

export type EnvironmentSnapshotIndex = {
  schemaVersion: 1;
  snapshots: EnvironmentSnapshotIndexEntry[];
  latest: Array<{
    sourceFormatId: string;
    ratingCutoff: number;
    snapshotId: string;
    path: string;
  }>;
};
