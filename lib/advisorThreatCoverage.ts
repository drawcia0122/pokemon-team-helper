import {
  evaluateMoveAgainstPokemon,
  getEnvironmentAttackingMoves,
  THREAT_MOVE_THRESHOLDS
} from "@/lib/battleEffectiveness";
import {
  TRICK_ROOM_RECOMMENDATION_CONFIG,
  type TeamProfile
} from "@/lib/teamProfile";
import type { ThreatPokemonAnalysis } from "@/lib/teamThreats";
import { getPokemonBySlug } from "@/lib/typeChart";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentMove,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";
import { getAdvisorMoveQuality } from "@/lib/advisorMoveQuality";

export const ADVISOR_USAGE_THRESHOLDS = {
  normalCandidate: 0.01,
  conditionalCandidate: 0.003,
  minimumCandidate: 0.003
} as const;

export const ADVISOR_COUNTERPLAY_RULES = {
  clearAnswerStrength: 0.6,
  conditionalMinimumDistinctThreats: 3,
  conditionalMinimumWeightedCoverage: 0.68,
  recommendationMinimumDistinctThreats: 2,
  recommendationMinimumWeightedCoverage: 0.38,
  topThreatMinimumCoverage: 0.28,
  stableMoveCoverageRatio: 0.7,
  choiceScarfMinimumShare: 0.1,
  choiceScarfSpeedMultiplier: 1.5
} as const;

export const THREAT_TARGET_WEIGHTS = {
  rankWeight: 0.28,
  threatScoreWeight: 0.3,
  usageWeight: 0.18,
  actualMovePressureWeight: 0.12,
  noCurrentAnswerBonus: 0.12
} as const;

export const ADVISOR_COUNTERPLAY_WEIGHTS = {
  weightedThreatCoverage: 50,
  distinctThreatCount: 7,
  topThreatAnswer: 8,
  noCurrentAnswerSolved: 8,
  candidateUsage: 6,
  lowUsagePenalty: 10
} as const;

export type AdvisorCounterplayMethod =
  | "stable-switch"
  | "outspeed"
  | "choice-scarf"
  | "priority"
  | "trick-room"
  | "offensive-pressure"
  | "conditional"
  | "none";

export type AdvisorAnswerClass =
  | "Stable"
  | "Matchup"
  | "Conditional"
  | "CoverageOnly"
  | "None";

export type AdvisorUsageEligibility =
  | "normal"
  | "conditional"
  | "below-minimum"
  | "unknown";

export type AdvisorThreatAnswer = {
  threatId: string;
  threatRank: number;
  threatScore: number;
  threatUsage: number;
  importanceWeight: number;
  counterplayMethods: AdvisorCounterplayMethod[];
  answerClass: AdvisorAnswerClass;
  stableSwitch: boolean;
  offensiveAnswer: boolean;
  answerStrength: number;
  currentTeamHasAnswer: boolean;
  newlySolved: boolean;
  primaryReason: string | null;
  failureReasons: string[];
};

export type AdvisorThreatCoverage = {
  threatAnswers: AdvisorThreatAnswer[];
  distinctThreatCount: number;
  conditionalThreatCount: number;
  coverageOnlyThreatCount: number;
  unansweredThreatCount: number;
  stableSwitchCount: number;
  outspeedCount: number;
  priorityCount: number;
  choiceScarfCount: number;
  trickRoomCount: number;
  weightedThreatCoverage: number;
  topThreatAnswered: boolean;
  unresolvedHighPriorityThreats: string[];
  candidateUsage: number | null;
  usageEligibility: AdvisorUsageEligibility;
  teamWideContribution: number;
  finalScore: number;
};

type CounterplayEvaluation = {
  methods: AdvisorCounterplayMethod[];
  answerClass: AdvisorAnswerClass;
  strength: number;
  stableSwitch: boolean;
  offensiveAnswer: boolean;
  primaryReason: string | null;
  failureReasons: string[];
};

const METHOD_STRENGTH: Record<AdvisorCounterplayMethod, number> = {
  "stable-switch": 1,
  outspeed: 0.82,
  "choice-scarf": 0.76,
  priority: 0.72,
  "trick-room": 0.8,
  "offensive-pressure": 0,
  conditional: 0.42,
  none: 0
};

