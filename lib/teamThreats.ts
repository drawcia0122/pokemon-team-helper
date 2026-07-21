import { getTeamTypeGapRows } from "@/lib/teamDiagnostics";
import {
  getMultiplier,
  getPokemonBySlug,
  getTypeLabel
} from "@/lib/typeChart";
import type {
  PokemonEntry,
  TeamSlot,
  TeamSummary,
  TypeName
} from "@/types/pokemon";

export const THREAT_SCORE_WEIGHTS = {
  attackCoverage: 45,
  defensivePressure: 20,
  speed: 15,
  attackingStat: 12,
  typeGap: 18
} as const;

export type ThreatPokemonAnalysis = {
  pokemon: PokemonEntry;
  score: number;
  reasons: string[];
  metrics: {
    superEffectiveTargetCount: number;
    quadEffectiveTargetCount: number;
    teamAnswerCount: number;
    teamAverageSpeed: number | null;
    speedDifference: number | null;
    maxAttackingStat: number | null;
    matchedTypeGaps: TypeName[];
  };
};

type ScoredReason = {
  id: string;
  text: string;
  points: number;
  order: number;
};

const THREAT_FORM_KINDS = new Set([
  "base",
  "mega",
  "regional",
  "standard",
  "gender"
]);

export function isThreatPokemonCandidate(pokemon: PokemonEntry): boolean {
  return (
    pokemon.formSelection === "team" &&
    !pokemon.isBattleOnly &&
    THREAT_FORM_KINDS.has(pokemon.formKind)
  );
}

function getTeamAverageSpeed(team: TeamSlot[]): number | null {
  const speeds = team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const speed = getPokemonBySlug(slot.pokemonSlug)?.baseStats?.speed;
    return typeof speed === "number" ? [speed] : [];
  });
  if (speeds.length === 0) return null;
  return Math.round(
    speeds.reduce((total, speed) => total + speed, 0) / speeds.length
  );
}

