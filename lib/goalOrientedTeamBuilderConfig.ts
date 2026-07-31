import type {
  CandidateIdentity,
  TeamBuilderCoreAxis,
  TeamBuilderGoal,
  TeamBuilderGoalRole
} from "@/types/goalOrientedTeamBuilder";

export const CANDIDATE_IDENTITY_LABELS: Record<CandidateIdentity, string> = {
  "setup-sweeper": "積みエース",
  cleaner: "終盤の掃除役",
  "wall-breaker": "崩し役",
  trapper: "相手を逃がさない崩し役",
  pivot: "対面操作役",
  "defensive-anchor": "守りの軸",
  "hazard-setter": "設置技による削り役",
  "hazard-remover": "設置技の除去役",
  "tempo-support": "展開補助役",
  "weather-enabler": "天候の起点役",
  "trick-room-enabler": "トリックルームの起点役",
  "utility-support": "補助役",
  hybrid: "複数の役割を持つ候補"
};

type IdentityGoalLink = {
  compatibility: number;
  role: Exclude<TeamBuilderGoalRole, "conflict">;
};

const link = (
  compatibility: number,
  role: IdentityGoalLink["role"] = "primary"
): IdentityGoalLink => ({ compatibility, role });

export const CANDIDATE_IDENTITY_GOAL_COMPATIBILITY: Record<
  CandidateIdentity,
  Partial<Record<TeamBuilderGoal, IdentityGoalLink>>
> = {
  "setup-sweeper": {
    "hyper-offense": link(1),
    "bulky-offense": link(0.9),
    balance: link(0.78),
    "hazard-stack": link(0.45, "support"),
    rain: link(0.42, "support"),
    sand: link(0.42, "support"),
    sun: link(0.5, "support"),
    "trick-room": link(0.48, "support")
  },
  cleaner: {
    "hyper-offense": link(0.92),
    "bulky-offense": link(0.86),
    balance: link(0.7),
    "hazard-stack": link(0.62, "support"),
    rain: link(0.68),
    sand: link(0.68),
    sun: link(0.68)
  },
  "wall-breaker": {
    "hyper-offense": link(0.94),
    "bulky-offense": link(0.9),
    balance: link(0.76),
    "hazard-stack": link(0.66, "support"),
    "pivot-cycle": link(0.55, "support")
  },
  trapper: {
    "bulky-offense": link(0.84),
    "hyper-offense": link(0.8),
    balance: link(0.78),
    "pivot-cycle": link(0.65, "support"),
    stall: link(0.45, "support")
  },
  pivot: {
    "pivot-cycle": link(1),
    balance: link(0.92),
    "bulky-offense": link(0.86),
    rain: link(0.62, "support"),
    sun: link(0.62, "support"),
    sand: link(0.58, "support")
  },
  "defensive-anchor": {
    stall: link(1),
    balance: link(0.94),
    "bulky-offense": link(0.82, "support"),
    "pivot-cycle": link(0.72, "support"),
    "hyper-offense": link(0.18, "support")
  },
  "hazard-setter": {
    "hazard-stack": link(1),
    balance: link(0.78, "support"),
    "bulky-offense": link(0.8, "support"),
    "pivot-cycle": link(0.66, "support"),
    "hyper-offense": link(0.72, "support")
  },
  "hazard-remover": {
    balance: link(0.94, "support"),
    "pivot-cycle": link(0.88, "support"),
    "bulky-offense": link(0.84, "support"),
    stall: link(0.82, "support"),
    "hyper-offense": link(0.55, "support")
  },
  "tempo-support": {
    "hyper-offense": link(0.88, "support"),
    "pivot-cycle": link(0.9, "support"),
    balance: link(0.78, "support"),
    "bulky-offense": link(0.82, "support"),
    "hazard-stack": link(0.72, "support")
  },
  "weather-enabler": {
    rain: link(1),
    sand: link(1),
    sun: link(1),
    "bulky-offense": link(0.42, "support"),
    balance: link(0.38, "support")
  },
  "trick-room-enabler": {
    "trick-room": link(1),
    "bulky-offense": link(0.55, "support"),
    balance: link(0.5, "support")
  },
  "utility-support": {
    balance: link(0.86, "support"),
    "pivot-cycle": link(0.82, "support"),
    stall: link(0.78, "support"),
    "bulky-offense": link(0.7, "support"),
    "hyper-offense": link(0.58, "support"),
    "hazard-stack": link(0.62, "support")
  },
  hybrid: {
    balance: link(0.86),
    "bulky-offense": link(0.82),
    "hyper-offense": link(0.68),
    "pivot-cycle": link(0.7, "support"),
    "hazard-stack": link(0.6, "support"),
    stall: link(0.58, "support")
  }
};

