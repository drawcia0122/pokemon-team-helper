import { readFileSync } from "node:fs";
import { getAdvisorMegaRecommendationDecision } from "@/lib/advisorMegaRecommendation";
import {
  GOAL_ORIENTED_TEAM_BUILDER_CONFIG
} from "@/lib/goalOrientedTeamBuilderConfig";
import {
  getProgressiveTeamAdvisor
} from "@/lib/progressiveTeamAdvisor";
import { getPokemonBySlug } from "@/lib/typeChart";
import { buildGoalBuilderFixture } from "@/scripts/lib/goalBuilderHarness";
import type {
  GoalOrientedCandidatePlan,
  TeamBuilderGoal
} from "@/types/goalOrientedTeamBuilder";
import type { TeamProfile } from "@/lib/teamProfile";
import type { PokemonEntry } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type GoalBuilderBenchmarkCase = {
  id: string;
  title: string;
  team: string[];
  profile: TeamProfile;
  candidate?: string;
  candidateAbove?: string[];
  requiredNextCandidates?: string[];
  expectedGoalInTop?: TeamBuilderGoal;
  goalSearchLimit?: number;
  minimumChainLength?: number;
  minimumGoalAffinity?: number;
  minimumDirectGoalSteps?: number;
  minimumNextGoalAffinity?: number;
  requiresDeferredMega?: boolean;
};

const benchmark = JSON.parse(
  readFileSync("benchmarks/goal-builder-cases.json", "utf8")
) as { schemaVersion: number; cases: GoalBuilderBenchmarkCase[] };
const golden = JSON.parse(
  readFileSync("benchmarks/goal-builder-golden.json", "utf8")
) as {
  schemaVersion: number;
  minimumOverallScore: number;
  maximumFailCount: number;
  requiredCases: string[];
};

assert(
  benchmark.schemaVersion === 1 && benchmark.cases.length >= 7,
  "Goal Builder Benchmark Caseが不足しています"
);
assert(
  golden.schemaVersion === 1 &&
    golden.requiredCases.every((id) =>
      benchmark.cases.some((entry) => entry.id === id)
    ),
  "Goal Builder Goldenの必須Caseがありません"
);

function scoreFormula(plan: GoalOrientedCandidatePlan): number {
  const weights = GOAL_ORIENTED_TEAM_BUILDER_CONFIG.scoreWeights;
  return Math.max(
    0,
    Math.min(
      100,
      plan.currentFit * weights.currentFit +
        plan.futurePotential * weights.futurePotential +
        plan.coreQuality.overall * weights.coreQuality -
        plan.deadEndRisk * weights.deadEndRisk
    )
  );
}

function validateChain(
  team: PokemonEntry[],
  candidate: GoalOrientedCandidatePlan
): void {
  const seed = getPokemonBySlug(candidate.candidateSlug);
  assert(seed, `${candidate.candidateSlug}を解決できません`);
  const selected = [...team, seed];
  const species = new Set(selected.map((member) => member.speciesId));
  for (const step of candidate.chain) {
    const pokemon = getPokemonBySlug(step.slug);
    assert(pokemon, `${step.slug}を解決できません`);
    assert(
      !species.has(pokemon.speciesId),
      `${candidate.candidateSlug}のChainでspeciesが重複しました: ${step.slug}`
    );
    const decision = getAdvisorMegaRecommendationDecision({
      currentTeamSize: selected.length,
      currentMegaCount: selected.filter(
        (member) => member.formKind === "mega"
      ).length,
      candidateIsMega: pokemon.formKind === "mega",
      actionKind: "add"
    });
    assert(
      decision.allowed,
      `${candidate.candidateSlug}のChainがメガ段階制御に違反しました: ${step.slug}`
    );
    selected.push(pokemon);
    species.add(pokemon.speciesId);
  }
  assert(selected.length <= 6, "Candidate Chainが6体を超えました");
  assert(
    candidate.chain.length <=
      GOAL_ORIENTED_TEAM_BUILDER_CONFIG.maximumChainDepth,
    "Candidate Chainが最大深度を超えました"
  );
}

