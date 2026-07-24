import type {
  EnvironmentBattleFormat,
  EnvironmentDatasetMetadata,
  InvestmentSystem
} from "@/types/environmentData";
import type { TypeName } from "@/types/pokemon";

export type EnvironmentMoveDamageClass = "physical" | "special" | "status";

export type EnvironmentMoveMetadata = {
  type: TypeName;
  damageClass: EnvironmentMoveDamageClass;
};

export type EnvironmentMoveMetadataRegistry = {
  schemaVersion: 1;
  source: {
    repository: "https://github.com/PokeAPI/pokeapi";
    commit: string;
  };
  moves: Record<string, EnvironmentMoveMetadata>;
};

export type ThreatEnvironmentMove = EnvironmentMoveMetadata & {
  id: string;
  name: string;
  share: number;
};

export type ThreatEnvironmentAbility = {
  id: string;
  name: string;
  share: number;
};

export type ThreatEnvironmentItem = {
  id: string;
  share: number;
};

export type ThreatEnvironmentRelation = {
  slug: string | null;
  name: string;
  share: number;
};

export type ThreatEnvironmentPokemon = {
  slug: string;
  usageRank: number;
  usageRate: number;
  choiceScarfShare?: number;
  offenseProfile: {
    physicalShare: number;
    specialShare: number;
    neutralShare: number;
  };
  moves: ThreatEnvironmentMove[];
  abilities: ThreatEnvironmentAbility[];
  items?: ThreatEnvironmentItem[];
  teammates: ThreatEnvironmentRelation[];
  checksAndCounters: ThreatEnvironmentRelation[];
};

export type ThreatEnvironmentDataset = {
  snapshotId: string;
  metadata: EnvironmentDatasetMetadata;
  source: "Pokemon Showdown";
  period: string;
  regulationId: "M-A" | "M-B";
  battleFormat: EnvironmentBattleFormat;
  ratingCutoff: number;
  investmentSystem: InvestmentSystem;
  pokemon: ThreatEnvironmentPokemon[];
};

export type ThreatEnvironmentCatalog = {
  schemaVersion: 1;
  datasets: ThreatEnvironmentDataset[];
};
