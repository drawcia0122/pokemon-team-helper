import {
  getTeamAdvisorIssues,
  type TeamAdvisorAnalysis,
  type TeamAdvisorCandidate,
  type TeamAdvisorIssue
} from "@/lib/teamAdvisor";
import {
  describeMoveEffectiveness,
  evaluateMoveAgainstPokemon,
  getEnvironmentAttackingMoves,
  THREAT_MOVE_THRESHOLDS
} from "@/lib/battleEffectiveness";
import {
  getTeamDiagnostics,
  getTeamTypeGapRows
} from "@/lib/teamDiagnostics";
import {
  getAdvisorCompatibleThreatAnalysis,
  type ThreatPokemonAnalysis
} from "@/lib/teamThreats";
import {
  getAllTypes,
  getMultiplier,
  getPokemonBySlug,
  getTypeLabel,
  resolveTeamSlot,
  summarizeTeam
} from "@/lib/typeChart";
import type { ThreatEnvironmentDataset } from "@/types/environmentThreat";
import type {
  PokemonEntry,
  TeamSlot,
  TeamSummary,
  TypeName
} from "@/types/pokemon";
import {
  getProfileSpeedRoleCount,
  isProfileSpeedAdvantage,
  PROFILE_SPEED_WEIGHTS,
  TEAM_PROFILE_CONFIG,
  TEAM_SPEED_THRESHOLDS,
  type TeamProfile
} from "@/lib/teamProfile";

export const ADVISOR_SWAP_WEIGHTS = {
  threatReduction: 2,
  issueReduction: 16,
  consistencyReduction: 12,
  defensiveImprovement: 3,
  offensiveImprovement: 4,
  speedRoleImprovement: 6,
  roleLossPenalty: 12,
  uniqueImmunityLossPenalty: 14,
  uniqueResistanceLossPenalty: 8,
  uniqueThreatAnswerLossPenalty: 12,
  newWeaknessPenalty: 14,
  threatIncreasePenalty: 3,
  usageTieBreaker: 1
} as const;

export const ADVISOR_TEAM_RULES = {
  recommendedMegaLimit: 2
} as const;

export const ADVISOR_RECOMMENDATION_RULES = {
  maxPerCategory: 5,
  preselectPerCategory: 8,
  overallScoreWindow: 30,
  maxSameRole: 2,
  maxMegaInOverall: 2,
  maxTypeOptions: 5
} as const;

export const ADVISOR_CATEGORY_WEIGHTS = {
  overall: ADVISOR_SWAP_WEIGHTS,
  defensive: {
    threatReduction: 2,
    issueReduction: 10,
    defensiveImprovement: 8,
    threatMoveImmunity: 6,
    threatMoveResistance: 3,
    stableCheck: 10,
    physicalWallGap: 7,
    specialWallGap: 7,
    recoveryAccess: 6,
    defensiveAbility: 3,
    roleLossPenalty: 14,
    newWeaknessPenalty: 16
  },
  offensive: {
    threatReduction: 2,
    issueReduction: 5,
    offensiveImprovement: 10,
    popularMoveCoverage: 7,
    attackerRoleGap: 6,
    speedSupport: 3,
    defensiveLossPenalty: 12,
    newWeaknessPenalty: 15
  },
  speed: {
    threatReduction: 1,
    issueReduction: 4,
    speedAdvantageThreat: 8,
    speedRoleImprovement: 15,
    popularMoveCoverage: 4,
    roleLossPenalty: 12,
    newWeaknessPenalty: 14
  },
  typeSpecific: {
    threatReduction: 2,
    issueReduction: 8,
    consistencyReduction: 9,
    defensiveImprovement: 5,
    offensiveImprovement: 4,
    roleLossPenalty: 12,
    newWeaknessPenalty: 15
  }
} as const;

export type AdvisorRecommendationCategory =
  | "overall"
  | "defensive"
  | "offensive"
  | "speed"
  | "typeSpecific";

export type AdvisorRecommendationRole =
  | "balanced"
  | "defensive"
  | "offensive"
  | "speed"
  | "type-coverage";

export const ADVISOR_CATEGORY_LABELS: Record<
  AdvisorRecommendationCategory,
  string
> = {
  overall: "総合",
  defensive: "耐久重視",
  offensive: "攻撃重視",
  speed: "素早さ重視",
  typeSpecific: "タイプ別"
};

export function getAdvisorCategoryLabels(
  profile: TeamProfile
): Record<AdvisorRecommendationCategory, string> {
  return {
    ...ADVISOR_CATEGORY_LABELS,
    speed: TEAM_PROFILE_CONFIG[profile].speedCategoryLabel
  };
}

const ATTACKER_STAT_THRESHOLD = 100;
const BULK_TOTAL_THRESHOLD = 180;
const BULK_STAT_THRESHOLD = 80;
const MAX_TEAM_SIZE = 6;
const MAX_IMPROVEMENT_NOTES = 3;
const MAX_CAUTION_NOTES = 2;

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

const DEFENSIVE_ABILITY_IDS = new Set([
  "regenerator",
  "unaware",
  "sturdy",
  "magicguard",
  "poisonheal",
  "toxicdebris",
  "levitate",
  "flashfire",
  "waterabsorb",
  "stormdrain",
  "dryskin",
  "lightningrod",
  "motordrive",
  "thickfat",
  "heatproof",
  "waterbubble",
  "icescales",
  "wonderguard",
  "sapsipper"
]);

export type AdvisorRoleCounts = {
  physicalAttacker: number;
  specialAttacker: number;
  mixedAttacker: number;
  physicalWall: number;
  specialWall: number;
  fast: number;
  mediumSpeed: number;
  slow: number;
};

export type AdvisorTeamMetrics = {
  memberCount: number;
  issueIds: string[];
  consistencyTypes: TypeName[];
  weakCounts: Record<TypeName, number>;
  coverCounts: Record<TypeName, number>;
  immunityCounts: Record<TypeName, number>;
  offenseCoverageCount: number;
  missingOffenseCount: number;
  threatAnswerSlotCount: number;
  roles: AdvisorRoleCounts;
};

export type AdvisorSwapAction =
  | { kind: "add"; removedSlotId: null; removedLabel: null }
  | { kind: "replace"; removedSlotId: string; removedLabel: string };

export type AdvisorSwapPlanMetrics = {
  threatReduction: number;
  issueReduction: number;
  consistencyReduction: number;
  defensiveImprovement: number;
  offensiveImprovement: number;
  speedRoleImprovement: number;
  roleLossCount: number;
  uniqueImmunityLossCount: number;
  uniqueResistanceLossCount: number;
  uniqueThreatAnswerLossCount: number;
  newMajorWeaknessCount: number;
  usageTieBreaker: number;
  threatMoveImmunityCount: number;
  threatMoveResistanceCount: number;
  stableCheckCount: number;
  physicalThreatCheckCount: number;
  specialThreatCheckCount: number;
  popularMoveCoverageCount: number;
  profileSpeedAdvantageCount: number;
  physicalWallImprovement: number;
  specialWallImprovement: number;
  physicalAttackerImprovement: number;
  specialAttackerImprovement: number;
  recoveryMoveShare: number;
  defensiveAbilityShare: number;
  mainstreamPhysicalShare: number;
  mainstreamSpecialShare: number;
  megaCountBefore: number;
  megaCountAfter: number;
  megaLimitPassed: boolean;
};

export type AdvisorSwapPlan = {
  candidate: TeamAdvisorCandidate;
  action: AdvisorSwapAction;
  beforeTeam: TeamSlot[];
  afterTeam: TeamSlot[];
  beforeIssues: TeamAdvisorIssue[];
  afterIssues: TeamAdvisorIssue[];
  beforeThreats: ThreatPokemonAnalysis[];
  afterThreats: ThreatPokemonAnalysis[];
  beforeThreatAverage: number | null;
  afterThreatAverage: number | null;
  threatAverageDelta: number | null;
  improvementScore: number;
  categoryScores: Record<AdvisorRecommendationCategory, number>;
  categoryReasons: Record<AdvisorRecommendationCategory, string[]>;
  recommendationRoles: AdvisorRecommendationRole[];
  selectedOverallRole: AdvisorRecommendationRole | null;
  improvements: string[];
  cautions: string[];
  lostRoles: string[];
  metrics: AdvisorSwapPlanMetrics;
  isRecommendation: boolean;
  isRecommendationByCategory: Record<AdvisorRecommendationCategory, boolean>;
};

