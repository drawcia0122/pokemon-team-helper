import { getPokemonBySlug } from "@/lib/typeChart";
import type {
  PokemonEntry,
  TeamSlot,
  TeamSummary
} from "@/types/pokemon";

export type TeamDiagnosticItem = {
  id: string;
  title: string;
  reason: string;
};

export type TeamDiagnostics = {
  strengths: TeamDiagnosticItem[];
  cautions: TeamDiagnosticItem[];
};

type RankedDiagnostic = TeamDiagnosticItem & { priority: number };

const HIGH_STAT_THRESHOLD = 100;
const BULK_TOTAL_THRESHOLD = 180;
const BULK_STAT_MINIMUM = 80;
const WIDE_OFFENSE_THRESHOLD = 12;
const WIDE_DEFENSE_THRESHOLD = 12;
const MAX_DIAGNOSTICS_PER_GROUP = 3;

function formatRatio(count: number, total: number): string {
  return `${count}/${total}体`;
}

function withoutPriority(
  diagnostics: RankedDiagnostic[]
): TeamDiagnosticItem[] {
  return diagnostics
    .sort(
      (a, b) =>
        b.priority - a.priority || a.id.localeCompare(b.id, "ja")
    )
    .slice(0, MAX_DIAGNOSTICS_PER_GROUP)
    .map(({ id, title, reason }) => ({ id, title, reason }));
}

