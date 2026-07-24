import environmentIndexData from "@/data/environment/index.json";
import pokemonData from "@/data/pokemon.json";
import { getThreatEnvironmentCatalog, readEnvironmentSnapshot } from "@/lib/environmentData.server";
import { findThreatEnvironmentDataset } from "@/lib/environmentThreatData";
import {
  analyzeRecommendations,
  type RecommendationAnalyzerResult
} from "@/lib/recommendationAnalyzer";
import { getAdvisorSwapSimulation } from "@/lib/advisorSwapSimulator";
import {
  filterAllowedPokemon,
  getRegulationDefinition
} from "@/lib/regulations";
import { getTeamAdvisorAnalysis } from "@/lib/teamAdvisor";
import { getTeamDiagnostics } from "@/lib/teamDiagnostics";
import { getThreatSnapshot } from "@/lib/threatSnapshot";
import { getPokemonBySlug, summarizeTeam } from "@/lib/typeChart";
import type { TeamProfile } from "@/lib/teamProfile";
import type {
  EnvironmentSnapshotIndex,
  EnvironmentSnapshotIndexEntry
} from "@/types/environmentData";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

export const DEFAULT_RECOMMENDATION_ANALYZER_TEAM = [
  "charizard",
  "garchomp",
  "rotom-wash",
  "corviknight",
  "clefable"
] as const;

export type RecommendationAnalyzerOptions = {
  teamSlugs?: string[];
  regulation?: string;
  profile?: TeamProfile;
  topLimit?: number;
};

function buildTeam(
  teamSlugs: string[],
  availablePokemon: PokemonEntry[]
): TeamSlot[] {
  if (teamSlugs.length < 1 || teamSlugs.length > 6) {
    throw new Error("Teamは1〜6体で指定してください。");
  }
  const availableSlugs = new Set(
    availablePokemon.map((pokemon) => pokemon.slug)
  );
  const speciesIds = new Set<number>();
  return teamSlugs.map((pokemonSlug, index) => {
    const pokemon = getPokemonBySlug(pokemonSlug);
    if (!pokemon) throw new Error(`不明なPokemon slugです: ${pokemonSlug}`);
    if (!availableSlugs.has(pokemonSlug)) {
      throw new Error(`指定regulationでは使用できません: ${pokemonSlug}`);
    }
    if (speciesIds.has(pokemon.speciesId)) {
      throw new Error(`同じspeciesを重複指定できません: ${pokemonSlug}`);
    }
    speciesIds.add(pokemon.speciesId);
    return {
      id: `analyzer-slot-${index + 1}`,
      mode: "pokemon",
      pokemonSlug
    };
  });
}

function findSnapshotReference(
  regulation: string,
  snapshotId: string
): EnvironmentSnapshotIndexEntry {
  const index = environmentIndexData as EnvironmentSnapshotIndex;
  const reference =
    index.snapshots.find(
      (entry) =>
        entry.snapshotId === snapshotId &&
        entry.regulationId === regulation &&
        entry.status === "available"
    ) ??
    index.snapshots.find(
      (entry) =>
        entry.regulationId === regulation &&
        entry.battleFormat === "single" &&
        entry.ratingCutoff === 1760 &&
        entry.status === "available"
    );
  if (!reference) {
    throw new Error(`${regulation}の環境snapshotがありません。`);
  }
  return reference;
}

export function buildRecommendationAnalyzerFixture(
  options: RecommendationAnalyzerOptions = {}
) {
  const teamSlugs = options.teamSlugs ?? [
    ...DEFAULT_RECOMMENDATION_ANALYZER_TEAM
  ];
  const regulation = options.regulation ?? "M-B";
  const profile = options.profile ?? "standard";
  const topLimit = options.topLimit ?? 20;
  if (profile !== "standard" && profile !== "trick-room") {
    throw new Error(`不明なProfileです: ${profile}`);
  }
  if (!Number.isInteger(topLimit) || topLimit < 1 || topLimit > 100) {
    throw new Error("topLimitは1〜100の整数で指定してください。");
  }
  const regulationDefinition = getRegulationDefinition(regulation);
  if (!regulationDefinition) {
    throw new Error(`不明なRegulationです: ${regulation}`);
  }
  const availablePokemon = filterAllowedPokemon(
    pokemonData as PokemonEntry[],
    regulationDefinition
  );
  const environmentDataset = findThreatEnvironmentDataset(
    getThreatEnvironmentCatalog(),
    regulation
  );
  if (!environmentDataset) {
    throw new Error(`${regulation}のThreat Environment Datasetがありません。`);
  }
  const environmentSnapshot = readEnvironmentSnapshot(
    findSnapshotReference(regulation, environmentDataset.snapshotId)
  );
  const team = buildTeam(teamSlugs, availablePokemon);
  const summary = summarizeTeam(team);
  const diagnostics = getTeamDiagnostics(
    team,
    summary,
    availablePokemon,
    profile
  );
  const threatSnapshot = getThreatSnapshot({
    team,
    availablePokemon,
    environmentDataset,
    profile
  });
  const advisor = getTeamAdvisorAnalysis({
    team,
    summary,
    diagnostics,
    threatSnapshot,
    availablePokemon,
    environmentDataset,
    profile
  });
  const simulation = getAdvisorSwapSimulation({
    team,
    advisor,
    availablePokemon,
    environmentDataset,
    threatSnapshot,
    profile
  });
  return {
    team,
    analyzerInput: {
      context: {
        team: teamSlugs,
        regulation,
        profile,
        datasetId: environmentDataset.snapshotId,
        period: environmentDataset.period,
        ratingCutoff: environmentDataset.ratingCutoff
      },
      plans: simulation.evaluatedPlans,
      environmentDataset,
      environmentSnapshot,
      availablePokemon,
      topLimit
    },
    advisor,
    simulation,
    threatSnapshot
  };
}

export function runRecommendationAnalyzer(
  options: RecommendationAnalyzerOptions = {}
): RecommendationAnalyzerResult {
  const fixture = buildRecommendationAnalyzerFixture(options);
  return analyzeRecommendations({
    context: {
      ...fixture.analyzerInput.context
    },
    plans: fixture.analyzerInput.plans,
    environmentDataset: fixture.analyzerInput.environmentDataset,
    environmentSnapshot: fixture.analyzerInput.environmentSnapshot,
    availablePokemon: fixture.analyzerInput.availablePokemon,
    topLimit: fixture.analyzerInput.topLimit
  });
}
