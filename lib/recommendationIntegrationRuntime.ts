import { evaluateBattleValueRuntime } from "@/lib/battleValueRuntime";
import { BoundedCache } from "@/lib/boundedCache";
import { battleValueEnvironmentSnapshot } from "@/lib/battleValueEnvironmentAdapter";
import { analyzeContestabilityCandidate } from "@/lib/contestabilityEngine";
import { CONTESTABILITY_CONFIG } from "@/lib/contestabilityConfig";
import {
  buildAbilityDenialProfile,
  buildAbilityEnvironmentDemand
} from "@/lib/abilityDenialProfile";
import { findBestDefensiveCore } from "@/lib/defensiveCoreEvaluation";
import type { AdvisorBuildPhase } from "@/lib/advisorBuildPhase";
import {
  buildGoalOrientedCandidatePlan,
  buildGoalOrientedTeamBuilder,
  prepareGoalOrientedTeamBuilder,
  type GoalOrientedTeamBuilderContext,
  type GoalOrientedTeamBuilderInput
} from "@/lib/goalOrientedTeamBuilder";
import { GOAL_ORIENTED_TEAM_BUILDER_CONFIG } from "@/lib/goalOrientedTeamBuilderConfig";
import { getMatchupVerdictContext } from "@/lib/matchupVerdictEngine";
import {
  getAdvisorSwapSimulation,
  rebuildAdvisorSwapSimulationWithPlans,
  type AdvisorSwapPlan,
  type AdvisorSwapSimulation,
  type AdvisorSwapSimulationInput
} from "@/lib/advisorSwapSimulator";
import {
  BATTLE_VALUE_AXIS_EXPLANATIONS,
  RECOMMENDATION_INTEGRATION_CONFIG
} from "@/lib/recommendationIntegrationConfig";
import {
  analyzeRecommendationPlan,
  RECOMMENDATION_CONTRIBUTION_CATEGORIES,
  type RecommendationContributionCategory
} from "@/lib/recommendationContribution";
import {
  buildRecommendationRuntimeAnalysis,
  type RecommendationRuntimeAnalysis
} from "@/lib/recommendationRuntimeAnalysis";
import type { EnvironmentSnapshot } from "@/types/environmentData";
import type { BattleValueCandidate } from "@/types/battleValue";
import type { AbilityDenialCategory } from "@/types/matchupCore";
import type {
  GoalOrientedCandidatePlan,
  GoalOrientedTeamBuilderResult
} from "@/types/goalOrientedTeamBuilder";
import { getPokemonBySlug } from "@/lib/typeChart";

const MAX_SIMULATION_CACHE_ENTRIES = 4;
export const MAX_GOAL_BUILDER_CONTEXT_CACHE_ENTRIES = 4;
export const MAX_GOAL_BUILDER_RESULT_CACHE_ENTRIES = 96;
const simulationCache = new BoundedCache<string, AdvisorSwapSimulation>(
  MAX_SIMULATION_CACHE_ENTRIES
);
const goalBuilderContextCache = new BoundedCache<
  string,
  GoalOrientedTeamBuilderContext
>(MAX_GOAL_BUILDER_CONTEXT_CACHE_ENTRIES);
const goalBuilderResultCache = new BoundedCache<
  string,
  GoalOrientedCandidatePlan
>(MAX_GOAL_BUILDER_RESULT_CACHE_ENTRIES);

type DeferredGoalBuilderSource = {
  contextKey: string;
  input: GoalOrientedTeamBuilderInput;
};

function getDeferredGoalBuilderContextKey(
  input: GoalOrientedTeamBuilderInput
): string {
  return JSON.stringify({
    teamSignature: input.team.join(","),
    regulation: input.environmentDataset.regulationId,
    profile: input.profile,
    datasetId: input.environmentDataset.snapshotId,
    datasetChecksum: input.environmentDataset.metadata.checksum
  });
}

const deferredGoalBuilderSources = new WeakMap<
  AdvisorSwapSimulation,
  DeferredGoalBuilderSource
>();

let goalBuilderComputationCount = 0;
let goalBuilderCacheHitCount = 0;

export type DeferredGoalBuilderCalculation = {
  plan: GoalOrientedCandidatePlan | null;
  cacheHit: boolean;
};

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

function battleValueExplanation(candidate: BattleValueCandidate): string[] {
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
    .slice(0, 3)
    .map(([axis]) => BATTLE_VALUE_AXIS_EXPLANATIONS[axis]);
}

export type IntegratedRecommendationRuntime = {
  simulation: AdvisorSwapSimulation;
  baseline: AdvisorSwapSimulation;
  integratedPlans: AdvisorSwapPlan[];
  recommendation: RecommendationRuntimeAnalysis;
  battleValue: ReturnType<typeof evaluateBattleValueRuntime>;
  battleBySlug: Map<string, BattleValueCandidate>;
  battleRanks: Map<string, number>;
  team: string[];
  recommendationWeight: number;
  battleValueWeight: number;
  contestabilityWeight: number;
  goalBuilder: GoalOrientedTeamBuilderResult;
};