export type AdvisorSwapSimulation = {
  plans: AdvisorSwapPlan[];
  plansByCategory: Record<
    Exclude<AdvisorRecommendationCategory, "typeSpecific">,
    AdvisorSwapPlan[]
  >;
  typePlans: Partial<Record<TypeName, AdvisorSwapPlan[]>>;
  typeOptions: Array<{ type: TypeName; label: string }>;
  candidatePoolCount: number;
  evaluatedPatternCount: number;
  recomputedThreatAnalysisCount: number;
  rejectedPlanCount: number;
};

export type AdvisorSwapSimulationInput = {
  team: TeamSlot[];
  advisor: TeamAdvisorAnalysis;
  availablePokemon: PokemonEntry[];
  environmentDataset: ThreatEnvironmentDataset | null;
  profile?: TeamProfile;
};

type Note = { id: string; text: string; priority: number };

type AdvisorCandidateEvidence = {
  threatMoveImmunityCount: number;
  threatMoveResistanceCount: number;
  stableCheckCount: number;
  physicalThreatCheckCount: number;
  specialThreatCheckCount: number;
  popularMoveCoverageCount: number;
  profileSpeedAdvantageCount: number;
  recoveryMoveShare: number;
  defensiveAbilityShare: number;
  mainstreamPhysicalShare: number;
  mainstreamSpecialShare: number;
  defensiveReasons: string[];
  offensiveReasons: string[];
  recoveryReason: string | null;
  defensiveAbilityReason: string | null;
};

function emptyCandidateEvidence(): AdvisorCandidateEvidence {
  return {
    threatMoveImmunityCount: 0,
    threatMoveResistanceCount: 0,
    stableCheckCount: 0,
    physicalThreatCheckCount: 0,
    specialThreatCheckCount: 0,
    popularMoveCoverageCount: 0,
    profileSpeedAdvantageCount: 0,
    recoveryMoveShare: 0,
    defensiveAbilityShare: 0,
    mainstreamPhysicalShare: 0,
    mainstreamSpecialShare: 0,
    defensiveReasons: [],
    offensiveReasons: [],
    recoveryReason: null,
    defensiveAbilityReason: null
  };
}

function subtractCandidateEvidence(
  candidate: AdvisorCandidateEvidence,
  replaced: AdvisorCandidateEvidence
): AdvisorCandidateEvidence {
  return {
    threatMoveImmunityCount:
      candidate.threatMoveImmunityCount - replaced.threatMoveImmunityCount,
    threatMoveResistanceCount:
      candidate.threatMoveResistanceCount - replaced.threatMoveResistanceCount,
    stableCheckCount: candidate.stableCheckCount - replaced.stableCheckCount,
    physicalThreatCheckCount:
      candidate.physicalThreatCheckCount - replaced.physicalThreatCheckCount,
    specialThreatCheckCount:
      candidate.specialThreatCheckCount - replaced.specialThreatCheckCount,
    popularMoveCoverageCount:
      candidate.popularMoveCoverageCount - replaced.popularMoveCoverageCount,
    profileSpeedAdvantageCount:
      candidate.profileSpeedAdvantageCount -
      replaced.profileSpeedAdvantageCount,
    recoveryMoveShare: candidate.recoveryMoveShare - replaced.recoveryMoveShare,
    defensiveAbilityShare:
      candidate.defensiveAbilityShare - replaced.defensiveAbilityShare,
    mainstreamPhysicalShare:
      candidate.mainstreamPhysicalShare - replaced.mainstreamPhysicalShare,
    mainstreamSpecialShare:
      candidate.mainstreamSpecialShare - replaced.mainstreamSpecialShare,
    defensiveReasons: candidate.defensiveReasons,
    offensiveReasons: candidate.offensiveReasons,
    recoveryReason: candidate.recoveryReason,
    defensiveAbilityReason: candidate.defensiveAbilityReason
  };
}

function countMegaForms(team: TeamSlot[]): number {
  return getPokemonMembers(team).filter(
    (pokemon) => pokemon.formKind === "mega"
  ).length;
}

function uniqueText(items: string[]): string[] {
  return [...new Set(items)];
}

function getCandidateEvidence(
  candidate: PokemonEntry,
  threats: ThreatPokemonAnalysis[],
  environmentDataset: ThreatEnvironmentDataset | null,
  profile: TeamProfile
): AdvisorCandidateEvidence {
  const environmentBySlug = new Map(
    environmentDataset?.pokemon.map((entry) => [entry.slug, entry]) ?? []
  );
  const candidateEnvironment = environmentBySlug.get(candidate.slug);
  let threatMoveImmunityCount = 0;
  let threatMoveResistanceCount = 0;
  let stableCheckCount = 0;
  let physicalThreatCheckCount = 0;
  let specialThreatCheckCount = 0;
  let popularMoveCoverageCount = 0;
  let profileSpeedAdvantageCount = 0;
  const defensiveReasons: Array<{ text: string; share: number }> = [];
  const offensiveReasons: Array<{ text: string; share: number }> = [];

  for (const threat of threats.slice(0, 5)) {
    const threatEnvironment = environmentBySlug.get(threat.pokemon.slug);
    const incomingMoves = getEnvironmentAttackingMoves(
      threatEnvironment?.moves
    );
    const incomingEvaluations = incomingMoves.map((move) => ({
      move,
      evaluation: evaluateMoveAgainstPokemon({
        move,
        attacker: threat.pokemon,
        defender: candidate,
        attackerAbilityUsage: threatEnvironment?.abilities,
        defenderAbilityUsage: candidateEnvironment?.abilities
      })
    }));

    for (const { move, evaluation } of incomingEvaluations) {
      if (evaluation.immunityProbability >= 0.5) {
        threatMoveImmunityCount += 1;
        defensiveReasons.push({
          text: describeMoveEffectiveness({
            evaluation,
            moveName: `${threat.pokemon.nameJa}の${move.name}（採用率${Math.round(move.share * 100)}%）`,
            defenderName: candidate.nameJa
          }),
          share: move.share
        });
      } else if (evaluation.resistanceProbability >= 0.5) {
        threatMoveResistanceCount += 1;
        defensiveReasons.push({
          text: describeMoveEffectiveness({
            evaluation,
            moveName: `${threat.pokemon.nameJa}の${move.name}（採用率${Math.round(move.share * 100)}%）`,
            defenderName: candidate.nameJa
          }),
          share: move.share
        });
      }
    }

    const primaryEvaluations = incomingEvaluations.filter(
      ({ move }) => move.share >= THREAT_MOVE_THRESHOLDS.primary
    );
    if (
      primaryEvaluations.length > 0 &&
      primaryEvaluations.every(
        ({ evaluation }) => evaluation.stableResistanceProbability >= 0.5
      )
    ) {
      stableCheckCount += 1;
    }
    const physicalMoves = primaryEvaluations.filter(
      ({ move }) => move.damageClass === "physical"
    );
    if (
      physicalMoves.length > 0 &&
      physicalMoves.every(
        ({ evaluation }) => evaluation.stableResistanceProbability >= 0.5
      )
    ) {
      physicalThreatCheckCount += 1;
    }
    const specialMoves = primaryEvaluations.filter(
      ({ move }) => move.damageClass === "special"
    );
    if (
      specialMoves.length > 0 &&
      specialMoves.every(
        ({ evaluation }) => evaluation.stableResistanceProbability >= 0.5
      )
    ) {
      specialThreatCheckCount += 1;
    }

    const candidateMoves = getEnvironmentAttackingMoves(
      candidateEnvironment?.moves
    );
    const bestEffectiveMove = candidateMoves
      .map((move) => ({
        move,
        evaluation: evaluateMoveAgainstPokemon({
          move,
          attacker: candidate,
          defender: threat.pokemon,
          attackerAbilityUsage: candidateEnvironment?.abilities,
          defenderAbilityUsage: threatEnvironment?.abilities
        })
      }))
      .filter(({ evaluation }) => evaluation.weaknessProbability >= 0.5)
      .sort((left, right) => right.move.share - left.move.share)[0];
    if (bestEffectiveMove) {
      popularMoveCoverageCount += 1;
      offensiveReasons.push({
        text: describeMoveEffectiveness({
          evaluation: bestEffectiveMove.evaluation,
          moveName: `${candidate.nameJa}の${bestEffectiveMove.move.name}（採用率${Math.round(bestEffectiveMove.move.share * 100)}%）`,
          defenderName: threat.pokemon.nameJa
        }),
        share: bestEffectiveMove.move.share
      });
    }
    if (
      candidate.baseStats &&
      threat.pokemon.baseStats &&
      isProfileSpeedAdvantage(
        candidate.baseStats.speed,
        threat.pokemon.baseStats.speed,
        profile
      )
    ) {
      profileSpeedAdvantageCount += 1;
    }
  }

  const recoveryMove = (candidateEnvironment?.moves ?? [])
    .filter(
      (move) =>
        move.damageClass === "status" &&
        RECOVERY_MOVE_IDS.has(move.id) &&
        move.share >= THREAT_MOVE_THRESHOLDS.secondary
    )
    .sort((left, right) => right.share - left.share)[0];
  const defensiveAbility = (candidateEnvironment?.abilities ?? [])
    .filter(
      (ability) =>
        DEFENSIVE_ABILITY_IDS.has(ability.id) &&
        ability.share >= THREAT_MOVE_THRESHOLDS.secondary
    )
    .sort((left, right) => right.share - left.share)[0];

  return {
    threatMoveImmunityCount,
    threatMoveResistanceCount,
    stableCheckCount,
    physicalThreatCheckCount,
    specialThreatCheckCount,
    popularMoveCoverageCount,
    profileSpeedAdvantageCount,
    recoveryMoveShare: recoveryMove?.share ?? 0,
    defensiveAbilityShare:
      stableCheckCount > 0 ? defensiveAbility?.share ?? 0 : 0,
    mainstreamPhysicalShare:
      candidateEnvironment?.offenseProfile.physicalShare ?? 0,
    mainstreamSpecialShare:
      candidateEnvironment?.offenseProfile.specialShare ?? 0,
    defensiveReasons: uniqueText(
      defensiveReasons
        .sort((left, right) => right.share - left.share)
        .map((entry) => entry.text)
    ),
    offensiveReasons: uniqueText(
      offensiveReasons
        .sort((left, right) => right.share - left.share)
        .map((entry) => entry.text)
    ),
    recoveryReason: recoveryMove
      ? `${recoveryMove.name}の採用率が${Math.round(recoveryMove.share * 100)}%で、継続的な受け役を担えます。`
      : null,
    defensiveAbilityReason:
      stableCheckCount > 0 && defensiveAbility
        ? `${defensiveAbility.name}の採用率が${Math.round(defensiveAbility.share * 100)}%で、要警戒相手への受け性能に寄与します。`
        : null
  };
}

