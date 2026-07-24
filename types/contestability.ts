export type ContestabilityAxis =
  | "environment"
  | "team"
  | "matchup"
  | "reliability";

export type ContestabilityReason = {
  axis: ContestabilityAxis;
  impact: "positive" | "caution";
  text: string;
};

export type ContestabilityCandidate = {
  score: number;
  axes: Record<ContestabilityAxis, number>;
  reasons: ContestabilityReason[];
  recommendationConfidence: number;
  diagnostics: {
    evaluatedThreatCount: number;
    minimumJobRate: number;
    stableJobRate: number;
    roleNeedCoverage: number;
    roleOverlap: number;
    usageConfidence: number;
    conditionality: number;
  };
};
