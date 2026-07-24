import {
  analyzeRecommendations,
  analyzeRecommendationPlan,
  RECOMMENDATION_CONTRIBUTION_CATEGORIES,
  type RecommendationContributionCategory
} from "@/lib/recommendationAnalyzer";
import { analyzeBattleValue } from "@/lib/battleValueEngine";
import { battleValueEnvironmentSnapshot } from "@/lib/battleValueEnvironmentAdapter";
import {
  getAdvisorSwapSimulation,
  rebuildAdvisorSwapSimulationWithPlans,
  type AdvisorSwapPlan,
  type AdvisorSwapSimulation,
  type AdvisorSwapSimulationInput
} from "@/lib/advisorSwapSimulator";
import {
  BATTLE_VALUE_AXIS_EXPLANATIONS,
  BATTLE_VALUE_AXIS_LABELS,
  RECOMMENDATION_INTEGRATION_CONFIG
} from "@/lib/recommendationIntegrationConfig";
import type { EnvironmentSnapshot } from "@/types/environmentData";
import type { BattleValueCandidate } from "@/types/battleValue";
import type {
  BattleValueIntegrationExplanation,
  RecommendationIntegrationCandidate,
  RecommendationIntegrationResult
} from "@/types/recommendationIntegration";

const REPRESENTATIVES = [
  "starmie-mega",
  "gengar-mega",
  "kingambit",
  "mawile-mega",
  "volcarona",
  "dragapult",
  "jolteon",
  "sylveon"
] as const;

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizePercentiles(
  entries: Array<{ key: string; value: number }>
): Map<string, number> {
  if (entries.length === 0) return new Map();
  if (entries.length === 1) return new Map([[entries[0].key, 100]]);
  const sorted = [...entries].sort(
    (left, right) =>
      left.value - right.value || left.key.localeCompare(right.key)
  );
  const result = new Map<string, number>();
  for (let index = 0; index < sorted.length; ) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) {
      end += 1;
    }
    const averageIndex = (index + end - 1) / 2;
    const normalized = round(
      (averageIndex / Math.max(1, sorted.length - 1)) * 100,
      6
    );
    for (let cursor = index; cursor < end; cursor += 1) {
      result.set(sorted[cursor].key, normalized);
    }
    index = end;
  }
  return result;
}

function planKey(plan: AdvisorSwapPlan, index: number): string {
  return `${index}:${plan.candidate.pokemon.slug}:${plan.action.kind}:${
    plan.action.removedSlotId ?? "add"
  }`;
}

function battleValueExplanation(
  candidate: BattleValueCandidate
): BattleValueIntegrationExplanation[] {
  return (
    Object.entries(candidate.axisBreakdown) as Array<
      [keyof typeof candidate.axisBreakdown, number]
    >
  )
    .filter(([, score]) => score > 0)
    .sort(
      (left, right) =>
        right[1] - left[1] || left[0].localeCompare(right[0])
    )
    .map(([axis, score]) => ({
      axis,
      label: BATTLE_VALUE_AXIS_LABELS[axis],
      score,
      text: BATTLE_VALUE_AXIS_EXPLANATIONS[axis]
    }));
}

function retention(left: string[], right: string[], limit: number): number {
  const count = Math.min(limit, left.length, right.length);
  if (count === 0) return 1;
  const baseline = new Set(left.slice(0, count));
  return round(
    right.slice(0, count).filter((slug) => baseline.has(slug)).length /
      count
  );
}

function bestBySpecies(
  plans: AdvisorSwapPlan[],
  score: (plan: AdvisorSwapPlan) => number
): AdvisorSwapPlan[] {
  const best = new Map<number, AdvisorSwapPlan>();
  for (const plan of plans) {
    if (plan.action.kind === "form-change") continue;
    const species = plan.candidate.pokemon.speciesId;
    const current = best.get(species);
    if (
      !current ||
      score(plan) > score(current) ||
      (score(plan) === score(current) &&
        plan.candidate.pokemon.slug.localeCompare(
          current.candidate.pokemon.slug
        ) < 0)
    ) {
      best.set(species, plan);
    }
  }
  return [...best.values()].sort(
    (left, right) =>
      score(right) - score(left) ||
      left.candidate.pokemon.slug.localeCompare(
        right.candidate.pokemon.slug
      )
  );
}