function cloneTeam(team: TeamSlot[]): TeamSlot[] {
  return team.map((slot) => ({ ...slot }));
}

function getPokemonMembers(team: TeamSlot[]): PokemonEntry[] {
  return team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    return pokemon ? [pokemon] : [];
  });
}

export function getAdvisorRoleCounts(team: TeamSlot[]): AdvisorRoleCounts {
  const members = getPokemonMembers(team).filter(
    (pokemon) => pokemon.baseStats
  );
  const roles: AdvisorRoleCounts = {
    physicalAttacker: 0,
    specialAttacker: 0,
    mixedAttacker: 0,
    physicalWall: 0,
    specialWall: 0,
    fast: 0,
    mediumSpeed: 0,
    slow: 0
  };

  for (const pokemon of members) {
    const stats = pokemon.baseStats!;
    const physical = stats.attack >= ATTACKER_STAT_THRESHOLD;
    const special = stats.specialAttack >= ATTACKER_STAT_THRESHOLD;
    if (physical) roles.physicalAttacker += 1;
    if (special) roles.specialAttacker += 1;
    if (physical && special) roles.mixedAttacker += 1;
    if (
      stats.hp + stats.defense >= BULK_TOTAL_THRESHOLD &&
      stats.defense >= BULK_STAT_THRESHOLD
    ) {
      roles.physicalWall += 1;
    }
    if (
      stats.hp + stats.specialDefense >= BULK_TOTAL_THRESHOLD &&
      stats.specialDefense >= BULK_STAT_THRESHOLD
    ) {
      roles.specialWall += 1;
    }
    if (stats.speed >= TEAM_SPEED_THRESHOLDS.fastMinimum) roles.fast += 1;
    else if (stats.speed >= TEAM_SPEED_THRESHOLDS.mediumMinimum) roles.mediumSpeed += 1;
    else roles.slow += 1;
  }

  return roles;
}

function getThreatAnswerSlotCount(
  summary: TeamSummary,
  threats: ThreatPokemonAnalysis[]
): number {
  return summary.members.filter((member) =>
    threats.some((threat) =>
      member.types.some(
        (type) => getMultiplier(type, threat.pokemon.types) > 1
      )
    )
  ).length;
}

export function getAdvisorTeamMetrics(
  team: TeamSlot[],
  summary: TeamSummary,
  issues: TeamAdvisorIssue[],
  threats: ThreatPokemonAnalysis[]
): AdvisorTeamMetrics {
  const weakCounts = {} as Record<TypeName, number>;
  const coverCounts = {} as Record<TypeName, number>;
  const immunityCounts = {} as Record<TypeName, number>;
  const rowsByType = new Map(
    summary.rows.map((row) => [row.attackType, row])
  );

  for (const type of getAllTypes()) {
    const row = rowsByType.get(type.nameEn);
    weakCounts[type.nameEn] = row
      ? row.multiplierMap.weak + row.multiplierMap.quadWeak
      : 0;
    coverCounts[type.nameEn] = row
      ? row.multiplierMap.resist +
        row.multiplierMap.doubleResist +
        row.multiplierMap.immune
      : 0;
    immunityCounts[type.nameEn] = row?.multiplierMap.immune ?? 0;
  }

  return {
    memberCount: summary.members.length,
    issueIds: issues.map((issue) => issue.id),
    consistencyTypes: getTeamTypeGapRows(summary).map(
      (row) => row.attackType
    ),
    weakCounts,
    coverCounts,
    immunityCounts,
    offenseCoverageCount: summary.offensiveCoverage.filter(
      (row) => row.superEffectiveCount > 0
    ).length,
    missingOffenseCount: summary.missingOffense.length,
    threatAnswerSlotCount: getThreatAnswerSlotCount(summary, threats),
    roles: getAdvisorRoleCounts(team)
  };
}

function averageThreatScore(
  threats: ThreatPokemonAnalysis[]
): number | null {
  if (!threats.length) return null;
  return Math.round(
    threats.reduce((total, threat) => total + threat.score, 0) /
      threats.length
  );
}

function buildAfterTeam(
  team: TeamSlot[],
  candidate: TeamAdvisorCandidate,
  removedSlotId: string | null
): TeamSlot[] {
  if (removedSlotId === null) {
    return [
      ...cloneTeam(team),
      {
        id: `advisor-add-${candidate.pokemon.slug}`,
        mode: "pokemon",
        pokemonSlug: candidate.pokemon.slug
      }
    ];
  }

  return team.map((slot) =>
    slot.id === removedSlotId
      ? {
          id: slot.id,
          mode: "pokemon" as const,
          pokemonSlug: candidate.pokemon.slug
        }
      : { ...slot }
  );
}

function getRemovedLabel(
  team: TeamSlot[],
  removedSlotId: string | null
): string | null {
  if (removedSlotId === null) return null;
  const slot = team.find((entry) => entry.id === removedSlotId);
  return slot ? resolveTeamSlot(slot)?.label ?? "現在のメンバー" : null;
}

function getRemovedPokemon(
  team: TeamSlot[],
  removedSlotId: string | null
): PokemonEntry | null {
  if (removedSlotId === null) return null;
  const slot = team.find((entry) => entry.id === removedSlotId);
  if (!slot || slot.mode !== "pokemon") return null;
  return getPokemonBySlug(slot.pokemonSlug) ?? null;
}

function collectLostRoles(
  before: AdvisorRoleCounts,
  after: AdvisorRoleCounts,
  profile: TeamProfile
): string[] {
  const labels: Array<[keyof AdvisorRoleCounts, string]> = [
    ["physicalAttacker", "唯一の物理アタッカー"],
    ["specialAttacker", "唯一の特殊アタッカー"],
    [
      TEAM_PROFILE_CONFIG[profile].activeSpeedRole,
      `唯一の${TEAM_PROFILE_CONFIG[profile].speedRoleLabel}`
    ],
    ["physicalWall", "唯一の物理耐久候補"],
    ["specialWall", "唯一の特殊耐久候補"]
  ];
  return labels.flatMap(([key, label]) =>
    before[key] === 1 && after[key] === 0 ? [label] : []
  );
}

