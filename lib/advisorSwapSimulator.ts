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
  ADVISOR_USAGE_THRESHOLDS,
  evaluateAdvisorThreatCoverage,
  isAdvisorThreatCoverageEligible,
  type AdvisorThreatCoverage
} from "@/lib/advisorThreatCoverage";
import {
  MIN_THREAT_USAGE_RATE,
  isThreatPokemonCandidate,
  type ThreatPokemonAnalysis
} from "@/lib/teamThreats";
import {
  getThreatSnapshot,
  type ThreatSnapshot
} from "@/lib/threatSnapshot";
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
  getTrickRoomLowSpeedBonusMultiplier,
  isProfileSpeedAdvantage,
  PROFILE_SPEED_WEIGHTS,
  TEAM_PROFILE_CONFIG,
  TEAM_SPEED_THRESHOLDS,
  TRICK_ROOM_RECOMMENDATION_CONFIG,
  type TeamProfile
} from "@/lib/teamProfile";
import {
  deduplicateAdvisorEvidence,
  selectAdvisorEvidence,
  scoreAdvisorEvidence,
  type AdvisorEvidence,
  type AdvisorEvidenceScore
} from "@/lib/advisorEvidence";
import {
  ADVISOR_MEGA_RECOMMENDATION_RULES,
  canRecommendMegaCandidate,
  type MegaRecommendationActionKind
} from "@/lib/advisorMegaRecommendation";

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
  recommendedMegaLimit:
    ADVISOR_MEGA_RECOMMENDATION_RULES.standardMegaLimit
} as const;

export const ADVISOR_PROGRESSIVE_MINIMUM_USAGE = 0.001;

export const ADVISOR_THREAT_WARNING_RULES = {
  minimumUsageRate: MIN_THREAT_USAGE_RATE,
  minimumRankRise: 3,
  minimumScoreIncrease: 3
} as const;

export const ADVISOR_RECOMMENDATION_RULES = {
  maxPerCategory: 5,
  maxPerThreatMode: 6,
  preselectPerCategory: 36,
  preselectByThreatCoverage: 48,
  preselectPerType: 6,
  preselectTrickRoomSlowRole: 32,
  preselectTrickRoomFallbackRole: 16,
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

export type AdvisorProfileRole =
  | "trickRoomSetter"
  | "slowAttacker"
  | "midSpeedFlexible"
  | "fastFallback"
  | "priorityUser"
  | "defensiveSupport"
  | "typeCoverage";

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
  quadWeakCounts: Record<TypeName, number>;
  coverCounts: Record<TypeName, number>;
  immunityCounts: Record<TypeName, number>;
  offenseCoverageCount: number;
  missingOffenseCount: number;
  threatAnswerSlotCount: number;
  roles: AdvisorRoleCounts;
};

export type AdvisorSwapAction =
  | { kind: "add"; removedSlotId: null; removedLabel: null }
  | { kind: "replace"; removedSlotId: string; removedLabel: string }
  | {
      kind: "form-change";
      removedSlotId: string;
      removedLabel: string;
    };

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
  standardSpeedAdvantageCount: number;
  priorityMoveShare: number;
  priorityMoveName: string | null;
  trickRoomMoveShare: number;
  trickRoomMoveName: string | null;
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
  megaRecommendationPassed: boolean;
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
  threatSnapshot: ThreatSnapshot;
  postActionThreatSnapshot: ThreatSnapshot;
  threatUnion: ThreatPokemonAnalysis[];
  beforeThreatAverage: number | null;
  afterThreatAverage: number | null;
  threatAverageDelta: number | null;
  improvementScore: number;
  categoryScores: Record<AdvisorRecommendationCategory, number>;
  categoryEvidenceIds: Record<AdvisorRecommendationCategory, string[]>;
  recommendationRoles: AdvisorRecommendationRole[];
  selectedOverallRole: AdvisorRecommendationRole | null;
  profileRoles: AdvisorProfileRole[];
  threatCoverage: AdvisorThreatCoverage;
  recommendationThreatCoverage: AdvisorThreatCoverage;
  evidence: AdvisorEvidence[];
  evidenceScore: AdvisorEvidenceScore;
  targetThreatImpacts: AdvisorTargetThreatImpact[];
  lostRoles: string[];
  metrics: AdvisorSwapPlanMetrics;
  isRecommendation: boolean;
  isRecommendationByCategory: Record<AdvisorRecommendationCategory, boolean>;
};

export type AdvisorThreatExploreMode =
  | "recommended"
  | "stableSwitch"
  | "revengeKill"
  | "type";

export type AdvisorTargetThreatImpact = {
  threatId: string;
  beforeRank: number | null;
  afterRank: number | null;
  beforeScore: number | null;
  afterScore: number | null;
  scoreDelta: number | null;
};

export type AdvisorThreatRecommendationGroup = {
  threat: ThreatPokemonAnalysis;
  plansByMode: Record<
    Exclude<AdvisorThreatExploreMode, "type">,
    AdvisorSwapPlan[]
  >;
  typePlans: Partial<Record<TypeName, AdvisorSwapPlan[]>>;
};

export type AdvisorSwapSimulation = {
  threatSnapshot: ThreatSnapshot;
  /**
   * Read-only debug surface for Recommendation Analyzer. Recommendation
   * selection continues to use the derived collections below.
   */
  evaluatedPlans: AdvisorSwapPlan[];
  plans: AdvisorSwapPlan[];
  /**
   * All evaluated empty-slot additions. Progressive phases rank only this
   * collection so replacement role loss can never be mixed into add results.
   */
  additionPlans: AdvisorSwapPlan[];
  plansByCategory: Record<
    Exclude<AdvisorRecommendationCategory, "typeSpecific">,
    AdvisorSwapPlan[]
  >;
  typePlans: Partial<Record<TypeName, AdvisorSwapPlan[]>>;
  typeOptions: Array<{ type: TypeName; label: string }>;
  threatRecommendations: AdvisorThreatRecommendationGroup[];
  threatTypeOptions: Array<{ type: TypeName; label: string }>;
  formChangePlans: AdvisorSwapPlan[];
  candidatePoolCount: number;
  megaRecommendationStats: {
    candidatePoolBeforeMegaFilter: number;
    candidatePoolAfterMegaFilter: number;
    actionPatternsBeforeMegaFilter: number;
    actionPatternsAfterMegaFilter: number;
  };
  evaluatedPatternCount: number;
  recomputedThreatAnalysisCount: number;
  rejectedPlanCount: number;
};

export type AdvisorSwapSimulationInput = {
  team: TeamSlot[];
  advisor: TeamAdvisorAnalysis;
  availablePokemon: PokemonEntry[];
  environmentDataset: ThreatEnvironmentDataset | null;
  threatSnapshot: ThreatSnapshot;
  profile?: TeamProfile;
};

