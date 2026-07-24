import { BATTLE_VALUE_CONFIG } from "@/lib/battleValueConfig";
import { getMultiplier } from "@/lib/typeChart";
import type { EnvironmentPokemon } from "@/types/environmentData";
import type { PokemonEntry } from "@/types/pokemon";
import type { SemanticCandidateProfile } from "@/types/semanticRecommendationGap";

export function battleValueReliability({
  profile,
  datasetCoverage,
  usageRate,
  teamProfile
}: {
  profile: SemanticCandidateProfile;
  datasetCoverage: number;
  usageRate: number;
  teamProfile: "standard" | "trick-room";
}): { value: number; reasons: string[] } {
  const activeTags = profile.battleTags
    .map((tag) => profile.tagProfiles[tag])
    .filter((entry) => entry.semanticPresence > 0.05);
  const evidenceStrength =
    activeTags.length === 0
      ? 0
      : activeTags
          .map((entry) => entry.maximumAdoptionRate * entry.averageConfidence)
          .sort((a, b) => b - a)
          .slice(0, 6)
          .reduce((total, value) => total + value, 0) /
        Math.min(6, activeTags.length);
  const usageConfidence = Math.min(1, Math.sqrt(usageRate / 0.03));
  const conditionalPriority = profile.tagProfiles.PriorityFinish.evidence.some(
    (entry) =>
      entry.entityKind === "move" &&
      BATTLE_VALUE_CONFIG.conditionalPriorityMultipliers[entry.entityId]
  );
  const sashDependent = profile.tagProfiles.Trade.evidence.some(
    (entry) => entry.entityId === "focussash"
  );
  const weatherDependent = Object.values(profile.tagProfiles).some((tag) =>
    tag.evidence.some((entry) => entry.semanticCategory === "Weather")
  );
  const conditionPenalty =
    (conditionalPriority ? 0.025 : 0) +
    (sashDependent ? 0.02 : 0) +
    (weatherDependent ? 0.02 : 0) +
    (teamProfile === "trick-room" ? 0.01 : 0);
  const value = Math.max(
    0.45,
    Math.min(
      1,
      0.42 +
        evidenceStrength * 0.28 +
        datasetCoverage * 0.18 +
        profile.semanticGapReliability * 0.08 +
        usageConfidence * 0.04 -
        profile.unclassifiedRate * 0.22 -
        conditionPenalty
    )
  );
  const reasons: string[] = [];
  if (evidenceStrength < 0.35) reasons.push("主要Evidenceの採用率が低い");
  if (profile.unclassifiedRate > 0.15) reasons.push("Unclassified率が高い");
  if (usageConfidence < 0.5) reasons.push("Datasetサンプルが少ない");
  if (conditionalPriority) reasons.push("条件付き先制技を含む");
  if (sashDependent) reasons.push("Focus Sash依存を含む");
  if (weatherDependent) reasons.push("天候依存要素を含む");
  if (teamProfile === "trick-room") reasons.push("Trick Room依存度は構成に左右される");
  reasons.push("技構成の同時分布は不明");
  return { value, reasons };
}

export function battleValueRiskAdjustment(
  profile: SemanticCandidateProfile,
  pokemon: PokemonEntry,
  environment: EnvironmentPokemon
): number {
  let adjustment = Math.max(-4, profile.riskContribution * 0.08);
  const conditionalPriority = profile.tagProfiles.PriorityFinish.evidence.some(
    (entry) =>
      BATTLE_VALUE_CONFIG.conditionalPriorityMultipliers[entry.entityId]
  );
  if (conditionalPriority) adjustment -= 0.6;
  const sashDependent = profile.tagProfiles.Trade.evidence.some(
    (entry) => entry.entityId === "focussash"
  );
  if (sashDependent) adjustment -= 0.5;
  if (sashDependent && getMultiplier("rock", pokemon.types) > 1) {
    adjustment -= 0.4;
  }
  const setupPresence = profile.tagProfiles.Setup.semanticPresence;
  const setupOpportunity = Math.max(
    profile.tagProfiles.DefensiveAnchor.semanticPresence,
    profile.tagProfiles.Tempo.semanticPresence * 0.75
  );
  if (setupPresence >= 0.35 && setupOpportunity < 0.2) {
    adjustment -= 0.8 * setupPresence;
  }
  const durability =
    (pokemon.baseStats?.hp ?? 0) +
    (pokemon.baseStats?.defense ?? 0) +
    (pokemon.baseStats?.specialDefense ?? 0);
  if (
    durability < 210 &&
    Math.max(
      profile.tagProfiles.WallBreak.semanticPresence,
      profile.tagProfiles.Cleanup.semanticPresence
    ) >= 0.5
  ) {
    adjustment -= 0.6;
  }
  const recoilShare = environment.moves
    .filter((entry) => BATTLE_VALUE_CONFIG.recoilMoveIds.includes(entry.id))
    .reduce((total, entry) => total + entry.share, 0);
  adjustment -= Math.min(0.7, recoilShare * 0.5);
  const weatherDependency = Object.values(profile.tagProfiles).some((tag) =>
    tag.evidence.some((entry) => entry.semanticCategory === "Weather")
  );
  if (weatherDependency) adjustment -= 0.4;
  const choiceShare = Math.max(
    0,
    ...environment.items
      .filter((entry) => BATTLE_VALUE_CONFIG.choiceItemIds.includes(entry.id))
      .map((entry) => entry.share)
  );
  adjustment -= Math.min(0.5, choiceShare * 0.35);
  return Math.max(
    BATTLE_VALUE_CONFIG.riskAdjustment.minimum,
    Math.min(BATTLE_VALUE_CONFIG.riskAdjustment.maximum, adjustment)
  );
}