const RECOVERY_MOVE_IDS = new Set([
  "recover",
  "roost",
  "slackoff",
  "synthesis",
  "wish",
  "strengthsap",
  "milkdrink",
  "shoreup",
  "softboiled",
  "morningsun"
]);

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function getUsageEligibility(
  usageRate: number | null
): AdvisorUsageEligibility {
  if (usageRate === null) return "unknown";
  if (usageRate < ADVISOR_USAGE_THRESHOLDS.minimumCandidate) {
    return "below-minimum";
  }
  if (usageRate < ADVISOR_USAGE_THRESHOLDS.normalCandidate) {
    return "conditional";
  }
  return "normal";
}

function getRelevantBulk(
  candidate: PokemonEntry,
  threatEnvironment: ThreatEnvironmentPokemon | undefined
): boolean {
  const stats = candidate.baseStats;
  if (!stats) return false;
  const physical = threatEnvironment?.offenseProfile.physicalShare ?? 0;
  const special = threatEnvironment?.offenseProfile.specialShare ?? 0;
  if (physical >= special * 1.35) {
    return stats.hp + stats.defense >= 180 && stats.defense >= 80;
  }
  if (special >= physical * 1.35) {
    return (
      stats.hp + stats.specialDefense >= 180 && stats.specialDefense >= 80
    );
  }
  return (
    stats.hp + Math.min(stats.defense, stats.specialDefense) >= 175 &&
    stats.defense >= 75 &&
    stats.specialDefense >= 75
  );
}

function getBestMoveAgainst(
  attacker: PokemonEntry,
  defender: PokemonEntry,
  attackerEnvironment: ThreatEnvironmentPokemon | undefined,
  defenderEnvironment: ThreatEnvironmentPokemon | undefined,
  moves = getEnvironmentAttackingMoves(attackerEnvironment?.moves)
) {
  return moves
    .map((move) => ({
      move,
      evaluation: evaluateMoveAgainstPokemon({
        move,
        attacker,
        defender,
        attackerAbilityUsage: attackerEnvironment?.abilities,
        defenderAbilityUsage: defenderEnvironment?.abilities
      })
    }))
    .filter(({ evaluation }) => evaluation.expectedMultiplier >= 1)
    .sort(
      (left, right) =>
        right.evaluation.expectedMultiplier -
          left.evaluation.expectedMultiplier ||
        right.move.share - left.move.share
    )[0];
}

function getPriorityMoveAgainst(
  attacker: PokemonEntry,
  defender: PokemonEntry,
  attackerEnvironment: ThreatEnvironmentPokemon | undefined,
  defenderEnvironment: ThreatEnvironmentPokemon | undefined
) {
  const moves = getEnvironmentAttackingMoves(attackerEnvironment?.moves).filter(
    (move) =>
      TRICK_ROOM_RECOMMENDATION_CONFIG.priorityMoveIds.includes(
        move.id as (typeof TRICK_ROOM_RECOMMENDATION_CONFIG.priorityMoveIds)[number]
      ) &&
      move.share >= TRICK_ROOM_RECOMMENDATION_CONFIG.adoptedMoveMinimumShare
  );
  return getBestMoveAgainst(
    attacker,
    defender,
    attackerEnvironment,
    defenderEnvironment,
    moves
  );
}

function hasCredibleOffensivePressure(
  candidate: PokemonEntry,
  bestMove: ReturnType<typeof getBestMoveAgainst>
): boolean {
  if (!bestMove || !candidate.baseStats) return false;
  return getAdvisorMoveQuality({
    move: bestMove.move,
    attacker: candidate
  }).reliable;
}

