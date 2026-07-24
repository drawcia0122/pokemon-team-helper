import type { BattleValueAxis } from "@/types/battleValue";
import type { TeamProfile } from "@/lib/teamProfile";

export type RecommendationBenchmarkPriority =
  | "critical"
  | "high"
  | "normal";

export type RecommendationBenchmarkExpected =
  | {
      id: string;
      type: "rank-at-most";
      candidate: string;
      maxRank: number;
      weight: number;
      failureReason: string;
    }
  | {
      id: string;
      type: "ranks-above";
      candidate: string;
      reference: string;
      weight: number;
      failureReason: string;
    }
  | {
      id: string;
      type: "battle-value-at-least";
      candidate: string;
      minimum: number;
      weight: number;
      failureReason: string;
    }
  | {
      id: string;
      type: "battle-axis-at-least";
      candidate: string;
      axis: BattleValueAxis;
      minimum: number;
      weight: number;
      failureReason: string;
    }
  | {
      id: string;
      type: "rank-improves";
      candidate: string;
      minimumPlaces: number;
      weight: number;
      failureReason: string;
    }
  | {
      id: string;
      type: "top-with-axis";
      axis: BattleValueAxis;
      maxRank: number;
      minimum: number;
      weight: number;
      failureReason: string;
    };

export type RecommendationBenchmarkCase = {
  id: string;
  title: string;
  description: string;
  regulation: string;
  profile: TeamProfile;
  team: string[];
  expected: RecommendationBenchmarkExpected[];
  priority: RecommendationBenchmarkPriority;
  tags: string[];
};

export type RecommendationBenchmarkDataset = {
  schemaVersion: 1;
  title: string;
  description: string;
  cases: RecommendationBenchmarkCase[];
};

export type RecommendationBenchmarkConditionStatus =
  | "PASS"
  | "PARTIAL"
  | "FAIL";

export type RecommendationBenchmarkConditionResult = {
  id: string;
  type: RecommendationBenchmarkExpected["type"];
  status: RecommendationBenchmarkConditionStatus;
  score: number;
  weight: number;
  message: string;
  failureReason: string | null;
};

export type RecommendationBenchmarkObservedCandidate = {
  slug: string;
  recommendation: number;
  battleValue: number;
  finalRecommendation: number;
  baselineRank: number;
  finalRank: number;
  rankDelta: number;
};

export type RecommendationBenchmarkCaseResult = {
  id: string;
  title: string;
  priority: RecommendationBenchmarkPriority;
  tags: string[];
  status: RecommendationBenchmarkConditionStatus;
  score: number;
  conditions: RecommendationBenchmarkConditionResult[];
  observedCandidates: RecommendationBenchmarkObservedCandidate[];
  failureReasons: string[];
  durationMs: number;
};

export type RecommendationBenchmarkRegression = {
  baselineAvailable: boolean;
  status: "improved" | "regressed" | "unchanged" | "no-baseline";
  overallDelta: number | null;
  passRateDelta: number | null;
  partialRateDelta: number | null;
  failRateDelta: number | null;
};

export type RecommendationBenchmarkResult = {
  metadata: {
    schemaVersion: 1;
    generatedAt: string;
    dataset: string;
    caseCount: number;
  };
  summary: {
    overallScore: number;
    passCount: number;
    partialCount: number;
    failCount: number;
    passRate: number;
    partialRate: number;
    failRate: number;
    durationMs: number;
  };
  regression: RecommendationBenchmarkRegression;
  cases: RecommendationBenchmarkCaseResult[];
};

export type RecommendationBenchmarkGolden = {
  schemaVersion: 1;
  generatedFromCommit: string;
  overallScore: number;
  passRate: number;
  partialRate: number;
  failRate: number;
  caseScores: Record<string, number>;
};
