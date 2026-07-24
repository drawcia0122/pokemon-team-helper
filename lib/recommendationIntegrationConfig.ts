import type {
  RecommendationContributionCategory
} from "@/lib/recommendationAnalyzer";

export const RECOMMENDATION_INTEGRATION_CONFIG = {
  battleValueWeight: 0.15,
  baselineContinuityWeight: 0.95,
  contributionWeight: 0.05,
  normalization: "percentile-rank",
  contributionWeights: {
    Threat: 0.18,
    Coverage: 0.14,
    Role: 0.16,
    Speed: 0.08,
    Type: 0.12,
    Ability: 0.07,
    Move: 0.08,
    Usage: 0.05,
    Environment: 0.04,
    Risk: 0.08
  } satisfies Record<RecommendationContributionCategory, number>
} as const;

export const BATTLE_VALUE_AXIS_LABELS = {
  immediateBreak: "Break",
  cleanup: "Cleanup",
  setupWinCondition: "Setup",
  priorityRevenge: "Priority Finish",
  trade: "Trade",
  tempo: "Tempo",
  snowball: "Snowball",
  trapTargetRemoval: "Trap",
  roleCompression: "Compression"
} as const;

export const BATTLE_VALUE_AXIS_EXPLANATIONS = {
  immediateBreak: "高火力で相手の受けを崩しやすいです。",
  cleanup: "終盤に残った相手を詰めやすいです。",
  setupWinCondition: "能力を上げて勝ち筋を作れます。",
  priorityRevenge: "先制技や素早さを生かして相手を仕留めやすいです。",
  trade: "不利な相手とも1対1交換を狙えます。",
  tempo: "交代技や妨害技で試合の流れを取りやすいです。",
  snowball: "一度有利を取ると、そのまま攻め続けやすいです。",
  trapTargetRemoval: "相手を逃がさず、重要な役割を崩しやすいです。",
  roleCompression: "複数の戦闘役割を1枠で担えます。"
} as const;
