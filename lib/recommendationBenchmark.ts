import benchmarkDatasetJson from "@/benchmarks/cases.json";
import {
  runRecommendationIntegration
} from "@/scripts/lib/recommendationIntegrationHarness";
import type {
  RecommendationBenchmarkCase,
  RecommendationBenchmarkCaseResult,
  RecommendationBenchmarkConditionResult,
  RecommendationBenchmarkConditionStatus,
  RecommendationBenchmarkDataset,
  RecommendationBenchmarkExpected,
  RecommendationBenchmarkGolden,
  RecommendationBenchmarkObservedCandidate,
  RecommendationBenchmarkPriority,
  RecommendationBenchmarkRegression,
  RecommendationBenchmarkResult
} from "@/types/recommendationBenchmark";
import type {
  RecommendationIntegrationCandidate,
  RecommendationIntegrationResult
} from "@/types/recommendationIntegration";

const PRIORITY_WEIGHTS: Record<RecommendationBenchmarkPriority, number> = {
  critical: 3,
  high: 2,
  normal: 1
};

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

function validateExpected(
  expected: RecommendationBenchmarkExpected,
  caseId: string
): void {
  assert(expected.id.length > 0, `${caseId}: expected.idがありません。`);
  assert(
    Number.isFinite(expected.weight) && expected.weight > 0,
    `${caseId}/${expected.id}: weightが不正です。`
  );
  assert(
    expected.failureReason.length > 0,
    `${caseId}/${expected.id}: failureReasonがありません。`
  );
  if (
    expected.type === "rank-at-most" ||
    expected.type === "top-with-axis"
  ) {
    assert(
      Number.isInteger(expected.maxRank) && expected.maxRank > 0,
      `${caseId}/${expected.id}: maxRankが不正です。`
    );
  }
  if (
    expected.type === "battle-value-at-least" ||
    expected.type === "battle-axis-at-least" ||
    expected.type === "top-with-axis"
  ) {
    assert(
      Number.isFinite(expected.minimum) && expected.minimum >= 0,
      `${caseId}/${expected.id}: minimumが不正です。`
    );
  }
  if (expected.type === "rank-improves") {
    assert(
      Number.isInteger(expected.minimumPlaces) &&
        expected.minimumPlaces >= 0,
      `${caseId}/${expected.id}: minimumPlacesが不正です。`
    );
  }
}

export function validateRecommendationBenchmarkDataset(
  dataset: RecommendationBenchmarkDataset
): void {
  assert(dataset.schemaVersion === 1, "Benchmark schemaVersionが不正です。");
  assert(dataset.title.length > 0, "Benchmark titleがありません。");
  assert(
    dataset.cases.length >= 20,
    `Benchmark Caseが20件未満です: ${dataset.cases.length}`
  );
  const ids = new Set<string>();
  for (const benchmarkCase of dataset.cases) {
    assert(
      !ids.has(benchmarkCase.id),
      `Benchmark Case IDが重複しています: ${benchmarkCase.id}`
    );
    ids.add(benchmarkCase.id);
    assert(
      benchmarkCase.title.length > 0 &&
        benchmarkCase.description.length > 0,
      `${benchmarkCase.id}: titleまたはdescriptionがありません。`
    );
    assert(
      benchmarkCase.regulation.length > 0,
      `${benchmarkCase.id}: regulationがありません。`
    );
    assert(
      benchmarkCase.profile === "standard" ||
        benchmarkCase.profile === "trick-room",
      `${benchmarkCase.id}: profileが不正です。`
    );
    assert(
      benchmarkCase.team.length >= 1 && benchmarkCase.team.length <= 6,
      `${benchmarkCase.id}: teamは1〜6体で指定してください。`
    );
    assert(
      new Set(benchmarkCase.team).size === benchmarkCase.team.length,
      `${benchmarkCase.id}: team slugが重複しています。`
    );
    assert(
      benchmarkCase.expected.length > 0,
      `${benchmarkCase.id}: expectedがありません。`
    );
    assert(
      ["critical", "high", "normal"].includes(benchmarkCase.priority),
      `${benchmarkCase.id}: priorityが不正です。`
    );
    assert(
      benchmarkCase.tags.length > 0,
      `${benchmarkCase.id}: tagsがありません。`
    );
    const expectedIds = new Set<string>();
    for (const expected of benchmarkCase.expected) {
      assert(
        !expectedIds.has(expected.id),
        `${benchmarkCase.id}: expected IDが重複しています: ${expected.id}`
      );
      expectedIds.add(expected.id);
      validateExpected(expected, benchmarkCase.id);
    }
  }
}

