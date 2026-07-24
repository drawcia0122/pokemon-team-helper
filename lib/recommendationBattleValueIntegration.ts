import {
  analyzeRecommendations,
  analyzeRecommendationPlan,
  RECOMMENDATION_CONTRIBUTION_CATEGORIES,
  type RecommendationContributionCategory
} from "@/lib/recommendationAnalyzer";
import { analyzeBattleValue } from "@/lib/battleValueEngine";
import { battleValueEnvironmentSnapshot } from "@/lib/battleValueEnvironmentAdapter";
import { analyzeContestabilityCandidate } from "@/lib/contestabilityEngine";
import { CONTESTABILITY_CONFIG } from "@/lib/contestabilityConfig";
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

function applyRecommendationRetentionGuard(
  plans: AdvisorSwapPlan[]
): AdvisorSwapPlan[] {
  const rawRanked = bestBySpecies(
    plans,
    (plan) => plan.finalRecommendation
  );
  const previousRanked = bestBySpecies(
    plans,
    (plan) => plan.preContestabilityRecommendation
  );
  const rawScore = new Map(
    rawRanked.map((plan) => [
      plan.candidate.pokemon.speciesId,
      plan.finalRecommendation
    ])
  );
  const byRawScore = (left: AdvisorSwapPlan, right: AdvisorSwapPlan) =>
    (rawScore.get(right.candidate.pokemon.speciesId) ?? 0) -
      (rawScore.get(left.candidate.pokemon.speciesId) ?? 0) ||
    left.candidate.pokemon.slug.localeCompare(
      right.candidate.pokemon.slug
    );
  const previousTop20 = previousRanked.slice(0, 20);
  const previousTop50 = previousRanked.slice(0, 50);
  const previousTop50Species = new Set(
    previousTop50.map((plan) => plan.candidate.pokemon.speciesId)
  );
  const protectedTop20Count = Math.ceil(
    20 * CONTESTABILITY_CONFIG.minimumTop20Retention
  );
  const protectedTop50Count = Math.ceil(
    50 * CONTESTABILITY_CONFIG.minimumTop50Retention
  );
  const challengeCount = 50 - protectedTop50Count;
  const protectedTop20 = [...previousTop20]
    .sort(byRawScore)
    .slice(0, protectedTop20Count);
  const protectedTop20Species = new Set(
    protectedTop20.map((plan) => plan.candidate.pokemon.speciesId)
  );
  const protectedTop50 = [
    ...protectedTop20,
    ...previousTop50
      .filter(
        (plan) =>
          !protectedTop20Species.has(plan.candidate.pokemon.speciesId)
      )
      .sort(byRawScore)
      .slice(0, protectedTop50Count - protectedTop20.length)
  ];
  const challengers = rawRanked
    .filter(
      (plan) =>
        !previousTop50Species.has(plan.candidate.pokemon.speciesId)
    )
    .sort(
      (left, right) =>
        (right.contestability?.score ?? 0) -
          (left.contestability?.score ?? 0) ||
        byRawScore(left, right)
    )
    .slice(0, challengeCount);
  const desiredTop50 = [...protectedTop50, ...challengers];
  const protectedTop20Set = new Set(
    protectedTop20.map((plan) => plan.candidate.pokemon.speciesId)
  );
  const top20Challengers = desiredTop50
    .filter(
      (plan) =>
        !protectedTop20Set.has(plan.candidate.pokemon.speciesId)
    )
    .sort(byRawScore)
    .slice(0, 20 - protectedTop20.length);
  const desiredTop20 = [...protectedTop20, ...top20Challengers].sort(
    byRawScore
  );
  const desiredTop20Species = new Set(
    desiredTop20.map((plan) => plan.candidate.pokemon.speciesId)
  );
  const desiredTop50Rest = desiredTop50
    .filter(
      (plan) =>
        !desiredTop20Species.has(plan.candidate.pokemon.speciesId)
    )
    .sort(byRawScore);
  const desiredTop50Species = new Set(
    desiredTop50.map((plan) => plan.candidate.pokemon.speciesId)
  );
  const remainder = rawRanked.filter(
    (plan) =>
      !desiredTop50Species.has(plan.candidate.pokemon.speciesId)
  );
  const desiredOrder = [
    ...desiredTop20,
    ...desiredTop50Rest,
    ...remainder
  ];
  const scoreSlots = rawRanked
    .map((plan) => plan.finalRecommendation)
    .sort((left, right) => right - left);
  for (let index = 1; index < scoreSlots.length; index += 1) {
    if (scoreSlots[index] >= scoreSlots[index - 1]) {
      scoreSlots[index] = round(
        Math.max(0, scoreSlots[index - 1] - 0.000001),
        6
      );
    }
  }
  const adjustmentBySpecies = new Map(
    desiredOrder.map((plan, index) => [
      plan.candidate.pokemon.speciesId,
      round(
        scoreSlots[index] -
          (rawScore.get(plan.candidate.pokemon.speciesId) ?? 0),
        6
      )
    ])
  );
  return plans.map((plan) => {
    const adjustment =
      adjustmentBySpecies.get(plan.candidate.pokemon.speciesId) ?? 0;
    const finalRecommendation = round(
      plan.finalRecommendation + adjustment,
      6
    );
    const integration = plan.recommendationIntegration;
    return {
      ...plan,
      improvementScore: finalRecommendation,
      finalRecommendation,
      recommendationProtectionAdjustment: adjustment,
      categoryScores: {
        ...plan.categoryScores,
        overall: finalRecommendation
      },
      recommendationIntegration: integration
        ? {
            ...integration,
            battleValueRatio:
              finalRecommendation === 0
                ? 0
                : round(
                    plan.battleValueContribution / finalRecommendation
                  ),
            contestabilityRatio:
              finalRecommendation === 0
                ? 0
                : round(
                    plan.contestabilityContribution /
                      finalRecommendation
                  )
          }
        : null
    };
  });
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

function retentionBySpecies(
  left: AdvisorSwapPlan[],
  right: AdvisorSwapPlan[],
  limit: number
): number {
  const count = Math.min(limit, left.length, right.length);
  if (count === 0) return 1;
  const baseline = new Set(
    left
      .slice(0, count)
      .map((plan) => plan.candidate.pokemon.speciesId)
  );
  return round(
    right
      .slice(0, count)
      .filter((plan) =>
        baseline.has(plan.candidate.pokemon.speciesId)
      ).length / count
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
  const semanticBySlug = new Map(
    recommendation.semanticProfiles.map((candidate) => [
      candidate.slug,
      candidate
    ])
  );
  const teamProfiles = team.flatMap((slug) => {
    const candidate = semanticBySlug.get(slug);
    return candidate ? [candidate] : [];
  });
  const environmentBySlug = new Map(
    environmentSnapshot.pokemon.map((candidate) => [
      candidate.slug,
      candidate
    ])
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
    const semantic = semanticBySlug.get(plan.candidate.pokemon.slug);
    const contestability =
      battle && semantic
        ? analyzeContestabilityCandidate({
            plan,
            candidate: battle,
            profile: semantic,
            teamProfiles,
            environment:
              environmentBySlug.get(plan.candidate.pokemon.slug) ?? null
          })
        : null;
    const contestabilityScore = contestability?.score ?? 0;
    const recommendationConfidence =
      contestability?.recommendationConfidence ?? 0;
    const confidenceAdjustedRecommendation = round(
      Math.min(
        100,
        recommendationNormalized * recommendationConfidence
      )
    );
    const contestabilityWeight = CONTESTABILITY_CONFIG.weight;
    const recommendationWeight = 1 - weight - contestabilityWeight;
    const finalRecommendation = round(
      confidenceAdjustedRecommendation * recommendationWeight +
        normalizedBattle * weight +
        contestabilityScore * contestabilityWeight
    );
    const battleValueContribution = round(normalizedBattle * weight);
    const contestabilityContribution = round(
      contestabilityScore * contestabilityWeight
    );
    const preContestabilityRecommendation = round(
      recommendationNormalized * (1 - weight) +
        normalizedBattle * weight
    );
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
      contestability,
      contestabilityContribution,
      contestabilityExplanation:
        contestability?.reasons.map((entry) => entry.text) ?? [],
      preContestabilityRecommendation,
      recommendationProtectionAdjustment: 0,
      finalRecommendation,
      recommendationIntegration: {
        weight,
        contestabilityWeight,
        recommendationNormalized: round(recommendationNormalized),
        recommendationConfidence,
        confidenceAdjustedRecommendation,
        contributionNormalized: normalized,
        contributionRatios,
        battleValue: battle?.finalBattleValue ?? 0,
        battleValueNormalized: round(normalizedBattle),
        battleValueRatio:
          finalRecommendation === 0
            ? 0
            : round(battleValueContribution / finalRecommendation),
        battleValueAxes: battle?.axisBreakdown ?? {},
        contestabilityNormalized: contestabilityScore,
        contestabilityRatio:
          finalRecommendation === 0
            ? 0
            : round(contestabilityContribution / finalRecommendation)
      }
    } satisfies AdvisorSwapPlan;
  });
  const protectedPlans =
    applyRecommendationRetentionGuard(integratedPlans);
  const simulation = rebuildAdvisorSwapSimulationWithPlans(
    baseline,
    protectedPlans,
    profile
  );
  const baselineRanked = bestBySpecies(
    baseline.evaluatedPlans,
    (plan) => plan.baselineRecommendationScore
  );
  const integratedRanked = bestBySpecies(
    protectedPlans,
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
          contestability: plan.contestability?.score ?? 0,
          contestabilityAxes:
            plan.contestability?.axes ?? {
              environment: 0,
              team: 0,
              matchup: 0,
              reliability: 0
            },
          contestabilityReasons: plan.contestability?.reasons ?? [],
          contestabilityContribution: plan.contestabilityContribution,
          contestabilityRatio: integration.contestabilityRatio,
          recommendationConfidence:
            integration.recommendationConfidence,
          confidenceAdjustedRecommendation:
            integration.confidenceAdjustedRecommendation,
          preContestabilityRecommendation:
            plan.preContestabilityRecommendation,
          recommendationProtectionAdjustment:
            plan.recommendationProtectionAdjustment,
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
        schemaVersion: 2,
        mode: "integrated",
        normalization: "percentile-rank",
        formula: `Final = confidence-adjusted Recommendation × ${round(
          (1 - weight - CONTESTABILITY_CONFIG.weight) * 100,
          1
        )}% + normalized Battle Value × ${round(
          weight * 100,
          1
        )}% + Contestability × ${round(
          CONTESTABILITY_CONFIG.weight * 100,
          1
        )}%`
      },
      input: {
        team,
        regulation: dataset.regulationId,
        profile,
        datasetId: dataset.snapshotId
      },
      config: {
        battleValueWeight: weight,
        contestabilityWeight: CONTESTABILITY_CONFIG.weight,
        recommendationWeight:
          1 - weight - CONTESTABILITY_CONFIG.weight,
        recommendationConfidenceFloor:
          CONTESTABILITY_CONFIG.recommendationConfidenceFloor,
        recommendationConfidenceMaximum:
          CONTESTABILITY_CONFIG.recommendationConfidenceMaximum,
        directActionConfidenceBoost:
          CONTESTABILITY_CONFIG.directActionConfidenceBoost,
        recommendationConfidenceMidpoint:
          CONTESTABILITY_CONFIG.recommendationConfidenceMidpoint,
        recommendationConfidenceSlope:
          CONTESTABILITY_CONFIG.recommendationConfidenceSlope,
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
      preContestabilityTop20: bestBySpecies(
        protectedPlans,
        (plan) => plan.preContestabilityRecommendation
      )
        .slice(0, 20)
        .map((plan) => plan.candidate.pokemon.slug),
      preContestabilityTop50: bestBySpecies(
        protectedPlans,
        (plan) => plan.preContestabilityRecommendation
      )
        .slice(0, 50)
        .map((plan) => plan.candidate.pokemon.slug),
      top20RetentionRate: retentionBySpecies(
        bestBySpecies(
          protectedPlans,
          (plan) => plan.preContestabilityRecommendation
        ),
        integratedRanked,
        20
      ),
      top50RetentionRate: retentionBySpecies(
        bestBySpecies(
          protectedPlans,
          (plan) => plan.preContestabilityRecommendation
        ),
        integratedRanked,
        50
      ),
      representatives: REPRESENTATIVES.flatMap((slug) => {
        const candidate = bySlug.get(slug);
        return candidate ? [candidate] : [];
      }),
      megaConstraintsPreserved: protectedPlans.every((plan, index) => {
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
    `Weight: Battle Value ${result.config.battleValueWeight * 100}% / Contestability ${result.config.contestabilityWeight * 100}%`,
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
      `  Contestability: score=${candidate.contestability} configured=${result.config.contestabilityWeight * 100}% actual=${round(candidate.contestabilityRatio * 100, 1)}% Environment=${candidate.contestabilityAxes.environment} Team=${candidate.contestabilityAxes.team} Matchup=${candidate.contestabilityAxes.matchup} Reliability=${candidate.contestabilityAxes.reliability}`,
      `  Contestability reasons: ${candidate.contestabilityReasons.map((entry) => entry.text).join(" / ")}`,
      `  Recommendation protection: ${candidate.recommendationProtectionAdjustment >= 0 ? "+" : ""}${candidate.recommendationProtectionAdjustment}`,
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
