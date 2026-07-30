import { readFileSync } from "node:fs";
import {
  compareRecommendationBenchmarkRegression,
  getRecommendationBenchmarkDataset,
  runRecommendationBenchmark,
  validateRecommendationBenchmarkDataset
} from "@/lib/recommendationBenchmark";
import { evaluateRecommendationReleaseGate } from "@/scripts/lib/recommendationReleaseGate";
import type {
  RecommendationBenchmarkGolden,
  RecommendationBenchmarkResult
} from "@/types/recommendationBenchmark";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const dataset = getRecommendationBenchmarkDataset();
validateRecommendationBenchmarkDataset(dataset);

const requiredTopics = [
  "Dragon offense",
  "Hyper offense",
  "Stall",
  "Balance",
  "Trick Room",
  "Rain",
  "Sand",
  "Sun",
  "Hazard Stack",
  "Hazard Removal不足",
  "Setup不足",
  "Cleanup不足",
  "Priority不足",
  "Mega入り序盤",
  "Mega入り終盤",
  "Defensive Team",
  "Pivot Team",
  "Double Wall",
  "WallBreak不足",
  "WinCondition不足"
];
const searchableTopics = dataset.cases.flatMap((entry) => [
  entry.title,
  ...entry.tags
]);
for (const topic of requiredTopics) {
  assert(
    searchableTopics.includes(topic),
    `必須Benchmark Caseがありません: ${topic}`
  );
}

const expectedSlugs = new Set(
  dataset.cases.flatMap((entry) =>
    entry.expected.flatMap((expected) => {
      if (expected.type === "top-with-axis") return [];
      if (expected.type === "ranks-above") {
        return [expected.candidate, expected.reference];
      }
      return [expected.candidate];
    })
  )
);
for (const slug of [
  "starmie-mega",
  "gengar-mega",
  "kingambit",
  "mawile-mega",
  "volcarona",
  "dragapult",
  "jolteon",
  "sylveon"
]) {
  assert(
    expectedSlugs.has(slug),
    `代表候補を利用するCaseがありません: ${slug}`
  );
}

assert(
  dataset.cases.every((entry) =>
    entry.expected.every((expected) =>
      [
        "rank-at-most",
        "ranks-above",
        "battle-value-at-least",
        "battle-axis-at-least",
        "rank-improves",
        "top-with-axis"
      ].includes(expected.type)
    )
  ),
  "固定順位を前提とするExpected Ruleが含まれています"
);

const golden = JSON.parse(
  readFileSync("benchmarks/golden.json", "utf8")
) as RecommendationBenchmarkGolden;
const result = runRecommendationBenchmark({
  golden,
  generatedAt: "2026-07-24T00:00:00.000Z"
});

assert(
  result.metadata.caseCount === dataset.cases.length &&
    result.cases.length >= 20,
  "Benchmark Case数が不正です"
);
assert(
  result.cases.every(
    (entry) =>
      entry.score >= 0 &&
      entry.score <= 100 &&
      entry.conditions.length > 0 &&
      entry.observedCandidates.length > 0 &&
      entry.observedCandidates.every(
        (observed) =>
          Number.isFinite(observed.recommendation) &&
          Number.isFinite(observed.battleValue) &&
          Number.isFinite(observed.finalRecommendation)
      )
  ),
  "Case ScoreまたはRecommendation観測値が不正です"
);
assert(
  result.summary.passCount +
      result.summary.partialCount +
      result.summary.failCount ===
    result.metadata.caseCount,
  "PASS・PARTIAL・FAIL件数がCase数と一致しません"
);
const case001 = result.cases.find((entry) => entry.id === "case001");
const releaseGate = evaluateRecommendationReleaseGate({
  overallScore: result.summary.overallScore,
  failCount: result.summary.failCount,
  case001Status: case001?.status ?? null,
  task049OverallScore: golden.overallScore,
  rankingRetention: {
    top20: 0.55,
    top50: 0.66
  }
});
assert(
  releaseGate.passed,
  `Recommendation Release Gateを満たしていません: ${releaseGate.failures.join(" / ")}`
);
assert(
  releaseGate.rankingRetention.classification === "audit-only" &&
    evaluateRecommendationReleaseGate({
      overallScore: result.summary.overallScore,
      failCount: result.summary.failCount,
      case001Status: case001?.status ?? null,
      task049OverallScore: golden.overallScore,
      rankingRetention: { top20: 0, top50: 0 }
    }).passed,
  "順位残留率低下だけでRelease Gateが失敗しました"
);
assert(
  !evaluateRecommendationReleaseGate({
    overallScore: 89.99,
    failCount: 0,
    case001Status: "PASS",
    task049OverallScore: golden.overallScore,
    rankingRetention: { top20: 1, top50: 1 }
  }).passed &&
    !evaluateRecommendationReleaseGate({
      overallScore: result.summary.overallScore,
      failCount: 1,
      case001Status: "PASS",
      task049OverallScore: golden.overallScore,
      rankingRetention: { top20: 1, top50: 1 }
    }).passed &&
    !evaluateRecommendationReleaseGate({
      overallScore: result.summary.overallScore,
      failCount: 0,
      case001Status: "FAIL",
      task049OverallScore: golden.overallScore,
      rankingRetention: { top20: 1, top50: 1 }
    }).passed,
  "Benchmark悪化をRelease Blockerとして検出できません"
);
assert(
  Object.keys(golden.caseScores).length === dataset.cases.length &&
    dataset.cases.every((entry) => entry.id in golden.caseScores),
  "Goldenへ全Caseの基準点が保存されていません"
);

const summary: RecommendationBenchmarkResult["summary"] = {
  ...result.summary,
  overallScore: golden.overallScore - 1,
  passRate: golden.passRate
};
assert(
  compareRecommendationBenchmarkRegression(summary, golden).status ===
    "regressed",
  "Overall低下をregressedとして検出できません"
);
assert(
  compareRecommendationBenchmarkRegression(
    {
      ...result.summary,
      overallScore: golden.overallScore,
      passRate: golden.passRate - 0.01
    },
    golden
  ).status === "regressed",
  "PASS率低下をregressedとして検出できません"
);
assert(
  compareRecommendationBenchmarkRegression(
    {
      ...result.summary,
      overallScore: golden.overallScore + 1,
      passRate: golden.passRate
    },
    golden
  ).status === "improved",
  "改善をimprovedとして検出できません"
);

const failureCases = result.cases.filter(
  (entry) => entry.status === "FAIL"
);
assert(
  failureCases.every(
    (entry) =>
      entry.failureReasons.length > 0 &&
      entry.conditions.some((condition) => condition.status === "FAIL")
  ),
  "FAIL Caseの理由を出力できません"
);

console.log(
  `[ok] TASK049 Benchmark: cases=${result.metadata.caseCount}, score=${result.summary.overallScore}, PASS=${result.summary.passCount}, PARTIAL=${result.summary.partialCount}, FAIL=${result.summary.failCount}`
);