export function buildIntegratedRecommendationRuntime({
  input,
  baseline = getAdvisorSwapSimulation(input),
  environmentSnapshot =
    input.environmentDataset === null
      ? null
      : battleValueEnvironmentSnapshot(input.environmentDataset),
  deferGoalBuilder = false
}: {
  input: AdvisorSwapSimulationInput;
  baseline?: AdvisorSwapSimulation;
  environmentSnapshot?: EnvironmentSnapshot | null;
  deferGoalBuilder?: boolean;
}): IntegratedRecommendationRuntime | null {
  const dataset = input.environmentDataset;
  if (!dataset || !environmentSnapshot || baseline.evaluatedPlans.length === 0) {
    return null;
  }
  const profile = input.profile ?? "standard";
  const team = input.team.flatMap((slot) =>
    slot.mode === "pokemon" ? [slot.pokemonSlug] : []
  );
  const recommendation = buildRecommendationRuntimeAnalysis({
    context: {
      team,
      regulation: dataset.regulationId,
      profile,
      datasetId: dataset.snapshotId
    },
    plans: baseline.evaluatedPlans,
    environmentDataset: dataset,
    environmentSnapshot,
    availablePokemon: input.availablePokemon
  });
  const battleValue = evaluateBattleValueRuntime({
    recommendation: recommendation.source,
    environmentSnapshot,
    availablePokemon: input.availablePokemon
  });
  const battleBySlug = new Map(
    battleValue.candidates.map((candidate) => [candidate.slug, candidate])
  );
  const semanticBySlug = new Map(
    recommendation.source.semanticProfiles.map((candidate) => [
      candidate.slug,
      candidate
    ])
  );
  const teamProfiles = team.flatMap((slug) => {
    const candidate = semanticBySlug.get(slug);
    return candidate ? [candidate] : [];
  });
  const environmentBySlug = new Map(
    environmentSnapshot.pokemon.map((candidate) => [candidate.slug, candidate])
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
  const matchupContext = getMatchupVerdictContext(dataset, profile);
  const abilityDemand = buildAbilityEnvironmentDemand(dataset);
  const currentMembers = team.flatMap((slug) => {
    const pokemon = getPokemonBySlug(slug);
    return pokemon ? [pokemon] : [];
  });
  const teamAbilityCoverageCache = new Map<
    string,
    Partial<Record<AbilityDenialCategory, number>>
  >();
  const getTeamAbilityCoverage = (
    members: typeof currentMembers
  ): Partial<Record<AbilityDenialCategory, number>> => {
    const key = members
      .map((member) => member.slug)
      .sort()
      .join(",");
    const cached = teamAbilityCoverageCache.get(key);
    if (cached) return cached;
    const coverage: Partial<Record<AbilityDenialCategory, number>> = {};
    for (const member of members) {
      const memberProfile = buildAbilityDenialProfile({
        pokemonSlug: member.slug,
        environment: matchupContext.environmentBySlug.get(member.slug),
        demand: abilityDemand
      });
      for (const [category, value] of Object.entries(
        memberProfile.categoryCoverage
      )) {
        const categoryKey = category as AbilityDenialCategory;
        coverage[categoryKey] =
          1 -
          (1 - (coverage[categoryKey] ?? 0)) *
            (1 - (value ?? 0));
      }
    }
    teamAbilityCoverageCache.set(key, coverage);
    return coverage;
  };
  const planAnalyses = baseline.evaluatedPlans.map((plan, index) => {
    const key = planKey(plan, index);
    if (currentMembers.length === 0) {
      return {
        key,
        plan,
        analysis: analyzeRecommendationPlan(plan, index + 1, dataset),
        abilityDenialProfile: null,
        defensiveCoreProfile: null,
        abilityMatchupValue: 0,
        abilityExplanation: []
      };
    }
    const postActionMembers = plan.afterTeam.flatMap((slot) => {
      if (slot.mode !== "pokemon") return [];
      const member = getPokemonBySlug(slot.pokemonSlug);
      return member ? [member] : [];
    });
    const corePartners = postActionMembers.filter(
      (member) => member.slug !== plan.candidate.pokemon.slug
    );
    const abilityDenialProfile = buildAbilityDenialProfile({
      pokemonSlug: plan.candidate.pokemon.slug,
      environment: matchupContext.environmentBySlug.get(
        plan.candidate.pokemon.slug
      ),
      demand: abilityDemand,
      teamCoverage: getTeamAbilityCoverage(corePartners)
    });
    const defensiveCoreProfile = findBestDefensiveCore(
      plan.candidate.pokemon,
      corePartners,
      matchupContext
    );
    const abilityMatchupValue = round(
      abilityDenialProfile.expectedValue * 0.6 +
        defensiveCoreProfile.coreSynergy * 0.4
    );
    const abilityExplanation = abilityDenialProfile.entries
      .filter((entry) => entry.matchupValue > 0)
      .sort(
        (left, right) =>
          right.matchupValue - left.matchupValue ||
          left.ability.localeCompare(right.ability)
      )
      .slice(0, 2)
      .flatMap((entry) =>
        entry.explanations.slice(0, 1).map(
          (text) =>
            `${entry.abilityName}型（採用率${Math.round(entry.adoptionRate * 100)}%）は、${text}`
        )
      );
    const analysis = analyzeRecommendationPlan(plan, index + 1, dataset);
    const abilitySignal =
      currentMembers.length < 6 ? 0 : round(abilityMatchupValue / 10);
    if (abilitySignal > 0) {
      analysis.contributions.Ability = round(
        analysis.contributions.Ability + abilitySignal
      );
      analysis.evidenceByCategory.Ability.push({
        id: "ability:environment-matchup",
        text:
          abilityExplanation[0] ??
          "特性による追加の拒否性能は確認できません。",
        points: abilitySignal,
        dimension: "context",
        confidence: abilityDenialProfile.confidence
      });
    }
    return {
      key,
      plan,
      analysis,
      abilityDenialProfile,
      defensiveCoreProfile,
      abilityMatchupValue,
      abilityExplanation
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
  ) as Record<RecommendationContributionCategory, Map<string, number>>;
  const battleValueWeight =
    RECOMMENDATION_INTEGRATION_CONFIG.battleValueWeight;
  const recommendationWeight =
    RECOMMENDATION_INTEGRATION_CONFIG.recommendationWeight;
  const contestabilityWeight = CONTESTABILITY_CONFIG.weight;
  const integrationWeightTotal =
    recommendationWeight + battleValueWeight + contestabilityWeight;
  if (Math.abs(integrationWeightTotal - 1) > 0.000001) {
    throw new Error(
      `Recommendation integration weights must total 1: ${integrationWeightTotal}`
    );
  }

  const integratedPlans = planAnalyses.map(({
    key,
    plan,
    abilityDenialProfile,
    defensiveCoreProfile,
    abilityMatchupValue,
    abilityExplanation
  }) => {
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
      Math.min(100, recommendationNormalized * recommendationConfidence)
    );
    const finalRecommendation = round(
      confidenceAdjustedRecommendation * recommendationWeight +
        normalizedBattle * battleValueWeight +
        contestabilityScore * contestabilityWeight
    );
    const battleValueContribution = round(
      normalizedBattle * battleValueWeight
    );
    const contestabilityContribution = round(
      contestabilityScore * contestabilityWeight
    );
    const preContestabilityRecommendation = round(
      recommendationNormalized * (1 - battleValueWeight) +
        normalizedBattle * battleValueWeight
    );
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
    const abilityContribution = round(
      normalized.Ability *
        RECOMMENDATION_INTEGRATION_CONFIG.contributionWeights.Ability *
        RECOMMENDATION_INTEGRATION_CONFIG.contributionWeight *
        recommendationWeight
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
      battleValueExplanation: battle ? battleValueExplanation(battle) : [],
      contestability,
      contestabilityContribution,
      contestabilityExplanation:
        contestability?.reasons.map((entry) => entry.text) ?? [],
      abilityMatchupValue,
      abilityContribution,
      abilityExplanation,
      abilityDenialProfile,
      defensiveCoreProfile,
      preContestabilityRecommendation,
      finalRecommendation,
      recommendationIntegration: {
        weight: battleValueWeight,
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
  const goalBuilderInput: GoalOrientedTeamBuilderInput = {
    team,
    plans: integratedPlans,
    battleBySlug,
    semanticBySlug,
    environmentDataset: dataset,
    profile
  };
  let goalBuilderValue: GoalOrientedTeamBuilderResult | null = null;
  const getGoalBuilder = () => {
    if (!goalBuilderValue) {
      goalBuilderValue = buildGoalOrientedTeamBuilder(goalBuilderInput);
    }
    return goalBuilderValue;
  };
  const plannerPlans = deferGoalBuilder
    ? integratedPlans
    : (() => {
        const goalPlanBySlug = new Map(
          getGoalBuilder().candidates.map((entry) => [
            entry.candidateSlug,
            entry
          ])
        );
        return integratedPlans.map((plan) => ({
          ...plan,
          goalBuilderPlan:
            plan.action.kind === "add"
              ? goalPlanBySlug.get(plan.candidate.pokemon.slug) ?? null
              : null
        }));
      })();
  const simulation = rebuildAdvisorSwapSimulationWithPlans(
    baseline,
    plannerPlans,
    profile
  );
  deferredGoalBuilderSources.set(simulation, {
    contextKey: getDeferredGoalBuilderContextKey(goalBuilderInput),
    input: goalBuilderInput
  });
  return {
    simulation,
    baseline,
    integratedPlans: plannerPlans,
    recommendation,
    battleValue,
    battleBySlug,
    battleRanks,
    team,
    recommendationWeight,
    battleValueWeight,
    contestabilityWeight,
    get goalBuilder() {
      return getGoalBuilder();
    }
  };
}

export function getRecommendationRuntimeCacheKey(
  input: AdvisorSwapSimulationInput
): string | null {
  const dataset = input.environmentDataset;
  if (!dataset) return null;
  return JSON.stringify({
    team: input.team.map((slot) =>
      slot.mode === "pokemon"
        ? [slot.id, slot.mode, slot.pokemonSlug]
        : [slot.id, slot.mode, slot.primaryType, slot.secondaryType ?? ""]
    ),
    regulation: dataset.regulationId,
    profile: input.profile ?? "standard",
    datasetId: dataset.snapshotId,
    datasetChecksum: dataset.metadata.checksum
  });
}

function getGoalBuilderResultCacheKey({
  source,
  candidateSlug,
  phase
}: {
  source: DeferredGoalBuilderSource;
  candidateSlug: string;
  phase: AdvisorBuildPhase;
}): string {
  return `${source.contextKey}|phase=${phase}|candidate=${candidateSlug}|goalBuilder=${GOAL_ORIENTED_TEAM_BUILDER_CONFIG.schemaVersion}`;
}

export function readDeferredGoalBuilderPlan({
  simulation,
  candidateSlug,
  phase
}: {
  simulation: AdvisorSwapSimulation;
  candidateSlug: string;
  phase: AdvisorBuildPhase;
}): GoalOrientedCandidatePlan | null {
  const source = deferredGoalBuilderSources.get(simulation);
  if (!source) return null;
  return (
    goalBuilderResultCache.get(
      getGoalBuilderResultCacheKey({ source, candidateSlug, phase })
    ) ?? null
  );
}

export function getDeferredGoalBuilderScopeKey(
  simulation: AdvisorSwapSimulation
): string | null {
  return deferredGoalBuilderSources.get(simulation)?.contextKey ?? null;
}

export function calculateDeferredGoalBuilderPlan({
  simulation,
  candidateSlug,
  phase
}: {
  simulation: AdvisorSwapSimulation;
  candidateSlug: string;
  phase: AdvisorBuildPhase;
}): DeferredGoalBuilderCalculation {
  const source = deferredGoalBuilderSources.get(simulation);
  if (!source) return { plan: null, cacheHit: false };
  const resultKey = getGoalBuilderResultCacheKey({
    source,
    candidateSlug,
    phase
  });
  const cached = goalBuilderResultCache.get(resultKey);
  if (cached) {
    goalBuilderCacheHitCount += 1;
    return { plan: cached, cacheHit: true };
  }
  let context = goalBuilderContextCache.get(source.contextKey);
  if (!context) {
    context = prepareGoalOrientedTeamBuilder(source.input);
    goalBuilderContextCache.set(source.contextKey, context);
  }
  const plan = buildGoalOrientedCandidatePlan({
    context,
    candidateSlug
  });
  if (plan) {
    goalBuilderResultCache.set(resultKey, plan);
    goalBuilderComputationCount += 1;
  }
  return { plan, cacheHit: false };
}

export function getDeferredGoalBuilderCacheMetrics(): {
  computations: number;
  cacheHits: number;
  contextEntries: number;
  resultEntries: number;
} {
  return {
    computations: goalBuilderComputationCount,
    cacheHits: goalBuilderCacheHitCount,
    contextEntries: goalBuilderContextCache.size,
    resultEntries: goalBuilderResultCache.size
  };
}

export function resetDeferredGoalBuilderCacheForTests(): void {
  goalBuilderContextCache.clear();
  goalBuilderResultCache.clear();
  goalBuilderComputationCount = 0;
  goalBuilderCacheHitCount = 0;
}

export function getIntegratedAdvisorSwapSimulation(
  input: AdvisorSwapSimulationInput
): AdvisorSwapSimulation {
  const key = getRecommendationRuntimeCacheKey(input);
  if (key) {
    const cached = simulationCache.get(key);
    if (cached) {
      return cached;
    }
  }
  const baseline = getAdvisorSwapSimulation(input);
  const runtime = buildIntegratedRecommendationRuntime({
    input,
    baseline,
    deferGoalBuilder: true
  });
  const simulation = runtime?.simulation ?? baseline;
  if (key) simulationCache.set(key, simulation);
  return simulation;
}