const results = benchmark.cases.map((entry) => {
  const checks: Array<{ label: string; passed: boolean }> = [];
  const { fixture, runtime } = buildGoalBuilderFixture({
    teamSlugs: entry.team,
    profile: entry.profile
  });
  const result = runtime.goalBuilder;
  checks.push({
    label: "Core Goal Planning",
    passed:
      result.metadata.mode === "core-goal-planning" &&
      result.metadata.beamSearch === false
  });
  checks.push({
    label: "決定論的なGoal Score順",
    passed: result.candidates.every(
      (candidate, index, all) =>
        index === 0 ||
        all[index - 1].goalScore > candidate.goalScore ||
        (all[index - 1].goalScore === candidate.goalScore &&
          all[index - 1].candidateSlug.localeCompare(
            candidate.candidateSlug
          ) <= 0)
    )
  });
  checks.push({
    label: "Goal Score式",
    passed: result.candidates.every(
      (candidate) =>
        Math.abs(scoreFormula(candidate) - candidate.goalScore) <= 0.03
    )
  });
  const teamPokemon = entry.team.map((slug) => {
    const pokemon = getPokemonBySlug(slug);
    assert(pokemon, `${slug}を解決できません`);
    return pokemon;
  });
  for (const candidate of result.candidates) {
    validateChain(teamPokemon, candidate);
  }
  checks.push({
    label: "2〜3手先と構築制約",
    passed: result.candidates.every(
      (candidate) =>
        candidate.remainingSlotsAfterCandidate ===
          6 - entry.team.length - 1 &&
        candidate.chain.length <= candidate.remainingSlotsAfterCandidate
    )
  });
  checks.push({
    label: "比較回数metadata",
    passed:
      result.computation.futureComparisonCount >=
      result.candidates.reduce(
        (total, candidate) =>
          total + candidate.evaluatedFutureCandidateCount,
        0
      )
  });
  const target = entry.candidate
    ? result.candidates.find(
        (candidate) => candidate.candidateSlug === entry.candidate
      )
    : undefined;
  if (entry.candidate) {
    checks.push({
      label: `${entry.candidate}を評価`,
      passed: Boolean(target)
    });
  }
  if (target && entry.candidateAbove) {
    const targetRank = result.ranking.indexOf(target.candidateSlug);
    checks.push({
      label: `${target.candidateSlug}の相対順位`,
      passed: entry.candidateAbove.every((slug) => {
        const comparedRank = result.ranking.indexOf(slug);
        return comparedRank >= 0 && targetRank < comparedRank;
      })
    });
  }
  if (target && entry.requiredNextCandidates) {
    const next = new Set(
      target.nextCandidates.map((candidate) => candidate.slug)
    );
    checks.push({
      label: `${target.candidateSlug}の次候補`,
      passed: entry.requiredNextCandidates.every((slug) => next.has(slug))
    });
  }
  if (entry.expectedGoalInTop) {
    checks.push({
      label: `${entry.expectedGoalInTop} Goal`,
      passed: result.candidates
        .slice(0, entry.goalSearchLimit ?? 10)
        .some(
          (candidate) =>
            candidate.selectedGoal.goal === entry.expectedGoalInTop
        )
    });
  }
  const goalTarget = entry.expectedGoalInTop
    ? result.candidates.find(
        (candidate) =>
          candidate.selectedGoal.goal === entry.expectedGoalInTop
      )
    : undefined;
  if (
    goalTarget &&
    typeof entry.minimumGoalAffinity === "number" &&
    typeof entry.minimumDirectGoalSteps === "number"
  ) {
    const affinityValues = [
      goalTarget.goalAffinity,
      ...goalTarget.chain.map((step) => step.goalAffinity)
    ];
    checks.push({
      label: `${entry.expectedGoalInTop} Goalへの直接適合`,
      passed:
        affinityValues.filter(
          (value) => value >= entry.minimumGoalAffinity!
        ).length >= entry.minimumDirectGoalSteps
    });
  }
  if (
    goalTarget &&
    typeof entry.minimumNextGoalAffinity === "number"
  ) {
    checks.push({
      label: `${entry.expectedGoalInTop} Goalへつながる次候補`,
      passed: goalTarget.nextCandidates.some(
        (candidate) =>
          candidate.goalAffinity >= entry.minimumNextGoalAffinity!
      )
    });
  }
  if (entry.minimumChainLength) {
    const chainTarget =
      target ??
      goalTarget ??
      result.candidates[0];
    checks.push({
      label: `${entry.minimumChainLength}手先`,
      passed:
        Boolean(chainTarget) &&
        chainTarget.chain.length >= entry.minimumChainLength
    });
  }
  if (entry.requiresDeferredMega) {
    checks.push({
      label: "後段で合法になるメガ候補",
      passed: result.candidates.some((candidate) => {
        const seed = getPokemonBySlug(candidate.candidateSlug);
        if (!seed || seed.formKind === "mega") return false;
        return candidate.chain.some((step) => {
          const pokemon = getPokemonBySlug(step.slug);
          return pokemon?.formKind === "mega" && step.step >= 2;
        });
      })
    });
  }
  checks.push({
    label: "Final Recommendation不変",
    passed: runtime.integratedPlans.every(
      (plan) =>
        plan.finalRecommendation === plan.categoryScores.overall &&
        plan.improvementScore === plan.finalRecommendation
    )
  });

  if (entry.id === "GOAL001") {
    const progressive = getProgressiveTeamAdvisor({
      team: fixture.team,
      advisor: fixture.advisor,
      simulation: runtime.simulation,
      availablePokemon: fixture.analyzerInput.availablePokemon,
      environmentDataset: fixture.analyzerInput.environmentDataset,
      profile: entry.profile
    });
    checks.push({
      label: "既存総合Score不変・完成形mode分離",
      passed:
        progressive.candidatesByMode.overall.every(
          (candidate) =>
            candidate.modeScores.overall === candidate.fitScore
        ) &&
        progressive.candidatesByMode.future.some(
          (candidate) =>
            candidate.plan.goalBuilderPlan &&
            candidate.modeScores.future !== candidate.fitScore
        )
    });
  }

  return {
    ...entry,
    passed: checks.every((check) => check.passed),
    checks,
    candidateCount: result.candidates.length,
    comparisonCount: result.computation.futureComparisonCount
  };
});