function evaluateCounterplay(
  candidate: PokemonEntry,
  threat: ThreatPokemonAnalysis,
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>,
  profile: TeamProfile
): CounterplayEvaluation {
  const candidateEnvironment = environmentBySlug.get(candidate.slug);
  const threatEnvironment = environmentBySlug.get(threat.pokemon.slug);
  const incomingMoves = getEnvironmentAttackingMoves(
    threatEnvironment?.moves,
    THREAT_MOVE_THRESHOLDS.secondary
  );
  const incoming = incomingMoves.map((move) => ({
    move,
    evaluation: evaluateMoveAgainstPokemon({
      move,
      attacker: threat.pokemon,
      defender: candidate,
      attackerAbilityUsage: threatEnvironment?.abilities,
      defenderAbilityUsage: candidateEnvironment?.abilities
    })
  }));
  const totalIncomingShare = incoming.reduce(
    (total, entry) => total + entry.move.share,
    0
  );
  const safeIncomingShare = incoming
    .filter(({ evaluation }) => evaluation.expectedMultiplier <= 1)
    .reduce((total, entry) => total + entry.move.share, 0);
  const primaryWeakness = incoming.some(
    ({ move, evaluation }) =>
      move.share >= THREAT_MOVE_THRESHOLDS.primary &&
      evaluation.weaknessProbability >= 0.5
  );
  const quadWeakness = incoming.some(
    ({ evaluation }) => evaluation.quadWeaknessProbability > 0
  );
  const bestMove = getBestMoveAgainst(
    candidate,
    threat.pokemon,
    candidateEnvironment,
    threatEnvironment
  );
  const credibleOffense = hasCredibleOffensivePressure(candidate, bestMove);
  const recoveryShare = Math.max(
    0,
    ...(candidateEnvironment?.moves
      .filter((move) => move.damageClass === "status" && RECOVERY_MOVE_IDS.has(move.id))
      .map((move) => move.share) ?? [])
  );
  const stableSwitch =
    incoming.length > 0 &&
    totalIncomingShare > 0 &&
    safeIncomingShare / totalIncomingShare >=
      ADVISOR_COUNTERPLAY_RULES.stableMoveCoverageRatio &&
    !primaryWeakness &&
    !quadWeakness &&
    getRelevantBulk(candidate, threatEnvironment) &&
    Boolean(bestMove) &&
    (credibleOffense || recoveryShare >= THREAT_MOVE_THRESHOLDS.secondary);
  const priorityMove = getPriorityMoveAgainst(
    candidate,
    threat.pokemon,
    candidateEnvironment,
    threatEnvironment
  );
  const candidateSpeed = candidate.baseStats?.speed;
  const threatSpeed = threat.pokemon.baseStats?.speed;
  const hasSpeedData =
    typeof candidateSpeed === "number" && typeof threatSpeed === "number";
  const outspeed = Boolean(
    hasSpeedData &&
      candidateSpeed! > threatSpeed! &&
      bestMove &&
      credibleOffense
  );
  const choiceScarf = Boolean(
    hasSpeedData &&
      (candidateEnvironment?.choiceScarfShare ?? 0) >=
        ADVISOR_COUNTERPLAY_RULES.choiceScarfMinimumShare &&
      candidateSpeed! * ADVISOR_COUNTERPLAY_RULES.choiceScarfSpeedMultiplier >
        threatSpeed! &&
      bestMove &&
      credibleOffense
  );
  const trickRoom = Boolean(
    profile === "trick-room" &&
      hasSpeedData &&
      candidateSpeed! < threatSpeed! &&
      bestMove &&
      credibleOffense
  );
  const priority = Boolean(
    priorityMove &&
      getAdvisorMoveQuality({
        move: priorityMove.move,
        attacker: candidate
      }).attackingStat !== null &&
      (getAdvisorMoveQuality({
        move: priorityMove.move,
        attacker: candidate
      }).attackingStat ?? 0) >= 100 &&
      getAdvisorMoveQuality({
        move: priorityMove.move,
        attacker: candidate
      }).stab &&
      priorityMove.evaluation.expectedMultiplier >= 2
  );
  const coverageOnly = Boolean(
    bestMove && bestMove.evaluation.expectedMultiplier >= 2
  );

  const primaryReturnPressure = incoming.some(
    ({ move, evaluation }) =>
      move.share >= THREAT_MOVE_THRESHOLDS.primary &&
      evaluation.expectedMultiplier > 1
  );
  const survivesPrimaryReturn =
    !primaryReturnPressure ||
    (getRelevantBulk(candidate, threatEnvironment) && !quadWeakness);
  const speedControlled = outspeed || choiceScarf || priority || trickRoom;

  const methods: AdvisorCounterplayMethod[] = [];
  if (stableSwitch) methods.push("stable-switch");
  if (outspeed) methods.push("outspeed");
  if (choiceScarf) methods.push("choice-scarf");
  if (priority) methods.push("priority");
  if (trickRoom) methods.push("trick-room");
  if (coverageOnly) methods.push("offensive-pressure");

  const partialResistance = incoming.some(
    ({ evaluation }) => evaluation.resistanceProbability >= 0.5
  );
  let answerClass: AdvisorAnswerClass = "None";
  if (stableSwitch) {
    answerClass = "Stable";
  } else if (credibleOffense && speedControlled && survivesPrimaryReturn) {
    answerClass = "Matchup";
  } else if (
    partialResistance ||
    (credibleOffense && speedControlled) ||
    (credibleOffense && getRelevantBulk(candidate, threatEnvironment))
  ) {
    answerClass = "Conditional";
  } else if (coverageOnly) {
    answerClass = "CoverageOnly";
  }

  if (answerClass === "Conditional" && !methods.includes("conditional")) {
    methods.push("conditional");
  }
  if (answerClass === "None") methods.push("none");

  const strength =
    answerClass === "Stable"
      ? 1
      : answerClass === "Matchup"
        ? 0.78
        : answerClass === "Conditional"
          ? METHOD_STRENGTH.conditional
          : 0;
  let primaryReason: string | null = null;
  if (stableSwitch) {
    const representativeResistance = incoming
      .filter(
        ({ evaluation }) => evaluation.stableResistanceProbability >= 0.5
      )
      .sort((left, right) => right.move.share - left.move.share)[0];
    primaryReason = representativeResistance
      ? `${threat.pokemon.nameJa}の${representativeResistance.move.name}（採用率${formatPercent(representativeResistance.move.share)}）を${representativeResistance.evaluation.immunityProbability >= 0.5 ? "無効化" : "半減以下に"}できます。`
      : `${threat.pokemon.nameJa}の採用率10%以上の攻撃技セットの大半を等倍以下に抑えます。`;
  } else if (priority && priorityMove) {
    primaryReason = `${priorityMove.move.name}（採用率${formatPercent(priorityMove.move.share)}）で${threat.pokemon.nameJa}へ先制して圧力をかけられます。`;
  } else if (choiceScarf && bestMove) {
    primaryReason = `こだわりスカーフ型（採用率${formatPercent(candidateEnvironment?.choiceScarfShare ?? 0)}）なら${threat.pokemon.nameJa}より速く、${bestMove.move.name}で圧力をかけられます。`;
  } else if (profile === "trick-room" && trickRoom && bestMove) {
    primaryReason = `トリックルーム下で${threat.pokemon.nameJa}より先に動き、${bestMove.move.name}（採用率${formatPercent(bestMove.move.share)}）で圧力をかけられます。`;
  } else if (outspeed && bestMove) {
    primaryReason = `${threat.pokemon.nameJa}より速く、${bestMove.move.name}（採用率${formatPercent(bestMove.move.share)}）で圧力をかけられます。`;
  } else if (answerClass === "Conditional" && bestMove && credibleOffense) {
    primaryReason = `${bestMove.move.name}（採用率${formatPercent(bestMove.move.share)}）を持ちますが、安定した対面回答ではありません。`;
  }

  const failureReasons: string[] = [];
  const dangerousMove = incoming
    .filter(({ evaluation }) => evaluation.weaknessProbability >= 0.5)
    .sort((left, right) => right.move.share - left.move.share)[0];
  if (dangerousMove) {
    failureReasons.push(
      `${threat.pokemon.nameJa}の${dangerousMove.move.name}（採用率${formatPercent(dangerousMove.move.share)}）が弱点です。`
    );
  }
  if (!bestMove) {
    failureReasons.push(`${threat.pokemon.nameJa}への実採用有効打を確認できません。`);
  }
  if (
    hasSpeedData &&
    profile === "standard" &&
    candidateSpeed! <= threatSpeed! &&
    !priority &&
    !choiceScarf
  ) {
    failureReasons.push(`${threat.pokemon.nameJa}より速い対面回答ではありません。`);
  }
  if (strength < ADVISOR_COUNTERPLAY_RULES.clearAnswerStrength) {
    failureReasons.push(`${threat.pokemon.nameJa}への明確な回答にはなりません。`);
  }

  return {
    methods,
    answerClass,
    strength,
    stableSwitch,
    offensiveAnswer:
      answerClass === "Matchup",
    primaryReason,
    failureReasons
  };
}

