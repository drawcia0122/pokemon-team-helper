import { getTeamTypeGapRows } from "@/lib/teamDiagnostics";
import {
  describeAbilityAdjustedMoveEffectiveness,
  evaluateMoveAgainstPokemon,
  getEnvironmentAttackingMoves,
  THREAT_MOVE_THRESHOLDS
} from "@/lib/battleEffectiveness";
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
import { ENVIRONMENT_MINIMUM_USAGE_RATE } from "@/lib/environmentDataset";
import {
  countProfileSpeedAdvantages,
  formatThreatSpeedReason,
  type TeamProfile
} from "@/lib/teamProfile";

export const THREAT_WEIGHTS = {
  attackCoverage: 28,
  quadCoverage: 4,
  defensivePressure: 13,
  speed: 9,
  offense: 7,
  typeGap: 11,
  usage: 20,
  popularMoves: 6,
  popularSet: 2
} as const;

type ThreatScoringWeights = {
  [Key in keyof typeof THREAT_WEIGHTS]: number;
};

// STEP 4の入れ替え比較はTASK030時点の基準値を前提とするため、
// 要警戒一覧の再調整を影響させない互換プロファイルとして保持する。
const ADVISOR_COMPATIBLE_THREAT_WEIGHTS: ThreatScoringWeights = {
  attackCoverage: 31,
  quadCoverage: 4,
  defensivePressure: 15,
  speed: 10,
  offense: 8,
  typeGap: 12,
  usage: 8,
  popularMoves: 10,
  popularSet: 2
};

export const THREAT_USAGE_SCORE_CURVE = [
  { usageRate: 0.001, points: 0 },
  { usageRate: 0.003, points: 2 },
  { usageRate: 0.005, points: 4 },
  { usageRate: 0.01, points: 7 },
  { usageRate: 0.03, points: 11 },
  { usageRate: 0.05, points: 14 },
  { usageRate: 0.1, points: 18 },
  { usageRate: 0.2, points: 20 }
] as const;

export const POPULAR_MOVE_MIN_SHARE = THREAT_MOVE_THRESHOLDS.primary;
export const MIN_THREAT_USAGE_RATE = ENVIRONMENT_MINIMUM_USAGE_RATE;

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
    teamSpeedCount: number;
    fasterTeamMemberCount: number;
    slowerTeamMemberCount: number;
    profileSpeedAdvantageCount: number;
    speedPoints: number;
    maxAttackingStat: number | null;
    matchedTypeGaps: TypeName[];
    profile: TeamProfile;
    nonSpeedMatchupPoints: number;
    baseMatchupPoints: number;
    usagePoints: number;
    popularMovePoints: number;
    popularSetPoints: number;
    environmentPoints: number;
    dominantDamageClass: "physical" | "special" | "mixed" | null;
    scoredPopularMoves: Array<{
      move: ThreatEnvironmentMove;
      targetCount: number;
      quadTargetCount: number;
      immuneTargetCount: number;
      resistantTargetCount: number;
      stableAnswerCount: number;
      abilityNotes: string[];
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

function getTeamSpeeds(team: TeamSlot[]): number[] {
  return team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const speed = getPokemonBySlug(slot.pokemonSlug)?.baseStats?.speed;
    return typeof speed === "number" ? [speed] : [];
  });
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
  attacker: PokemonEntry,
  environment: ThreatEnvironmentPokemon | undefined,
  summary: TeamSummary,
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>,
  weights: ThreatScoringWeights
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
  const popularMoves = getEnvironmentAttackingMoves(environment.moves);
  const scoredMoves = popularMoves
    .map((move) => {
      let targetCount = 0;
      let quadTargetCount = 0;
      let immuneTargetCount = 0;
      let resistantTargetCount = 0;
      let stableAnswerCount = 0;
      const abilityNotes = new Set<string>();
      for (const member of summary.members) {
        const defender = member.slug
          ? getPokemonBySlug(member.slug)
          : undefined;
        const evaluation = evaluateMoveAgainstPokemon({
          move,
          attacker,
          defender: defender ?? {
            slug: `type:${member.slotId}`,
            types: member.types
          },
          attackerAbilityUsage: environment.abilities,
          defenderAbilityUsage: member.slug
            ? environmentBySlug.get(member.slug)?.abilities
            : undefined
        });
        if (evaluation.weaknessProbability >= 0.5) targetCount += 1;
        if (evaluation.quadWeaknessProbability >= 0.5) quadTargetCount += 1;
        if (evaluation.immunityProbability >= 0.5) immuneTargetCount += 1;
        if (evaluation.resistanceProbability >= 0.5) {
          resistantTargetCount += 1;
        }
        if (evaluation.stableResistanceProbability >= 0.5) {
          stableAnswerCount += 1;
        }
        const abilityReason = describeAbilityAdjustedMoveEffectiveness({
          evaluation,
          moveName: move.name,
          defenderName: member.label
        });
        if (abilityReason) abilityNotes.add(abilityReason);
      }
      const targetRatio = targetCount / summary.members.length;
      const quadRatio = quadTargetCount / summary.members.length;
      const moveTierFactor =
        move.share >= THREAT_MOVE_THRESHOLDS.primary ? 1 : 0.5;
      const stablePressure = stableAnswerCount === 0 ? 0.2 : 0;
      const points = move.share * moveTierFactor *
        (targetRatio * weights.popularMoves +
          quadRatio * weights.popularMoves * 0.2 +
          stablePressure * weights.popularMoves);
      return {
        move,
        targetCount,
        quadTargetCount,
        immuneTargetCount,
        resistantTargetCount,
        stableAnswerCount,
        abilityNotes: [...abilityNotes],
        points
      };
    })
    .sort(
      (left, right) =>
        right.points - left.points || right.move.share - left.move.share
    );
  const points = Math.min(
    weights.popularMoves,
    Math.round(scoredMoves.reduce((total, entry) => total + entry.points, 0))
  );
  const setPoints =
    scoredMoves.length > 0 &&
    (dominantDamageClass === "physical" || dominantDamageClass === "special")
      ? weights.popularSet
      : 0;

  return { points, setPoints, dominantDamageClass, scoredMoves };
}

