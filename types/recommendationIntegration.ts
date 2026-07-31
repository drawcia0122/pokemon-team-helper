import type {
  RecommendationContributionCategory
} from "@/lib/recommendationContribution";
import type { BattleValueAxis } from "@/types/battleValue";
import type {
  ContestabilityCandidate,
  ContestabilityReason
} from "@/types/contestability";

export type BattleValueIntegrationExplanation = {
  axis: BattleValueAxis;
  label: string;
  score: number;
  text: string;
};

export type RecommendationIntegrationCandidate = {
  slug: string;
  name: string;
  eligibility: boolean;
  baselineRank: number;
  integratedRank: number;
  rankDelta: number;
  baselineRecommendation: number;
  recommendationNormalized: number;
  contributionNormalized: Record<
    RecommendationContributionCategory,
    number
  >;
  contributionRatios: Record<
    RecommendationContributionCategory,
    number
  >;
  battleValue: number;
  battleValueRank: number;
  battleValueNormalized: number;
  battleValueContribution: number;
  battleValueRatio: number;
  battleValueAxes: Record<BattleValueAxis, number>;
  battleValueExplanation: BattleValueIntegrationExplanation[];
  contestability: number;
  contestabilityAxes: ContestabilityCandidate["axes"];
  contestabilityReasons: ContestabilityReason[];
  contestabilityContribution: number;
  contestabilityRatio: number;
  abilityMatchupValue: number;
  abilityContribution: number;
  abilityExplanation: string[];
  defensiveCoreSynergy: number;
  recommendationConfidence: number;
  confidenceAdjustedRecommendation: number;
  preContestabilityRecommendation: number;
  finalRecommendation: number;
};

export type RecommendationIntegrationResult = {
  metadata: {
    schemaVersion: 2;
    mode: "integrated";
    normalization: "percentile-rank";
    formula: string;
  };
  input: {
    team: string[];
    regulation: string;
    profile: "standard" | "trick-room";
    datasetId: string;
  };
  config: {
    battleValueWeight: number;
    contestabilityWeight: number;
    recommendationWeight: number;
    recommendationConfidenceFloor: number;
    recommendationConfidenceMaximum: number;
    directActionConfidenceBoost: number;
    recommendationConfidenceMidpoint: number;
    recommendationConfidenceSlope: number;
    baselineContinuityWeight: number;
    contributionWeight: number;
    contributionWeights: Record<
      RecommendationContributionCategory,
      number
    >;
  };
  candidates: RecommendationIntegrationCandidate[];
  baselineTop20: string[];
  integratedTop20: string[];
  baselineTop50: string[];
  integratedTop50: string[];
  preContestabilityTop20: string[];
  preContestabilityTop50: string[];
  top20RetentionRate: number;
  top50RetentionRate: number;
  representatives: RecommendationIntegrationCandidate[];
  megaConstraintsPreserved: boolean;
};