function getCurrentTeamPokemon(team: TeamSlot[]): PokemonEntry[] {
  return team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    return pokemon ? [pokemon] : [];
  });
}

function getImportanceWeight(
  threat: ThreatPokemonAnalysis,
  rank: number,
  currentTeamHasAnswer: boolean
): number {
  const rankValue = Math.max(0.2, (6 - rank) / 5);
  const scoreValue = Math.min(1, Math.max(0, threat.score / 100));
  const usageValue = Math.min(
    1,
    Math.max(0, (threat.environment?.usageRate ?? 0) / 0.2)
  );
  const movePressureValue = Math.min(
    1,
    Math.max(0, threat.metrics.popularMovePoints / 6)
  );
  return (
    rankValue * THREAT_TARGET_WEIGHTS.rankWeight +
    scoreValue * THREAT_TARGET_WEIGHTS.threatScoreWeight +
    usageValue * THREAT_TARGET_WEIGHTS.usageWeight +
    movePressureValue * THREAT_TARGET_WEIGHTS.actualMovePressureWeight +
    (currentTeamHasAnswer ? 0 : THREAT_TARGET_WEIGHTS.noCurrentAnswerBonus)
  );
}

function getCandidateUsageScore(usageRate: number | null): number {
  if (usageRate === null) return 0;
  return Math.min(
    ADVISOR_COUNTERPLAY_WEIGHTS.candidateUsage,
    Math.sqrt(Math.min(1, usageRate / 0.1)) *
      ADVISOR_COUNTERPLAY_WEIGHTS.candidateUsage
  );
}