export function getAdvisorProfileSpeedRoleImprovement(
  before: AdvisorRoleCounts,
  after: AdvisorRoleCounts,
  profile: TeamProfile
): number {
  const weights = PROFILE_SPEED_WEIGHTS[profile];
  const fastDelta = after.fast - before.fast;
  const slowDelta = after.slow - before.slow;
  const weightedDelta = (
    delta: number,
    gainWeight: number,
    lossWeight: number
  ) => delta >= 0 ? delta * gainWeight : delta * lossWeight;
  return weightedDelta(
    fastDelta,
    weights.fastRoleGain,
    weights.fastRoleLoss
  ) + weightedDelta(
    slowDelta,
    weights.slowRoleGain,
    weights.slowRoleLoss
  );
}

function uniqueThreatAnswerLosses(
  beforeSummary: TeamSummary,
  afterSummary: TeamSummary,
  beforeThreats: ThreatPokemonAnalysis[]
): string[] {
  return beforeThreats.flatMap((threat) => {
    const beforeAnswers = beforeSummary.members.filter((member) =>
      member.types.some(
        (type) => getMultiplier(type, threat.pokemon.types) > 1
      )
    ).length;
    const afterAnswers = afterSummary.members.filter((member) =>
      member.types.some(
        (type) => getMultiplier(type, threat.pokemon.types) > 1
      )
    ).length;
    return beforeAnswers === 1 && afterAnswers === 0
      ? [threat.pokemon.nameJa]
      : [];
  });
}

function addNote(notes: Note[], note: Note): void {
  if (!notes.some((entry) => entry.id === note.id)) notes.push(note);
}

function formatCountChange(
  label: string,
  before: number,
  after: number
): string {
  return `${label} ${before}体 → ${after}体`;
}

function buildPlanNotes(
  before: AdvisorTeamMetrics,
  after: AdvisorTeamMetrics,
  beforeThreatAverage: number | null,
  afterThreatAverage: number | null,
  lostRoles: string[],
  uniqueImmunityLosses: TypeName[],
  uniqueResistanceLosses: TypeName[],
  threatAnswerLosses: string[],
  newMajorWeaknesses: TypeName[],
  profile: TeamProfile
): { improvements: string[]; cautions: string[] } {
  const improvements: Note[] = [];
  const cautions: Note[] = [];
  const threatDelta =
    beforeThreatAverage !== null && afterThreatAverage !== null
      ? beforeThreatAverage - afterThreatAverage
      : 0;

  if (threatDelta > 0) {
    addNote(improvements, {
      id: "threat-average",
      text: `要警戒TOP5平均 ${beforeThreatAverage} → ${afterThreatAverage}（-${threatDelta}）`,
      priority: 120
    });
  } else if (threatDelta < 0) {
    addNote(cautions, {
      id: "threat-average",
      text: `要警戒TOP5平均 ${beforeThreatAverage} → ${afterThreatAverage}（+${Math.abs(threatDelta)}）`,
      priority: 120
    });
  }

  for (const type of getAllTypes().map((entry) => entry.nameEn)) {
    const weakDelta = before.weakCounts[type] - after.weakCounts[type];
    const coverDelta = after.coverCounts[type] - before.coverCounts[type];
    if (weakDelta > 0) {
      addNote(improvements, {
        id: `weak-${type}`,
        text: formatCountChange(
          `${getTypeLabel(type)}弱点`,
          before.weakCounts[type],
          after.weakCounts[type]
        ),
        priority: 100 + before.weakCounts[type] * 2
      });
    } else if (weakDelta < 0) {
      addNote(cautions, {
        id: `weak-${type}`,
        text: formatCountChange(
          `${getTypeLabel(type)}弱点`,
          before.weakCounts[type],
          after.weakCounts[type]
        ),
        priority: 90 + after.weakCounts[type] * 2
      });
    }
    if (
      coverDelta > 0 &&
      (before.consistencyTypes.includes(type) || before.weakCounts[type] > 0)
    ) {
      addNote(improvements, {
        id: `cover-${type}`,
        text: formatCountChange(
          `${getTypeLabel(type)}半減・無効`,
          before.coverCounts[type],
          after.coverCounts[type]
        ),
        priority: 95 + before.weakCounts[type]
      });
    }
  }

  const issueReduction = before.issueIds.length - after.issueIds.length;
  if (issueReduction > 0) {
    addNote(improvements, {
      id: "issues",
      text: `現在の課題 ${before.issueIds.length}件 → ${after.issueIds.length}件`,
      priority: 105
    });
  }
  const beforeProfileSpeedRoles = getProfileSpeedRoleCount(
    before.roles,
    profile
  );
  const afterProfileSpeedRoles = getProfileSpeedRoleCount(
    after.roles,
    profile
  );
  if (afterProfileSpeedRoles > beforeProfileSpeedRoles) {
    addNote(improvements, {
      id: "profile-speed-role",
      text: formatCountChange(
        TEAM_PROFILE_CONFIG[profile].speedRoleLabel,
        beforeProfileSpeedRoles,
        afterProfileSpeedRoles
      ),
      priority: 88
    });
  }
  if (after.roles.specialAttacker > before.roles.specialAttacker) {
    addNote(improvements, {
      id: "special-role",
      text: formatCountChange(
        "特殊アタッカー",
        before.roles.specialAttacker,
        after.roles.specialAttacker
      ),
      priority: 86
    });
  }
  if (after.roles.physicalAttacker > before.roles.physicalAttacker) {
    addNote(improvements, {
      id: "physical-role",
      text: formatCountChange(
        "物理アタッカー",
        before.roles.physicalAttacker,
        after.roles.physicalAttacker
      ),
      priority: 85
    });
  }
  if (after.offenseCoverageCount > before.offenseCoverageCount) {
    addNote(improvements, {
      id: "offense-coverage",
      text: `一致技で抜群を取れるタイプ ${before.offenseCoverageCount}種類 → ${after.offenseCoverageCount}種類`,
      priority: 82
    });
  }
  if (after.threatAnswerSlotCount > before.threatAnswerSlotCount) {
    addNote(improvements, {
      id: "threat-answer-slots",
      text: formatCountChange(
        "要警戒TOP5へ抜群を取れる枠",
        before.threatAnswerSlotCount,
        after.threatAnswerSlotCount
      ),
      priority: 92
    });
  }

  for (const label of lostRoles) {
    addNote(cautions, {
      id: `lost-role-${label}`,
      text: `${label}を失います。`,
      priority: 110
    });
  }
  for (const type of uniqueImmunityLosses) {
    addNote(cautions, {
      id: `lost-immunity-${type}`,
      text: `${getTypeLabel(type)}無効枠が1体 → 0体になります。`,
      priority: 115
    });
  }
  for (const type of uniqueResistanceLosses) {
    addNote(cautions, {
      id: `lost-resistance-${type}`,
      text: `${getTypeLabel(type)}の唯一の半減・無効枠を失います。`,
      priority: 108
    });
  }
  for (const name of threatAnswerLosses) {
    addNote(cautions, {
      id: `lost-threat-answer-${name}`,
      text: `${name}へ抜群を取れる唯一の枠を失います。`,
      priority: 112
    });
  }
  for (const type of newMajorWeaknesses) {
    addNote(cautions, {
      id: `new-consistency-${type}`,
      text: `${getTypeLabel(type)}技の新しい一貫が生まれます。`,
      priority: 118
    });
  }
  if (after.offenseCoverageCount < before.offenseCoverageCount) {
    addNote(cautions, {
      id: "offense-coverage",
      text: `一致技の攻撃範囲 ${before.offenseCoverageCount}種類 → ${after.offenseCoverageCount}種類`,
      priority: 84
    });
  }

  return {
    improvements: improvements
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .slice(0, MAX_IMPROVEMENT_NOTES)
      .map((note) => note.text),
    cautions: cautions
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .slice(0, MAX_CAUTION_NOTES)
      .map((note) => note.text)
  };
}

