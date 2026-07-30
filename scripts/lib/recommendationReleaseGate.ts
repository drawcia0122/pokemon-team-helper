import type { RecommendationBenchmarkConditionStatus } from "@/types/recommendationBenchmark";

export type RankingRetentionAudit = {
  top20: number;
  top50: number;
};

export type RecommendationReleaseGateInput = {
  overallScore: number;
  failCount: number;
  case001Status: RecommendationBenchmarkConditionStatus | null;
  task049OverallScore: number;
  rankingRetention: RankingRetentionAudit;
};

export type RecommendationReleaseGateResult = {
  passed: boolean;
  failures: string[];
  rankingRetention: RankingRetentionAudit & {
    classification: "audit-only";
  };
};

export function evaluateRecommendationReleaseGate(
  input: RecommendationReleaseGateInput
): RecommendationReleaseGateResult {
  const failures: string[] = [];
  if (input.overallScore < 90) {
    failures.push(`Benchmark Overall ${input.overallScore} < 90`);
  }
  if (input.failCount !== 0) {
    failures.push(`Benchmark FAIL ${input.failCount} != 0`);
  }
  if (input.case001Status !== "PASS") {
    failures.push(`CASE001 ${input.case001Status ?? "missing"} != PASS`);
  }
  if (input.overallScore <= input.task049OverallScore) {
    failures.push(
      `Benchmark Overall ${input.overallScore} <= TASK049 ${input.task049OverallScore}`
    );
  }
  return {
    passed: failures.length === 0,
    failures,
    rankingRetention: {
      ...input.rankingRetention,
      classification: "audit-only"
    }
  };
}

export function formatRankingRetentionAudit(
  audit: RankingRetentionAudit
): string {
  return [
    "[audit] Ranking Retention (Audit Only)",
    `[audit] TOP20 ${(audit.top20 * 100).toFixed(1)}% - Audit Only`,
    `[audit] TOP50 ${(audit.top50 * 100).toFixed(1)}% - Audit Only`,
    "[audit] Ranking Retention is not a release gate."
  ].join("\n");
}