export function evaluateAdvisorThreatCoverage({
  candidate,
  threats,
  currentTeam,
  environmentDataset,
  profile
}: {
  candidate: PokemonEntry;
  threats: ThreatPokemonAnalysis[];
  currentTeam: TeamSlot[];
  environmentDataset: ThreatEnvironmentDataset | null;
  profile: TeamProfile;
}): AdvisorThreatCoverage {
  const topThreats = threats;
  const environmentBySlug = new Map(
    environmentDataset?.pokemon.map((entry) => [entry.slug, entry]) ?? []
  );
  const currentMembers = getCurrentTeamPokemon(currentTeam);
  const candidateUsage = environmentBySlug.get(candidate.slug)?.usageRate ?? null;
  const usageEligibility = getUsageEligibility(candidateUsage);

  const threatAnswers = topThreats.map((threat, index) => {
    const currentTeamHasAnswer = currentMembers.some(
      (member) =>
        evaluateCounterplay(member, threat, environmentBySlug, profile)
          .strength >= ADVISOR_COUNTERPLAY_RULES.clearAnswerStrength
    );
    const answer = evaluateCounterplay(
      candidate,
      threat,
      environmentBySlug,
      profile
    );
    const threatRank = index + 1;
    return {
      threatId: threat.pokemon.slug,
      threatRank,
      threatScore: threat.score,
      threatUsage: threat.environment?.usageRate ?? 0,
      importanceWeight: getImportanceWeight(
        threat,
        threatRank,
        currentTeamHasAnswer
      ),
      counterplayMethods: answer.methods,
      answerClass: answer.answerClass,
      stableSwitch: answer.stableSwitch,
      offensiveAnswer: answer.offensiveAnswer,
      answerStrength: answer.strength,
      currentTeamHasAnswer,
      newlySolved:
        !currentTeamHasAnswer &&
        answer.strength >= ADVISOR_COUNTERPLAY_RULES.clearAnswerStrength,
      primaryReason: answer.primaryReason,
      failureReasons: answer.failureReasons
    } satisfies AdvisorThreatAnswer;
  });
  const totalImportance = threatAnswers.reduce(
    (total, answer) => total + answer.importanceWeight,
    0
  );
  const weightedThreatCoverage =
    totalImportance > 0
      ? threatAnswers.reduce(
          (total, answer) =>
            total + answer.importanceWeight * answer.answerStrength,
          0
        ) / totalImportance
      : 0;
  const clearAnswers = threatAnswers.filter(
    (answer) =>
      answer.answerStrength >= ADVISOR_COUNTERPLAY_RULES.clearAnswerStrength
  );
  const conditionalAnswers = threatAnswers.filter(
    (answer) => answer.answerClass === "Conditional"
  );
  const coverageOnlyAnswers = threatAnswers.filter(
    (answer) => answer.answerClass === "CoverageOnly"
  );
  const newlySolvedCount = clearAnswers.filter(
    (answer) => answer.newlySolved
  ).length;
  const lowUsagePenalty =
    usageEligibility === "conditional"
      ? ADVISOR_COUNTERPLAY_WEIGHTS.lowUsagePenalty
      : usageEligibility === "below-minimum" || usageEligibility === "unknown"
        ? ADVISOR_COUNTERPLAY_WEIGHTS.lowUsagePenalty * 2
        : 0;
  const finalScore = Math.round(
    weightedThreatCoverage *
      ADVISOR_COUNTERPLAY_WEIGHTS.weightedThreatCoverage +
      clearAnswers.length * ADVISOR_COUNTERPLAY_WEIGHTS.distinctThreatCount +
      (clearAnswers.some((answer) => answer.threatRank === 1)
        ? ADVISOR_COUNTERPLAY_WEIGHTS.topThreatAnswer
        : 0) +
      newlySolvedCount * ADVISOR_COUNTERPLAY_WEIGHTS.noCurrentAnswerSolved +
      getCandidateUsageScore(candidateUsage) -
      lowUsagePenalty
  );

  return {
    threatAnswers,
    distinctThreatCount: clearAnswers.length,
    conditionalThreatCount: conditionalAnswers.length,
    coverageOnlyThreatCount: coverageOnlyAnswers.length,
    unansweredThreatCount: threatAnswers.length - clearAnswers.length,
    stableSwitchCount: clearAnswers.filter((answer) => answer.stableSwitch).length,
    outspeedCount: clearAnswers.filter((answer) =>
      answer.counterplayMethods.includes("outspeed")
    ).length,
    priorityCount: clearAnswers.filter((answer) =>
      answer.counterplayMethods.includes("priority")
    ).length,
    choiceScarfCount: clearAnswers.filter((answer) =>
      answer.counterplayMethods.includes("choice-scarf")
    ).length,
    trickRoomCount: clearAnswers.filter((answer) =>
      answer.counterplayMethods.includes("trick-room")
    ).length,
    weightedThreatCoverage,
    topThreatAnswered: clearAnswers.some((answer) => answer.threatRank === 1),
    unresolvedHighPriorityThreats: threatAnswers
      .filter(
        (answer) =>
          answer.threatRank <= 2 &&
          answer.answerStrength <
            ADVISOR_COUNTERPLAY_RULES.clearAnswerStrength
      )
      .map((answer) => answer.threatId),
    candidateUsage,
    usageEligibility,
    teamWideContribution: newlySolvedCount,
    finalScore
  };
}