function getCategoryScores({
  improvementScore,
  threatReduction,
  issueReduction,
  consistencyReduction,
  defensiveImprovement,
  offensiveImprovement,
  speedRoleImprovement,
  physicalWallImprovement,
  specialWallImprovement,
  physicalAttackerImprovement,
  specialAttackerImprovement,
  lostRoleCount,
  uniqueImmunityLossCount,
  uniqueResistanceLossCount,
  newMajorWeaknessCount,
  evidence
}: {
  improvementScore: number;
  threatReduction: number;
  issueReduction: number;
  consistencyReduction: number;
  defensiveImprovement: number;
  offensiveImprovement: number;
  speedRoleImprovement: number;
  physicalWallImprovement: number;
  specialWallImprovement: number;
  physicalAttackerImprovement: number;
  specialAttackerImprovement: number;
  lostRoleCount: number;
  uniqueImmunityLossCount: number;
  uniqueResistanceLossCount: number;
  newMajorWeaknessCount: number;
  evidence: AdvisorCandidateEvidence;
}): Record<AdvisorRecommendationCategory, number> {
  const defensiveLosses =
    lostRoleCount + uniqueImmunityLossCount + uniqueResistanceLossCount;
  const mainstreamAttackerRoleGain =
    Math.max(0, physicalAttackerImprovement) *
      Math.max(0, evidence.mainstreamPhysicalShare) +
    Math.max(0, specialAttackerImprovement) *
      Math.max(0, evidence.mainstreamSpecialShare);
  const defensive = ADVISOR_CATEGORY_WEIGHTS.defensive;
  const offensive = ADVISOR_CATEGORY_WEIGHTS.offensive;
  const speed = ADVISOR_CATEGORY_WEIGHTS.speed;
  const typeSpecific = ADVISOR_CATEGORY_WEIGHTS.typeSpecific;

  return {
    overall: improvementScore,
    defensive: Math.round(
      threatReduction * defensive.threatReduction +
        issueReduction * defensive.issueReduction +
        defensiveImprovement * defensive.defensiveImprovement +
        evidence.threatMoveImmunityCount * defensive.threatMoveImmunity +
        evidence.threatMoveResistanceCount * defensive.threatMoveResistance +
        evidence.stableCheckCount * defensive.stableCheck +
        Math.max(0, physicalWallImprovement) * defensive.physicalWallGap +
        Math.max(0, specialWallImprovement) * defensive.specialWallGap +
        evidence.recoveryMoveShare * defensive.recoveryAccess +
        evidence.defensiveAbilityShare * defensive.defensiveAbility -
        defensiveLosses * defensive.roleLossPenalty -
        newMajorWeaknessCount * defensive.newWeaknessPenalty
    ),
    offensive: Math.round(
      threatReduction * offensive.threatReduction +
        issueReduction * offensive.issueReduction +
        offensiveImprovement * offensive.offensiveImprovement +
        evidence.popularMoveCoverageCount *
          offensive.popularMoveCoverage +
        mainstreamAttackerRoleGain * offensive.attackerRoleGap +
        Math.max(0, speedRoleImprovement) * offensive.speedSupport -
        defensiveLosses * offensive.defensiveLossPenalty -
        newMajorWeaknessCount * offensive.newWeaknessPenalty
    ),
    speed: Math.round(
      threatReduction * speed.threatReduction +
        issueReduction * speed.issueReduction +
        evidence.profileSpeedAdvantageCount *
          speed.speedAdvantageThreat +
        Math.max(0, speedRoleImprovement) *
          speed.speedRoleImprovement +
        evidence.popularMoveCoverageCount * speed.popularMoveCoverage -
        lostRoleCount * speed.roleLossPenalty -
        newMajorWeaknessCount * speed.newWeaknessPenalty
    ),
    typeSpecific: Math.round(
      threatReduction * typeSpecific.threatReduction +
        issueReduction * typeSpecific.issueReduction +
        consistencyReduction * typeSpecific.consistencyReduction +
        defensiveImprovement * typeSpecific.defensiveImprovement +
        offensiveImprovement * typeSpecific.offensiveImprovement -
        defensiveLosses * typeSpecific.roleLossPenalty -
        newMajorWeaknessCount * typeSpecific.newWeaknessPenalty
    )
  };
}

function getRecommendationRoles(
  metrics: Pick<
    AdvisorSwapPlanMetrics,
    | "issueReduction"
    | "consistencyReduction"
    | "defensiveImprovement"
    | "offensiveImprovement"
    | "speedRoleImprovement"
    | "stableCheckCount"
    | "popularMoveCoverageCount"
    | "profileSpeedAdvantageCount"
  >
): AdvisorRecommendationRole[] {
  const roles: AdvisorRecommendationRole[] = [];
  if (
    metrics.defensiveImprovement > 0 ||
    metrics.stableCheckCount > 0
  ) {
    roles.push("defensive");
  }
  if (
    metrics.offensiveImprovement > 0 ||
    metrics.popularMoveCoverageCount > 0
  ) {
    roles.push("offensive");
  }
  if (
    metrics.speedRoleImprovement > 0 ||
    metrics.profileSpeedAdvantageCount >= 3
  ) {
    roles.push("speed");
  }
  if (metrics.consistencyReduction > 0 || metrics.defensiveImprovement >= 2) {
    roles.push("type-coverage");
  }
  if (metrics.issueReduction >= 2 || roles.length >= 3) {
    roles.unshift("balanced");
  }
  return roles.length ? uniqueText(roles) as AdvisorRecommendationRole[] : ["balanced"];
}

function takeRecommendationReasons(
  preferred: Array<string | null | undefined>,
  fallback: string[]
): string[] {
  return uniqueText([
    ...preferred.filter((item): item is string => Boolean(item)),
    ...fallback
  ]).slice(0, MAX_IMPROVEMENT_NOTES);
}

function buildCategoryReasons({
  beforeMetrics,
  afterMetrics,
  evidence,
  evidenceGain,
  improvements,
  profile
}: {
  beforeMetrics: AdvisorTeamMetrics;
  afterMetrics: AdvisorTeamMetrics;
  evidence: AdvisorCandidateEvidence;
  evidenceGain: AdvisorCandidateEvidence;
  improvements: string[];
  profile: TeamProfile;
}): Record<AdvisorRecommendationCategory, string[]> {
  const physicalWallReason =
    afterMetrics.roles.physicalWall > beforeMetrics.roles.physicalWall
      ? formatCountChange(
          "物理耐久候補",
          beforeMetrics.roles.physicalWall,
          afterMetrics.roles.physicalWall
        )
      : null;
  const specialWallReason =
    afterMetrics.roles.specialWall > beforeMetrics.roles.specialWall
      ? formatCountChange(
          "特殊耐久候補",
          beforeMetrics.roles.specialWall,
          afterMetrics.roles.specialWall
        )
      : null;
  const attackerReason =
    afterMetrics.roles.physicalAttacker > beforeMetrics.roles.physicalAttacker
      ? `${formatCountChange(
          "物理アタッカー",
          beforeMetrics.roles.physicalAttacker,
          afterMetrics.roles.physicalAttacker
        )}${
          evidence.mainstreamPhysicalShare > 0
            ? `（環境の物理型 ${Math.round(evidence.mainstreamPhysicalShare * 100)}%）`
            : ""
        }`
      : afterMetrics.roles.specialAttacker >
          beforeMetrics.roles.specialAttacker
        ? `${formatCountChange(
            "特殊アタッカー",
            beforeMetrics.roles.specialAttacker,
            afterMetrics.roles.specialAttacker
          )}${
            evidence.mainstreamSpecialShare > 0
              ? `（環境の特殊型 ${Math.round(evidence.mainstreamSpecialShare * 100)}%）`
              : ""
          }`
        : null;
  const stableCheckReason = evidenceGain.stableCheckCount > 0
    ? `要警戒TOP5のうち${evidence.stableCheckCount}体の主要技を半減・無効で受けられます。`
    : null;
  const offenseReason = evidenceGain.popularMoveCoverageCount > 0
    ? `要警戒TOP5のうち${evidence.popularMoveCoverageCount}体へ実採用技で抜群を取れます。`
    : null;
  const speedReason = evidenceGain.profileSpeedAdvantageCount > 0
    ? profile === "trick-room"
      ? `要警戒TOP5のうち${evidence.profileSpeedAdvantageCount}体より遅く、トリックルーム下で先に動きやすいです。`
      : `要警戒TOP5のうち${evidence.profileSpeedAdvantageCount}体より速く、先に動きやすいです。`
    : null;
  const defensiveMoveReasons =
    evidenceGain.threatMoveImmunityCount > 0 ||
    evidenceGain.threatMoveResistanceCount > 0
      ? evidence.defensiveReasons
      : [];
  const offensiveMoveReasons =
    evidenceGain.popularMoveCoverageCount > 0
      ? evidence.offensiveReasons
      : [];

  return {
    overall: takeRecommendationReasons(improvements, []),
    defensive: takeRecommendationReasons(
      [
        defensiveMoveReasons[0],
        stableCheckReason,
        evidenceGain.recoveryMoveShare > 0 ? evidence.recoveryReason : null,
        evidenceGain.defensiveAbilityShare > 0
          ? evidence.defensiveAbilityReason
          : null,
        physicalWallReason,
        specialWallReason,
        ...defensiveMoveReasons.slice(1)
      ],
      improvements
    ),
    offensive: takeRecommendationReasons(
      [...offensiveMoveReasons, offenseReason, attackerReason],
      improvements
    ),
    speed: takeRecommendationReasons(
      [speedReason, ...offensiveMoveReasons, attackerReason],
      improvements
    ),
    typeSpecific: takeRecommendationReasons(improvements, [])
  };
}

