import { getTeamTypeGapRows } from "@/lib/teamDiagnostics";
import {
  getMultiplier,
  getPokemonBySlug,
  getTypeLabel
} from "@/lib/typeChart";
import type {
  ThreatEnvironmentAbility,
  ThreatEnvironmentDataset,
  ThreatEnvironmentMove,
  ThreatEnvironmentPokemon,
  ThreatEnvironmentRelation
} from "@/types/environmentThreat";
import type {
  PokemonEntry,
  TeamSlot,
  TeamSummary,
  TypeName
} from "@/types/pokemon";

export const THREAT_WEIGHTS = {
  attackCoverage: 35,
  defensivePressure: 15,
  speed: 10,
  offense: 8,
  typeGap: 12,
  usage: 8,
  popularMoves: 10,
  popularSet: 2
} as const;

export const POPULAR_MOVE_MIN_SHARE = 0.2;

export type ThreatPokemonEnvironment = {
  source: "Pokemon Showdown";
  period: string;
  battleFormat: ThreatEnvironmentDataset["battleFormat"];
  ratingCutoff: number;
  usageRank: number;
  usageRate: number;
  offenseProfile: ThreatEnvironmentPokemon["offenseProfile"];
  topAbility: ThreatEnvironmentAbility | null;
  teammates: ThreatEnvironmentRelation[];
  checksAndCounters: ThreatEnvironmentRelation[];
};