function getActualMoveCoverage(
  attacker: PokemonEntry,
  environment: ThreatEnvironmentPokemon | undefined,
  summary: TeamSummary,
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>
): {
  hasActualMoves: boolean;
  superEffectiveTargetCount: number;
  quadEffectiveTargetCount: number;
  coverageRatio: number;
  quadRatio: number;
} {
  const moves = getEnvironmentAttackingMoves(environment?.moves);
  if (!environment || moves.length === 0 || summary.members.length === 0) {
    return {
      hasActualMoves: false,
      superEffectiveTargetCount: 0,
      quadEffectiveTargetCount: 0,
      coverageRatio: 0,
      quadRatio: 0
    };
  }

  const memberScores = summary.members.map((member) => {
    const defender = member.slug ? getPokemonBySlug(member.slug) : undefined;
    let bestWeakness = 0;
    let bestQuadWeakness = 0;
    for (const move of moves) {
      const evaluation = evaluateMoveAgainstPokemon({
        move,
        attacker,
        defender: defender ?? {
          slug: `type:${member.slotId}`,
          types: member.types
        },
        attackerAbilityUsage: environment.abilities,
        defenderAbilityUsage: member.slug
          ? environmentBySlug.get(member.slug)?.abilities
          : undefined
      });
      const adoptionWeight = Math.min(
        1,
        move.share / THREAT_MOVE_THRESHOLDS.primary
      );
      bestWeakness = Math.max(
        bestWeakness,
        evaluation.weaknessProbability * adoptionWeight
      );
      bestQuadWeakness = Math.max(
        bestQuadWeakness,
        evaluation.quadWeaknessProbability * adoptionWeight
      );
    }
    return { bestWeakness, bestQuadWeakness };
  });

  return {
    hasActualMoves: true,
    superEffectiveTargetCount: memberScores.filter(
      (entry) => entry.bestWeakness >= 0.5
    ).length,
    quadEffectiveTargetCount: memberScores.filter(
      (entry) => entry.bestQuadWeakness >= 0.5
    ).length,
    coverageRatio:
      memberScores.reduce((sum, entry) => sum + entry.bestWeakness, 0) /
      memberScores.length,
    quadRatio:
      memberScores.reduce((sum, entry) => sum + entry.bestQuadWeakness, 0) /
      memberScores.length
  };
}

export function scoreThreatUsageRate(
  usageRate: number | undefined
): number {
  if (
    typeof usageRate !== "number" ||
    !Number.isFinite(usageRate) ||
    usageRate <= THREAT_USAGE_SCORE_CURVE[0].usageRate
  ) {
    return 0;
  }

  for (let index = 1; index < THREAT_USAGE_SCORE_CURVE.length; index += 1) {
    const upper = THREAT_USAGE_SCORE_CURVE[index];
    if (usageRate > upper.usageRate) continue;
    const lower = THREAT_USAGE_SCORE_CURVE[index - 1];
    const progress =
      (usageRate - lower.usageRate) /
      (upper.usageRate - lower.usageRate);
    return Math.min(
      THREAT_WEIGHTS.usage,
      Math.round(lower.points + (upper.points - lower.points) * progress)
    );
  }

  return THREAT_WEIGHTS.usage;
}