type AdvisorCandidateEvidence = {
  threatMoveImmunityCount: number;
  threatMoveResistanceCount: number;
  stableCheckCount: number;
  physicalThreatCheckCount: number;
  specialThreatCheckCount: number;
  popularMoveCoverageCount: number;
  profileSpeedAdvantageCount: number;
  standardSpeedAdvantageCount: number;
  priorityMoveShare: number;
  priorityMoveName: string | null;
  trickRoomMoveShare: number;
  trickRoomMoveName: string | null;
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
    standardSpeedAdvantageCount: 0,
    priorityMoveShare: 0,
    priorityMoveName: null,
    trickRoomMoveShare: 0,
    trickRoomMoveName: null,
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
    standardSpeedAdvantageCount:
      candidate.standardSpeedAdvantageCount -
      replaced.standardSpeedAdvantageCount,
    priorityMoveShare: candidate.priorityMoveShare - replaced.priorityMoveShare,
    priorityMoveName:
      candidate.priorityMoveShare > replaced.priorityMoveShare
        ? candidate.priorityMoveName
        : null,
    trickRoomMoveShare:
      candidate.trickRoomMoveShare - replaced.trickRoomMoveShare,
    trickRoomMoveName:
      candidate.trickRoomMoveShare > replaced.trickRoomMoveShare
        ? candidate.trickRoomMoveName
        : null,
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
  let standardSpeedAdvantageCount = 0;
  const defensiveReasons: Array<{ text: string; share: number }> = [];
  const offensiveReasons: Array<{ text: string; share: number }> = [];
  const candidateMoves = getEnvironmentAttackingMoves(
    candidateEnvironment?.moves
  );

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
    if (
      candidate.baseStats &&
      threat.pokemon.baseStats &&
      candidate.baseStats.speed > threat.pokemon.baseStats.speed
    ) {
      standardSpeedAdvantageCount += 1;
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
  const priorityMove = (candidateEnvironment?.moves ?? [])
    .filter(
      (move) =>
        TRICK_ROOM_RECOMMENDATION_CONFIG.priorityMoveIds.includes(
          move.id as (typeof TRICK_ROOM_RECOMMENDATION_CONFIG.priorityMoveIds)[number]
        ) &&
        move.damageClass !== "status" &&
        move.share >=
          TRICK_ROOM_RECOMMENDATION_CONFIG.adoptedMoveMinimumShare
    )
    .sort((left, right) => right.share - left.share)[0];
  const trickRoomMove = (candidateEnvironment?.moves ?? [])
    .filter(
      (move) =>
        move.id === "trickroom" &&
        move.share >=
          TRICK_ROOM_RECOMMENDATION_CONFIG.adoptedMoveMinimumShare
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
    standardSpeedAdvantageCount,
    priorityMoveShare: priorityMove?.share ?? 0,
    priorityMoveName: priorityMove?.name ?? null,
    trickRoomMoveShare: trickRoomMove?.share ?? 0,
    trickRoomMoveName: trickRoomMove?.name ?? null,
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
  const quadWeakCounts = {} as Record<TypeName, number>;
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
    quadWeakCounts[type.nameEn] = row?.multiplierMap.quadWeak ?? 0;
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
    quadWeakCounts,
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
  const topThreats = threats.slice(0, 5);
  return Math.round(
    topThreats.reduce((total, threat) => total + threat.score, 0) /
      topThreats.length
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
  const fastImprovement = weightedDelta(
    fastDelta,
    weights.fastRoleGain,
    weights.fastRoleLoss
  );
  const slowGainWeight =
    profile === "trick-room" && slowDelta > 0
      ? weights.slowRoleGain *
        getTrickRoomLowSpeedBonusMultiplier(before.slow)
      : weights.slowRoleGain;
  const slowImprovement = weightedDelta(
    slowDelta,
    slowGainWeight,
    weights.slowRoleLoss
  );
  return fastImprovement + slowImprovement;
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
  evidence,
  profile,
  counterplayScore
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
  profile: TeamProfile;
  counterplayScore: number;
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
  const standardFallbackSupport =
    profile === "trick-room"
      ? evidence.standardSpeedAdvantageCount * 1.5 +
        evidence.priorityMoveShare * 8
      : Math.max(0, speedRoleImprovement) * offensive.speedSupport;

  return {
    overall: improvementScore,
    defensive: Math.round(
      counterplayScore * 0.3 +
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
      counterplayScore * 0.4 +
      threatReduction * offensive.threatReduction +
        issueReduction * offensive.issueReduction +
        offensiveImprovement * offensive.offensiveImprovement +
        evidence.popularMoveCoverageCount *
          offensive.popularMoveCoverage +
        mainstreamAttackerRoleGain * offensive.attackerRoleGap +
        standardFallbackSupport -
        defensiveLosses * offensive.defensiveLossPenalty -
        newMajorWeaknessCount * offensive.newWeaknessPenalty
    ),
    speed: Math.round(
      counterplayScore * 0.25 +
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
      counterplayScore * 0.35 +
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

function getAdvisorProfileRoles({
  pokemon,
  evidence,
  consistencyReduction,
  defensiveImprovement,
  offensiveImprovement
}: {
  pokemon: PokemonEntry;
  evidence: AdvisorCandidateEvidence;
  consistencyReduction: number;
  defensiveImprovement: number;
  offensiveImprovement: number;
}): AdvisorProfileRole[] {
  const roles: AdvisorProfileRole[] = [];
  const speed = pokemon.baseStats?.speed;
  const hasAdoptedAttack =
    evidence.popularMoveCoverageCount > 0 ||
    evidence.priorityMoveShare > 0;
  const hasAttackingStats =
    Math.max(
      pokemon.baseStats?.attack ?? 0,
      pokemon.baseStats?.specialAttack ?? 0
    ) >= ATTACKER_STAT_THRESHOLD ||
    evidence.mainstreamPhysicalShare + evidence.mainstreamSpecialShare >= 0.5;

  if (evidence.trickRoomMoveShare > 0) roles.push("trickRoomSetter");
  if (evidence.priorityMoveShare > 0) roles.push("priorityUser");
  if (
    speed !== undefined &&
    speed <= TRICK_ROOM_RECOMMENDATION_CONFIG.lowSpeedThreshold &&
    hasAdoptedAttack &&
    hasAttackingStats
  ) {
    roles.push("slowAttacker");
  }
  if (
    speed !== undefined &&
    speed >= TEAM_SPEED_THRESHOLDS.mediumMinimum &&
    speed < TEAM_SPEED_THRESHOLDS.fastMinimum &&
    hasAdoptedAttack
  ) {
    roles.push("midSpeedFlexible");
  }
  if (
    speed !== undefined &&
    speed >= TEAM_SPEED_THRESHOLDS.fastMinimum &&
    hasAdoptedAttack
  ) {
    roles.push("fastFallback");
  }
  if (
    evidence.stableCheckCount > 0 ||
    evidence.recoveryMoveShare > 0 ||
    evidence.defensiveAbilityShare > 0
  ) {
    roles.push("defensiveSupport");
  }
  if (
    consistencyReduction > 0 ||
    defensiveImprovement > 0 ||
    offensiveImprovement > 0
  ) {
    roles.push("typeCoverage");
  }
  return uniqueText(roles) as AdvisorProfileRole[];
}

const PROFILE_ROLE_LOSS_LABELS: Partial<
  Record<AdvisorProfileRole, string>
> = {
  trickRoomSetter: "唯一のトリックルーム始動役",
  priorityUser: "唯一の先制技役",
  fastFallback: "唯一の通常時の高速保険",
  defensiveSupport: "唯一の耐久・サポート役"
};

function getTeamProfileRoleCounts(
  team: TeamSlot[],
  environmentDataset: ThreatEnvironmentDataset | null
): Map<AdvisorProfileRole, number> {
  const counts = new Map<AdvisorProfileRole, number>();
  const environmentBySlug = new Map(
    environmentDataset?.pokemon.map((entry) => [entry.slug, entry]) ?? []
  );
  for (const pokemon of getPokemonMembers(team)) {
    const environment = environmentBySlug.get(pokemon.slug);
    const adoptedMoves = environment?.moves.filter(
      (move) =>
        move.share >=
        TRICK_ROOM_RECOMMENDATION_CONFIG.adoptedMoveMinimumShare
    ) ?? [];
    const priorityMove = adoptedMoves.find(
      (move) =>
        move.damageClass !== "status" &&
        TRICK_ROOM_RECOMMENDATION_CONFIG.priorityMoveIds.includes(
          move.id as (typeof TRICK_ROOM_RECOMMENDATION_CONFIG.priorityMoveIds)[number]
        )
    );
    const trickRoomMove = adoptedMoves.find(
      (move) => move.id === "trickroom"
    );
    const evidence = {
      ...emptyCandidateEvidence(),
      popularMoveCoverageCount: adoptedMoves.some(
        (move) => move.damageClass !== "status"
      )
        ? 1
        : 0,
      priorityMoveShare: priorityMove?.share ?? 0,
      priorityMoveName: priorityMove?.name ?? null,
      trickRoomMoveShare: trickRoomMove?.share ?? 0,
      trickRoomMoveName: trickRoomMove?.name ?? null,
      recoveryMoveShare:
        adoptedMoves.find(
          (move) =>
            move.damageClass === "status" && RECOVERY_MOVE_IDS.has(move.id)
        )?.share ?? 0,
      defensiveAbilityShare:
        environment?.abilities.find((ability) =>
          DEFENSIVE_ABILITY_IDS.has(ability.id)
        )?.share ?? 0
    };
    const roles = getAdvisorProfileRoles({
      pokemon,
      evidence,
      consistencyReduction: 0,
      defensiveImprovement: 0,
      offensiveImprovement: 0
    });
    for (const role of roles) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return counts;
}

function collectLostProfileRoles(
  before: Map<AdvisorProfileRole, number>,
  after: Map<AdvisorProfileRole, number>,
  profile: TeamProfile
): string[] {
  if (profile !== "trick-room") return [];
  return Object.entries(PROFILE_ROLE_LOSS_LABELS).flatMap(
    ([role, label]) =>
      (before.get(role as AdvisorProfileRole) ?? 0) === 1 &&
      (after.get(role as AdvisorProfileRole) ?? 0) === 0 &&
      label
        ? [label]
        : []
  );
}

function mergeThreatUnion(
  beforeThreats: ThreatPokemonAnalysis[],
  afterThreats: ThreatPokemonAnalysis[]
): ThreatPokemonAnalysis[] {
  const bySlug = new Map<string, ThreatPokemonAnalysis>();
  for (const threat of [...beforeThreats, ...afterThreats]) {
    const current = bySlug.get(threat.pokemon.slug);
    if (!current || threat.score > current.score) {
      bySlug.set(threat.pokemon.slug, threat);
    }
  }
  return [...bySlug.values()].sort(
    (left, right) =>
      right.score - left.score ||
      (right.environment?.usageRate ?? 0) -
        (left.environment?.usageRate ?? 0) ||
      left.pokemon.id - right.pokemon.id
  );
}

function getTargetThreatImpacts(
  beforeThreats: ThreatPokemonAnalysis[],
  afterThreats: ThreatPokemonAnalysis[]
): AdvisorTargetThreatImpact[] {
  const afterBySlug = new Map(
    afterThreats.map((threat, index) => [
      threat.pokemon.slug,
      { threat, rank: index + 1 }
    ])
  );
  return beforeThreats.slice(0, 5).map((threat, index) => {
    const after = afterBySlug.get(threat.pokemon.slug);
    const conservativeAfterScore =
      after?.threat.score ?? Math.max(0, threat.score - 15);
    return {
      threatId: threat.pokemon.slug,
      beforeRank: index + 1,
      afterRank: after?.rank ?? null,
      beforeScore: threat.score,
      afterScore: after?.threat.score ?? null,
      scoreDelta: conservativeAfterScore - threat.score
    };
  });
}

function maxThreatScore(threats: ThreatPokemonAnalysis[]): number {
  return threats.reduce((maximum, threat) => Math.max(maximum, threat.score), 0);
}

function expectedThreatScore(threats: ThreatPokemonAnalysis[]): number {
  const totalUsage = threats.reduce(
    (total, threat) => total + (threat.environment?.usageRate ?? 0),
    0
  );
  if (totalUsage <= 0) return averageThreatScore(threats) ?? 0;
  return threats.reduce(
    (total, threat) =>
      total + threat.score * (threat.environment?.usageRate ?? 0),
    0
  ) / totalUsage;
}

type AdvisorFunctionalSignature = {
  typeKey: string;
  roles: Set<string>;
  moveTypes: Set<string>;
  speedBand: "fast" | "medium" | "slow" | "unknown";
};

function getFunctionalSignature(
  pokemon: PokemonEntry,
  environmentDataset: ThreatEnvironmentDataset | null
): AdvisorFunctionalSignature {
  const stats = pokemon.baseStats;
  const environment = environmentDataset?.pokemon.find(
    (entry) => entry.slug === pokemon.slug
  );
  const roles = new Set<string>();
  if (stats) {
    if (stats.attack >= ATTACKER_STAT_THRESHOLD) roles.add("physical-offense");
    if (stats.specialAttack >= ATTACKER_STAT_THRESHOLD) roles.add("special-offense");
    if (stats.hp + stats.defense >= BULK_TOTAL_THRESHOLD && stats.defense >= BULK_STAT_THRESHOLD) {
      roles.add("physical-wall");
    }
    if (
      stats.hp + stats.specialDefense >= BULK_TOTAL_THRESHOLD &&
      stats.specialDefense >= BULK_STAT_THRESHOLD
    ) {
      roles.add("special-wall");
    }
  }
  if (
    environment?.moves.some(
      (move) =>
        TRICK_ROOM_RECOMMENDATION_CONFIG.priorityMoveIds.includes(
          move.id as (typeof TRICK_ROOM_RECOMMENDATION_CONFIG.priorityMoveIds)[number]
        ) && move.share >= TRICK_ROOM_RECOMMENDATION_CONFIG.adoptedMoveMinimumShare
    )
  ) {
    roles.add("priority");
  }
  if (environment?.moves.some((move) => move.id === "uturn" || move.id === "voltswitch" || move.id === "flipturn")) {
    roles.add("pivot");
  }
  const speedBand = !stats
    ? "unknown"
    : stats.speed >= TEAM_SPEED_THRESHOLDS.fastMinimum
      ? "fast"
      : stats.speed >= TEAM_SPEED_THRESHOLDS.mediumMinimum
        ? "medium"
        : "slow";
  return {
    typeKey: [...pokemon.types].sort().join("/"),
    roles,
    moveTypes: new Set(
      getEnvironmentAttackingMoves(environment?.moves).map((move) => move.type)
    ),
    speedBand
  };
}

function overlapRatio(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  const union = new Set([...left, ...right]);
  const intersection = [...left].filter((value) => right.has(value)).length;
  return union.size ? intersection / union.size : 0;
}

function getRedundancyEvidence(
  candidate: PokemonEntry,
  comparisonTeam: TeamSlot[],
  environmentDataset: ThreatEnvironmentDataset | null,
  candidateThreatAnswers: Set<string>,
  existingThreatAnswers: Set<string>
): AdvisorEvidence | null {
  const candidateSignature = getFunctionalSignature(candidate, environmentDataset);
  let strongest: { member: PokemonEntry; similarity: number } | null = null;
  const teamRoles = new Set<string>();
  const teamMoveTypes = new Set<string>();
  const teamAnswerIds = new Set<string>();
  const teamSpeedBands = new Set<string>();
  let teamHasExactType = false;
  for (const slot of comparisonTeam) {
    if (slot.mode !== "pokemon") continue;
    const member = getPokemonBySlug(slot.pokemonSlug);
    if (!member) continue;
    const signature = getFunctionalSignature(member, environmentDataset);
    signature.roles.forEach((role) => teamRoles.add(role));
    signature.moveTypes.forEach((type) => teamMoveTypes.add(type));
    teamSpeedBands.add(signature.speedBand);
    teamHasExactType ||= candidateSignature.typeKey === signature.typeKey;
    existingThreatAnswers.forEach((answer) => teamAnswerIds.add(answer));
    const exactTypes = candidateSignature.typeKey === signature.typeKey;
    const roleOverlap = overlapRatio(candidateSignature.roles, signature.roles);
    const moveOverlap = overlapRatio(candidateSignature.moveTypes, signature.moveTypes);
    const answerOverlap = overlapRatio(candidateThreatAnswers, existingThreatAnswers);
    const sameSpeedBand = candidateSignature.speedBand === signature.speedBand;
    const similarity =
      (exactTypes ? 0.24 : 0) +
      roleOverlap * 0.24 +
      moveOverlap * 0.2 +
      answerOverlap * 0.22 +
      (sameSpeedBand ? 0.1 : 0) +
      (exactTypes && moveOverlap >= 0.7 && answerOverlap >= 0.7 ? 0.15 : 0);
    if (!strongest || similarity > strongest.similarity) {
      strongest = { member, similarity };
    }
  }
  const hasUniqueTeamValue =
    [...candidateSignature.roles].some((role) => !teamRoles.has(role)) ||
    [...candidateSignature.moveTypes].some((type) => !teamMoveTypes.has(type)) ||
    [...candidateThreatAnswers].some((answer) => !teamAnswerIds.has(answer)) ||
    !teamSpeedBands.has(candidateSignature.speedBand);
  if (teamHasExactType && !hasUniqueTeamValue) {
    return {
      id: "redundancy:team-overlap",
      kind: "risk",
      primaryDimension: "riskPenalty",
      points: -24,
      displayText:
        "同タイプの既存枠と役割・攻撃範囲・回答対象・速度帯が重複し、独自価値がありません。",
      source: "team-delta",
      confidence: "high"
    };
  }
  if (!strongest || strongest.similarity < 0.78) return null;
  return {
    id: `redundancy:${strongest.member.speciesId}`,
    kind: "risk",
    primaryDimension: "riskPenalty",
    points: strongest.similarity >= 0.9 ? -22 : -14,
    displayText: `${strongest.member.nameJa}とタイプ・役割・攻撃範囲・回答対象が大きく重複します。`,
    source: "team-delta",
    confidence: "medium"
  };
}

function buildAdvisorPlanEvidence({
  candidate,
  comparisonTeam,
  beforeMetrics,
  afterMetrics,
  beforeThreats,
  afterThreats,
  currentDisplayedTop5,
  postActionTop5,
  currentFullThreatRanking,
  postActionFullThreatRanking,
  threatCoverage,
  displayThreatCoverage,
  actionKind,
  candidateEvidenceGain,
  lostRoles,
  threatAnswerLosses,
  environmentUsageRate,
  environmentDataset,
  profile
}: {
  candidate: PokemonEntry;
  comparisonTeam: TeamSlot[];
  beforeMetrics: AdvisorTeamMetrics;
  afterMetrics: AdvisorTeamMetrics;
  beforeThreats: ThreatPokemonAnalysis[];
  afterThreats: ThreatPokemonAnalysis[];
  currentDisplayedTop5: ThreatPokemonAnalysis[];
  postActionTop5: ThreatPokemonAnalysis[];
  currentFullThreatRanking: ThreatPokemonAnalysis[];
  postActionFullThreatRanking: ThreatPokemonAnalysis[];
  threatCoverage: AdvisorThreatCoverage;
  displayThreatCoverage: AdvisorThreatCoverage;
  actionKind: MegaRecommendationActionKind;
  candidateEvidenceGain: AdvisorCandidateEvidence;
  lostRoles: string[];
  threatAnswerLosses: string[];
  environmentUsageRate: number;
  environmentDataset: ThreatEnvironmentDataset | null;
  profile: TeamProfile;
}): AdvisorEvidence[] {
  const evidence: AdvisorEvidence[] = [];
  const currentTop5Ids = new Set(
    currentDisplayedTop5.map((threat) => threat.pokemon.slug)
  );
  const postActionTop5Ids = new Set(
    postActionTop5.map((threat) => threat.pokemon.slug)
  );
  const currentRankingBySlug = new Map(
    currentFullThreatRanking.map((threat, index) => [
      threat.pokemon.slug,
      { threat, rank: index + 1 }
    ])
  );
  const postActionRankingBySlug = new Map(
    postActionFullThreatRanking.map((threat, index) => [
      threat.pokemon.slug,
      { threat, rank: index + 1 }
    ])
  );
  const threatScope = (
    threatId: string
  ): "current-top5" | "post-action-top5" | "tracked-threat" =>
    currentTop5Ids.has(threatId)
      ? "current-top5"
      : postActionTop5Ids.has(threatId)
        ? "post-action-top5"
        : "tracked-threat";
  const threatContext = (threatId: string) => {
    const before = currentRankingBySlug.get(threatId);
    const after = postActionRankingBySlug.get(threatId);
    return {
      targetThreatId: threatId,
      beforeRank: before?.rank ?? null,
      afterRank: after?.rank ?? null,
      beforeScore: before?.threat.score ?? null,
      afterScore: after?.threat.score ?? null,
      usageRate:
        after?.threat.environment?.usageRate ??
        before?.threat.environment?.usageRate ??
        null
    };
  };
  for (const type of getAllTypes().map((entry) => entry.nameEn)) {
    const weakDelta = beforeMetrics.weakCounts[type] - afterMetrics.weakCounts[type];
    const coverDelta = afterMetrics.coverCounts[type] - beforeMetrics.coverCounts[type];
    const immunityDelta = afterMetrics.immunityCounts[type] - beforeMetrics.immunityCounts[type];
    const quadWeakDelta =
      afterMetrics.quadWeakCounts[type] - beforeMetrics.quadWeakCounts[type];
    const lostOnlyImmunity =
      beforeMetrics.immunityCounts[type] === 1 &&
      afterMetrics.immunityCounts[type] === 0;
    const positive = Math.max(0, weakDelta) * 3 + Math.max(0, coverDelta) * 2 + Math.max(0, immunityDelta) * 3;
    const negative =
      Math.max(0, -weakDelta) * 5 +
      Math.max(0, quadWeakDelta) * 16 +
      Math.max(0, -coverDelta) * 3 +
      Math.max(0, -immunityDelta) * 4 +
      (lostOnlyImmunity ? 12 : 0);
    if (positive > 0) {
      evidence.push({
        id: `defense:${type}`,
        kind: "type-delta",
        primaryDimension: "defensiveImprovement",
        points: Math.min(9, positive),
        displayText: `${getTypeLabel(type)}への受け方を改善します。`,
        source: "team-delta",
        confidence: "high",
        type,
        beforeValue: beforeMetrics.weakCounts[type],
        afterValue: afterMetrics.weakCounts[type]
      });
    }
    if (negative > 0) {
      evidence.push({
        id: `risk:type:${type}`,
        kind: "risk",
        primaryDimension: "riskPenalty",
        points: -Math.min(20, negative),
        displayText: lostOnlyImmunity
          ? `唯一の${getTypeLabel(type)}無効枠を失います。`
          : `${getTypeLabel(type)}への弱点・受け先が悪化します。`,
        source: "team-delta",
        confidence: "high",
        type,
        beforeValue: beforeMetrics.weakCounts[type],
        afterValue: afterMetrics.weakCounts[type]
      });
    }
  }

  const offenseDelta = afterMetrics.offenseCoverageCount - beforeMetrics.offenseCoverageCount;
  if (offenseDelta > 0) {
    evidence.push({
      id: "offense:coverage",
      kind: "offense-delta",
      primaryDimension: "offensiveImprovement",
      points: Math.min(12, offenseDelta * 3),
      displayText: `一致技の攻撃範囲を${offenseDelta}タイプ増やします。`,
      source: "team-delta",
      confidence: "high",
      beforeValue: beforeMetrics.offenseCoverageCount,
      afterValue: afterMetrics.offenseCoverageCount
    });
  }

  if (candidateEvidenceGain.recoveryMoveShare > 0 && candidateEvidenceGain.recoveryReason) {
    evidence.push({
      id: "role:recovery",
      kind: "role-delta",
      primaryDimension: "roleImprovement",
      points: Math.min(16, candidateEvidenceGain.recoveryMoveShare * 18),
      displayText: candidateEvidenceGain.recoveryReason,
      source: "role-delta",
      confidence: "medium"
    });
  }
  if (
    candidateEvidenceGain.defensiveAbilityShare > 0 &&
    candidateEvidenceGain.defensiveAbilityReason
  ) {
    evidence.push({
      id: "role:defensive-ability",
      kind: "role-delta",
      primaryDimension: "roleImprovement",
      points: Math.min(5, candidateEvidenceGain.defensiveAbilityShare * 5),
      displayText: candidateEvidenceGain.defensiveAbilityReason,
      source: "role-delta",
      confidence: "medium"
    });
  }

  const roleDeltas: Array<[keyof AdvisorRoleCounts, string]> = [
    ["physicalAttacker", "物理アタッカー"],
    ["specialAttacker", "特殊アタッカー"],
    ["physicalWall", "物理耐久役"],
    ["specialWall", "特殊耐久役"],
    [TEAM_PROFILE_CONFIG[profile].activeSpeedRole, TEAM_PROFILE_CONFIG[profile].speedRoleLabel]
  ];
  for (const [role, label] of roleDeltas) {
    const isProfileSpeedRole = role === "fast" || role === "slow";
    const roleIncreased = afterMetrics.roles[role] > beforeMetrics.roles[role];
    if (
      roleIncreased &&
      (isProfileSpeedRole || beforeMetrics.roles[role] === 0)
    ) {
      const speedRolePoints =
        profile === "trick-room"
          ? beforeMetrics.roles.slow === 0
            ? 8
            : beforeMetrics.roles.slow === 1
              ? 5
              : beforeMetrics.roles.slow === 2
                ? 2
                : 0
          : 6;
      if (isProfileSpeedRole && speedRolePoints <= 0) continue;
      const speedReason =
        profile === "trick-room"
          ? `こちらの${candidateEvidenceGain.profileSpeedAdvantageCount}体より遅く、トリックルーム下で先に動きやすい候補です。`
          : `こちらの${candidateEvidenceGain.profileSpeedAdvantageCount}体より速く、通常時に先手を取りやすい候補です。`;
      evidence.push({
        id: `role:${role}`,
        kind: isProfileSpeedRole ? "speed-delta" : "role-delta",
        primaryDimension: isProfileSpeedRole
          ? "speedImprovement"
          : "roleImprovement",
        points: isProfileSpeedRole ? speedRolePoints : 7,
        displayText: isProfileSpeedRole
          ? speedReason
          : `${label}を新しく追加します。`,
        source: "role-delta",
        confidence: isProfileSpeedRole ? "medium" : "high"
      });
    }
  }
  if (
    profile === "trick-room" &&
    afterMetrics.roles.fast > beforeMetrics.roles.fast
  ) {
    evidence.push({
      id: "role:fast-fallback",
      kind: "role-delta",
      primaryDimension: "roleImprovement",
      points: 14,
      displayText: "トリックルーム外で動ける高速の保険を追加します。",
      source: "role-delta",
      confidence: "medium"
    });
  }

  const resolvedIssueCount = Math.max(
    0,
    beforeMetrics.issueIds.length - afterMetrics.issueIds.length
  );
  if (resolvedIssueCount > 0) {
    evidence.push({
      id: "issues:resolved",
      kind: "issue-delta",
      primaryDimension: "teamIssueImprovement",
      points: Math.min(15, resolvedIssueCount * 7),
      displayText: `現在の課題を${resolvedIssueCount}件解消します。`,
      source: "team-delta",
      confidence: "high",
      beforeValue: beforeMetrics.issueIds.length,
      afterValue: afterMetrics.issueIds.length
    });
  }

  const clearAnswerIds = new Set<string>();
  const existingAnswerIds = new Set(
    threatCoverage.threatAnswers
      .filter((answer) => answer.currentTeamHasAnswer)
      .map((answer) => answer.threatId)
  );
  for (const answer of threatCoverage.threatAnswers) {
    if (
      answer.answerClass !== "stableSwitch" &&
      answer.answerClass !== "revengeKill"
    ) {
      continue;
    }
    clearAnswerIds.add(answer.threatId);
    if (!answer.currentTeamHasAnswer) {
      evidence.push({
        id: `threat-answer:${answer.threatId}`,
        kind: "counterplay",
        primaryDimension: "targetCounterplay",
        points: answer.answerClass === "stableSwitch" ? 10 : 8,
        displayText:
          answer.primaryReason ??
          `${answer.threatId}へ新しい回答を追加します。`,
        source: "threat-union",
        confidence: answer.confidence,
        scope: threatScope(answer.threatId),
        targetThreat: answer.threatId,
        ...threatContext(answer.threatId)
      });
    }
  }

  for (const answer of displayThreatCoverage.threatAnswers) {
    if (
      answer.answerClass === "notCounter" ||
      answer.answerClass === "coverageOnly" ||
      !answer.primaryReason
    ) {
      continue;
    }
    if (!currentTop5Ids.has(answer.threatId)) continue;
    evidence.push({
      id: `display-threat-answer:${answer.threatId}`,
      kind: "counterplay",
      primaryDimension: "targetCounterplay",
      // Display-scope Evidence must not alter the established recommendation
      // score. The recommendation engine has already scored its tracked set.
      points: 0,
      displayText: answer.primaryReason,
      source: "threat-union",
      confidence: answer.confidence,
      scope: "current-top5",
      ...threatContext(answer.threatId)
    });
  }

  if (lostRoles.length > 0 || threatAnswerLosses.length > 0) {
    const roleText = lostRoles.length
      ? `${lostRoles.join("・")}を失います`
      : null;
    const answerText = threatAnswerLosses.length
      ? `要警戒相手への既存回答を${threatAnswerLosses.length}件失います`
      : null;
    evidence.push({
      id: "risk:removed-member-loss",
      kind: "risk",
      primaryDimension: "riskPenalty",
      points: -Math.min(
        20,
        lostRoles.length * 9 + threatAnswerLosses.length * 7
      ),
      displayText: `${[roleText, answerText].filter(Boolean).join("。")}。`,
      source: "role-delta",
      confidence: "high"
    });
  }

  const beforeMax = maxThreatScore(beforeThreats);
  const afterMax = maxThreatScore(afterThreats);
  const beforeExpected = expectedThreatScore(beforeThreats);
  const afterExpected = expectedThreatScore(afterThreats);
  const maximumImprovement = Math.max(0, beforeMax - afterMax);
  const expectedImprovement = Math.max(0, beforeExpected - afterExpected);
  if (maximumImprovement > 0 || expectedImprovement >= 0.5) {
    evidence.push({
      id: "threat-delta:overall",
      kind: "threat-delta",
      primaryDimension: "postSwapThreatRisk",
      points: Math.min(
        25,
        Math.ceil(maximumImprovement / 2) +
          Math.ceil(expectedImprovement)
      ),
      displayText: `交換後の最大脅威 ${beforeMax} → ${afterMax}、期待脅威 ${Math.round(beforeExpected)} → ${Math.round(afterExpected)}です。`,
      source: "threat-union",
      confidence: "high",
      scope: "tracked-threat",
      beforeValue: beforeExpected,
      afterValue: afterExpected
    });
  }
  const beforeIds = new Set(beforeThreats.map((threat) => threat.pokemon.slug));
  const emerged = afterThreats.filter((threat) => !beforeIds.has(threat.pokemon.slug));
  const beforeRanks = new Map(
    beforeThreats.map((threat, index) => [threat.pokemon.slug, index + 1])
  );
  const risen = afterThreats.filter((threat, index) => {
    const beforeRank = beforeRanks.get(threat.pokemon.slug);
    return beforeRank !== undefined && beforeRank - (index + 1) >= 2;
  });
  const maximumWorsening = Math.max(0, afterMax - beforeMax);
  const expectedWorsening = Math.max(0, afterExpected - beforeExpected);
  const postSwapRiskPoints =
    Math.ceil(maximumWorsening / 2) +
    Math.ceil(expectedWorsening) +
    emerged.length * 4 +
    risen.length * 3;
  if (postSwapRiskPoints > 0) {
    const primaryChange =
      emerged[0] ??
      risen[0] ??
      afterThreats.find((threat) => threat.score === afterMax);
    evidence.push({
      id: "risk:post-swap-threat-summary",
      kind: "risk",
      primaryDimension: "riskPenalty",
      points: -Math.min(20, postSwapRiskPoints),
      displayText: emerged.length
        ? `交換後に${primaryChange?.pokemon.nameJa ?? "新しい要警戒候補"}が要警戒TOP5へ現れます。`
        : risen.length
          ? `${primaryChange?.pokemon.nameJa ?? "要警戒候補"}の順位が交換後に大きく上がります。`
          : `交換後の最大・期待脅威が悪化します。`,
      source: "threat-union",
      confidence: "high",
      scope: "tracked-threat",
      affectedTeamMembers: [...emerged, ...risen].map(
        (threat) => threat.pokemon.slug
      ),
      beforeValue: beforeExpected,
      afterValue: afterExpected
    });
  }

  const actionLabel =
    actionKind === "add"
      ? "追加後"
      : actionKind === "formChange"
        ? "フォーム変更後"
        : "交換後";
  for (const threat of postActionTop5) {
    const context = threatContext(threat.pokemon.slug);
    const entersTop5 =
      context.afterRank !== null &&
      context.afterRank <= 5 &&
      (context.beforeRank === null || context.beforeRank > 5) &&
      context.usageRate !== null &&
      context.usageRate >= ADVISOR_THREAT_WARNING_RULES.minimumUsageRate &&
      postActionTop5Ids.has(threat.pokemon.slug);
    if (!entersTop5) continue;
    evidence.push({
      id: `risk:post-action-top5:${threat.pokemon.slug}`,
      kind: "risk",
      primaryDimension: "riskPenalty",
      points: 0,
      displayText: `${actionLabel}、${threat.pokemon.nameJa}が要警戒${context.afterRank}位へ入ります。`,
      source: "threat-union",
      confidence: "high",
      scope: "post-action-top5",
      ...context
    });
  }
  for (const threat of postActionFullThreatRanking) {
    const context = threatContext(threat.pokemon.slug);
    if (
      context.beforeRank === null ||
      context.afterRank === null ||
      context.afterRank > 5 ||
      context.afterRank >= context.beforeRank ||
      context.usageRate === null ||
      context.usageRate < ADVISOR_THREAT_WARNING_RULES.minimumUsageRate ||
      context.beforeScore === null ||
      context.afterScore === null ||
      context.afterScore - context.beforeScore <
        ADVISOR_THREAT_WARNING_RULES.minimumScoreIncrease ||
      (context.beforeRank - context.afterRank <
        ADVISOR_THREAT_WARNING_RULES.minimumRankRise &&
        !(context.afterRank <= 5 && context.beforeRank > 5)) ||
      (context.afterRank <= 5 &&
        context.beforeRank > 5 &&
        postActionTop5Ids.has(threat.pokemon.slug))
    ) {
      continue;
    }
    evidence.push({
      id: `risk:threat-rank-rise:${threat.pokemon.slug}`,
      kind: "risk",
      primaryDimension: "riskPenalty",
      points: 0,
      displayText: `${actionLabel}、${threat.pokemon.nameJa}の要警戒順位が${context.beforeRank}位から${context.afterRank}位へ上昇します。`,
      source: "threat-union",
      confidence: "high",
      scope: "post-action-top5",
      ...context
    });
  }

  const redundancy = getRedundancyEvidence(
    candidate,
    comparisonTeam,
    environmentDataset,
    clearAnswerIds,
    existingAnswerIds
  );
  if (redundancy) evidence.push(redundancy);

  if (environmentUsageRate > 0) {
    evidence.push({
      id: "environment:usage",
      kind: "environment",
      primaryDimension: "environmentValidity",
      points: Math.min(4, Math.sqrt(Math.min(environmentUsageRate, 0.1) / 0.1) * 4),
      displayText: `環境使用率${(environmentUsageRate * 100).toFixed(1)}%の採用実績があります。`,
      source: "environment",
      confidence: "high"
    });
  }
  return evidence;
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
  const threatSnapshot = input.threatSnapshot;
  const postActionThreatSnapshot = getThreatSnapshot({
    team: afterTeam,
    availablePokemon: input.availablePokemon,
    environmentDataset: input.environmentDataset,
    profile
  });
  const beforeThreats = threatSnapshot.currentDisplayedTop5;
  const afterThreats = postActionThreatSnapshot.currentDisplayedTop5;
  const beforeTrackedThreats = threatSnapshot.trackedThreats;
  const afterTrackedThreats = postActionThreatSnapshot.trackedThreats;
  const beforeMetrics = getAdvisorTeamMetrics(
    beforeTeam,
    beforeSummary,
    beforeIssues,
    beforeTrackedThreats
  );
  const afterMetrics = getAdvisorTeamMetrics(
    afterTeam,
    afterSummary,
    afterIssues,
    afterTrackedThreats
  );
  const beforeThreatAverage = averageThreatScore(beforeThreats);
  const afterThreatAverage = averageThreatScore(afterThreats);
  const recommendationBeforeThreatAverage = averageThreatScore(
    beforeTrackedThreats
  );
  const recommendationAfterThreatAverage = averageThreatScore(
    afterTrackedThreats
  );
  const candidateEvidence = getCandidateEvidence(
    candidate.pokemon,
    beforeTrackedThreats,
    input.environmentDataset,
    profile
  );
  const removedPokemon = getRemovedPokemon(beforeTeam, removedSlotId);
  const actionKind: MegaRecommendationActionKind =
    removedSlotId === null
      ? "add"
      : removedPokemon?.speciesId === candidate.pokemon.speciesId
        ? "formChange"
        : "replace";
  const replacedEvidence = removedPokemon
    ? getCandidateEvidence(
        removedPokemon,
        beforeTrackedThreats,
        input.environmentDataset,
        profile
      )
    : emptyCandidateEvidence();
  const evidenceGain = subtractCandidateEvidence(
    candidateEvidence,
    replacedEvidence
  );
  const threatReduction =
    recommendationBeforeThreatAverage !== null &&
    recommendationAfterThreatAverage !== null
      ? recommendationBeforeThreatAverage -
        recommendationAfterThreatAverage
      : 0;
  const issueReduction =
    beforeMetrics.issueIds.length - afterMetrics.issueIds.length;
  const recommendationThreatUnion = mergeThreatUnion(
    beforeTrackedThreats,
    afterTrackedThreats
  );
  const threatUnion = mergeThreatUnion(beforeThreats, afterThreats);
  const recommendationThreatCoverage = evaluateAdvisorThreatCoverage({
    candidate: candidate.pokemon,
    threats: recommendationThreatUnion,
    currentTeam: beforeTeam,
    environmentDataset: input.environmentDataset,
    profile
  });
  const threatCoverage = evaluateAdvisorThreatCoverage({
    candidate: candidate.pokemon,
    threats: beforeThreats,
    currentTeam: beforeTeam,
    environmentDataset: input.environmentDataset,
    profile
  });
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
  const rawSpeedRoleImprovement = getAdvisorProfileSpeedRoleImprovement(
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
  const hasPracticalTrickRoomValue =
    evidenceGain.popularMoveCoverageCount > 0 ||
    evidenceGain.stableCheckCount > 0 ||
    evidenceGain.recoveryMoveShare > 0 ||
    evidenceGain.defensiveAbilityShare > 0 ||
    threatReduction > 0 ||
    issueReduction > 0 ||
    defensiveImprovement > 0 ||
    offensiveImprovement > 0;
  const speedRoleImprovement =
    profile === "trick-room" &&
    rawSpeedRoleImprovement > 0 &&
    !hasPracticalTrickRoomValue
      ? 0
      : rawSpeedRoleImprovement;
  const overallSpeedRoleImprovement =
    profile === "trick-room" ? 0 : speedRoleImprovement;
  const lostRoles = uniqueText([
    ...collectLostRoles(beforeMetrics.roles, afterMetrics.roles, profile),
    ...collectLostProfileRoles(
      getTeamProfileRoleCounts(
        beforeTeam,
        input.environmentDataset
      ),
      getTeamProfileRoleCounts(
        afterTeam,
        input.environmentDataset
      ),
      profile
    )
  ]);
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
    beforeTrackedThreats
  );
  const newMajorWeaknesses = afterMetrics.consistencyTypes.filter(
    (type) => !beforeMetrics.consistencyTypes.includes(type)
  );
  const environmentUsageRate = candidate.environmentUsageRate ?? 0;
  const usageTieBreaker = Math.min(
    ADVISOR_SWAP_WEIGHTS.usageTieBreaker,
    environmentUsageRate * ADVISOR_SWAP_WEIGHTS.usageTieBreaker
  );
  const comparisonTeam = beforeTeam.filter(
    (slot) => removedSlotId === null || slot.id !== removedSlotId
  );
  const megaCountBefore = countMegaForms(beforeTeam);
  const megaCountAfter = countMegaForms(afterTeam);
  const baseEvidence = buildAdvisorPlanEvidence({
      candidate: candidate.pokemon,
      comparisonTeam,
      beforeMetrics,
      afterMetrics,
      beforeThreats: beforeTrackedThreats,
      afterThreats: afterTrackedThreats,
      currentDisplayedTop5: beforeThreats,
      postActionTop5: afterThreats,
      currentFullThreatRanking: threatSnapshot.fullThreatRanking,
      postActionFullThreatRanking:
        postActionThreatSnapshot.fullThreatRanking,
      threatCoverage: recommendationThreatCoverage,
      displayThreatCoverage: threatCoverage,
      actionKind,
      candidateEvidenceGain: evidenceGain,
      lostRoles,
      threatAnswerLosses,
      environmentUsageRate,
      environmentDataset: input.environmentDataset,
      profile
    });
  if (
    candidate.pokemon.formKind === "mega" &&
    megaCountAfter > megaCountBefore
  ) {
    baseEvidence.push({
      id: "risk:mega-opportunity-cost",
      kind: "risk",
      primaryDimension: "riskPenalty",
      points: -5,
      displayText: "メガ枠を使用します。",
      source: "team-delta",
      confidence: "high",
      beforeValue: megaCountBefore,
      afterValue: megaCountAfter
    });
  }
  const evidence = deduplicateAdvisorEvidence(baseEvidence);
  const evidenceScore = scoreAdvisorEvidence(evidence);
  const targetThreatImpacts = getTargetThreatImpacts(
    threatSnapshot.fullThreatRanking,
    postActionThreatSnapshot.fullThreatRanking
  );
  const improvementScore = evidenceScore.overall;
  const evidenceImprovements = evidence
    .filter(
      (entry) =>
        entry.points > 0 &&
        entry.primaryDimension !== "environmentValidity"
    )
    .sort((left, right) => right.points - left.points || left.id.localeCompare(right.id))
    .slice(0, MAX_IMPROVEMENT_NOTES);
  const megaLimitPassed =
    candidate.pokemon.formKind !== "mega" ||
    megaCountAfter <= ADVISOR_TEAM_RULES.recommendedMegaLimit;
  const megaRecommendationPassed = canRecommendMegaCandidate({
    currentTeamSize: getPokemonMembers(beforeTeam).length,
    currentMegaCount: megaCountBefore,
    candidateIsMega: candidate.pokemon.formKind === "mega",
    actionKind,
    removedSlotContainsPokemon:
      removedSlotId === null ? undefined : removedPokemon !== null,
    removedPokemonIsMega: removedPokemon?.formKind === "mega"
  });
  const categoryScores = {
    overall: evidenceScore.overall,
    defensive: evidenceScore.defensive,
    offensive: evidenceScore.offensive,
    speed: evidenceScore.speed,
    typeSpecific: evidenceScore.typeSpecific
  };
  const categoryEvidenceIds = Object.fromEntries(
    (["overall", "defensive", "offensive", "speed", "typeSpecific"] as AdvisorRecommendationCategory[]).map(
      (category) => [
        category,
        selectAdvisorEvidence(evidence, category).map(
          (entry) => entry.id
        )
      ]
    )
  ) as Record<AdvisorRecommendationCategory, string[]>;
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
  const profileRoles = getAdvisorProfileRoles({
    pokemon: candidate.pokemon,
    evidence: candidateEvidence,
    consistencyReduction,
    defensiveImprovement,
    offensiveImprovement
  });
  const meaningfulImprovement = evidence.some(
    (entry) =>
      entry.points > 0 &&
      entry.primaryDimension !== "environmentValidity"
  );
  const baseSafetyGate =
    megaLimitPassed &&
    megaRecommendationPassed &&
    recommendationThreatCoverage.usageEligibility !== "below-minimum" &&
    recommendationThreatCoverage.usageEligibility !== "unknown" &&
    newMajorWeaknesses.length === 0 &&
    !(lostRoles.length >= 2 && improvementScore < 30);
  const sharedRecommendationGate =
    baseSafetyGate &&
    isAdvisorThreatCoverageEligible(
      recommendationThreatCoverage,
      issueReduction
    );
  const isRecommendation =
    improvementScore > 0 &&
    sharedRecommendationGate &&
    !(threatReduction < 0 && improvementScore < 20) &&
    meaningfulImprovement &&
    evidenceImprovements.length > 0;
  const categoryMeaning = {
    overall: meaningfulImprovement,
    defensive: categoryEvidenceIds.defensive.length > 0,
    offensive: categoryEvidenceIds.offensive.length > 0,
    speed:
      profile === "trick-room"
        ? (speedRoleImprovement > 0 && hasPracticalTrickRoomValue) ||
          (evidenceGain.profileSpeedAdvantageCount > 0 &&
            (evidenceGain.popularMoveCoverageCount > 0 ||
              evidenceGain.stableCheckCount > 0))
        : speedRoleImprovement > 0 ||
          (evidenceGain.profileSpeedAdvantageCount > 0 &&
            evidenceGain.popularMoveCoverageCount > 0),
    typeSpecific: categoryEvidenceIds.typeSpecific.length > 0
  } satisfies Record<AdvisorRecommendationCategory, boolean>;
  const isRecommendationByCategory = Object.fromEntries(
    (Object.keys(categoryMeaning) as AdvisorRecommendationCategory[]).map(
      (category) => {
        if (category === "overall") return [category, isRecommendation];
        const categoryScore = categoryScores[category];
        return [
          category,
          baseSafetyGate &&
            categoryMeaning[category] &&
            categoryScore > 0 &&
            !(threatReduction < 0 && categoryScore < 20) &&
            categoryEvidenceIds[category].length > 0
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
            kind:
              actionKind === "formChange" ? "form-change" : "replace",
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
    threatSnapshot,
    postActionThreatSnapshot,
    threatUnion,
    beforeThreatAverage,
    afterThreatAverage,
    threatAverageDelta:
      beforeThreatAverage !== null && afterThreatAverage !== null
        ? afterThreatAverage - beforeThreatAverage
        : null,
    improvementScore,
    categoryScores,
    categoryEvidenceIds,
    recommendationRoles,
    selectedOverallRole: null,
    profileRoles,
    threatCoverage,
    recommendationThreatCoverage,
    evidence,
    evidenceScore,
    targetThreatImpacts,
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
      threatMoveImmunityCount: candidateEvidence.threatMoveImmunityCount,
      threatMoveResistanceCount: candidateEvidence.threatMoveResistanceCount,
      stableCheckCount: recommendationThreatCoverage.stableSwitchCount,
      physicalThreatCheckCount: candidateEvidence.physicalThreatCheckCount,
      specialThreatCheckCount: candidateEvidence.specialThreatCheckCount,
      popularMoveCoverageCount: candidateEvidence.popularMoveCoverageCount,
      profileSpeedAdvantageCount:
        candidateEvidence.profileSpeedAdvantageCount,
      standardSpeedAdvantageCount:
        candidateEvidence.standardSpeedAdvantageCount,
      priorityMoveShare: candidateEvidence.priorityMoveShare,
      priorityMoveName: candidateEvidence.priorityMoveName,
      trickRoomMoveShare: candidateEvidence.trickRoomMoveShare,
      trickRoomMoveName: candidateEvidence.trickRoomMoveName,
      physicalWallImprovement,
      specialWallImprovement,
      physicalAttackerImprovement,
      specialAttackerImprovement,
      recoveryMoveShare: candidateEvidence.recoveryMoveShare,
      defensiveAbilityShare: candidateEvidence.defensiveAbilityShare,
      mainstreamPhysicalShare: candidateEvidence.mainstreamPhysicalShare,
      mainstreamSpecialShare: candidateEvidence.mainstreamSpecialShare,
      megaCountBefore,
      megaCountAfter,
      megaLimitPassed,
      megaRecommendationPassed
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
    right.evidence.filter((entry) => entry.points > 0).length -
      left.evidence.filter((entry) => entry.points > 0).length ||
    right.metrics.usageTieBreaker - left.metrics.usageTieBreaker ||
    left.candidate.pokemon.speciesId - right.candidate.pokemon.speciesId ||
    left.candidate.pokemon.formOrder - right.candidate.pokemon.formOrder
  );
}

function getCandidateProxyScore(
  category: Exclude<AdvisorRecommendationCategory, "typeSpecific">,
  candidate: TeamAdvisorCandidate,
  environmentBySlug: Map<string, ThreatEnvironmentDataset["pokemon"][number]>,
  profile: TeamProfile,
  currentSlowCount: number
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
        ? (Math.max(0, 100 - (stats?.speed ?? 100)) / 3) *
          getTrickRoomLowSpeedBonusMultiplier(currentSlowCount)
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
  const eligible = [...pool]
    .filter(
      (candidate) =>
        (environmentBySlug.get(candidate.pokemon.slug)?.usageRate ?? -1) >=
        ADVISOR_USAGE_THRESHOLDS.minimumCandidate
    );
  const selected = new Map<string, TeamAdvisorCandidate>();
  const currentSlowCount = getAdvisorRoleCounts(input.team).slow;
  const summary = summarizeTeam(input.team);
  if (summary.members.length < MAX_TEAM_SIZE) {
    return input.availablePokemon
      .filter((pokemon) => {
        const usage = environmentBySlug.get(pokemon.slug)?.usageRate;
        return (
          isThreatPokemonCandidate(pokemon) &&
          typeof usage === "number" &&
          usage >= ADVISOR_PROGRESSIVE_MINIMUM_USAGE
        );
      })
      .map((pokemon) =>
        createAdvisorSimulationCandidate(
          pokemon,
          input.environmentDataset,
          "段階型チームアドバイザー候補"
        )
      )
      .sort((left, right) => left.pokemon.id - right.pokemon.id);
  }
  const currentThreats = input.threatSnapshot.trackedThreats;
  eligible
    .map((candidate) => ({
      candidate,
      coverage: evaluateAdvisorThreatCoverage({
        candidate: candidate.pokemon,
        threats: currentThreats,
        currentTeam: input.team,
        environmentDataset: input.environmentDataset,
        profile
      })
    }))
    .sort(
      (left, right) =>
        right.coverage.finalScore - left.coverage.finalScore ||
        left.candidate.pokemon.id - right.candidate.pokemon.id
    )
    .slice(0, ADVISOR_RECOMMENDATION_RULES.preselectByThreatCoverage)
    .forEach(({ candidate }) => selected.set(candidate.pokemon.slug, candidate));
  for (const category of ["overall", "defensive", "offensive", "speed"] as const) {
    eligible
      .slice()
      .sort(
        (left, right) =>
          getCandidateProxyScore(
            category,
            right,
            environmentBySlug,
            profile,
            currentSlowCount
          ) -
            getCandidateProxyScore(
              category,
              left,
              environmentBySlug,
              profile,
              currentSlowCount
            ) ||
          left.pokemon.id - right.pokemon.id
      )
      .slice(0, ADVISOR_RECOMMENDATION_RULES.preselectPerCategory)
      .forEach((candidate) => selected.set(candidate.pokemon.slug, candidate));
  }
  for (const type of getAllTypes().map((entry) => entry.nameEn)) {
    eligible
      .filter((candidate) => candidate.pokemon.types.includes(type))
      .slice()
      .sort(compareCandidatesForPreselection)
      .slice(0, ADVISOR_RECOMMENDATION_RULES.preselectPerType)
      .forEach((candidate) => selected.set(candidate.pokemon.slug, candidate));
  }
  if (profile === "trick-room") {
    eligible
      .filter(
        (candidate) =>
          (candidate.pokemon.baseStats?.speed ?? Number.POSITIVE_INFINITY) <=
            TRICK_ROOM_RECOMMENDATION_CONFIG.lowSpeedThreshold &&
          (candidate.metrics.threatResponsePoints > 0 ||
            candidate.metrics.offensePoints > 0 ||
            candidate.metrics.issueResolutionPoints > 0 ||
            candidate.metrics.rolePoints > 0)
      )
      .slice()
      .sort(
        (left, right) =>
          getCandidateProxyScore(
            "speed",
            right,
            environmentBySlug,
            profile,
            currentSlowCount
          ) -
            getCandidateProxyScore(
              "speed",
              left,
              environmentBySlug,
              profile,
              currentSlowCount
            ) ||
          left.pokemon.id - right.pokemon.id
      )
      .slice(
        0,
        ADVISOR_RECOMMENDATION_RULES.preselectTrickRoomSlowRole
      )
      .forEach((candidate) => selected.set(candidate.pokemon.slug, candidate));
    for (const category of ["defensive", "offensive"] as const) {
      eligible
        .filter(
          (candidate) =>
            (candidate.pokemon.baseStats?.speed ?? 0) >=
              TEAM_SPEED_THRESHOLDS.fastMinimum &&
            (candidate.metrics.threatResponsePoints > 0 ||
              candidate.metrics.issueResolutionPoints > 0 ||
              candidate.metrics.offensePoints > 0 ||
              candidate.metrics.rolePoints > 0)
        )
        .slice()
        .sort(
          (left, right) =>
            getCandidateProxyScore(
              category,
              right,
              environmentBySlug,
              profile,
              currentSlowCount
            ) -
              getCandidateProxyScore(
                category,
                left,
                environmentBySlug,
                profile,
                currentSlowCount
              ) ||
            left.pokemon.id - right.pokemon.id
        )
        .slice(
          0,
          ADVISOR_RECOMMENDATION_RULES.preselectTrickRoomFallbackRole
        )
        .forEach((candidate) =>
          selected.set(candidate.pokemon.slug, candidate)
        );
    }
  }
  input.advisor.candidates.forEach((candidate) =>
    selected.set(candidate.pokemon.slug, candidate)
  );
  return [...selected.values()].sort(
    (left, right) => left.pokemon.id - right.pokemon.id
  );
}

function compareCandidatesForPreselection(
  left: TeamAdvisorCandidate,
  right: TeamAdvisorCandidate
): number {
  return (
    right.metrics.threatResponsePoints - left.metrics.threatResponsePoints ||
    right.metrics.issueResolutionPoints - left.metrics.issueResolutionPoints ||
    right.score - left.score ||
    left.pokemon.id - right.pokemon.id
  );
}

export function createAdvisorSimulationCandidate(
  pokemon: PokemonEntry,
  environmentDataset: ThreatEnvironmentDataset | null,
  reason: string
): TeamAdvisorCandidate {
  const usageRate =
    environmentDataset?.pokemon.find((entry) => entry.slug === pokemon.slug)
      ?.usageRate ?? null;
  return {
    pokemon,
    score: 0,
    rating: 1,
    reasons: [reason],
    addressedIssueIds: [],
    environmentUsageRate: usageRate,
    metrics: {
      issueResolutionPoints: 0,
      threatResponsePoints: 0,
      rolePoints: 0,
      offensePoints: 0,
      environmentUsagePoints: 0,
      newWeaknessPenalty: 0
    }
  };
}

function getBestPlansBySpecies(
  plans: AdvisorSwapPlan[],
  category: AdvisorRecommendationCategory,
  type?: TypeName
): AdvisorSwapPlan[] {
  const bestBySpecies = new Map<number, AdvisorSwapPlan>();
  for (const plan of plans) {
    if (
      plan.action.kind === "form-change" ||
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

function isSlowRecommendation(plan: AdvisorSwapPlan): boolean {
  return (
    (plan.candidate.pokemon.baseStats?.speed ?? Number.POSITIVE_INFINITY) <=
    TRICK_ROOM_RECOMMENDATION_CONFIG.lowSpeedThreshold
  );
}

function selectCategoryPlans(
  plans: AdvisorSwapPlan[],
  category: AdvisorRecommendationCategory,
  type?: TypeName,
  profile: TeamProfile = "standard"
): AdvisorSwapPlan[] {
  const ranked = getBestPlansBySpecies(plans, category, type);
  const selected: AdvisorSwapPlan[] = [];
  let megaCount = 0;
  let slowCount = 0;
  for (const plan of ranked) {
    if (
      isMegaPlan(plan) &&
      megaCount >= ADVISOR_RECOMMENDATION_RULES.maxMegaInOverall
    ) {
      continue;
    }
    if (
      profile === "trick-room" &&
      category !== "speed" &&
      isSlowRecommendation(plan) &&
      slowCount >=
        TRICK_ROOM_RECOMMENDATION_CONFIG.maxSlowOutsideTrickRoomCategory
    ) {
      continue;
    }
    selected.push(plan);
    if (isMegaPlan(plan)) megaCount += 1;
    if (isSlowRecommendation(plan)) slowCount += 1;
    if (selected.length >= ADVISOR_RECOMMENDATION_RULES.maxPerCategory) break;
  }
  if (profile === "trick-room" && selected.length > 0) {
    const needsDefensiveFallback =
      category === "defensive" &&
      !selected.some(
        (plan) =>
          (plan.candidate.pokemon.baseStats?.speed ?? 0) >=
            TEAM_SPEED_THRESHOLDS.fastMinimum
      );
    const needsOffensiveFallback =
      category === "offensive" &&
      !selected.some(
        (plan) =>
          plan.profileRoles.includes("fastFallback") ||
          plan.profileRoles.includes("priorityUser")
      );
    const fallback = ranked.find((plan) => {
      if (
        selected.some(
          (entry) =>
            entry.candidate.pokemon.speciesId ===
            plan.candidate.pokemon.speciesId
        )
      ) {
        return false;
      }
      if (
        isMegaPlan(plan) &&
        selected.filter(isMegaPlan).length >=
          ADVISOR_RECOMMENDATION_RULES.maxMegaInOverall
      ) {
        return false;
      }
      if (needsDefensiveFallback) {
        return (
          (plan.candidate.pokemon.baseStats?.speed ?? 0) >=
            TEAM_SPEED_THRESHOLDS.fastMinimum &&
          (plan.metrics.stableCheckCount > 0 ||
            plan.metrics.threatMoveResistanceCount > 0 ||
            plan.metrics.threatMoveImmunityCount > 0)
        );
      }
      if (needsOffensiveFallback) {
        return (
          plan.profileRoles.includes("fastFallback") ||
          plan.profileRoles.includes("priorityUser")
        );
      }
      return false;
    });
    if (fallback && (needsDefensiveFallback || needsOffensiveFallback)) {
      selected[selected.length - 1] = fallback;
    }
  }
  return selected;
}

function selectDiverseOverallPlans(
  plans: AdvisorSwapPlan[],
  profile: TeamProfile
): AdvisorSwapPlan[] {
  const ranked = getBestPlansBySpecies(plans, "overall");
  const topScore = ranked[0]?.categoryScores.overall ?? 0;
  const qualified = ranked.filter(
    (plan) =>
      plan.categoryScores.overall >=
      topScore - ADVISOR_RECOMMENDATION_RULES.overallScoreWindow
  );
  const selected: AdvisorSwapPlan[] = [];
  const roleCounts = new Map<AdvisorRecommendationRole, number>();
  const profileRoleCounts = new Map<AdvisorProfileRole, number>();
  let megaCount = 0;
  let slowCount = 0;

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
      profile === "trick-room" &&
      isSlowRecommendation(plan) &&
      slowCount >=
        TRICK_ROOM_RECOMMENDATION_CONFIG.maxSlowRoleRecommendations
    ) {
      continue;
    }
    const profileRole =
      profile === "trick-room"
        ? [...plan.profileRoles]
            .sort(
              (left, right) =>
                (profileRoleCounts.get(left) ?? 0) -
                  (profileRoleCounts.get(right) ?? 0) ||
                left.localeCompare(right)
            )
            .find(
              (candidateRole) =>
                (profileRoleCounts.get(candidateRole) ?? 0) <
                ADVISOR_RECOMMENDATION_RULES.maxSameRole
            ) ?? null
        : null;
    if (
      profile === "trick-room" &&
      plan.profileRoles.length > 0 &&
      !profileRole
    ) {
      continue;
    }
    if (
      isMegaPlan(plan) &&
      megaCount >= ADVISOR_RECOMMENDATION_RULES.maxMegaInOverall
    ) {
      continue;
    }
    selected.push({ ...plan, selectedOverallRole: role });
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    if (profileRole) {
      profileRoleCounts.set(
        profileRole,
        (profileRoleCounts.get(profileRole) ?? 0) + 1
      );
    }
    if (isMegaPlan(plan)) megaCount += 1;
    if (isSlowRecommendation(plan)) slowCount += 1;
    if (selected.length >= ADVISOR_RECOMMENDATION_RULES.maxPerCategory) break;
  }
  if (
    profile === "trick-room" &&
    !selected.some((plan) => plan.profileRoles.includes("slowAttacker")) &&
    selected.length > 0
  ) {
    const bestSlow = ranked.find(
      (plan) =>
        isSlowRecommendation(plan) &&
        plan.profileRoles.includes("slowAttacker") &&
        plan.metrics.speedRoleImprovement > 0 &&
        (plan.metrics.popularMoveCoverageCount > 0 ||
          plan.metrics.stableCheckCount > 0 ||
          plan.metrics.threatReduction > 0 ||
          plan.metrics.issueReduction > 0) &&
        (!isMegaPlan(plan) ||
          selected.filter(isMegaPlan).length <
            ADVISOR_RECOMMENDATION_RULES.maxMegaInOverall ||
          selected.some(isMegaPlan))
    );
    const selectedRole = bestSlow?.recommendationRoles[0];
    if (bestSlow && selectedRole) {
      const replacementIndex =
        slowCount >=
        TRICK_ROOM_RECOMMENDATION_CONFIG.maxSlowRoleRecommendations
          ? selected.findLastIndex(
              (plan) =>
                isSlowRecommendation(plan) &&
                !plan.profileRoles.includes("slowAttacker")
            )
          : isMegaPlan(bestSlow) &&
        selected.filter(isMegaPlan).length >=
          ADVISOR_RECOMMENDATION_RULES.maxMegaInOverall
          ? selected.findLastIndex(isMegaPlan)
          : selected.length - 1;
      selected[replacementIndex] = {
        ...bestSlow,
        selectedOverallRole: selectedRole
      };
    }
  }
  return selected;
}

function getTypePlanGroups(
  plans: AdvisorSwapPlan[],
  profile: TeamProfile
): {
  typePlans: Partial<Record<TypeName, AdvisorSwapPlan[]>>;
  typeOptions: Array<{ type: TypeName; label: string }>;
} {
  const groups = getAllTypes().flatMap((entry) => {
    const typePlans = selectCategoryPlans(
      plans,
      "typeSpecific",
      entry.nameEn,
      profile
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

function getTargetPlanScore(
  plan: AdvisorSwapPlan,
  threatId: string
): number {
  const answer = plan.threatCoverage.threatAnswers.find(
    (entry) => entry.threatId === threatId
  );
  const impact = plan.targetThreatImpacts.find(
    (entry) => entry.threatId === threatId
  );
  const classPoints =
    answer?.answerClass === "stableSwitch"
      ? 40
      : answer?.answerClass === "revengeKill"
        ? 35
        : answer?.answerClass === "softCheck"
          ? 20
          : answer?.answerClass === "coverageOnly"
            ? 6
            : 0;
  const targetReduction = Math.max(0, -(impact?.scoreDelta ?? 0));
  return (
    classPoints +
    targetReduction +
    plan.evidenceScore.dimensionTotals.postSwapThreatRisk * 0.5 +
    plan.evidenceScore.dimensionTotals.teamIssueImprovement * 0.35 +
    plan.evidenceScore.dimensionTotals.riskPenalty * 0.5 +
    plan.evidenceScore.dimensionTotals.environmentValidity * 0.2
  );
}

function isTargetPlanUsable(
  plan: AdvisorSwapPlan,
  threatId: string
): boolean {
  const answer = plan.threatCoverage.threatAnswers.find(
    (entry) => entry.threatId === threatId
  );
  return Boolean(
    answer &&
      answer.answerClass !== "notCounter" &&
      answer.answerClass !== "coverageOnly" &&
      plan.metrics.megaLimitPassed &&
      plan.metrics.megaRecommendationPassed &&
      plan.metrics.newMajorWeaknessCount === 0 &&
      plan.threatCoverage.usageEligibility !== "below-minimum" &&
      plan.threatCoverage.usageEligibility !== "unknown" &&
      getTargetPlanScore(plan, threatId) > 0
  );
}

function selectThreatPlans(
  plans: AdvisorSwapPlan[],
  threatId: string,
  mode: Exclude<AdvisorThreatExploreMode, "type">,
  type?: TypeName
): AdvisorSwapPlan[] {
  const bestBySpecies = new Map<number, AdvisorSwapPlan>();
  for (const plan of plans) {
    if (plan.action.kind === "form-change") continue;
    if (!isTargetPlanUsable(plan, threatId)) continue;
    if (type && !plan.candidate.pokemon.types.includes(type)) continue;
    const answer = plan.threatCoverage.threatAnswers.find(
      (entry) => entry.threatId === threatId
    );
    if (
      mode === "stableSwitch" &&
      answer?.answerClass !== "stableSwitch"
    ) {
      continue;
    }
    if (
      mode === "revengeKill" &&
      answer?.answerClass !== "revengeKill"
    ) {
      continue;
    }
    const speciesId = plan.candidate.pokemon.speciesId;
    const current = bestBySpecies.get(speciesId);
    if (
      !current ||
      getTargetPlanScore(plan, threatId) >
        getTargetPlanScore(current, threatId)
    ) {
      bestBySpecies.set(speciesId, plan);
    }
  }
  return [...bestBySpecies.values()]
    .sort(
      (left, right) =>
        getTargetPlanScore(right, threatId) -
          getTargetPlanScore(left, threatId) ||
        right.metrics.usageTieBreaker - left.metrics.usageTieBreaker ||
        left.candidate.pokemon.id - right.candidate.pokemon.id
    )
    .slice(0, ADVISOR_RECOMMENDATION_RULES.maxPerThreatMode);
}

function getThreatRecommendationGroups(
  plans: AdvisorSwapPlan[],
  threats: ThreatPokemonAnalysis[]
): AdvisorThreatRecommendationGroup[] {
  return threats.slice(0, 5).map((threat) => ({
    threat,
    plansByMode: {
      recommended: selectThreatPlans(
        plans,
        threat.pokemon.slug,
        "recommended"
      ),
      stableSwitch: selectThreatPlans(
        plans,
        threat.pokemon.slug,
        "stableSwitch"
      ),
      revengeKill: selectThreatPlans(
        plans,
        threat.pokemon.slug,
        "revengeKill"
      )
    },
    typePlans: Object.fromEntries(
      getAllTypes().map((type) => [
        type.nameEn,
        selectThreatPlans(
          plans,
          threat.pokemon.slug,
          "recommended",
          type.nameEn
        )
      ])
    )
  }));
}

function emptySimulation(
  threatSnapshot: ThreatSnapshot
): AdvisorSwapSimulation {
  return {
    threatSnapshot,
    evaluatedPlans: [],
    plans: [],
    additionPlans: [],
    plansByCategory: {
      overall: [],
      defensive: [],
      offensive: [],
      speed: []
    },
    typePlans: {},
    typeOptions: [],
    threatRecommendations: [],
    threatTypeOptions: getAllTypes().map((type) => ({
      type: type.nameEn,
      label: type.nameJa
    })),
    formChangePlans: [],
    candidatePoolCount: 0,
    megaRecommendationStats: {
      candidatePoolBeforeMegaFilter: 0,
      candidatePoolAfterMegaFilter: 0,
      actionPatternsBeforeMegaFilter: 0,
      actionPatternsAfterMegaFilter: 0
    },
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
  if (summary.members.length < 1 || candidatePool.length === 0) {
    return emptySimulation(input.threatSnapshot);
  }

  const memberSlotIds = summary.members.map((member) => member.slotId);
  const patternSlotIds: Array<string | null> =
    summary.members.length < MAX_TEAM_SIZE
      ? [null]
      : memberSlotIds;
  const currentTeamPokemon = getPokemonMembers(input.team);
  const currentTeamSize = currentTeamPokemon.length;
  const currentMegaCount = currentTeamPokemon.filter(
    (pokemon) => pokemon.formKind === "mega"
  ).length;
  const teamSpeciesIds = new Set(
    currentTeamPokemon.map((pokemon) => pokemon.speciesId)
  );
  const removedPokemonBySlot = new Map(
    input.team.flatMap((slot) => {
      if (slot.mode !== "pokemon") return [];
      const pokemon = getPokemonBySlug(slot.pokemonSlug);
      return pokemon ? [[slot.id, pokemon] as const] : [];
    })
  );
  const seenCandidateSlugs = new Set<string>();
  const candidatesBeforeMegaFilter = candidatePool.filter((candidate) => {
    const speciesId = candidate.pokemon.speciesId;
    const slug = candidate.pokemon.slug;
    const usageRate = input.environmentDataset?.pokemon.find(
      (entry) => entry.slug === slug
    )?.usageRate;
    const minimumUsage =
      summary.members.length < MAX_TEAM_SIZE
        ? ADVISOR_PROGRESSIVE_MINIMUM_USAGE
        : ADVISOR_USAGE_THRESHOLDS.minimumCandidate;
    if (
      teamSpeciesIds.has(speciesId) ||
      seenCandidateSlugs.has(slug) ||
      (input.environmentDataset !== null &&
        (typeof usageRate !== "number" ||
          usageRate < minimumUsage))
    ) {
      return false;
    }
    seenCandidateSlugs.add(slug);
    return true;
  });
  const generalActionPatternsBeforeMegaFilter =
    candidatesBeforeMegaFilter.flatMap((candidate) =>
      patternSlotIds.map((removedSlotId) => ({
        candidate,
        removedSlotId
      }))
    );
  const generalActionPatterns = generalActionPatternsBeforeMegaFilter.filter(
    ({ candidate, removedSlotId }) =>
      canRecommendMegaCandidate({
        currentTeamSize,
        currentMegaCount,
        candidateIsMega: candidate.pokemon.formKind === "mega",
        actionKind: removedSlotId === null ? "add" : "replace",
        removedSlotContainsPokemon:
          removedSlotId === null
            ? undefined
            : removedPokemonBySlot.has(removedSlotId),
        removedPokemonIsMega:
          removedSlotId === null
            ? false
            : removedPokemonBySlot.get(removedSlotId)?.formKind === "mega"
      })
  );
  const eligibleCandidateSlugs = new Set(
    generalActionPatterns.map(({ candidate }) => candidate.pokemon.slug)
  );
  const eligibleCandidates = candidatesBeforeMegaFilter.filter((candidate) =>
    eligibleCandidateSlugs.has(candidate.pokemon.slug)
  );
  const generalPlans = generalActionPatterns.map(
    ({ candidate, removedSlotId }) =>
      evaluateAdvisorSwapPlan(input, candidate, removedSlotId)
  );
  const currentPokemonSlots = input.team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    return pokemon ? [{ slot, pokemon }] : [];
  });
  const formActionPatternsBeforeMegaFilter = currentPokemonSlots.flatMap(
    ({ slot, pokemon }) =>
      input.availablePokemon
        .filter(
          (form) =>
            form.speciesId === pokemon.speciesId &&
            form.slug !== pokemon.slug &&
            form.formSelection === "team"
        )
        .map((form) => ({ slot, pokemon, form }))
  );
  const formActionPatterns = formActionPatternsBeforeMegaFilter.filter(
    ({ pokemon, form }) =>
      canRecommendMegaCandidate({
        currentTeamSize,
        currentMegaCount,
        candidateIsMega: form.formKind === "mega",
        actionKind: "formChange",
        removedSlotContainsPokemon: true,
        removedPokemonIsMega: pokemon.formKind === "mega"
      })
  );
  const formPlans = formActionPatterns.map(({ slot, pokemon, form }) =>
    evaluateAdvisorSwapPlan(
      input,
      createAdvisorSimulationCandidate(
        form,
        input.environmentDataset,
        `${pokemon.nameJa}からのフォーム変更`
      ),
      slot.id
    )
  );
  const allPlans = [...generalPlans, ...formPlans];
  const additionPlans = generalPlans.filter(
    (plan) => plan.action.kind === "add"
  );
  const profile = input.profile ?? "standard";
  const overallPlans = selectDiverseOverallPlans(allPlans, profile);
  const plansByCategory = {
    overall: overallPlans,
    defensive: selectCategoryPlans(allPlans, "defensive", undefined, profile),
    offensive: selectCategoryPlans(allPlans, "offensive", undefined, profile),
    speed: selectCategoryPlans(allPlans, "speed", undefined, profile)
  };
  const typeGroups = getTypePlanGroups(allPlans, profile);
  const beforeThreats = input.threatSnapshot.currentDisplayedTop5;
  const threatRecommendations = getThreatRecommendationGroups(
    allPlans,
    beforeThreats
  );
  const formChangePlans = formPlans
    .filter(
      (plan) =>
        plan.action.kind === "form-change" &&
        plan.metrics.megaLimitPassed &&
        plan.metrics.megaRecommendationPassed &&
        plan.improvementScore > 0
    )
    .sort((left, right) => right.improvementScore - left.improvementScore)
    .slice(0, ADVISOR_RECOMMENDATION_RULES.maxPerCategory);
  return {
    threatSnapshot: input.threatSnapshot,
    evaluatedPlans: allPlans,
    plans: overallPlans,
    additionPlans,
    plansByCategory,
    typePlans: typeGroups.typePlans,
    typeOptions: typeGroups.typeOptions,
    threatRecommendations,
    threatTypeOptions: getAllTypes().map((type) => ({
      type: type.nameEn,
      label: type.nameJa
    })),
    formChangePlans,
    candidatePoolCount: eligibleCandidates.length,
    megaRecommendationStats: {
      candidatePoolBeforeMegaFilter: candidatesBeforeMegaFilter.length,
      candidatePoolAfterMegaFilter: eligibleCandidates.length,
      actionPatternsBeforeMegaFilter:
        generalActionPatternsBeforeMegaFilter.length +
        formActionPatternsBeforeMegaFilter.length,
      actionPatternsAfterMegaFilter:
        generalActionPatterns.length + formActionPatterns.length
    },
    evaluatedPatternCount: allPlans.length,
    recomputedThreatAnalysisCount: allPlans.length,
    rejectedPlanCount:
      allPlans.length - allPlans.filter((plan) => plan.isRecommendation).length
  };
}