export function integrateBattleValueRecommendation({
  input,
  baseline = getAdvisorSwapSimulation(input),
  environmentSnapshot =
    input.environmentDataset === null
      ? null
      : battleValueEnvironmentSnapshot(input.environmentDataset)
}: {
  input: AdvisorSwapSimulationInput;
  baseline?: AdvisorSwapSimulation;
  environmentSnapshot?: EnvironmentSnapshot | null;
}): {
  simulation: AdvisorSwapSimulation;
  analysis: RecommendationIntegrationResult | null;
} {
  const dataset = input.environmentDataset;
  if (
    !dataset ||
    !environmentSnapshot ||
    baseline.evaluatedPlans.length === 0
  ) {
    return { simulation: baseline, analysis: null };
  }
  const profile = input.profile ?? "standard";
  const team = input.team.flatMap((slot) =>
    slot.mode === "pokemon" ? [slot.pokemonSlug] : []
  );
  const context = {
    team,
    regulation: dataset.regulationId,
    profile,
    datasetId: dataset.snapshotId,
    period: dataset.period,
    ratingCutoff: dataset.ratingCutoff
  };
  const recommendation = analyzeRecommendations({
    context,
    plans: baseline.evaluatedPlans,
    environmentDataset: dataset,
    environmentSnapshot,
    availablePokemon: input.availablePokemon,
    topLimit: 50
  });
  const battleValue = analyzeBattleValue({
    recommendation,
    environmentSnapshot,
    availablePokemon: input.availablePokemon,
    recommendationUnchanged: false
  });
  const battleBySlug = new Map(
    battleValue.candidates.map((candidate) => [candidate.slug, candidate])
  );
  const battleRanks = new Map(
    battleValue.battleValueRanking.map((candidate, index) => [
      candidate.slug,
      index + 1
    ])
  );
  const battleNormalized = normalizePercentiles(
    battleValue.battleValueRanking.map((candidate) => ({
      key: candidate.slug,
      value: candidate.finalBattleValue
    }))
  );
  const planAnalyses = baseline.evaluatedPlans.map((plan, index) => {
    const key = planKey(plan, index);
    return {
      key,
      plan,
      analysis: analyzeRecommendationPlan(plan, index + 1, dataset)
    };
  });
  const baselineNormalized = normalizePercentiles(
    planAnalyses.map(({ key, plan }) => ({
      key,
      value: plan.baselineRecommendationScore
    }))
  );
  const contributionNormalized = Object.fromEntries(
    RECOMMENDATION_CONTRIBUTION_CATEGORIES.map((category) => [
      category,
      normalizePercentiles(
        planAnalyses.map(({ key, analysis }) => ({
          key,
          value: analysis.contributions[category]
        }))
      )
    ])
  ) as Record<
    RecommendationContributionCategory,
    Map<string, number>
  >;
  const weight = RECOMMENDATION_INTEGRATION_CONFIG.battleValueWeight;
  const integratedPlans = planAnalyses.map(({ key, plan, analysis }) => {
    const normalized = Object.fromEntries(
      RECOMMENDATION_CONTRIBUTION_CATEGORIES.map((category) => [
        category,
        contributionNormalized[category].get(key) ?? 0
      ])
    ) as Record<RecommendationContributionCategory, number>;
    const contributionScore = RECOMMENDATION_CONTRIBUTION_CATEGORIES.reduce(
      (total, category) =>
        total +
        normalized[category] *
          RECOMMENDATION_INTEGRATION_CONFIG.contributionWeights[category],
      0
    );
    const recommendationNormalized =
      (baselineNormalized.get(key) ?? 0) *
        RECOMMENDATION_INTEGRATION_CONFIG.baselineContinuityWeight +
      contributionScore *
        RECOMMENDATION_INTEGRATION_CONFIG.contributionWeight;
    const battle = battleBySlug.get(plan.candidate.pokemon.slug);
    const normalizedBattle = battle
      ? battleNormalized.get(battle.slug) ?? 0
      : 0;
    const finalRecommendation = round(
      recommendationNormalized * (1 - weight) +
        normalizedBattle * weight
    );
    const battleValueContribution = round(normalizedBattle * weight);
    const explanations = battle ? battleValueExplanation(battle) : [];
    const contributionTotal = RECOMMENDATION_CONTRIBUTION_CATEGORIES.reduce(
      (total, category) =>
        total +
        normalized[category] *
          RECOMMENDATION_INTEGRATION_CONFIG.contributionWeights[category],
      0
    );
    const contributionRatios = Object.fromEntries(
      RECOMMENDATION_CONTRIBUTION_CATEGORIES.map((category) => [
        category,
        contributionTotal === 0
          ? 0
          : round(
              (normalized[category] *
                RECOMMENDATION_INTEGRATION_CONFIG.contributionWeights[
                  category
                ]) /
                contributionTotal
            )
      ])
    );
    return {
      ...plan,
      improvementScore: finalRecommendation,
      baselineRecommendationScore: plan.baselineRecommendationScore,
      categoryScores: {
        ...plan.categoryScores,
        overall: finalRecommendation
      },
      battleValueContribution,
      battleValueExplanation: explanations
        .slice(0, 3)
        .map((entry) => entry.text),
      finalRecommendation,
      recommendationIntegration: {
        weight,
        recommendationNormalized: round(recommendationNormalized),
        contributionNormalized: normalized,
        contributionRatios,
        battleValue: battle?.finalBattleValue ?? 0,
        battleValueNormalized: round(normalizedBattle),
        battleValueRatio:
          finalRecommendation === 0
            ? 0
            : round(battleValueContribution / finalRecommendation),
        battleValueAxes: battle?.axisBreakdown ?? {}
      }
    } satisfies AdvisorSwapPlan;
  });
  const simulation = rebuildAdvisorSwapSimulationWithPlans(
    baseline,
    integratedPlans,
    profile
  );
  const baselineRanked = bestBySpecies(
    baseline.evaluatedPlans,
    (plan) => plan.baselineRecommendationScore
  );
  const integratedRanked = bestBySpecies(
    integratedPlans,
    (plan) => plan.finalRecommendation
  );
  const baselineRank = new Map(
    baselineRanked.map((plan, index) => [
      plan.candidate.pokemon.slug,
      index + 1
    ])
  );
  const integratedRank = new Map(
    integratedRanked.map((plan, index) => [
      plan.candidate.pokemon.slug,
      index + 1
    ])
  );
  const baselinePlanBySlug = new Map(
    baselineRanked.map((plan) => [plan.candidate.pokemon.slug, plan])
  );
  const integratedCandidates = integratedRanked.flatMap(
    (plan): RecommendationIntegrationCandidate[] => {
      const integration = plan.recommendationIntegration;
      const battle = battleBySlug.get(plan.candidate.pokemon.slug);
      const before = baselineRank.get(plan.candidate.pokemon.slug);
      const after = integratedRank.get(plan.candidate.pokemon.slug);
      if (!integration || !battle || !before || !after) return [];
      const explanation = battleValueExplanation(battle);
      return [
        {
          slug: plan.candidate.pokemon.slug,
          name: plan.candidate.pokemon.nameJa,
          eligibility: plan.isRecommendationByCategory.overall,
          baselineRank: before,
          integratedRank: after,
          rankDelta: before - after,
          baselineRecommendation:
            baselinePlanBySlug.get(plan.candidate.pokemon.slug)
              ?.baselineRecommendationScore ?? 0,
          recommendationNormalized: integration.recommendationNormalized,
          contributionNormalized:
            integration.contributionNormalized as Record<
              RecommendationContributionCategory,
              number
            >,
          contributionRatios:
            integration.contributionRatios as Record<
              RecommendationContributionCategory,
              number
            >,
          battleValue: integration.battleValue,
          battleValueRank:
            battleRanks.get(plan.candidate.pokemon.slug) ?? 0,
          battleValueNormalized: integration.battleValueNormalized,
          battleValueContribution: plan.battleValueContribution,
          battleValueRatio: integration.battleValueRatio,
          battleValueAxes: battle.axisBreakdown,
          battleValueExplanation: explanation,
          finalRecommendation: plan.finalRecommendation
        }
      ];
    }
  );
  const baselineSlugs = baselineRanked.map(
    (plan) => plan.candidate.pokemon.slug
  );
  const integratedSlugs = integratedRanked.map(
    (plan) => plan.candidate.pokemon.slug
  );
  const bySlug = new Map(
    integratedCandidates.map((candidate) => [candidate.slug, candidate])
  );
  return {
    simulation,
    analysis: {
      metadata: {
        schemaVersion: 1,
        mode: "integrated",
        normalization: "percentile-rank",
        formula: `Final = normalized Recommendation × ${round(
          (1 - weight) * 100,
          1
        )}% + normalized Battle Value × ${round(weight * 100, 1)}%`
      },
      input: {
        team,
        regulation: dataset.regulationId,
        profile,
        datasetId: dataset.snapshotId
      },
      config: {
        battleValueWeight: weight,
        baselineContinuityWeight:
          RECOMMENDATION_INTEGRATION_CONFIG.baselineContinuityWeight,
        contributionWeight:
          RECOMMENDATION_INTEGRATION_CONFIG.contributionWeight,
        contributionWeights: {
          ...RECOMMENDATION_INTEGRATION_CONFIG.contributionWeights
        }
      },
      candidates: integratedCandidates,
      baselineTop20: baselineSlugs.slice(0, 20),
      integratedTop20: integratedSlugs.slice(0, 20),
      baselineTop50: baselineSlugs.slice(0, 50),
      integratedTop50: integratedSlugs.slice(0, 50),
      top20RetentionRate: retention(
        baselineSlugs,
        integratedSlugs,
        20
      ),
      top50RetentionRate: retention(
        baselineSlugs,
        integratedSlugs,
        50
      ),
      representatives: REPRESENTATIVES.flatMap((slug) => {
        const candidate = bySlug.get(slug);
        return candidate ? [candidate] : [];
      }),
      megaConstraintsPreserved: integratedPlans.every((plan, index) => {
        const before = baseline.evaluatedPlans[index];
        return (
          before.metrics.megaLimitPassed ===
            plan.metrics.megaLimitPassed &&
          before.metrics.megaRecommendationPassed ===
            plan.metrics.megaRecommendationPassed &&
          before.isRecommendation === plan.isRecommendation &&
          before.isRecommendationByCategory.overall ===
            plan.isRecommendationByCategory.overall
        );
      })
    }
  };
}