export function getRecommendationBenchmarkDataset(): RecommendationBenchmarkDataset {
  const dataset =
    benchmarkDatasetJson as RecommendationBenchmarkDataset;
  validateRecommendationBenchmarkDataset(dataset);
  return dataset;
}

function candidate(
  result: RecommendationIntegrationResult,
  slug: string
): RecommendationIntegrationCandidate | null {
  return (
    result.candidates.find((entry) => entry.slug === slug) ?? null
  );
}

function condition(
  expected: RecommendationBenchmarkExpected,
  status: RecommendationBenchmarkConditionStatus,
  message: string
): RecommendationBenchmarkConditionResult {
  return {
    id: expected.id,
    type: expected.type,
    status,
    score: status === "PASS" ? 100 : status === "PARTIAL" ? 50 : 0,
    weight: expected.weight,
    message,
    failureReason:
      status === "PASS" ? null : expected.failureReason
  };
}

function evaluateExpected(
  expected: RecommendationBenchmarkExpected,
  result: RecommendationIntegrationResult
): RecommendationBenchmarkConditionResult {
  if (expected.type === "top-with-axis") {
    const matching = result.candidates
      .filter(
        (entry) =>
          entry.battleValueAxes[expected.axis] >= expected.minimum
      )
      .sort(
        (left, right) =>
          left.integratedRank - right.integratedRank ||
          left.slug.localeCompare(right.slug)
      );
    const best = matching[0] ?? null;
    if (best && best.integratedRank <= expected.maxRank) {
      return condition(
        expected,
        "PASS",
        `${best.slug}が${expected.axis}=${round(
          best.battleValueAxes[expected.axis]
        )}でTOP${expected.maxRank}以内（${best.integratedRank}位）`
      );
    }
    const partial = result.candidates
      .filter(
        (entry) =>
          entry.battleValueAxes[expected.axis] > 0 &&
          entry.integratedRank <= expected.maxRank + 10
      )
      .sort(
        (left, right) =>
          right.battleValueAxes[expected.axis] -
            left.battleValueAxes[expected.axis] ||
          left.integratedRank - right.integratedRank
      )[0];
    if (partial) {
      return condition(
        expected,
        "PARTIAL",
        `${partial.slug}が${expected.axis}=${round(
          partial.battleValueAxes[expected.axis]
        )}、${partial.integratedRank}位`
      );
    }
    return condition(
      expected,
      "FAIL",
      `${expected.axis}>=${expected.minimum}の候補がTOP${expected.maxRank}以内にありません`
    );
  }

  const current = candidate(result, expected.candidate);
  if (!current) {
    return condition(
      expected,
      "FAIL",
      `${expected.candidate}をRecommendation候補から取得できません`
    );
  }

  if (expected.type === "rank-at-most") {
    if (current.integratedRank <= expected.maxRank) {
      return condition(
        expected,
        "PASS",
        `${current.slug}は${current.integratedRank}位（TOP${expected.maxRank}以内）`
      );
    }
    if (
      current.integratedRank <=
      expected.maxRank + Math.max(5, Math.ceil(expected.maxRank * 0.25))
    ) {
      return condition(
        expected,
        "PARTIAL",
        `${current.slug}は${current.integratedRank}位（TOP${expected.maxRank}に近接）`
      );
    }
    return condition(
      expected,
      "FAIL",
      `${current.slug}は${current.integratedRank}位（期待: TOP${expected.maxRank}以内）`
    );
  }

  if (expected.type === "ranks-above") {
    const reference = candidate(result, expected.reference);
    if (!reference) {
      return condition(
        expected,
        "FAIL",
        `${expected.reference}をRecommendation候補から取得できません`
      );
    }
    if (current.integratedRank <= reference.integratedRank) {
      return condition(
        expected,
        "PASS",
        `${current.slug} ${current.integratedRank}位 <= ${reference.slug} ${reference.integratedRank}位`
      );
    }
    if (current.integratedRank <= reference.integratedRank + 10) {
      return condition(
        expected,
        "PARTIAL",
        `${current.slug} ${current.integratedRank}位、${reference.slug} ${reference.integratedRank}位`
      );
    }
    return condition(
      expected,
      "FAIL",
      `${current.slug} ${current.integratedRank}位 > ${reference.slug} ${reference.integratedRank}位`
    );
  }

  if (expected.type === "battle-value-at-least") {
    if (current.battleValue >= expected.minimum) {
      return condition(
        expected,
        "PASS",
        `${current.slug}のBattle Valueは${round(current.battleValue)}`
      );
    }
    if (current.battleValue >= expected.minimum * 0.75) {
      return condition(
        expected,
        "PARTIAL",
        `${current.slug}のBattle Valueは${round(current.battleValue)}（期待: ${expected.minimum}以上）`
      );
    }
    return condition(
      expected,
      "FAIL",
      `${current.slug}のBattle Valueは${round(current.battleValue)}（期待: ${expected.minimum}以上）`
    );
  }

  if (expected.type === "battle-axis-at-least") {
    const score = current.battleValueAxes[expected.axis] ?? 0;
    if (score >= expected.minimum) {
      return condition(
        expected,
        "PASS",
        `${current.slug}の${expected.axis}は${round(score)}`
      );
    }
    if (score >= expected.minimum * 0.75) {
      return condition(
        expected,
        "PARTIAL",
        `${current.slug}の${expected.axis}は${round(score)}（期待: ${expected.minimum}以上）`
      );
    }
    return condition(
      expected,
      "FAIL",
      `${current.slug}の${expected.axis}は${round(score)}（期待: ${expected.minimum}以上）`
    );
  }

  if (current.rankDelta >= expected.minimumPlaces) {
    return condition(
      expected,
      "PASS",
      `${current.slug}は${current.baselineRank}位から${current.integratedRank}位へ${current.rankDelta}順位改善`
    );
  }
  if (current.rankDelta >= 0) {
    return condition(
      expected,
      "PARTIAL",
      `${current.slug}は${current.baselineRank}位から${current.integratedRank}位（改善${current.rankDelta}）`
    );
  }
  return condition(
    expected,
    "FAIL",
    `${current.slug}は${current.baselineRank}位から${current.integratedRank}位へ悪化`
  );
}

