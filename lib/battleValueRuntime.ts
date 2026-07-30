import { calculateBattleValueAxes } from "@/lib/battleValueAxes";
import { battleValueTier } from "@/lib/battleValueConfig";
import { battleValueInteractions } from "@/lib/battleValueInteractions";
import {
  battleValueReliability,
  battleValueRiskAdjustment
} from "@/lib/battleValueReliability";
import { battleValueTeamFit } from "@/lib/battleValueTeamFit";
import type { EnvironmentSnapshot } from "@/types/environmentData";
import type { PokemonEntry } from "@/types/pokemon";
import type { BattleValueCandidate } from "@/types/battleValue";
import type {
  CandidateArchetypeName,
  SemanticCandidateProfile
} from "@/types/semanticRecommendationGap";
import type { BattleTag } from "@/types/semanticCombat";

export type BattleValueRecommendationSource = {
  input: {
    team: string[];
    regulation: string;
    profile: "standard" | "trick-room";
    datasetId: string;
  };
  semanticProfiles: SemanticCandidateProfile[];
  datasetSummary: {
    coverage: { moves: number; abilities: number; items: number };
    battleTagCounts: Record<BattleTag, number>;
  };
  battleTagSummary: Array<{ tag: BattleTag }>;
  archetypeSummary: Record<CandidateArchetypeName, number>;
  unclassifiedSummary: SemanticCandidateProfile["unclassified"];
};

type BattleValuePrecision = {
  final: number;
  reliability: number;
  intrinsic: number;
};

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function compareBattleValue(
  left: BattleValueCandidate,
  right: BattleValueCandidate,
  precision: ReadonlyMap<string, BattleValuePrecision>
): number {
  const leftPrecision = precision.get(left.slug);
  const rightPrecision = precision.get(right.slug);
  return (
    (rightPrecision?.final ?? right.finalBattleValue) -
      (leftPrecision?.final ?? left.finalBattleValue) ||
    (rightPrecision?.reliability ?? right.reliability) -
      (leftPrecision?.reliability ?? left.reliability) ||
    (rightPrecision?.intrinsic ?? right.intrinsicBattleValue) -
      (leftPrecision?.intrinsic ?? left.intrinsicBattleValue) ||
    (left.recommendationRank ?? Number.POSITIVE_INFINITY) -
      (right.recommendationRank ?? Number.POSITIVE_INFINITY) ||
    left.slug.localeCompare(right.slug)
  );
}

export function evaluateBattleValueRuntime({
  recommendation,
  environmentSnapshot,
  availablePokemon,
  candidateSlug = null
}: {
  recommendation: BattleValueRecommendationSource;
  environmentSnapshot: EnvironmentSnapshot;
  availablePokemon: PokemonEntry[];
  candidateSlug?: string | null;
}): {
  candidates: BattleValueCandidate[];
  battleValueRanking: BattleValueCandidate[];
} {
  const pokemonBySlug = new Map(
    availablePokemon.map((pokemon) => [pokemon.slug, pokemon])
  );
  const environmentBySlug = new Map(
    environmentSnapshot.pokemon.map((pokemon) => [pokemon.slug, pokemon])
  );
  const semanticBySlug = new Map(
    recommendation.semanticProfiles.map((profile) => [profile.slug, profile])
  );
  const teamProfiles = recommendation.input.team.flatMap((slug) => {
    const profile = semanticBySlug.get(slug);
    return profile ? [profile] : [];
  });
  const datasetCoverage =
    (recommendation.datasetSummary.coverage.moves +
      recommendation.datasetSummary.coverage.abilities +
      recommendation.datasetSummary.coverage.items) /
    3;
  const precisionBySlug = new Map<string, BattleValuePrecision>();

  const candidates = recommendation.semanticProfiles
    .flatMap((profile) => {
      if (candidateSlug && profile.slug !== candidateSlug) return [];
      if (!candidateSlug && recommendation.input.team.includes(profile.slug)) {
        return [];
      }
      const pokemon = pokemonBySlug.get(profile.slug);
      const environment = environmentBySlug.get(profile.slug);
      if (!pokemon || !environment) return [];
      const axisResult = calculateBattleValueAxes({
        profile,
        pokemon,
        environment,
        teamProfile: recommendation.input.profile,
        battleProfile: {
          tempoSupport: profile.tagProfiles.Tempo.maximumAdoptionRate
        }
      });
      const interaction = battleValueInteractions(profile, pokemon, environment);
      const teamFitModifier = battleValueTeamFit(profile, teamProfiles);
      const reliability = battleValueReliability({
        profile,
        datasetCoverage,
        usageRate: environment.usage.rate,
        teamProfile: recommendation.input.profile
      });
      const riskAdjustment = battleValueRiskAdjustment(
        profile,
        pokemon,
        environment
      );
      const intrinsicBattleValue = clamp100(
        Object.values(axisResult.axes).reduce(
          (total, value) => total + value,
          0
        ) + interaction.points
      );
      const rawBattleValue = clamp100(
        intrinsicBattleValue + teamFitModifier + riskAdjustment
      );
      const finalBattleValue = clamp100(rawBattleValue * reliability.value);
      precisionBySlug.set(profile.slug, {
        final: finalBattleValue,
        reliability: reliability.value,
        intrinsic: intrinsicBattleValue
      });
      const result: BattleValueCandidate = {
        slug: profile.slug,
        name: profile.name,
        eligibility: profile.recommendationEligible,
        exclusionClass: profile.disposition,
        recommendationRank: profile.recommendationRank,
        recommendationScore: profile.recommendationScore,
        semanticGap: profile.semanticGap,
        archetype: profile.archetype.primary,
        battleTags: profile.battleTags,
        intrinsicBattleValue: round(intrinsicBattleValue),
        teamFitModifier: round(teamFitModifier),
        rawBattleValue: round(rawBattleValue),
        reliability: round(reliability.value, 3),
        reliabilityReasons: reliability.reasons,
        riskContribution: profile.riskContribution,
        riskAdjustment: round(riskAdjustment),
        finalBattleValue: round(finalBattleValue),
        tier: battleValueTier(finalBattleValue),
        axisBreakdown: Object.fromEntries(
          Object.entries(axisResult.axes).map(([key, value]) => [
            key,
            round(value)
          ])
        ) as BattleValueCandidate["axisBreakdown"],
        interactionBonus: round(interaction.points),
        interactions: interaction.interactions.map((entry) => ({
          ...entry,
          points: round(entry.points)
        })),
        evidence: [
          ...axisResult.evidence,
          ...profile.battleTags.flatMap((tag) =>
            profile.tagProfiles[tag].evidence
              .slice(0, 1)
              .map(
                (entry) =>
                  `${tag}:${entry.entityKind}:${entry.entityId}:${round(entry.adoptionRate * 100, 1)}%`
              )
          )
        ].slice(0, 20),
        unclassified: profile.unclassified
      };
      return [result];
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const battleValueRanking = [...candidates].sort((left, right) =>
    compareBattleValue(left, right, precisionBySlug)
  );
  return { candidates, battleValueRanking };
}