export function evaluateAdvisorSwapPlan(
  input: AdvisorSwapSimulationInput,
  candidate: TeamAdvisorCandidate,
  removedSlotId: string | null
): AdvisorSwapPlan {
  const profile = input.profile ?? "standard";
  const beforeTeam = cloneTeam(input.team);
  const afterTeam = buildAfterTeam(input.team, candidate, removedSlotId);
  const beforeSummary = summarizeTeam(beforeTeam);
  const afterSummary = summarizeTeam(afterTeam);
  const beforeDiagnostics = getTeamDiagnostics(
    beforeTeam,
    beforeSummary,
    input.availablePokemon,
    profile
  );
  const afterDiagnostics = getTeamDiagnostics(
    afterTeam,
    afterSummary,
    input.availablePokemon,
    profile
  );
  const beforeIssues = getTeamAdvisorIssues(
    beforeSummary,
    beforeDiagnostics
  );
  const afterIssues = getTeamAdvisorIssues(afterSummary, afterDiagnostics);
  const beforeThreats = getAdvisorCompatibleThreatAnalysis(
    beforeTeam,
    beforeSummary,
    input.availablePokemon,
    input.environmentDataset,
    5,
    profile
  );
  const afterThreats = getAdvisorCompatibleThreatAnalysis(
    afterTeam,
    afterSummary,
    input.availablePokemon,
    input.environmentDataset,
    5,
    profile
  );
  const beforeMetrics = getAdvisorTeamMetrics(
    beforeTeam,
    beforeSummary,
    beforeIssues,
    beforeThreats
  );
  const afterMetrics = getAdvisorTeamMetrics(
    afterTeam,
    afterSummary,
    afterIssues,
    afterThreats
  );
  const beforeThreatAverage = averageThreatScore(beforeThreats);
  const afterThreatAverage = averageThreatScore(afterThreats);
  const evidence = getCandidateEvidence(
    candidate.pokemon,
    beforeThreats,
    input.environmentDataset,
    profile
  );
  const removedPokemon = getRemovedPokemon(beforeTeam, removedSlotId);
  const replacedEvidence = removedPokemon
    ? getCandidateEvidence(
        removedPokemon,
        beforeThreats,
        input.environmentDataset,
        profile
      )
    : emptyCandidateEvidence();
  const evidenceGain = subtractCandidateEvidence(
    evidence,
    replacedEvidence
  );
  const threatReduction =
    beforeThreatAverage !== null && afterThreatAverage !== null
      ? beforeThreatAverage - afterThreatAverage
      : 0;
  const issueReduction =
    beforeMetrics.issueIds.length - afterMetrics.issueIds.length;
  const consistencyReduction =
    beforeMetrics.consistencyTypes.length -
    afterMetrics.consistencyTypes.length;
  const importantTypes = getAllTypes()
    .map((type) => type.nameEn)
    .filter(
      (type) =>
        beforeMetrics.consistencyTypes.includes(type) ||
        beforeMetrics.weakCounts[type] >= 2
    );
  const defensiveImprovement = importantTypes.reduce((total, type) => {
    const weakReduction = Math.max(
      0,
      beforeMetrics.weakCounts[type] - afterMetrics.weakCounts[type]
    );
    const coverIncrease = Math.max(
      0,
      afterMetrics.coverCounts[type] - beforeMetrics.coverCounts[type]
    );
    return total + weakReduction + coverIncrease;
  }, 0);
  const offensiveImprovement =
    afterMetrics.offenseCoverageCount - beforeMetrics.offenseCoverageCount +
    (afterMetrics.threatAnswerSlotCount -
      beforeMetrics.threatAnswerSlotCount);
  const speedRoleImprovement = getAdvisorProfileSpeedRoleImprovement(
    beforeMetrics.roles,
    afterMetrics.roles,
    profile
  );
  const physicalWallImprovement =
    afterMetrics.roles.physicalWall - beforeMetrics.roles.physicalWall;
  const specialWallImprovement =
    afterMetrics.roles.specialWall - beforeMetrics.roles.specialWall;
  const physicalAttackerImprovement =
    afterMetrics.roles.physicalAttacker -
    beforeMetrics.roles.physicalAttacker;
  const specialAttackerImprovement =
    afterMetrics.roles.specialAttacker -
    beforeMetrics.roles.specialAttacker;
  const lostRoles = collectLostRoles(
    beforeMetrics.roles,
    afterMetrics.roles,
    profile
  );
  const uniqueImmunityLosses = getAllTypes()
    .map((type) => type.nameEn)
    .filter(
      (type) =>
        beforeMetrics.immunityCounts[type] === 1 &&
        afterMetrics.immunityCounts[type] === 0
    );
  const uniqueResistanceLosses = getAllTypes()
    .map((type) => type.nameEn)
    .filter(
      (type) =>
        !uniqueImmunityLosses.includes(type) &&
        beforeMetrics.coverCounts[type] === 1 &&
        afterMetrics.coverCounts[type] === 0 &&
        beforeMetrics.weakCounts[type] > 0
    );
  const threatAnswerLosses = uniqueThreatAnswerLosses(
    beforeSummary,
    afterSummary,
    beforeThreats
  );
  const newMajorWeaknesses = afterMetrics.consistencyTypes.filter(
    (type) => !beforeMetrics.consistencyTypes.includes(type)
  );
  const environmentUsageRate = candidate.environmentUsageRate ?? 0;
  const usageTieBreaker = Math.min(
    ADVISOR_SWAP_WEIGHTS.usageTieBreaker,
    environmentUsageRate * ADVISOR_SWAP_WEIGHTS.usageTieBreaker
  );
  const improvementScore = Math.round(
    threatReduction * ADVISOR_SWAP_WEIGHTS.threatReduction +
      issueReduction * ADVISOR_SWAP_WEIGHTS.issueReduction +
      consistencyReduction * ADVISOR_SWAP_WEIGHTS.consistencyReduction +
      defensiveImprovement * ADVISOR_SWAP_WEIGHTS.defensiveImprovement +
      offensiveImprovement * ADVISOR_SWAP_WEIGHTS.offensiveImprovement +
      speedRoleImprovement * ADVISOR_SWAP_WEIGHTS.speedRoleImprovement -
      lostRoles.length * ADVISOR_SWAP_WEIGHTS.roleLossPenalty -
      uniqueImmunityLosses.length *
        ADVISOR_SWAP_WEIGHTS.uniqueImmunityLossPenalty -
      uniqueResistanceLosses.length *
        ADVISOR_SWAP_WEIGHTS.uniqueResistanceLossPenalty -
      threatAnswerLosses.length *
        ADVISOR_SWAP_WEIGHTS.uniqueThreatAnswerLossPenalty -
      newMajorWeaknesses.length * ADVISOR_SWAP_WEIGHTS.newWeaknessPenalty -
      Math.max(0, -threatReduction) *
        ADVISOR_SWAP_WEIGHTS.threatIncreasePenalty
  );
  const notes = buildPlanNotes(
    beforeMetrics,
    afterMetrics,
    beforeThreatAverage,
    afterThreatAverage,
    lostRoles,
    uniqueImmunityLosses,
    uniqueResistanceLosses,
    threatAnswerLosses,
    newMajorWeaknesses,
    profile
  );
  const megaCountBefore = countMegaForms(beforeTeam);
  const megaCountAfter = countMegaForms(afterTeam);
  const megaLimitPassed =
    candidate.pokemon.formKind !== "mega" ||
    megaCountAfter <= ADVISOR_TEAM_RULES.recommendedMegaLimit;
  const categoryScores = getCategoryScores({
    improvementScore,
    threatReduction,
    issueReduction,
    consistencyReduction,
    defensiveImprovement,
    offensiveImprovement,
    speedRoleImprovement,
    physicalWallImprovement,
    specialWallImprovement,
    physicalAttackerImprovement,
    specialAttackerImprovement,
    lostRoleCount: lostRoles.length,
    uniqueImmunityLossCount: uniqueImmunityLosses.length,
    uniqueResistanceLossCount: uniqueResistanceLosses.length,
    newMajorWeaknessCount: newMajorWeaknesses.length,
    evidence: evidenceGain
  });
  const categoryReasons = buildCategoryReasons({
    beforeMetrics,
    afterMetrics,
    evidence,
    evidenceGain,
    improvements: notes.improvements,
    profile
  });
  const recommendationRoles = getRecommendationRoles({
    issueReduction,
    consistencyReduction,
    defensiveImprovement,
    offensiveImprovement,
    speedRoleImprovement,
    stableCheckCount: evidenceGain.stableCheckCount,
    popularMoveCoverageCount: evidenceGain.popularMoveCoverageCount,
    profileSpeedAdvantageCount:
      evidenceGain.profileSpeedAdvantageCount
  });
  const meaningfulImprovement =
    issueReduction > 0 ||
    threatReduction >= 2 ||
    defensiveImprovement >= 2 ||
    offensiveImprovement >= 2 ||
    speedRoleImprovement > 0;
  const sharedRecommendationGate =
    megaLimitPassed &&
    newMajorWeaknesses.length === 0 &&
    !(lostRoles.length >= 2 && improvementScore < 30);
  const isRecommendation =
    improvementScore > 0 &&
    sharedRecommendationGate &&
    !(threatReduction < 0 && improvementScore < 20) &&
    meaningfulImprovement &&
    notes.improvements.length > 0;
  const categoryMeaning = {
    overall: meaningfulImprovement,
    defensive:
      evidenceGain.stableCheckCount > 0 ||
      evidenceGain.threatMoveImmunityCount > 0 ||
      evidenceGain.threatMoveResistanceCount > 0,
    offensive:
      offensiveImprovement > 0 ||
      physicalAttackerImprovement > 0 ||
      specialAttackerImprovement > 0 ||
      evidenceGain.popularMoveCoverageCount > 0,
    speed:
      speedRoleImprovement > 0 ||
      (evidenceGain.profileSpeedAdvantageCount > 0 &&
        evidenceGain.popularMoveCoverageCount > 0),
    typeSpecific:
      consistencyReduction > 0 ||
      defensiveImprovement > 0 ||
      offensiveImprovement > 0
  } satisfies Record<AdvisorRecommendationCategory, boolean>;
  const isRecommendationByCategory = Object.fromEntries(
    (Object.keys(categoryMeaning) as AdvisorRecommendationCategory[]).map(
      (category) => {
        if (category === "overall") return [category, isRecommendation];
        const categoryScore = categoryScores[category];
        return [
          category,
          sharedRecommendationGate &&
            categoryMeaning[category] &&
            categoryScore > 0 &&
            !(threatReduction < 0 && categoryScore < 20) &&
            categoryReasons[category].length > 0
        ];
      }
    )
  ) as Record<AdvisorRecommendationCategory, boolean>;

  return {
    candidate,
    action:
      removedSlotId === null
        ? { kind: "add", removedSlotId: null, removedLabel: null }
        : {
            kind: "replace",
            removedSlotId,
            removedLabel:
              getRemovedLabel(input.team, removedSlotId) ?? "現在のメンバー"
          },
    beforeTeam,
    afterTeam,
    beforeIssues,
    afterIssues,
    beforeThreats,
    afterThreats,
    beforeThreatAverage,
    afterThreatAverage,
    threatAverageDelta:
      beforeThreatAverage !== null && afterThreatAverage !== null
        ? afterThreatAverage - beforeThreatAverage
        : null,
    improvementScore,
    categoryScores,
    categoryReasons,
    recommendationRoles,
    selectedOverallRole: null,
    improvements: notes.improvements,
    cautions: notes.cautions,
    lostRoles,
    metrics: {
      threatReduction,
      issueReduction,
      consistencyReduction,
      defensiveImprovement,
      offensiveImprovement,
      speedRoleImprovement,
      roleLossCount: lostRoles.length,
      uniqueImmunityLossCount: uniqueImmunityLosses.length,
      uniqueResistanceLossCount: uniqueResistanceLosses.length,
      uniqueThreatAnswerLossCount: threatAnswerLosses.length,
      newMajorWeaknessCount: newMajorWeaknesses.length,
      usageTieBreaker,
      threatMoveImmunityCount: evidence.threatMoveImmunityCount,
      threatMoveResistanceCount: evidence.threatMoveResistanceCount,
      stableCheckCount: evidence.stableCheckCount,
      physicalThreatCheckCount: evidence.physicalThreatCheckCount,
      specialThreatCheckCount: evidence.specialThreatCheckCount,
      popularMoveCoverageCount: evidence.popularMoveCoverageCount,
      profileSpeedAdvantageCount:
        evidence.profileSpeedAdvantageCount,
      physicalWallImprovement,
      specialWallImprovement,
      physicalAttackerImprovement,
      specialAttackerImprovement,
      recoveryMoveShare: evidence.recoveryMoveShare,
      defensiveAbilityShare: evidence.defensiveAbilityShare,
      mainstreamPhysicalShare: evidence.mainstreamPhysicalShare,
      mainstreamSpecialShare: evidence.mainstreamSpecialShare,
      megaCountBefore,
      megaCountAfter,
      megaLimitPassed
    },
    isRecommendation,
    isRecommendationByCategory
  };
}