function expectedCandidateSlugs(
  benchmarkCase: RecommendationBenchmarkCase
): string[] {
  return benchmarkCase.expected.flatMap((expected) => {
    if (expected.type === "top-with-axis") return [];
    if (expected.type === "ranks-above") {
      return [expected.candidate, expected.reference];
    }
    return [expected.candidate];
  });
}

function observedCandidates(
  benchmarkCase: RecommendationBenchmarkCase,
  result: RecommendationIntegrationResult
): RecommendationBenchmarkObservedCandidate[] {
  const slugs = new Set([
    ...result.candidates.slice(0, 20).map((entry) => entry.slug),
    ...expectedCandidateSlugs(benchmarkCase)
  ]);
  return result.candidates
    .filter((entry) => slugs.has(entry.slug))
    .map((entry) => ({
      slug: entry.slug,
      recommendation: entry.baselineRecommendation,
      battleValue: entry.battleValue,
      finalRecommendation: entry.finalRecommendation,
      baselineRank: entry.baselineRank,
      finalRank: entry.integratedRank,
      rankDelta: entry.rankDelta
    }));
}

function caseResult(
  benchmarkCase: RecommendationBenchmarkCase,
  result: RecommendationIntegrationResult,
  durationMs: number
): RecommendationBenchmarkCaseResult {
  const conditions = benchmarkCase.expected.map((expected) =>
    evaluateExpected(expected, result)
  );
  const totalWeight = conditions.reduce(
    (total, entry) => total + entry.weight,
    0
  );
  const score = round(
    conditions.reduce(
      (total, entry) => total + entry.score * entry.weight,
      0
    ) / totalWeight
  );
  const status: RecommendationBenchmarkConditionStatus =
    conditions.every((entry) => entry.status === "PASS")
      ? "PASS"
      : score >= 50
        ? "PARTIAL"
        : "FAIL";
  return {
    id: benchmarkCase.id,
    title: benchmarkCase.title,
    priority: benchmarkCase.priority,
    tags: [...benchmarkCase.tags],
    status,
    score,
    conditions,
    observedCandidates: observedCandidates(benchmarkCase, result),
    failureReasons: [
      ...new Set(
        conditions.flatMap((entry) =>
          entry.failureReason ? [entry.failureReason] : []
        )
      )
    ],
    durationMs
  };
}

export function compareRecommendationBenchmarkRegression(
  summary: RecommendationBenchmarkResult["summary"],
  golden: RecommendationBenchmarkGolden | null
): RecommendationBenchmarkRegression {
  if (!golden) {
    return {
      baselineAvailable: false,
      status: "no-baseline",
      overallDelta: null,
      passRateDelta: null,
      partialRateDelta: null,
      failRateDelta: null
    };
  }
  const overallDelta = round(
    summary.overallScore - golden.overallScore
  );
  const passRateDelta = round(summary.passRate - golden.passRate, 4);
  const partialRateDelta = round(
    summary.partialRate - golden.partialRate,
    4
  );
  const failRateDelta = round(summary.failRate - golden.failRate, 4);
  const regressed = overallDelta < 0 || passRateDelta < 0;
  const improved =
    !regressed && (overallDelta > 0 || passRateDelta > 0);
  return {
    baselineAvailable: true,
    status: regressed
      ? "regressed"
      : improved
        ? "improved"
        : "unchanged",
    overallDelta,
    passRateDelta,
    partialRateDelta,
    failRateDelta
  };
}