export function isAdvisorThreatCoverageEligible(
  coverage: AdvisorThreatCoverage,
  issueReduction: number
): boolean {
  if (
    coverage.usageEligibility === "below-minimum" ||
    coverage.usageEligibility === "unknown"
  ) {
    return false;
  }
  const broadlyUseful =
    coverage.distinctThreatCount >=
      ADVISOR_COUNTERPLAY_RULES.recommendationMinimumDistinctThreats ||
    coverage.weightedThreatCoverage >=
      ADVISOR_COUNTERPLAY_RULES.recommendationMinimumWeightedCoverage ||
    (coverage.topThreatAnswered &&
      coverage.weightedThreatCoverage >=
        ADVISOR_COUNTERPLAY_RULES.topThreatMinimumCoverage &&
      issueReduction > 0) ||
    coverage.teamWideContribution >= 2;
  if (!broadlyUseful) return false;
  if (coverage.usageEligibility === "conditional") {
    return (
      coverage.distinctThreatCount >=
        ADVISOR_COUNTERPLAY_RULES.conditionalMinimumDistinctThreats ||
      (coverage.weightedThreatCoverage >=
        ADVISOR_COUNTERPLAY_RULES.conditionalMinimumWeightedCoverage &&
        issueReduction > 0)
    );
  }
  return true;
}

export function getAdvisorCounterplayMethodLabel(
  method: AdvisorCounterplayMethod
): string {
  const labels: Record<AdvisorCounterplayMethod, string> = {
    "stable-switch": "受けて対処",
    outspeed: "上から攻撃",
    "choice-scarf": "スカーフ型",
    priority: "先制技",
    "trick-room": "トリル下で先手",
    "offensive-pressure": "有効打",
    conditional: "条件付き",
    none: "明確な対策なし"
  };
  return labels[method];
}
