import type {
  RecommendationContributionCategory
} from "@/lib/recommendationAnalyzer";
import type { BattleValueAxis } from "@/types/battleValue";

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
  finalRecommendation: number;
};

export type RecommendationIntegrationResult = {
  metadata: {
    schemaVersion: 1;
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
  top20RetentionRate: number;
  top50RetentionRate: number;
  representatives: RecommendationIntegrationCandidate[];
  megaConstraintsPreserved: boolean;
};
