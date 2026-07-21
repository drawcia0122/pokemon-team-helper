import type {
  PokemonCandidateScore,
  DefensiveSummaryRow,
  OffensiveCoverageRow,
  PokemonEntry,
  TeamSlot,
  TeamSummary,
  TypeCandidateScore
} from "@/types/pokemon";

export type CandidateSelection =
  | { kind: "type"; value: TypeCandidateScore }
  | { kind: "pokemon"; value: PokemonCandidateScore }
  | null;

export const TEAM_DETAIL_SECTIONS = [
  { id: "members", label: "メンバー別の相性", defaultOpen: false },
  { id: "type-table", label: "完全なタイプ相性表", defaultOpen: false },
  { id: "offense", label: "攻撃範囲の詳細", defaultOpen: false }
] as const;

export function getCoveredOffenseRows(
  summary: TeamSummary
): OffensiveCoverageRow[] {
  return summary.offensiveCoverage
    .filter((row) => row.superEffectiveCount > 0)
    .sort(
      (a, b) =>
        b.superEffectiveCount - a.superEffectiveCount ||
        a.defendTypeJa.localeCompare(b.defendTypeJa, "ja")
    );
}

export function getDefensiveAttentionRows(
  summary: TeamSummary
): DefensiveSummaryRow[] {
  const memberCount = summary.members.length;
  if (memberCount === 0) return [];

  return summary.rows.filter((row) => {
    const coveredCount =
      row.multiplierMap.resist +
      row.multiplierMap.doubleResist +
      row.multiplierMap.immune;
    const neutralOrWorseCount =
      row.multiplierMap.neutral +
      row.multiplierMap.weak +
      row.multiplierMap.quadWeak;

    return coveredCount === 0 && neutralOrWorseCount === memberCount;
  });
}

export function getTeamUiSummary(summary: TeamSummary, slotCount: number) {
  const severeMemberIds = new Set(
    summary.memberProfiles
      .filter((profile) => profile.byMultiplier.quadWeak.length > 0)
      .map((profile) => profile.member.slotId)
  );
  const coveredOffense = summary.offensiveCoverage.filter(
    (row) => row.superEffectiveCount > 0
  ).length;
  const immunityTypes = summary.rows.filter((row) => row.multiplierMap.immune > 0);
  const mainResistances = summary.rows.filter(
    (row) =>
      row.multiplierMap.resist +
        row.multiplierMap.doubleResist +
        row.multiplierMap.immune >
      row.multiplierMap.weak + row.multiplierMap.quadWeak
  );

  return {
    filledSlots: slotCount,
    emptySlots: Math.max(0, 6 - slotCount),
    canAnalyze: summary.members.length >= 2,
    sharedWeaknessCount: summary.sharedWeaknesses.length,
    severeMemberCount: severeMemberIds.size,
    mainResistanceCount: mainResistances.length,
    immunityTypeCount: immunityTypes.length,
    coveredOffense,
    missingOffenseCount: summary.missingOffense.length
  };
}

export function isTeamSlotAllowed(
  slot: TeamSlot,
  availablePokemon: PokemonEntry[]
): boolean {
  if (slot.mode === "type") {
    return true;
  }

  return availablePokemon.some((pokemon) => pokemon.slug === slot.pokemonSlug);
}

export function getTopRecommendations<T>(candidates: T[], limit = 3): T[] {
  return candidates.slice(0, Math.max(0, limit));
}