export type ThreatPokemonAnalysis = {
  pokemon: PokemonEntry;
  score: number;
  reasons: string[];
  environment: ThreatPokemonEnvironment | null;
  metrics: {
    superEffectiveTargetCount: number;
    quadEffectiveTargetCount: number;
    teamAnswerCount: number;
    teamAverageSpeed: number | null;
    speedDifference: number | null;
    maxAttackingStat: number | null;
    matchedTypeGaps: TypeName[];
    usagePoints: number;
    popularMovePoints: number;
    popularSetPoints: number;
    dominantDamageClass: "physical" | "special" | "mixed" | null;
    scoredPopularMoves: Array<{
      move: ThreatEnvironmentMove;
      targetCount: number;
      quadTargetCount: number;
      points: number;
    }>;
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
  const isSelectableMega =
    pokemon.formKind === "mega" && pokemon.formSelection === "team";

  return (
    pokemon.formSelection === "team" &&
    (!pokemon.isBattleOnly || isSelectableMega) &&
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

function getDominantDamageClass(
  environment: ThreatEnvironmentPokemon
): "physical" | "special" | "mixed" | null {
  const { physicalShare, specialShare } = environment.offenseProfile;
  if (physicalShare >= 0.35 && physicalShare >= specialShare * 1.5) {
    return "physical";
  }
  if (specialShare >= 0.35 && specialShare >= physicalShare * 1.5) {
    return "special";
  }
  const moves = environment.moves;
  const damagingMoves = moves.filter(
    (move) =>
      move.damageClass !== "status" && move.share >= POPULAR_MOVE_MIN_SHARE
  );
  if (damagingMoves.length === 0) return null;
  const physicalMoveShare = damagingMoves
    .filter((move) => move.damageClass === "physical")
    .reduce((total, move) => total + move.share, 0);
  const specialMoveShare = damagingMoves
    .filter((move) => move.damageClass === "special")
    .reduce((total, move) => total + move.share, 0);
  if (physicalMoveShare >= specialMoveShare * 1.5) return "physical";
  if (specialMoveShare >= physicalMoveShare * 1.5) return "special";
  return "mixed";
}

function scorePopularMoves(
  environment: ThreatEnvironmentPokemon | undefined,
  summary: TeamSummary
): {
  points: number;
  setPoints: number;
  dominantDamageClass: "physical" | "special" | "mixed" | null;
  scoredMoves: ThreatPokemonAnalysis["metrics"]["scoredPopularMoves"];
} {
  if (!environment || summary.members.length === 0) {
    return {
      points: 0,
      setPoints: 0,
      dominantDamageClass: null,
      scoredMoves: []
    };
  }

  const dominantDamageClass = getDominantDamageClass(environment);
  const popularMoves = environment.moves.filter(
    (move) =>
      move.damageClass !== "status" &&
      move.share >= POPULAR_MOVE_MIN_SHARE &&
      (dominantDamageClass === "mixed" ||
        dominantDamageClass === null ||
        move.damageClass === dominantDamageClass)
  );
  const scoredMoves = popularMoves
    .map((move) => {
      let targetCount = 0;
      let quadTargetCount = 0;
      for (const member of summary.members) {
        const multiplier = getMultiplier(move.type, member.types);
        if (multiplier > 1) targetCount += 1;
        if (multiplier >= 4) quadTargetCount += 1;
      }
      const targetRatio = targetCount / summary.members.length;
      const quadRatio = quadTargetCount / summary.members.length;
      const points = move.share *
        (targetRatio * THREAT_WEIGHTS.popularMoves + quadRatio * 2);
      return { move, targetCount, quadTargetCount, points };
    })
    .filter((entry) => entry.targetCount > 0)
    .sort(
      (left, right) =>
        right.points - left.points || right.move.share - left.move.share
    );
  const points = Math.min(
    THREAT_WEIGHTS.popularMoves,
    Math.round(scoredMoves.reduce((total, entry) => total + entry.points, 0))
  );
  const setPoints =
    scoredMoves.length > 0 &&
    (dominantDamageClass === "physical" || dominantDamageClass === "special")
      ? THREAT_WEIGHTS.popularSet
      : 0;

  return { points, setPoints, dominantDamageClass, scoredMoves };
}

function scoreUsage(usageRate: number | undefined): number {
  if (!usageRate || usageRate <= 0) return 0;
  return Math.min(
    THREAT_WEIGHTS.usage,
    Math.round(Math.sqrt(Math.min(usageRate, 0.5) / 0.5) * THREAT_WEIGHTS.usage)
  );
}

function scoreThreatPokemon(
  pokemon: PokemonEntry,
  summary: TeamSummary,
  teamAverageSpeed: number | null,
  typeGaps: TypeName[],
  environmentDataset: ThreatEnvironmentDataset | null,
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>
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
        (superEffectiveTargetCount / memberCount) * 31 +
          (quadEffectiveTargetCount / memberCount) * 4
      )
    : 0;
  const defensivePressurePoints =
    teamAnswerCount === 0
      ? THREAT_WEIGHTS.defensivePressure
      : teamAnswerCount === 1
        ? 9
        : teamAnswerCount === 2
          ? 4
          : 0;
  const speedPoints =
    speedDifference === null
      ? 0
      : speedDifference >= 40
        ? THREAT_WEIGHTS.speed
        : speedDifference >= 20
          ? 7
          : speedDifference >= 10
            ? 4
            : 0;
  const attackingStatPoints =
    maxAttackingStat === null
      ? 0
      : maxAttackingStat >= 150
        ? THREAT_WEIGHTS.offense
        : maxAttackingStat >= 130
          ? 6
          : maxAttackingStat >= 100
            ? 3
            : 0;
  const typeGapPoints = Math.min(
    THREAT_WEIGHTS.typeGap,
    matchedTypeGaps.length * 10
  );
  const environmentSource = environmentBySlug.get(pokemon.slug);
  const usagePoints = scoreUsage(environmentSource?.usageRate);
  const popularMoves = scorePopularMoves(environmentSource, summary);
  const score = Math.min(
    100,
    attackCoveragePoints +
      defensivePressurePoints +
      speedPoints +
      attackingStatPoints +
      typeGapPoints +
      usagePoints +
      popularMoves.points +
      popularMoves.setPoints
  );
  const reasons: ScoredReason[] = [];

  matchedTypeGaps.forEach((type, index) => {
    reasons.push({
      id: `type-gap-${type}`,
      text: `${getTypeLabel(type)}が一貫しています。`,
      points: typeGapPoints,
      order: 1 + index
    });
  });
  popularMoves.scoredMoves.slice(0, 2).forEach((entry, index) => {
    const quadNote = entry.quadTargetCount
      ? `（うち${entry.quadTargetCount}体は4倍弱点）`
      : "";
    reasons.push({
      id: `popular-move-${entry.move.id}`,
      text: `採用率${Math.round(entry.move.share * 100)}%の${entry.move.name}が${entry.targetCount}体へ抜群です${quadNote}。`,
      points: entry.points,
      order: 10 + index
    });
  });
  if (speedPoints > 0 && stats && speedDifference !== null) {
    reasons.push({
      id: "speed",
      text: `すばやさ${stats.speed}で、パーティ平均を${speedDifference}上回ります。`,
      points: speedPoints,
      order: 20
    });
  }
  if (attackCoveragePoints > 0) {
    const quadNote = quadEffectiveTargetCount
      ? `（うち${quadEffectiveTargetCount}体は4倍弱点）`
      : "";
    reasons.push({
      id: "attack-coverage",
      text: `${superEffectiveTargetCount}体へタイプ一致で抜群を取れます${quadNote}。`,
      points: attackCoveragePoints,
      order: 30
    });
  }
  if (defensivePressurePoints > 0) {
    reasons.push({
      id: "defensive-pressure",
      text:
        teamAnswerCount === 0
          ? "こちらが抜群を取れる一致タイプがありません。"
          : `こちらが抜群を取れるのは${teamAnswerCount}枠だけです。`,
      points: defensivePressurePoints,
      order: 40
    });
  }
  if (attackingStatPoints > 0 && stats && maxAttackingStat !== null) {
    const label = stats.attack >= stats.specialAttack ? "こうげき" : "とくこう";
    reasons.push({
      id: "attacking-stat",
      text: `${label}${maxAttackingStat}で攻撃性能が高めです。`,
      points: attackingStatPoints,
      order: 50
    });
  }
  if (popularMoves.setPoints > 0 && popularMoves.dominantDamageClass) {
    reasons.push({
      id: "popular-set",
      text: `${popularMoves.dominantDamageClass === "physical" ? "物理" : "特殊"}技中心の型が多いです。`,
      points: popularMoves.setPoints,
      order: 60
    });
  }

  return {
    pokemon,
    score,
    reasons: reasons
      .filter((reason) => reason.points > 0)
      .sort((a, b) => a.order - b.order || b.points - a.points)
      .slice(0, 4)
      .map((reason) => reason.text),
    environment:
      environmentSource && environmentDataset
        ? {
            source: environmentDataset.source,
            period: environmentDataset.period,
            battleFormat: environmentDataset.battleFormat,
            ratingCutoff: environmentDataset.ratingCutoff,
            usageRank: environmentSource.usageRank,
            usageRate: environmentSource.usageRate,
            offenseProfile: environmentSource.offenseProfile,
            topAbility: environmentSource.abilities[0] ?? null,
            teammates: environmentSource.teammates,
            checksAndCounters: environmentSource.checksAndCounters
          }
        : null,
    metrics: {
      superEffectiveTargetCount,
      quadEffectiveTargetCount,
      teamAnswerCount,
      teamAverageSpeed,
      speedDifference,
      maxAttackingStat,
      matchedTypeGaps,
      usagePoints,
      popularMovePoints: popularMoves.points,
      popularSetPoints: popularMoves.setPoints,
      dominantDamageClass: popularMoves.dominantDamageClass,
      scoredPopularMoves: popularMoves.scoredMoves
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
  environmentDataset: ThreatEnvironmentDataset | null = null,
  limit = 5
): ThreatPokemonAnalysis[] {
  if (summary.members.length === 0 || limit <= 0) return [];

  const teamAverageSpeed = getTeamAverageSpeed(team);
  const typeGaps = getTeamTypeGapRows(summary).map(
    (row) => row.attackType
  );
  const environmentBySlug = new Map(
    environmentDataset?.pokemon.map((entry) => [entry.slug, entry]) ?? []
  );
  const bestBySpecies = new Map<number, ThreatPokemonAnalysis>();

  for (const pokemon of availablePokemon) {
    if (!isThreatPokemonCandidate(pokemon)) continue;
    const result = scoreThreatPokemon(
      pokemon,
      summary,
      teamAverageSpeed,
      typeGaps,
      environmentDataset,
      environmentBySlug
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
