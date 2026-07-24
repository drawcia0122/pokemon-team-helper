import type {
  EnvironmentBattleFormat,
  EnvironmentDatasetMetadata,
  InvestmentSystem
} from "@/types/environmentData";

export type EnvironmentSelection = {
  battleFormat: EnvironmentBattleFormat;
  regulationId: "M-A" | "M-B";
  ratingCutoff: 0 | 1760;
};

export type EnvironmentRankingEntryDto = {
  rank: number;
  slug: string;
  name: string;
  pokemonId: number;
  usageRate: number;
  detailUrl: string;
};

export type EnvironmentRankingDatasetDto = EnvironmentSelection & {
  snapshotId: string;
  metadata: EnvironmentDatasetMetadata;
  sourceFormatId: string;
  period: string;
  retrievedAt: string;
  battleCount: number;
  contentHash: string;
  ranking: EnvironmentRankingEntryDto[];
};

export type EnvironmentRankingCatalogDto = {
  source: "Pokemon Showdown";
  datasets: EnvironmentRankingDatasetDto[];
  initialSelection: EnvironmentSelection;
};

export type EnvironmentDistributionDto = {
  id: string;
  name: string;
  rate: number;
};

export type EnvironmentRelationDto = {
  slug: string | null;
  name: string;
  pokemonId: number | null;
  rate: number;
};

export type EnvironmentStatSpreadDto = {
  natureId: string;
  natureName: string;
  investmentSystem: InvestmentSystem;
  values: {
    hp: number;
    attack: number;
    defense: number;
    specialAttack: number;
    specialDefense: number;
    speed: number;
  };
  rate: number;
};

export type EnvironmentPokemonDetailDto = {
  schemaVersion: 1;
  snapshotId: string;
  slug: string;
  name: string;
  pokemonId: number;
  rank: number;
  usageRate: number;
  moves: EnvironmentDistributionDto[];
  items: EnvironmentDistributionDto[];
  abilities: EnvironmentDistributionDto[];
  statSpreads: EnvironmentStatSpreadDto[];
  teammates: EnvironmentRelationDto[];
  checksAndCounters: EnvironmentRelationDto[];
};
