import {
  getAdvisorCompatibleThreatAnalysis,
  getThreatPokemonAnalysis,
  MIN_THREAT_USAGE_RATE,
  type ThreatPokemonAnalysis
} from "@/lib/teamThreats";
import { summarizeTeam } from "@/lib/typeChart";
import type { TeamProfile } from "@/lib/teamProfile";
import type { ThreatEnvironmentDataset } from "@/types/environmentThreat";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

export const THREAT_SNAPSHOT_RULES = {
  displayedLimit: 5,
  trackedLimit: 10
} as const;

export type ThreatAnalysisContext = {
  datasetId: string | null;
  regulationId: string | null;
  battleFormat: ThreatEnvironmentDataset["battleFormat"] | null;
  ratingCutoff: number | null;
  profile: TeamProfile;
  minimumUsageRate: number;
  moveUsageEvaluated: true;
  abilityUsageEvaluated: true;
  speciesAggregation: "best-form-per-species";
  megaHandling: "selectable-team-form";
  displayedScoring: "canonical";
  trackedPurpose: "recommendation-compatibility";
};

/**
 * One immutable view of the current threat state.
 *
 * `currentDisplayedTop5` and `fullThreatRanking` are the canonical ranking
 * shown to users. `trackedThreats` preserves the established TASK037
 * recommendation signals, but is explicitly internal and must never be used
 * as a replacement for the displayed ranking or for user-facing threat names.
 */
export type ThreatSnapshot = {
  currentDisplayedTop5: ThreatPokemonAnalysis[];
  trackedThreats: ThreatPokemonAnalysis[];
  fullThreatRanking: ThreatPokemonAnalysis[];
  analysisContext: ThreatAnalysisContext;
};

export type ThreatSnapshotInput = {
  team: TeamSlot[];
  availablePokemon: PokemonEntry[];
  environmentDataset: ThreatEnvironmentDataset | null;
  profile?: TeamProfile;
};

export function getThreatSnapshot({
  team,
  availablePokemon,
  environmentDataset,
  profile = "standard"
}: ThreatSnapshotInput): ThreatSnapshot {
  const summary = summarizeTeam(team);
  const fullThreatRanking = getThreatPokemonAnalysis(
    team,
    summary,
    availablePokemon,
    environmentDataset,
    availablePokemon.length,
    profile
  );
  const trackedThreats = getAdvisorCompatibleThreatAnalysis(
    team,
    summary,
    availablePokemon,
    environmentDataset,
    THREAT_SNAPSHOT_RULES.trackedLimit,
    profile
  );
  return {
    currentDisplayedTop5: fullThreatRanking.slice(
      0,
      THREAT_SNAPSHOT_RULES.displayedLimit
    ),
    trackedThreats,
    fullThreatRanking,
    analysisContext: {
      datasetId: environmentDataset?.snapshotId ?? null,
      regulationId: environmentDataset?.regulationId ?? null,
      battleFormat: environmentDataset?.battleFormat ?? null,
      ratingCutoff: environmentDataset?.ratingCutoff ?? null,
      profile,
      minimumUsageRate: MIN_THREAT_USAGE_RATE,
      moveUsageEvaluated: true,
      abilityUsageEvaluated: true,
      speciesAggregation: "best-form-per-species",
      megaHandling: "selectable-team-form",
      displayedScoring: "canonical",
      trackedPurpose: "recommendation-compatibility"
    }
  };
}

export function getThreatSnapshotIds(
  threats: readonly ThreatPokemonAnalysis[]
): string[] {
  return threats.map((threat) => threat.pokemon.slug);
}