export function getIntegratedAdvisorSwapSimulation(
  input: AdvisorSwapSimulationInput
): AdvisorSwapSimulation {
  return integrateBattleValueRecommendation({ input }).simulation;
}

export function formatRecommendationIntegrationReport(
  result: RecommendationIntegrationResult,
  topLimit = 20,
  candidateSlug?: string
): string {
  const candidates = candidateSlug
    ? result.candidates.filter((candidate) => candidate.slug === candidateSlug)
    : result.candidates.slice(0, topLimit);
  const lines = [
    "Recommendation Battle Value Integration V1",
    `Team: ${result.input.team.join(", ")}`,
    `Regulation/Profile: ${result.input.regulation} / ${result.input.profile}`,
    `Weight: ${result.config.battleValueWeight * 100}%`,
    `TOP20 retention: ${round(result.top20RetentionRate * 100, 1)}%`,
    `TOP50 retention: ${round(result.top50RetentionRate * 100, 1)}%`,
    "",
    "Ranking"
  ];
  for (const candidate of candidates) {
    lines.push(
      `${candidate.integratedRank}. ${candidate.name} (${candidate.slug}) Recommendation=${candidate.baselineRecommendation} BV=${candidate.battleValue} Final=${candidate.finalRecommendation} rank=${candidate.baselineRank}->${candidate.integratedRank} Δ=${candidate.rankDelta >= 0 ? "+" : ""}${candidate.rankDelta}`,
      `  Contribution: ${RECOMMENDATION_CONTRIBUTION_CATEGORIES.map((category) => `${category}=${round(candidate.contributionRatios[category] * 100, 1)}%`).join(" ")}`,
      `  Battle Value: configured=${result.config.battleValueWeight * 100}% actual=${round(candidate.battleValueRatio * 100, 1)}% contribution=${candidate.battleValueContribution}`,
      `  Axes: ${candidate.battleValueExplanation.map((entry) => `${entry.label}=${entry.score}`).join(" ")}`,
      `  Reasons: ${candidate.battleValueExplanation.slice(0, 3).map((entry) => entry.text).join(" / ")}`
    );
  }
  lines.push(
    "",
    `TOP20 before: ${result.baselineTop20.join(",")}`,
    `TOP20 after: ${result.integratedTop20.join(",")}`,
    "",
    `TOP50 before: ${result.baselineTop50.join(",")}`,
    `TOP50 after: ${result.integratedTop50.join(",")}`,
    ""
  );
  return `${lines.join("\n")}\n`;
}