export function getTeamDiagnostics(
  team: TeamSlot[],
  summary: TeamSummary,
  availablePokemon: PokemonEntry[]
): TeamDiagnostics {
  const pokemonMembers = team
    .filter(
      (slot): slot is Extract<TeamSlot, { mode: "pokemon" }> =>
        slot.mode === "pokemon"
    )
    .map((slot) => ({ slot, pokemon: getPokemonBySlug(slot.pokemonSlug) }))
    .filter(
      (
        value
      ): value is {
        slot: Extract<TeamSlot, { mode: "pokemon" }>;
        pokemon: PokemonEntry;
      } => Boolean(value.pokemon)
    );
  const statMembers = pokemonMembers.filter(
    (member) => member.pokemon.baseStats !== undefined
  );
  const statCount = statMembers.length;
  const memberCount = summary.members.length;
  const availableSlugs = new Set(
    availablePokemon.map((pokemon) => pokemon.slug)
  );
  const strengths: RankedDiagnostic[] = [];
  const cautions: RankedDiagnostic[] = [];

  if (statCount > 0) {
    const majority = Math.ceil(statCount / 2);
    const physicalBulkCount = statMembers.filter(({ pokemon }) => {
      const stats = pokemon.baseStats!;
      return (
        stats.hp + stats.defense >= BULK_TOTAL_THRESHOLD &&
        stats.defense >= BULK_STAT_MINIMUM
      );
    }).length;
    const specialBulkCount = statMembers.filter(({ pokemon }) => {
      const stats = pokemon.baseStats!;
      return (
        stats.hp + stats.specialDefense >= BULK_TOTAL_THRESHOLD &&
        stats.specialDefense >= BULK_STAT_MINIMUM
      );
    }).length;
    const fastAttackerCount = statMembers.filter(({ pokemon }) => {
      const stats = pokemon.baseStats!;
      return (
        stats.speed >= HIGH_STAT_THRESHOLD &&
        Math.max(stats.attack, stats.specialAttack) >= HIGH_STAT_THRESHOLD
      );
    }).length;
    const physicalAttackerCount = statMembers.filter(
      ({ pokemon }) => pokemon.baseStats!.attack >= HIGH_STAT_THRESHOLD
    ).length;
    const specialAttackerCount = statMembers.filter(
      ({ pokemon }) =>
        pokemon.baseStats!.specialAttack >= HIGH_STAT_THRESHOLD
    ).length;

    if (physicalBulkCount >= majority) {
      strengths.push({
        id: "physical-bulk",
        title: "物理耐久が高めです",
        reason: `HP＋ぼうぎょが${BULK_TOTAL_THRESHOLD}以上かつ、ぼうぎょ${BULK_STAT_MINIMUM}以上のポケモンが${formatRatio(physicalBulkCount, statCount)}います。`,
        priority: 65
      });
    }
    if (specialBulkCount >= majority) {
      strengths.push({
        id: "special-bulk",
        title: "特殊耐久が高めです",
        reason: `HP＋とくぼうが${BULK_TOTAL_THRESHOLD}以上かつ、とくぼう${BULK_STAT_MINIMUM}以上のポケモンが${formatRatio(specialBulkCount, statCount)}います。`,
        priority: 64
      });
    }
    if (fastAttackerCount >= majority) {
      strengths.push({
        id: "fast-attackers",
        title: "高速アタッカーが多いです",
        reason: `攻撃系種族値とすばやさがともに${HIGH_STAT_THRESHOLD}以上のポケモンが${formatRatio(fastAttackerCount, statCount)}います。`,
        priority: 76
      });
    }
    if (physicalAttackerCount >= majority) {
      strengths.push({
        id: "physical-attackers",
        title: "物理アタッカーが豊富です",
        reason: `こうげき${HIGH_STAT_THRESHOLD}以上のポケモンが${formatRatio(physicalAttackerCount, statCount)}います。`,
        priority: 61
      });
    }
    if (specialAttackerCount >= majority) {
      strengths.push({
        id: "special-attackers",
        title: "特殊アタッカーが豊富です",
        reason: `とくこう${HIGH_STAT_THRESHOLD}以上のポケモンが${formatRatio(specialAttackerCount, statCount)}います。`,
        priority: 60
      });
    }

    if (fastAttackerCount <= Math.floor(statCount / 4)) {
      cautions.push({
        id: "low-speed",
        title: "全体的に素早さが低めです",
        reason: `攻撃系種族値とすばやさがともに${HIGH_STAT_THRESHOLD}以上のポケモンは${formatRatio(fastAttackerCount, statCount)}です。`,
        priority: 90
      });
    }
    if (specialAttackerCount === 0) {
      cautions.push({
        id: "special-attacker-shortage",
        title: "特殊アタッカーが不足しています",
        reason: `とくこう${HIGH_STAT_THRESHOLD}以上のポケモンがいません。`,
        priority: 89
      });
    }
    if (physicalBulkCount === 0) {
      cautions.push({
        id: "physical-wall-shortage",
        title: "物理受けが不足しています",
        reason: `HP＋ぼうぎょが${BULK_TOTAL_THRESHOLD}以上かつ、ぼうぎょ${BULK_STAT_MINIMUM}以上のポケモンがいません。`,
        priority: 70
      });
    }
    if (specialBulkCount === 0) {
      cautions.push({
        id: "special-wall-shortage",
        title: "特殊受けが不足しています",
        reason: `HP＋とくぼうが${BULK_TOTAL_THRESHOLD}以上かつ、とくぼう${BULK_STAT_MINIMUM}以上のポケモンがいません。`,
        priority: 69
      });
    }
  }

  const coveredOffenseCount = summary.offensiveCoverage.filter(
    (row) => row.superEffectiveCount > 0
  ).length;
  if (coveredOffenseCount >= WIDE_OFFENSE_THRESHOLD) {
    strengths.push({
      id: "wide-offense",
      title: "攻撃範囲が広いです",
      reason: `18タイプ中${coveredOffenseCount}タイプにタイプ一致で抜群を取れます。`,
      priority: 82
    });
  }

  const coveredDefenseCount = summary.rows.filter(
    (row) =>
      row.multiplierMap.resist +
        row.multiplierMap.doubleResist +
        row.multiplierMap.immune >
      0
  ).length;
  if (memberCount >= 3 && coveredDefenseCount >= WIDE_DEFENSE_THRESHOLD) {
    strengths.push({
      id: "defensive-type-coverage",
      title: "タイプの一貫を切れています",
      reason: `18タイプ中${coveredDefenseCount}タイプを半減または無効で受けられます。`,
      priority: 80
    });
  }

  if (memberCount > 0) {
    const weakMinimum = Math.max(1, Math.ceil(memberCount / 2));
    summary.rows
      .filter((row) => {
        const weakCount =
          row.multiplierMap.weak + row.multiplierMap.quadWeak;
        const coverCount =
          row.multiplierMap.resist +
          row.multiplierMap.doubleResist +
          row.multiplierMap.immune;
        return coverCount === 0 && weakCount >= weakMinimum;
      })
      .sort((a, b) => {
        const aWeak = a.multiplierMap.weak + a.multiplierMap.quadWeak;
        const bWeak = b.multiplierMap.weak + b.multiplierMap.quadWeak;
        return (
          bWeak - aWeak ||
          b.multiplierMap.quadWeak - a.multiplierMap.quadWeak ||
          a.attackTypeJa.localeCompare(b.attackTypeJa, "ja")
        );
      })
      .slice(0, 2)
      .forEach((row) => {
        const weakCount =
          row.multiplierMap.weak + row.multiplierMap.quadWeak;
        cautions.push({
          id: `type-gap-${row.attackType}`,
          title: `${row.attackTypeJa}が一貫しています`,
          reason: `${weakCount}体が弱点で、半減・無効で受けられるポケモンがいません。`,
          priority: 84 + weakCount + row.multiplierMap.quadWeak
        });
      });
  }

  const unavailableCount = pokemonMembers.filter(
    ({ pokemon }) => !availableSlugs.has(pokemon.slug)
  ).length;
  if (unavailableCount > 0) {
    cautions.push({
      id: "unavailable-pokemon",
      title: "現在のルールで使用できないポケモンがいます",
      reason: `選択中の${unavailableCount}体が現在のシーズンの使用可能一覧に含まれません。`,
      priority: 110
    });
  }

  return {
    strengths: withoutPriority(strengths),
    cautions: withoutPriority(cautions)
  };
}
