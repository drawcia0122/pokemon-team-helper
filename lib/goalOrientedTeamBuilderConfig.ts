import type {
  TeamBuilderCoreAxis,
  TeamBuilderGoal
} from "@/types/goalOrientedTeamBuilder";

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
  schemaVersion: 1,
  maximumChainDepth: 3,
  maximumImmediatePreviews: 3,
  futurePoolSize: 48,
  minimumViableFutureScore: 48,
  minimumDirectGoalAffinity: 18,
  minimumGoalEvidence: 0.12,
  scoreWeights: {
    currentFit: 0.5,
    futurePotential: 0.18,
    coreQuality: 0.32,
    deadEndRisk: 0.2
  },
  formula:
    "currentFit*0.50 + futurePotential*0.18 + coreQuality*0.32 - deadEndRisk*0.20"
} as const;
