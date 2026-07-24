import moveMetadataData from "@/data/environment/moveMetadata.json";
import { getAdvisorMovePower } from "@/lib/advisorMoveQuality";
import { BATTLE_VALUE_CONFIG } from "@/lib/battleValueConfig";
import type { EnvironmentPokemon } from "@/types/environmentData";
import type { EnvironmentMoveMetadataRegistry } from "@/types/environmentThreat";
import type { PokemonEntry } from "@/types/pokemon";
import type { SemanticCandidateProfile } from "@/types/semanticRecommendationGap";
import type { BattleValueAxis } from "@/types/battleValue";

const metadata = moveMetadataData as EnvironmentMoveMetadataRegistry;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function presence(profile: SemanticCandidateProfile, tag: keyof SemanticCandidateProfile["tagProfiles"]) {
  return profile.tagProfiles[tag].semanticPresence;
}

function attackPressure(
  pokemon: PokemonEntry,
  environment: EnvironmentPokemon
): { pressure: number; physical: number; special: number; evidence: string[] } {
  let physical = 0;
  let special = 0;
  const evidence: string[] = [];
  for (const move of environment.moves) {
    if (move.share < BATTLE_VALUE_CONFIG.minimumEvidenceShare) continue;
    const detail = metadata.moves[move.id];
    const power = getAdvisorMovePower(move.id);
    if (!detail || !power || detail.damageClass === "status") continue;
    const stat =
      detail.damageClass === "physical"
        ? pokemon.baseStats?.attack ?? 0
        : pokemon.baseStats?.specialAttack ?? 0;
    const stab = pokemon.types.includes(detail.type) ? 1.15 : 1;
    const value =
      clamp((stat - 55) / 125) *
      clamp(power / 120) *
      Math.sqrt(move.share) *
      stab;
    if (detail.damageClass === "physical") physical = Math.max(physical, value);
    else special = Math.max(special, value);
    if (value > 0.3) evidence.push(`${move.id}:${detail.damageClass}:${(move.share * 100).toFixed(1)}%`);
  }
  const strongest = Math.max(physical, special);
  const mixedSupport = Math.min(physical, special) * 0.2;
  return {
    pressure: clamp(strongest + mixedSupport),
    physical,
    special,
    evidence: evidence.sort()
  };
}

