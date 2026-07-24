import { getAdvisorSwapSimulation } from "@/lib/advisorSwapSimulator";
import { getThreatEnvironmentCatalog } from "@/lib/environmentData.server";
import { findThreatEnvironmentDataset } from "@/lib/environmentThreatData";
import { getAvailablePokemonBySeason } from "@/lib/regulations";
import { getTeamAdvisorAnalysis } from "@/lib/teamAdvisor";
import { getTeamDiagnostics } from "@/lib/teamDiagnostics";
import { getThreatSnapshot } from "@/lib/threatSnapshot";
import { getPokemonBySlug, summarizeTeam } from "@/lib/typeChart";
import type { TeamProfile } from "@/lib/teamProfile";
import type { TeamSlot } from "@/types/pokemon";

export type TrickRoomDiversityFixture = {
  id: string;
  label: string;
  team: string[];
  expectedSlowCount: number;
};

export const TRICK_ROOM_DIVERSITY_FIXTURES: TrickRoomDiversityFixture[] = [
  {
    id: "slow-0",
    label: "低速枠0体",
    team: ["dragonite", "garchomp", "gliscor", "charizard", "rotom-wash"],
    expectedSlowCount: 0
  },
  {
    id: "slow-2",
    label: "低速枠2体",
    team: ["slowbro", "torkoal", "dragonite", "garchomp", "charizard", "rotom-wash"],
    expectedSlowCount: 2
  },
  {
    id: "slow-3",
    label: "低速枠3体",
    team: ["slowbro", "torkoal", "snorlax", "garchomp", "charizard", "rotom-wash"],
    expectedSlowCount: 3
  },
  {
    id: "slow-4",
    label: "低速枠4体以上",
    team: ["slowbro", "torkoal", "snorlax", "scizor", "garchomp", "charizard"],
    expectedSlowCount: 4
  }
];

function toTeam(slugs: string[]): TeamSlot[] {
  return slugs.map((pokemonSlug, index) => ({
    id: `slot-${index + 1}`,
    mode: "pokemon",
    pokemonSlug
  }));
}

export function analyzeAdvisorTeam(
  teamSlugs: string[],
  profile: TeamProfile
) {
  const availablePokemon = getAvailablePokemonBySeason("season-m4");
  const environmentDataset = findThreatEnvironmentDataset(
    getThreatEnvironmentCatalog(),
    "M-B"
  );
  if (!environmentDataset) throw new Error("M-Bの環境snapshotがありません");
  for (const slug of teamSlugs) {
    if (!getPokemonBySlug(slug)) {
      throw new Error(`不明なslug ${slug}`);
    }
  }
  const team = toTeam(teamSlugs);
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
  const threats = threatSnapshot.currentDisplayedTop5;
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
    availablePokemon,
    environmentDataset,
    advisor,
    threats,
    threatSnapshot,
    simulation
  };
}

export function analyzeTrickRoomFixture(fixture: TrickRoomDiversityFixture) {
  return {
    fixture,
    ...analyzeAdvisorTeam(fixture.team, "trick-room")
  };
}