function scoreThreatPokemon(
  pokemon: PokemonEntry,
  summary: TeamSummary,
  teamAverageSpeed: number | null,
  typeGaps: TypeName[]
): ThreatPokemonAnalysis {
  const memberCount = summary.members.length;
  let superEffectiveTargetCount = 0;
  let quadEffectiveTargetCount = 0;

  for (const member of summary.members) {
    const bestMultiplier = pokemon.types.reduce(
      (best, attackType) =>
        Math.max(best, getMultiplier(attackType, member.types)),
      0
    );
    if (bestMultiplier > 1) superEffectiveTargetCount += 1;
    if (bestMultiplier >= 4) quadEffectiveTargetCount += 1;
  }

  const teamAnswerCount = summary.members.filter((member) =>
    member.types.some(
      (attackType) => getMultiplier(attackType, pokemon.types) > 1
    )
  ).length;
  const matchedTypeGaps = pokemon.types.filter((type) =>
    typeGaps.includes(type)
  );
  const stats = pokemon.baseStats;
  const maxAttackingStat = stats
    ? Math.max(stats.attack, stats.specialAttack)
    : null;
  const speedDifference =
    stats && teamAverageSpeed !== null
      ? stats.speed - teamAverageSpeed
      : null;

  const attackCoveragePoints = memberCount
    ? Math.round(
        (superEffectiveTargetCount / memberCount) * 40 +
          (quadEffectiveTargetCount / memberCount) * 5
      )
    : 0;
  const defensivePressurePoints =
    teamAnswerCount === 0
      ? THREAT_SCORE_WEIGHTS.defensivePressure
      : teamAnswerCount === 1
        ? 12
        : teamAnswerCount === 2
          ? 6
          : 0;
  const speedPoints =
    speedDifference === null
      ? 0
      : speedDifference >= 40
        ? THREAT_SCORE_WEIGHTS.speed
        : speedDifference >= 20
          ? 10
          : speedDifference >= 10
            ? 5
            : 0;
  const attackingStatPoints =
    maxAttackingStat === null
      ? 0
      : maxAttackingStat >= 150
        ? THREAT_SCORE_WEIGHTS.attackingStat
        : maxAttackingStat >= 130
          ? 9
          : maxAttackingStat >= 100
            ? 5
            : 0;
  const typeGapPoints = Math.min(
    THREAT_SCORE_WEIGHTS.typeGap,
    matchedTypeGaps.length * 12
  );
  const score = Math.min(
    100,
    attackCoveragePoints +
      defensivePressurePoints +
      speedPoints +
      attackingStatPoints +
      typeGapPoints
  );
  const reasons: ScoredReason[] = [];

  if (attackCoveragePoints > 0) {
    const quadNote = quadEffectiveTargetCount
      ? `（うち${quadEffectiveTargetCount}体は4倍弱点）`
      : "";
    reasons.push({
      id: "attack-coverage",
      text: `${superEffectiveTargetCount}体へタイプ一致で抜群を取れます${quadNote}。`,
      points: attackCoveragePoints,
      order: 1
    });
  }
  matchedTypeGaps.forEach((type, index) => {
    reasons.push({
      id: `type-gap-${type}`,
      text: `${getTypeLabel(type)}が一貫しています。`,
      points: typeGapPoints,
      order: 2 + index
    });
  });
  if (defensivePressurePoints > 0) {
    reasons.push({
      id: "defensive-pressure",
      text:
        teamAnswerCount === 0
          ? "こちらが抜群を取れる一致タイプがありません。"
          : `こちらが抜群を取れるのは${teamAnswerCount}枠だけです。`,
      points: defensivePressurePoints,
      order: 4
    });
  }
  if (speedPoints > 0 && stats && speedDifference !== null) {
    reasons.push({
      id: "speed",
      text: `すばやさ${stats.speed}で、パーティ平均を${speedDifference}上回ります。`,
      points: speedPoints,
      order: 5
    });
  }
  if (attackingStatPoints > 0 && stats && maxAttackingStat !== null) {
    const label = stats.attack >= stats.specialAttack ? "こうげき" : "とくこう";
    reasons.push({
      id: "attacking-stat",
      text: `${label}${maxAttackingStat}で攻撃性能が高めです。`,
      points: attackingStatPoints,
      order: 6
    });
  }

  return {
    pokemon,
    score,
    reasons: reasons
      .sort((a, b) => b.points - a.points || a.order - b.order)
      .slice(0, 3)
      .map((reason) => reason.text),
    metrics: {
      superEffectiveTargetCount,
      quadEffectiveTargetCount,
      teamAnswerCount,
      teamAverageSpeed,
      speedDifference,
      maxAttackingStat,
      matchedTypeGaps
    }
  };
}

function compareThreats(
  a: ThreatPokemonAnalysis,
  b: ThreatPokemonAnalysis
): number {
  return (
    b.score - a.score ||
    a.pokemon.speciesId - b.pokemon.speciesId ||
    a.pokemon.formOrder - b.pokemon.formOrder ||
    a.pokemon.id - b.pokemon.id
  );
}

export function getThreatPokemonAnalysis(
  team: TeamSlot[],
  summary: TeamSummary,
  availablePokemon: PokemonEntry[],
  limit = 5
): ThreatPokemonAnalysis[] {
  if (summary.members.length === 0 || limit <= 0) return [];

  const teamAverageSpeed = getTeamAverageSpeed(team);
  const typeGaps = getTeamTypeGapRows(summary).map(
    (row) => row.attackType
  );
  const bestBySpecies = new Map<number, ThreatPokemonAnalysis>();

  for (const pokemon of availablePokemon) {
    if (!isThreatPokemonCandidate(pokemon)) continue;
    const result = scoreThreatPokemon(
      pokemon,
      summary,
      teamAverageSpeed,
      typeGaps
    );
    const current = bestBySpecies.get(pokemon.speciesId);
    if (
      !current ||
      compareThreats(result, current) < 0 ||
      (result.score === current.score &&
        pokemon.isDefaultForm &&
        !current.pokemon.isDefaultForm)
    ) {
      bestBySpecies.set(pokemon.speciesId, result);
    }
  }

  return [...bestBySpecies.values()]
    .sort(compareThreats)
    .slice(0, limit);
}