export function calculateBattleValueAxes({
  profile,
  pokemon,
  environment,
  teamProfile,
  battleProfile
}: {
  profile: SemanticCandidateProfile;
  pokemon: PokemonEntry;
  environment: EnvironmentPokemon;
  teamProfile: "standard" | "trick-room";
  battleProfile: Record<string, number>;
}): {
  axes: Record<BattleValueAxis, number>;
  attackPressure: number;
  evidence: string[];
} {
  const attack = attackPressure(pokemon, environment);
  const wallBreak = presence(profile, "WallBreak");
  const offensiveMultiplier = profile.tagProfiles.WallBreak.evidence
    .filter((entry) => entry.entityKind === "ability")
    .reduce(
      (maximum, entry) =>
        Math.max(maximum, entry.adoptionRate * entry.confidenceWeight),
      0
    );
  const immediateBreak =
    BATTLE_VALUE_CONFIG.weights.immediateBreak *
    clamp(
      attack.pressure * 0.62 +
        wallBreak * 0.28 +
        offensiveMultiplier * 0.18 +
        presence(profile, "Tempo") * 0.05
    );

  const speed = pokemon.baseStats?.speed ?? 0;
  const speedValue =
    teamProfile === "trick-room"
      ? clamp((105 - speed) / 85)
      : clamp((speed - 45) / 105);
  const cleanupFoundation =
    presence(profile, "Cleanup") * 0.4 +
    presence(profile, "PriorityFinish") * 0.22 +
    presence(profile, "RevengeKill") * 0.18 +
    speedValue * 0.2;
  const cleanup =
    BATTLE_VALUE_CONFIG.weights.cleanup *
    clamp(cleanupFoundation * (0.55 + attack.pressure * 0.45));

  const opportunity = Math.max(
    presence(profile, "DefensiveAnchor"),
    presence(profile, "Tempo") * 0.75
  );
  const setupWinCondition =
    BATTLE_VALUE_CONFIG.weights.setupWinCondition *
    clamp(
      (presence(profile, "Setup") * 0.42 +
        presence(profile, "WinCondition") * 0.38 +
        presence(profile, "Snowball") * 0.12 +
        opportunity * 0.08) *
        (0.55 + Math.max(attack.pressure, speedValue) * 0.45)
    );

  const priorityEvidence = profile.tagProfiles.PriorityFinish.evidence;
  const priorityQuality = priorityEvidence.reduce((maximum, entry) => {
    const power = getAdvisorMovePower(entry.entityId) ?? 40;
    const conditional =
      BATTLE_VALUE_CONFIG.conditionalPriorityMultipliers[entry.entityId] ?? 1;
    const damageClass = metadata.moves[entry.entityId]?.damageClass;
    const stat =
      damageClass === "special"
        ? pokemon.baseStats?.specialAttack ?? 0
        : pokemon.baseStats?.attack ?? 0;
    return Math.max(
      maximum,
      entry.adoptionRate *
        conditional *
        clamp(power / 80) *
        clamp((stat - 45) / 115)
    );
  }, 0);
  const priorityRevenge =
    BATTLE_VALUE_CONFIG.weights.priorityRevenge *
    clamp(
      priorityQuality * 0.58 +
        presence(profile, "RevengeKill") * 0.28 +
        speedValue * attack.pressure * 0.14
    );

  const tradeMove = profile.tagProfiles.Trade.evidence
    .filter((entry) => entry.entityKind === "move")
    .reduce((maximum, entry) => Math.max(maximum, entry.adoptionRate), 0);
  const trade =
    BATTLE_VALUE_CONFIG.weights.trade *
    clamp(tradeMove * 0.72 + presence(profile, "Trade") * 0.28);

  const tempo =
    BATTLE_VALUE_CONFIG.weights.tempo *
    clamp(
      presence(profile, "Tempo") * 0.42 +
        presence(profile, "Pivot") * 0.35 +
        presence(profile, "Utility") * 0.13 +
        Math.min(0.1, battleProfile.tempoSupport ?? 0)
    );

  const snowball =
    BATTLE_VALUE_CONFIG.weights.snowball *
    clamp(
      presence(profile, "Snowball") *
        (0.45 + attack.pressure * 0.3 + cleanupFoundation * 0.25)
    );

  const trapEvidence = [
    ...profile.tagProfiles.WallBreak.evidence,
    ...profile.tagProfiles.Tempo.evidence
  ].filter((entry) => entry.semanticCategory === "Trap");
  const trapPresence = trapEvidence.reduce(
    (maximum, entry) =>
      Math.max(maximum, entry.adoptionRate * entry.confidenceWeight),
    0
  );
  const trapTargetRemoval =
    BATTLE_VALUE_CONFIG.weights.trapTargetRemoval *
    clamp(
      trapPresence *
        (0.4 + wallBreak * 0.35 + presence(profile, "Trade") * 0.25)
    );

  const compressionPairs = [
    ["Setup", "PriorityFinish"],
    ["Pivot", "WallBreak"],
    ["DefensiveAnchor", "Tempo"],
    ["HazardSetter", "HazardRemoval"],
    ["Cleanup", "Snowball"]
  ] as const;
  const compression = compressionPairs
    .map(([left, right]) =>
      Math.min(presence(profile, left), presence(profile, right))
    )
    .sort((a, b) => b - a);
  const roleCompression =
    BATTLE_VALUE_CONFIG.weights.roleCompression *
    clamp((compression[0] ?? 0) * 0.65 + (compression[1] ?? 0) * 0.25);

  return {
    axes: {
      immediateBreak,
      cleanup,
      setupWinCondition,
      priorityRevenge,
      trade,
      tempo,
      snowball,
      trapTargetRemoval,
      roleCompression
    },
    attackPressure: attack.pressure,
    evidence: attack.evidence
  };
}
