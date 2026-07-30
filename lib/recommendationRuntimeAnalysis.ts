import {
  analyzeRecommendationPlan,
  getBestRecommendationPlansBySlug,
  type RecommendationCandidateAnalysis
} from "@/lib/recommendationContribution";
import {
  buildSemanticRecommendationRuntimeAnalysis
} from "@/lib/semanticRecommendationGap";
import { BATTLE_TAG_DEFINITIONS } from "@/lib/semanticCombatRegistry";
import type { BattleValueRecommendationSource } from "@/lib/battleValueRuntime";
import type { AdvisorSwapPlan } from "@/lib/advisorSwapSimulator";
import type { EnvironmentSnapshot } from "@/types/environmentData";
import type { ThreatEnvironmentDataset } from "@/types/environmentThreat";
import type { PokemonEntry } from "@/types/pokemon";
import type {
  CandidateArchetypeName,
  SemanticCandidateProfile
} from "@/types/semanticRecommendationGap";

export type RecommendationRuntimeContext = {
  team: string[];
  regulation: string;
  profile: "standard" | "trick-room";
  datasetId: string;
};

export type RecommendationRuntimeAnalysis = {
  candidates: RecommendationCandidateAnalysis[];
  source: BattleValueRecommendationSource;
};

const ARCHETYPE_NAMES: CandidateArchetypeName[] = [
  "Breaker",
  "Cleaner",
  "Setup Sweeper",
  "Trapper",
  "Pivot",
  "Defensive Anchor",
  "Hazard Control",
  "Hybrid",
  "Unclassified Archetype"
];

function uniqueUnclassified(
  profiles: SemanticCandidateProfile[]
): SemanticCandidateProfile["unclassified"] {
  return profiles
    .flatMap((profile) => profile.unclassified)
    .filter(
      (entry, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.entityKind === entry.entityKind &&
            candidate.entityId === entry.entityId
        ) === index
    )
    .sort(
      (left, right) =>
        left.entityKind.localeCompare(right.entityKind) ||
        left.entityId.localeCompare(right.entityId)
    );
}

export function buildRecommendationRuntimeAnalysis({
  context,
  plans,
  environmentDataset,
  environmentSnapshot,
  availablePokemon
}: {
  context: RecommendationRuntimeContext;
  plans: AdvisorSwapPlan[];
  environmentDataset: ThreatEnvironmentDataset;
  environmentSnapshot: EnvironmentSnapshot;
  availablePokemon: PokemonEntry[];
}): RecommendationRuntimeAnalysis {
  const rankedPlans = getBestRecommendationPlansBySlug(plans);
  const candidates = rankedPlans.map((plan, index) =>
    analyzeRecommendationPlan(plan, index + 1, environmentDataset)
  );
  const planBySlug = new Map(
    rankedPlans.map((plan) => [plan.candidate.pokemon.slug, plan])
  );
  const bestSpeciesCandidates = new Map<
    number,
    RecommendationCandidateAnalysis
  >();
  for (const candidate of candidates) {
    const speciesId = planBySlug.get(candidate.slug)?.candidate.pokemon.speciesId;
    if (speciesId === undefined || bestSpeciesCandidates.has(speciesId)) continue;
    bestSpeciesCandidates.set(speciesId, candidate);
  }
  [...bestSpeciesCandidates.values()]
    .sort((left, right) => left.rank - right.rank)
    .forEach((candidate, index) => {
      candidate.speciesRank = index + 1;
    });

  const semantic = buildSemanticRecommendationRuntimeAnalysis({
    candidates,
    environmentSnapshot,
    availablePokemon
  });
  const profiles = semantic.semanticProfiles;
  const battleTagCounts = Object.fromEntries(
    BATTLE_TAG_DEFINITIONS.map(({ tag }) => [
      tag,
      profiles.filter((profile) => profile.battleTags.includes(tag)).length
    ])
  ) as BattleValueRecommendationSource["datasetSummary"]["battleTagCounts"];
  const archetypeSummary = Object.fromEntries(
    ARCHETYPE_NAMES.map((name) => [
      name,
      profiles.filter((profile) => profile.archetype.primary === name).length
    ])
  ) as Record<CandidateArchetypeName, number>;

  return {
    candidates,
    source: {
      input: context,
      semanticProfiles: profiles,
      datasetSummary: {
        coverage: semantic.coverage,
        battleTagCounts
      },
      battleTagSummary: BATTLE_TAG_DEFINITIONS.map(({ tag }) => ({ tag })),
      archetypeSummary,
      unclassifiedSummary: uniqueUnclassified(profiles)
    }
  };
}
