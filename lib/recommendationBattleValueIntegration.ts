import {
  RECOMMENDATION_CONTRIBUTION_CATEGORIES,
  type RecommendationContributionCategory
} from "@/lib/recommendationContribution";
import { CONTESTABILITY_CONFIG } from "@/lib/contestabilityConfig";
import {
  getAdvisorSwapSimulation,
  type AdvisorSwapPlan,
  type AdvisorSwapSimulation,
  type AdvisorSwapSimulationInput
} from "@/lib/advisorSwapSimulator";
import {
  buildIntegratedRecommendationRuntime,
  getIntegratedAdvisorSwapSimulation as getRuntimeIntegratedAdvisorSwapSimulation
} from "@/lib/recommendationIntegrationRuntime";
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
  baseline,
  environmentSnapshot
}: {
  input: AdvisorSwapSimulationInput;
  baseline?: AdvisorSwapSimulation;
  environmentSnapshot?: EnvironmentSnapshot | null;
}): {
  simulation: AdvisorSwapSimulation;
  analysis: RecommendationIntegrationResult | null;
} {
  const resolvedBaseline = baseline ?? getAdvisorSwapSimulation(input);
  const dataset = input.environmentDataset;
  const runtime = buildIntegratedRecommendationRuntime({
    input,
    baseline: resolvedBaseline,
    environmentSnapshot
  });
  if (!dataset || !runtime) {
    return { simulation: resolvedBaseline, analysis: null };
  }
  const profile = input.profile ?? "standard";
  const {
    simulation,
    baseline: runtimeBaseline,
    integratedPlans,
    battleBySlug,
    battleRanks,
    team,
    recommendationWeight,
    battleValueWeight: weight,
    contestabilityWeight
  } = runtime;
  const baselineRanked = bestBySpecies(
    runtimeBaseline.evaluatedPlans,
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
          recommendationWeight * 100,
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
        contestabilityWeight,
        recommendationWeight,
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
        integratedPlans,
        (plan) => plan.preContestabilityRecommendation
      )
        .slice(0, 20)
        .map((plan) => plan.candidate.pokemon.slug),
      preContestabilityTop50: bestBySpecies(
        integratedPlans,
        (plan) => plan.preContestabilityRecommendation
      )
        .slice(0, 50)
        .map((plan) => plan.candidate.pokemon.slug),
      top20RetentionRate: retentionBySpecies(
        bestBySpecies(
          integratedPlans,
          (plan) => plan.preContestabilityRecommendation
        ),
        integratedRanked,
        20
      ),
      top50RetentionRate: retentionBySpecies(
        bestBySpecies(
          integratedPlans,
          (plan) => plan.preContestabilityRecommendation
        ),
        integratedRanked,
        50
      ),
      representatives: REPRESENTATIVES.flatMap((slug) => {
        const candidate = bySlug.get(slug);
        return candidate ? [candidate] : [];
      }),
      megaConstraintsPreserved: integratedPlans.every((plan, index) => {
        const before = runtimeBaseline.evaluatedPlans[index];
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
  return getRuntimeIntegratedAdvisorSwapSimulation(input);
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
