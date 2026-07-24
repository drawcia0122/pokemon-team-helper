import { BATTLE_VALUE_CONFIG } from "@/lib/battleValueConfig";
import type { BattleTag } from "@/types/semanticCombat";
import type { SemanticCandidateProfile } from "@/types/semanticRecommendationGap";

const TEAM_ROLE_TAGS: BattleTag[] = [
  "Setup",
  "WinCondition",
  "Cleanup",
  "PriorityFinish",
  "RevengeKill",
  "WallBreak",
  "Pivot",
  "Trade",
  "DefensiveAnchor",
  "HazardSetter",
  "HazardRemoval"
];

export function battleValueTeamFit(
  candidate: SemanticCandidateProfile,
  teamProfiles: SemanticCandidateProfile[]
): number {
  if (teamProfiles.length === 0) return 0;
  let modifier = 0;
  for (const tag of TEAM_ROLE_TAGS) {
    const teamMaximum = Math.max(
      0,
      ...teamProfiles.map((profile) => profile.tagProfiles[tag].semanticPresence)
    );
    const candidatePresence = candidate.tagProfiles[tag].semanticPresence;
    if (teamMaximum < 0.25 && candidatePresence >= 0.35) {
      modifier += 1.7 * candidatePresence;
    } else if (teamMaximum >= 0.7 && candidatePresence >= 0.7) {
      modifier -= 0.65 * candidatePresence;
    }
  }
  const sameArchetype = teamProfiles.filter(
    (profile) =>
      profile.archetype.primary === candidate.archetype.primary &&
      candidate.archetype.primary !== "Hybrid"
  ).length;
  modifier -= Math.max(0, sameArchetype - 1) * 1.2;
  const compressionPairs: Array<[BattleTag, BattleTag]> = [
    ["Setup", "PriorityFinish"],
    ["Pivot", "WallBreak"],
    ["DefensiveAnchor", "Tempo"],
    ["HazardSetter", "HazardRemoval"]
  ];
  modifier +=
    Math.max(
      0,
      ...compressionPairs.map(([left, right]) =>
        Math.min(
          candidate.tagProfiles[left].semanticPresence,
          candidate.tagProfiles[right].semanticPresence
        )
      )
    ) * 0.8;
  modifier += candidate.tagProfiles.Utility.semanticPresence * 0.8;
  return Math.max(
    BATTLE_VALUE_CONFIG.teamFit.minimum,
    Math.min(BATTLE_VALUE_CONFIG.teamFit.maximum, modifier)
  );
}