const productionSource = [
  readFileSync("lib/goalOrientedTeamBuilder.ts", "utf8"),
  readFileSync("lib/goalOrientedTeamBuilderConfig.ts", "utf8")
].join("\n");
for (const forbidden of [
  "gengar-mega",
  "umbreon",
  "sylveon",
  "charizard-mega-y",
  "floette-mega",
  "staraptor-mega",
  "applyRecommendationRetentionGuard",
  "scoreSlots",
  "previousTop20"
]) {
  assert(
    !productionSource.includes(forbidden),
    `本番Plannerへ固定候補または順位補正が含まれています: ${forbidden}`
  );
}
assert(
  !productionSource.includes("bestSignalsBySpecies"),
  "Goal評価前に旧Recommendationだけでフォームを固定しています"
);
assert(
  !productionSource.includes("chillyreception"),
  "雪を展開する技を雨GoalのEvidenceとして扱っています"
);
const nextCardSource = readFileSync(
  "components/team/AdvisorNextCandidateCard.tsx",
  "utf8"
);
assert(
  nextCardSource.includes("candidate.reasonsByMode[mode]"),
  "完成形modeのおすすめ理由がPlanner Explanationを参照していません"
);
assert(
  !/finalRecommendation\s*[:=]/.test(
    readFileSync("lib/goalOrientedTeamBuilder.ts", "utf8")
  ),
  "Goal BuilderがFinal Recommendationを書き換えています"
);

const failCount = results.filter((entry) => !entry.passed).length;
const overall =
  results.reduce(
    (total, entry) =>
      total +
      (entry.checks.filter((check) => check.passed).length /
        entry.checks.length) *
        100,
    0
  ) / results.length;
for (const result of results) {
  console.log(
    `${result.id} ${result.passed ? "PASS" : "FAIL"} ` +
      result.checks
        .map((check) => `${check.passed ? "✓" : "×"}${check.label}`)
        .join(" / ")
  );
}
console.log(
  `Goal Builder Benchmark: Overall=${overall.toFixed(2)} PASS=${results.length - failCount} FAIL=${failCount}`
);
console.log(
  `Planner computation: candidates=${results.reduce((total, entry) => total + entry.candidateCount, 0)} comparisons=${results.reduce((total, entry) => total + entry.comparisonCount, 0)}`
);
assert(
  overall >= golden.minimumOverallScore &&
    failCount <= golden.maximumFailCount,
  `Goal Builder BenchmarkがGolden未達です: Overall=${overall.toFixed(2)} FAIL=${failCount}`
);
console.log("[ok] TASK054 Goal-Oriented Multi-step Team Builder Golden");