function scoreAdvisorCompatibleUsageRate(
  usageRate: number | undefined
): number {
  if (!usageRate || usageRate <= 0) return 0;
  return Math.min(
    ADVISOR_COMPATIBLE_THREAT_WEIGHTS.usage,
    Math.round(
      Math.sqrt(Math.min(usageRate, 0.5) / 0.5) *
        ADVISOR_COMPATIBLE_THREAT_WEIGHTS.usage
    )
  );
}

function scoreThreatPokemon(
  pokemon: PokemonEntry,
  summary: TeamSummary,
  teamSpeeds: number[],
  profile: TeamProfile,
  typeGaps: TypeName[],
  environmentDataset: ThreatEnvironmentDataset | null,
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>,
  weights: ThreatScoringWeights,
  scoreUsage: (usageRate: number | undefined) => number
): ThreatPokemonAnalysis {
  const memberCount = summary.members.length;
  const environmentSource = environmentBySlug.get(pokemon.slug);
  const actualMoveCoverage = getActualMoveCoverage(
    pokemon,
    environmentSource,
    summary,
    environmentBySlug
  );
  let superEffectiveTargetCount = 0;
  let quadEffectiveTargetCount = 0;

  if (actualMoveCoverage.hasActualMoves) {
    superEffectiveTargetCount = actualMoveCoverage.superEffectiveTargetCount;
    quadEffectiveTargetCount = actualMoveCoverage.quadEffectiveTargetCount;
  } else {
    for (const member of summary.members) {
      const bestMultiplier = pokemon.types.reduce(
        (best, attackType) =>
          Math.max(best, getMultiplier(attackType, member.types)),
        0
      );
      if (bestMultiplier > 1) superEffectiveTargetCount += 1;
      if (bestMultiplier >= 4) quadEffectiveTargetCount += 1;
    }
  }

  const teamAnswerCount = summary.members.filter((member) =>
    member.types.some(
      (attackType) => getMultiplier(attackType, pokemon.types) > 1
    )
  ).length;
  const actualMoveTypes = new Set(
    getEnvironmentAttackingMoves(environmentSource?.moves).map(
      (move) => move.type
    )
  );
  const matchedTypeGaps = (actualMoveCoverage.hasActualMoves
    ? [...actualMoveTypes]
    : pokemon.types
  ).filter((type) => typeGaps.includes(type));
  const stats = pokemon.baseStats;
  const maxAttackingStat = stats
    ? Math.max(stats.attack, stats.specialAttack)
    : null;
  const fasterTeamMemberCount = stats
    ? teamSpeeds.filter((speed) => stats.speed > speed).length
    : 0;
  const slowerTeamMemberCount = stats
    ? teamSpeeds.filter((speed) => stats.speed < speed).length
    : 0;
  const profileSpeedAdvantageCount = stats
    ? countProfileSpeedAdvantages(stats.speed, teamSpeeds, profile)
    : 0;

  const attackCoveragePoints = memberCount
    ? Math.round(
        (actualMoveCoverage.hasActualMoves
          ? actualMoveCoverage.coverageRatio
          : superEffectiveTargetCount / memberCount) *
          weights.attackCoverage +
          (actualMoveCoverage.hasActualMoves
            ? actualMoveCoverage.quadRatio
            : quadEffectiveTargetCount / memberCount) *
            weights.quadCoverage
      )
    : 0;
  const defensivePressurePoints =
    teamAnswerCount === 0
      ? weights.defensivePressure
      : teamAnswerCount === 1
        ? Math.round(weights.defensivePressure * 0.6)
        : teamAnswerCount === 2
          ? Math.round(weights.defensivePressure * (4 / 15))
          : 0;
  const speedPoints = teamSpeeds.length
    ? Math.round(
        weights.speed * (profileSpeedAdvantageCount / teamSpeeds.length)
      )
    : 0;
  const attackingStatPoints =
    maxAttackingStat === null
      ? 0
      : maxAttackingStat >= 150
        ? weights.offense
        : maxAttackingStat >= 130
          ? Math.round(weights.offense * 0.75)
          : maxAttackingStat >= 100
            ? Math.round(weights.offense * 0.375)
            : 0;
  const rawTypeGapPoints = Math.min(
    weights.typeGap,
    matchedTypeGaps.length *
      Math.round(weights.typeGap * (10 / 12))
  );
  const typeGapPoints = actualMoveCoverage.hasActualMoves
    ? Math.round(rawTypeGapPoints * 0.35)
    : rawTypeGapPoints;
  const usagePoints = scoreUsage(environmentSource?.usageRate);
  const popularMoves = scorePopularMoves(
    pokemon,
    environmentSource,
    summary,
    environmentBySlug,
    weights
  );
  const nonSpeedMatchupPoints =
    attackCoveragePoints +
    defensivePressurePoints +
    attackingStatPoints +
    typeGapPoints;
  const baseMatchupPoints = nonSpeedMatchupPoints + speedPoints;
  const environmentPoints =
    usagePoints + popularMoves.points + popularMoves.setPoints;
  const score = Math.min(
    100,
    baseMatchupPoints + environmentPoints
  );
  const reasons: ScoredReason[] = [];

  if (!actualMoveCoverage.hasActualMoves) {
    matchedTypeGaps.forEach((type, index) => {
      reasons.push({
        id: `type-gap-${type}`,
        text: `${getTypeLabel(type)}が一貫しています。`,
        points: typeGapPoints,
        order: 10 + index
      });
    });
  }
  popularMoves.scoredMoves.slice(0, 2).forEach((entry, index) => {
    const quadNote = entry.quadTargetCount
      ? `（うち${entry.quadTargetCount}体は4倍弱点）`
      : "";
    reasons.push({
      id: `popular-move-${entry.move.id}`,
      text:
        entry.targetCount > 0
          ? `採用率${Math.round(entry.move.share * 100)}%の${entry.move.name}が${entry.targetCount}体へ抜群です${quadNote}。`
          : `採用率${Math.round(entry.move.share * 100)}%の${entry.move.name}を半減・無効で受ける枠がありません。`,
      points: entry.points,
      order: 1 + index
    });
    entry.abilityNotes.slice(0, 1).forEach((note) => {
      reasons.push({
        id: `popular-move-ability-${entry.move.id}`,
        text: note,
        points: entry.points,
        order: 5 + index
      });
    });
  });
  const speedReason = formatThreatSpeedReason({
    advantageCount: profileSpeedAdvantageCount,
    memberCount: teamSpeeds.length,
    profile
  });
  if (speedPoints > 0 && speedReason) {
    reasons.push({
      id: "speed",
      text: speedReason,
      points: speedPoints,
      order: 20
    });
  }
  if (attackCoveragePoints > 0 && !actualMoveCoverage.hasActualMoves) {
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
      teamSpeedCount: teamSpeeds.length,
      fasterTeamMemberCount,
      slowerTeamMemberCount,
      profileSpeedAdvantageCount,
      speedPoints,
      maxAttackingStat,
      matchedTypeGaps,
      profile,
      nonSpeedMatchupPoints,
      baseMatchupPoints,
      usagePoints,
      popularMovePoints: popularMoves.points,
      popularSetPoints: popularMoves.setPoints,
      environmentPoints,
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
  limit = 5,
  profile: TeamProfile = "standard"
): ThreatPokemonAnalysis[] {
  return getThreatPokemonAnalysisWithScoring(
    team,
    summary,
    availablePokemon,
    environmentDataset,
    limit,
    profile,
    THREAT_WEIGHTS,
    scoreThreatUsageRate
  );
}

/**
 * TASK031の要警戒順位調整をSTEP 4の提案値へ波及させないための互換経路。
 * 新規UIの要警戒一覧では使用しない。
 */
export function getAdvisorCompatibleThreatAnalysis(
  team: TeamSlot[],
  summary: TeamSummary,
  availablePokemon: PokemonEntry[],
  environmentDataset: ThreatEnvironmentDataset | null = null,
  limit = 5,
  profile: TeamProfile = "standard"
): ThreatPokemonAnalysis[] {
  return getThreatPokemonAnalysisWithScoring(
    team,
    summary,
    availablePokemon,
    environmentDataset,
    limit,
    profile,
    ADVISOR_COMPATIBLE_THREAT_WEIGHTS,
    scoreAdvisorCompatibleUsageRate
  );
}

function getThreatPokemonAnalysisWithScoring(
  team: TeamSlot[],
  summary: TeamSummary,
  availablePokemon: PokemonEntry[],
  environmentDataset: ThreatEnvironmentDataset | null,
  limit: number,
  profile: TeamProfile,
  weights: ThreatScoringWeights,
  scoreUsage: (usageRate: number | undefined) => number
): ThreatPokemonAnalysis[] {
  if (summary.members.length === 0 || limit <= 0) return [];

  const teamSpeeds = getTeamSpeeds(team);
  const typeGaps = getTeamTypeGapRows(summary).map(
    (row) => row.attackType
  );
  const environmentBySlug = new Map(
    environmentDataset?.pokemon.map((entry) => [entry.slug, entry]) ?? []
  );
  const bestBySpecies = new Map<number, ThreatPokemonAnalysis>();

  for (const pokemon of availablePokemon) {
    if (!isThreatPokemonCandidate(pokemon)) continue;
    const environment = environmentBySlug.get(pokemon.slug);
    if (!environment || environment.usageRate < MIN_THREAT_USAGE_RATE) {
      continue;
    }
    const result = scoreThreatPokemon(
      pokemon,
      summary,
      teamSpeeds,
      profile,
      typeGaps,
      environmentDataset,
      environmentBySlug,
      weights,
      scoreUsage
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