function comparePlansForCategory(
  category: AdvisorRecommendationCategory,
  left: AdvisorSwapPlan,
  right: AdvisorSwapPlan
): number {
  return (
    right.categoryScores[category] - left.categoryScores[category] ||
    right.improvementScore - left.improvementScore ||
    right.metrics.threatReduction - left.metrics.threatReduction ||
    right.metrics.issueReduction - left.metrics.issueReduction ||
    right.metrics.usageTieBreaker - left.metrics.usageTieBreaker ||
    left.candidate.pokemon.speciesId - right.candidate.pokemon.speciesId ||
    left.candidate.pokemon.formOrder - right.candidate.pokemon.formOrder
  );
}

function getCandidateProxyScore(
  category: Exclude<AdvisorRecommendationCategory, "typeSpecific">,
  candidate: TeamAdvisorCandidate,
  environmentBySlug: Map<string, ThreatEnvironmentDataset["pokemon"][number]>,
  profile: TeamProfile
): number {
  const stats = candidate.pokemon.baseStats;
  const environment = environmentBySlug.get(candidate.pokemon.slug);
  const recoveryShare = Math.max(
    0,
    ...(environment?.moves
      .filter(
        (move) =>
          move.damageClass === "status" && RECOVERY_MOVE_IDS.has(move.id)
      )
      .map((move) => move.share) ?? [])
  );
  if (category === "defensive") {
    const physicalBulk = stats ? stats.hp + stats.defense : 0;
    const specialBulk = stats ? stats.hp + stats.specialDefense : 0;
    return (
      candidate.metrics.threatResponsePoints * 4 +
      candidate.metrics.issueResolutionPoints * 2 +
      Math.max(0, candidate.metrics.rolePoints) +
      Math.max(physicalBulk, specialBulk) / 20 +
      recoveryShare * 12
    );
  }
  if (category === "offensive") {
    return (
      candidate.metrics.offensePoints * 4 +
      candidate.metrics.threatResponsePoints * 2 +
      Math.max(stats?.attack ?? 0, stats?.specialAttack ?? 0) / 8 +
      (stats?.speed ?? 0) / 20
    );
  }
  if (category === "speed") {
    const profileSpeedValue =
      profile === "trick-room"
        ? Math.max(0, 100 - (stats?.speed ?? 100)) / 3
        : (stats?.speed ?? 0) / 4;
    return (
      profileSpeedValue +
      candidate.metrics.threatResponsePoints * 2 +
      candidate.metrics.offensePoints * 2 +
      candidate.metrics.rolePoints
    );
  }
  return candidate.score;
}