export const TEAM_BUILDER_GOAL_LABELS: Record<TeamBuilderGoal, string> = {
  balance: "バランス",
  "bulky-offense": "耐久寄りの攻撃構築",
  stall: "耐久サイクル",
  "hyper-offense": "攻撃重視",
  rain: "雨",
  sand: "砂",
  sun: "晴れ",
  "trick-room": "トリックルーム",
  "hazard-stack": "設置技を軸にした構築",
  "pivot-cycle": "交代技を軸にしたサイクル"
};

export const TEAM_BUILDER_GOAL_AXIS_WEIGHTS: Record<
  TeamBuilderGoal,
  Record<TeamBuilderCoreAxis, number>
> = {
  balance: {
    offensiveCore: 0.17,
    defensiveCore: 0.17,
    abilityCore: 0.1,
    pivotCore: 0.1,
    setupCore: 0.08,
    cleanupCore: 0.1,
    winCondition: 0.1,
    cycleViability: 0.18
  },
  "bulky-offense": {
    offensiveCore: 0.22,
    defensiveCore: 0.15,
    abilityCore: 0.08,
    pivotCore: 0.1,
    setupCore: 0.12,
    cleanupCore: 0.12,
    winCondition: 0.13,
    cycleViability: 0.08
  },
  stall: {
    offensiveCore: 0.04,
    defensiveCore: 0.23,
    abilityCore: 0.18,
    pivotCore: 0.08,
    setupCore: 0.04,
    cleanupCore: 0.03,
    winCondition: 0.12,
    cycleViability: 0.28
  },
  "hyper-offense": {
    offensiveCore: 0.25,
    defensiveCore: 0.03,
    abilityCore: 0.04,
    pivotCore: 0.12,
    setupCore: 0.18,
    cleanupCore: 0.16,
    winCondition: 0.18,
    cycleViability: 0.04
  },
  rain: {
    offensiveCore: 0.22,
    defensiveCore: 0.08,
    abilityCore: 0.08,
    pivotCore: 0.15,
    setupCore: 0.08,
    cleanupCore: 0.18,
    winCondition: 0.14,
    cycleViability: 0.07
  },
  sand: {
    offensiveCore: 0.18,
    defensiveCore: 0.14,
    abilityCore: 0.12,
    pivotCore: 0.08,
    setupCore: 0.1,
    cleanupCore: 0.14,
    winCondition: 0.14,
    cycleViability: 0.1
  },
  sun: {
    offensiveCore: 0.23,
    defensiveCore: 0.07,
    abilityCore: 0.09,
    pivotCore: 0.13,
    setupCore: 0.1,
    cleanupCore: 0.16,
    winCondition: 0.15,
    cycleViability: 0.07
  },
  "trick-room": {
    offensiveCore: 0.2,
    defensiveCore: 0.11,
    abilityCore: 0.08,
    pivotCore: 0.08,
    setupCore: 0.14,
    cleanupCore: 0.08,
    winCondition: 0.2,
    cycleViability: 0.11
  },
  "hazard-stack": {
    offensiveCore: 0.14,
    defensiveCore: 0.12,
    abilityCore: 0.1,
    pivotCore: 0.12,
    setupCore: 0.08,
    cleanupCore: 0.13,
    winCondition: 0.14,
    cycleViability: 0.17
  },
  "pivot-cycle": {
    offensiveCore: 0.1,
    defensiveCore: 0.16,
    abilityCore: 0.12,
    pivotCore: 0.22,
    setupCore: 0.05,
    cleanupCore: 0.08,
    winCondition: 0.08,
    cycleViability: 0.19
  }
};

export const GOAL_ORIENTED_TEAM_BUILDER_CONFIG = {
  schemaVersion: 2,
  maximumChainDepth: 3,
  maximumImmediatePreviews: 3,
  futurePoolSize: 48,
  minimumViableFutureScore: 48,
  minimumDirectGoalAffinity: 18,
  minimumGoalEvidence: 0.12,
  minimumIdentityEvidence: 0.18,
  minimumSecondaryIdentityScore: 24,
  highConfidenceGoalSwitchDelta: 10,
  normalGoalSwitchDelta: 6,
  scoreWeights: {
    currentFit: 0.46,
    futurePotential: 0.14,
    coreQuality: 0.2,
    identityGoalCompatibility: 0.2,
    deadEndRisk: 0.16,
    identityConflictPenalty: 0.18
  },
  formula:
    "currentFit*0.46 + futurePotential*0.14 + coreQuality*0.20 + identityGoalCompatibility*0.20 - deadEndRisk*0.16 - identityConflictPenalty*0.18"
} as const;
