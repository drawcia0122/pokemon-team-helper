import type { BattleValueCandidate } from "@/types/battleValue";

export type FusionZone = "safe" | "neutral" | "danger";

export type FusionCandidate = {
  slug: string;
  name: string;
  eligibility: boolean;
  recommendationRank: number | null;
  recommendationReferenceRank: number;
  recommendationScore: number | null;
  recommendationNormalized: number;
  battleValueRank: number;
  battleValue: number;
  battleValueNormalized: number;
  fusionRank: number;
  fusionScore: number;
  rankDeltaVsRecommendation: number;
  rankDifferenceVsBattleValue: number;
  absoluteRankMovement: number;
};

export type FusionStability = {
  totalRankMovement: number;
  averageRankMovement: number;
  medianRankMovement: number;
  top20RetentionRate: number;
  top50RetentionRate: number;
  top20ChangeRate: number;
  top50ChangeRate: number;
  top100ChangeRate: number;
  battleValueReflectionRate: number;
};

export type FusionWeightResult = {
  weight: number;
  weightPercent: number;
  zone: FusionZone;
  zoneReasons: string[];
  stability: FusionStability;
  ranking: FusionCandidate[];
};

export type FusionProtectionCategory =
  | "threat-support"
  | "static-support"
  | "battle-candidate"
  | "balanced"
  | "high-value-but-excluded";

export type FusionProtectionMetric = {
  category: FusionProtectionCategory;
  candidateCount: number;
  weightPercent: number;
  averageRankDelta: number;
  averageAbsoluteRankMovement: number;
  protectedRate: number;
};

export type FusionRepresentative = {
  slug: string;
  name: string;
  eligibility: boolean;
  recommendationRank: number | null;
  recommendationReferenceRank: number;
  battleValueRank: number;
  battleValue: number;
  trajectories: Array<{
    weightPercent: number;
    fusionRank: number;
    rankDeltaVsRecommendation: number;
  }>;
};

export type FusionSensitivity = {
  mostAffected: FusionCandidate[];
  leastAffected: FusionCandidate[];
};

export type RecommendationFusionResult = {
  metadata: {
    schemaVersion: 1;
    mode: "shadow";
    deterministic: true;
    normalization: "percentile-rank";
    formula: string;
    tieBreak: string;
  };
  input: {
    team: string[];
    regulation: string;
    profile: "standard" | "trick-room";
    datasetId: string;
    candidate: string | null;
  };
  weights: number[];
  candidateCount: number;
  baseline: {
    recommendationRanking: FusionCandidate[];
    battleValueRanking: BattleValueCandidate[];
    averageRecommendationDistanceFromBattleValue: number;
  };
  weightResults: FusionWeightResult[];
  safeZone: {
    weights: number[];
    recommendedWeight: number | null;
    rationale: string;
  };
  dangerZone: {
    weights: number[];
    rationale: string;
  };
  sensitivity: FusionSensitivity;
  protectionMetrics: FusionProtectionMetric[];
  representatives: FusionRepresentative[];
  megaConstraintsPreserved: boolean;
  recommendationUnchanged: boolean;
  battleValueUnchanged: boolean;
  semanticGapUnchanged: boolean;
};