function cacheKey(benchmarkCase: RecommendationBenchmarkCase): string {
  return JSON.stringify({
    regulation: benchmarkCase.regulation,
    profile: benchmarkCase.profile,
    team: benchmarkCase.team
  });
}

export function runRecommendationBenchmark({
  dataset = getRecommendationBenchmarkDataset(),
  golden = null,
  generatedAt = new Date().toISOString()
}: {
  dataset?: RecommendationBenchmarkDataset;
  golden?: RecommendationBenchmarkGolden | null;
  generatedAt?: string;
} = {}): RecommendationBenchmarkResult {
  validateRecommendationBenchmarkDataset(dataset);
  const startedAt = Date.now();
  const cache = new Map<string, RecommendationIntegrationResult>();
  const cases = dataset.cases.map((benchmarkCase) => {
    const caseStartedAt = Date.now();
    const key = cacheKey(benchmarkCase);
    let analysis = cache.get(key);
    if (!analysis) {
      const integration = runRecommendationIntegration({
        teamSlugs: benchmarkCase.team,
        regulation: benchmarkCase.regulation,
        profile: benchmarkCase.profile,
        topLimit: 100
      });
      assert(
        integration.analysis,
        `${benchmarkCase.id}: Integration結果がありません。`
      );
      analysis = integration.analysis;
      cache.set(key, analysis);
    }
    return caseResult(
      benchmarkCase,
      analysis,
      Date.now() - caseStartedAt
    );
  });
  const passCount = cases.filter(
    (entry) => entry.status === "PASS"
  ).length;
  const partialCount = cases.filter(
    (entry) => entry.status === "PARTIAL"
  ).length;
  const failCount = cases.filter(
    (entry) => entry.status === "FAIL"
  ).length;
  const totalPriorityWeight = cases.reduce(
    (total, entry) => total + PRIORITY_WEIGHTS[entry.priority],
    0
  );
  const summary = {
    overallScore: round(
      cases.reduce(
        (total, entry) =>
          total + entry.score * PRIORITY_WEIGHTS[entry.priority],
        0
      ) / totalPriorityWeight
    ),
    passCount,
    partialCount,
    failCount,
    passRate: round(passCount / cases.length, 4),
    partialRate: round(partialCount / cases.length, 4),
    failRate: round(failCount / cases.length, 4),
    durationMs: Date.now() - startedAt
  };
  return {
    metadata: {
      schemaVersion: 1,
      generatedAt,
      dataset: dataset.title,
      caseCount: cases.length
    },
    summary,
    regression: compareRecommendationBenchmarkRegression(summary, golden),
    cases
  };
}

export function formatRecommendationBenchmarkReport(
  result: RecommendationBenchmarkResult
): string {
  const lines = ["Recommendation Benchmark", ""];
  for (const benchmarkCase of result.cases) {
    lines.push(
      `${benchmarkCase.id.toUpperCase()} ${benchmarkCase.status}`,
      `${benchmarkCase.score}点`
    );
  }
  lines.push(
    "",
    "Overall",
    `${result.summary.overallScore}点`,
    `PASS ${result.summary.passCount} (${round(result.summary.passRate * 100, 1)}%)`,
    `PARTIAL ${result.summary.partialCount} (${round(result.summary.partialRate * 100, 1)}%)`,
    `FAIL ${result.summary.failCount} (${round(result.summary.failRate * 100, 1)}%)`,
    `Regression ${result.regression.status}`
  );
  const failures = result.cases.filter(
    (entry) => entry.status === "FAIL"
  );
  if (failures.length > 0) {
    lines.push("", "Failure Report");
    for (const failure of failures) {
      lines.push(
        `${failure.id.toUpperCase()} ${failure.title}: ${failure.failureReasons.join(" / ")}`
      );
      failure.conditions
        .filter((entry) => entry.status === "FAIL")
        .forEach((entry) => lines.push(`  - ${entry.message}`));
    }
  }
  lines.push(
    "",
    `Duration ${round(result.summary.durationMs / 1000, 2)}s`
  );
  return `${lines.join("\n")}\n`;
}
