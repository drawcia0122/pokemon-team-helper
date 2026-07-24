import type { RecommendationRepresentationMapEntry } from "@/types/semanticRecommendationGap";

export const SEMANTIC_RECOMMENDATION_REPRESENTATION_MAP: readonly RecommendationRepresentationMapEntry[] =
  [
    {
      tag: "WallBreak",
      classification: "partially-represented",
      directCategories: ["Coverage"],
      indirectCategories: ["Threat", "Move", "Ability"],
      gapWeight: 0.65,
      rationale: "攻撃範囲は評価されますが、受けを崩す継続圧力は直接評価されません。"
    },
    {
      tag: "Cleanup",
      classification: "partially-represented",
      directCategories: ["Speed"],
      indirectCategories: ["Move", "Usage"],
      gapWeight: 0.7,
      rationale: "素早さは評価されますが、終盤の一掃能力は独立評価されません。"
    },
    {
      tag: "Setup",
      classification: "unrepresented",
      directCategories: [],
      indirectCategories: ["Move", "Role"],
      gapWeight: 1,
      rationale: "積み技の存在は勝ち筋としてScoreへ接続されていません。"
    },
    {
      tag: "WinCondition",
      classification: "unrepresented",
      directCategories: [],
      indirectCategories: ["Role"],
      gapWeight: 1,
      rationale: "対戦を決める勝ち筋は現行カテゴリにありません。"
    },
    {
      tag: "PriorityFinish",
      classification: "partially-represented",
      directCategories: ["Speed"],
      indirectCategories: ["Move", "Threat"],
      gapWeight: 0.7,
      rationale: "先制技採用率の一部は速度評価へ入りますが、終盤処理価値は直接評価されません。"
    },
    {
      tag: "Trade",
      classification: "unrepresented",
      directCategories: [],
      indirectCategories: ["Move"],
      gapWeight: 1,
      rationale: "1対1交換や道連れの価値はScoreへ接続されていません。"
    },
    {
      tag: "Tempo",
      classification: "unrepresented",
      directCategories: [],
      indirectCategories: ["Speed", "Move", "Role"],
      gapWeight: 0.9,
      rationale: "行動・交代を制限して主導権を取る価値は直接評価されません。"
    },
    {
      tag: "Pivot",
      classification: "partially-represented",
      directCategories: ["Role"],
      indirectCategories: ["Move", "Type"],
      gapWeight: 0.55,
      rationale: "役割補完は評価されますが、対面操作の価値は限定的です。"
    },
    {
      tag: "RevengeKill",
      classification: "partially-represented",
      directCategories: ["Threat", "Speed"],
      indirectCategories: ["Move"],
      gapWeight: 0.55,
      rationale: "速度と対面処理は評価されますが、切り返し性能の全体は表現されません。"
    },
    {
      tag: "Snowball",
      classification: "unrepresented",
      directCategories: [],
      indirectCategories: ["Ability", "Role"],
      gapWeight: 1,
      rationale: "撃破後の連続強化はScoreへ接続されていません。"
    },
    {
      tag: "HazardSetter",
      classification: "partially-represented",
      directCategories: ["Role"],
      indirectCategories: ["Move"],
      gapWeight: 0.6,
      rationale: "役割として一部表現されますが、交代への累積負荷は直接評価されません。"
    },
    {
      tag: "HazardRemoval",
      classification: "represented",
      directCategories: ["Role", "Move"],
      indirectCategories: ["Type"],
      gapWeight: 0.2,
      rationale: "役割・技による構築補完として概ね評価されます。"
    },
    {
      tag: "DefensiveAnchor",
      classification: "represented",
      directCategories: ["Type", "Ability", "Role"],
      indirectCategories: ["Threat"],
      gapWeight: 0.2,
      rationale: "耐性、特性、役割、要警戒対策で直接評価されます。"
    },
    {
      tag: "Utility",
      classification: "partially-represented",
      directCategories: ["Role"],
      indirectCategories: ["Ability", "Move", "Threat"],
      gapWeight: 0.5,
      rationale: "一部の補助役割は評価されますが、妨害全般の価値は直接評価されません。"
    }
  ] as const;

export const SEMANTIC_REPRESENTATION_BY_TAG = Object.freeze(
  Object.fromEntries(
    SEMANTIC_RECOMMENDATION_REPRESENTATION_MAP.map((entry) => [
      entry.tag,
      entry
    ])
  )
);