function preselectSimulationCandidates(
  input: AdvisorSwapSimulationInput
): TeamAdvisorCandidate[] {
  const profile = input.profile ?? "standard";
  const environmentBySlug = new Map(
    input.environmentDataset?.pokemon.map((entry) => [entry.slug, entry]) ?? []
  );
  const pool =
    input.advisor.candidatePool.length > 0
      ? input.advisor.candidatePool
      : input.advisor.candidates;
  const selected = new Map<string, TeamAdvisorCandidate>();
  for (const category of [
    "overall",
    "defensive",
    "offensive",
    "speed"
  ] as const) {
    [...pool]
      .sort(
        (left, right) =>
          getCandidateProxyScore(category, right, environmentBySlug, profile) -
            getCandidateProxyScore(category, left, environmentBySlug, profile) ||
          left.pokemon.id - right.pokemon.id
      )
      .slice(0, ADVISOR_RECOMMENDATION_RULES.preselectPerCategory)
      .forEach((candidate) => selected.set(candidate.pokemon.slug, candidate));
  }
  input.advisor.candidates.forEach((candidate) =>
    selected.set(candidate.pokemon.slug, candidate)
  );
  return [...selected.values()];
}

function getBestPlansBySpecies(
  plans: AdvisorSwapPlan[],
  category: AdvisorRecommendationCategory,
  type?: TypeName
): AdvisorSwapPlan[] {
  const bestBySpecies = new Map<number, AdvisorSwapPlan>();
  for (const plan of plans) {
    if (
      !plan.isRecommendationByCategory[category] ||
      plan.categoryScores[category] <= 0 ||
      (type && !plan.candidate.pokemon.types.includes(type))
    ) {
      continue;
    }
    const speciesId = plan.candidate.pokemon.speciesId;
    const current = bestBySpecies.get(speciesId);
    if (!current || comparePlansForCategory(category, plan, current) < 0) {
      bestBySpecies.set(speciesId, plan);
    }
  }
  return [...bestBySpecies.values()].sort((left, right) =>
    comparePlansForCategory(category, left, right)
  );
}

function isMegaPlan(plan: AdvisorSwapPlan): boolean {
  return plan.candidate.pokemon.formKind === "mega";
}

function selectCategoryPlans(
  plans: AdvisorSwapPlan[],
  category: AdvisorRecommendationCategory,
  type?: TypeName
): AdvisorSwapPlan[] {
  const selected: AdvisorSwapPlan[] = [];
  let megaCount = 0;
  for (const plan of getBestPlansBySpecies(plans, category, type)) {
    if (
      isMegaPlan(plan) &&
      megaCount >= ADVISOR_RECOMMENDATION_RULES.maxMegaInOverall
    ) {
      continue;
    }
    selected.push(plan);
    if (isMegaPlan(plan)) megaCount += 1;
    if (selected.length >= ADVISOR_RECOMMENDATION_RULES.maxPerCategory) break;
  }
  return selected;
}

function selectDiverseOverallPlans(plans: AdvisorSwapPlan[]): AdvisorSwapPlan[] {
  const ranked = getBestPlansBySpecies(plans, "overall");
  const topScore = ranked[0]?.categoryScores.overall ?? 0;
  const qualified = ranked.filter(
    (plan) =>
      plan.categoryScores.overall >=
      topScore - ADVISOR_RECOMMENDATION_RULES.overallScoreWindow
  );
  const selected: AdvisorSwapPlan[] = [];
  const roleCounts = new Map<AdvisorRecommendationRole, number>();
  let megaCount = 0;

  for (const plan of qualified) {
    const role = [...plan.recommendationRoles]
      .sort(
        (left, right) =>
          (roleCounts.get(left) ?? 0) - (roleCounts.get(right) ?? 0) ||
          left.localeCompare(right)
      )
      .find(
        (candidateRole) =>
          (roleCounts.get(candidateRole) ?? 0) <
          ADVISOR_RECOMMENDATION_RULES.maxSameRole
      );
    if (!role) continue;
    if (
      isMegaPlan(plan) &&
      megaCount >= ADVISOR_RECOMMENDATION_RULES.maxMegaInOverall
    ) {
      continue;
    }
    selected.push({ ...plan, selectedOverallRole: role });
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    if (isMegaPlan(plan)) megaCount += 1;
    if (selected.length >= ADVISOR_RECOMMENDATION_RULES.maxPerCategory) break;
  }
  return selected;
}

function getTypePlanGroups(
  plans: AdvisorSwapPlan[]
): {
  typePlans: Partial<Record<TypeName, AdvisorSwapPlan[]>>;
  typeOptions: Array<{ type: TypeName; label: string }>;
} {
  const groups = getAllTypes().flatMap((entry) => {
    const typePlans = selectCategoryPlans(
      plans,
      "typeSpecific",
      entry.nameEn
    );
    if (!typePlans.length) return [];
    return [{ type: entry.nameEn, label: entry.nameJa, plans: typePlans }];
  });
  groups.sort(
    (left, right) =>
      (right.plans[0]?.categoryScores.typeSpecific ?? 0) -
        (left.plans[0]?.categoryScores.typeSpecific ?? 0) ||
      left.type.localeCompare(right.type)
  );
  const selectedGroups = groups.slice(
    0,
    ADVISOR_RECOMMENDATION_RULES.maxTypeOptions
  );
  return {
    typePlans: Object.fromEntries(
      selectedGroups.map((group) => [group.type, group.plans])
    ),
    typeOptions: selectedGroups.map(({ type, label }) => ({ type, label }))
  };
}

function emptySimulation(): AdvisorSwapSimulation {
  return {
    plans: [],
    plansByCategory: {
      overall: [],
      defensive: [],
      offensive: [],
      speed: []
    },
    typePlans: {},
    typeOptions: [],
    candidatePoolCount: 0,
    evaluatedPatternCount: 0,
    recomputedThreatAnalysisCount: 0,
    rejectedPlanCount: 0
  };
}

export function getAdvisorSwapSimulation(
  input: AdvisorSwapSimulationInput
): AdvisorSwapSimulation {
  const summary = summarizeTeam(input.team);
  const candidatePool = preselectSimulationCandidates(input);
  if (summary.members.length < 2 || candidatePool.length === 0) {
    return emptySimulation();
  }

  const memberSlotIds = summary.members.map((member) => member.slotId);
  const patternSlotIds: Array<string | null> =
    summary.members.length < MAX_TEAM_SIZE
      ? [null, ...memberSlotIds]
      : memberSlotIds;
  const teamSpeciesIds = new Set(
    getPokemonMembers(input.team).map((pokemon) => pokemon.speciesId)
  );
  const seenCandidateSlugs = new Set<string>();
  const eligibleCandidates = candidatePool.filter((candidate) => {
    const speciesId = candidate.pokemon.speciesId;
    const slug = candidate.pokemon.slug;
    if (teamSpeciesIds.has(speciesId) || seenCandidateSlugs.has(slug)) {
      return false;
    }
    seenCandidateSlugs.add(slug);
    return true;
  });
  const allPlans = eligibleCandidates.flatMap((candidate) =>
    patternSlotIds.map((removedSlotId) =>
      evaluateAdvisorSwapPlan(input, candidate, removedSlotId)
    )
  );
  const overallPlans = selectDiverseOverallPlans(allPlans);
  const plansByCategory = {
    overall: overallPlans,
    defensive: selectCategoryPlans(allPlans, "defensive"),
    offensive: selectCategoryPlans(allPlans, "offensive"),
    speed: selectCategoryPlans(allPlans, "speed")
  };
  const typeGroups = getTypePlanGroups(allPlans);
  return {
    plans: overallPlans,
    plansByCategory,
    typePlans: typeGroups.typePlans,
    typeOptions: typeGroups.typeOptions,
    candidatePoolCount: eligibleCandidates.length,
    evaluatedPatternCount: allPlans.length,
    recomputedThreatAnalysisCount: allPlans.length,
    rejectedPlanCount:
      allPlans.length - allPlans.filter((plan) => plan.isRecommendation).length
  };
}
