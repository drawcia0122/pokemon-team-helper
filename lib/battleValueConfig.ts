import type {
  BattleValueAxis,
  BattleValueTier
} from "@/types/battleValue";

export const BATTLE_VALUE_CONFIG = Object.freeze({
  minimumEvidenceShare: 0.01,
  conditionalPriorityMultipliers: {
    fakeout: 0.35,
    suckerpunch: 0.72
  } as Readonly<Record<string, number>>,
  choiceItemIds: ["choiceband", "choicescarf", "choicespecs"] as readonly string[],
  recoilMoveIds: [
    "bravebird",
    "doubleedge",
    "flareblitz",
    "headcharge",
    "headsmash",
    "lightofruin",
    "submission",
    "takedown",
    "volttackle",
    "wavecrash",
    "wildcharge",
    "woodhammer"
  ] as readonly string[],
  weights: {
    immediateBreak: 18,
    cleanup: 15,
    setupWinCondition: 15,
    priorityRevenge: 10,
    trade: 8,
    tempo: 10,
    snowball: 8,
    trapTargetRemoval: 8,
    roleCompression: 8,
    interactionBonus: 10
  } satisfies Record<BattleValueAxis | "interactionBonus", number>,
  teamFit: { minimum: -15, maximum: 15 },
  riskAdjustment: { minimum: -10, maximum: 0 },
  tierThresholds: {
    S: 85,
    A: 70,
    B: 55,
    C: 40,
    D: 25,
    E: 0
  } satisfies Record<BattleValueTier, number>
});

export function battleValueTier(value: number): BattleValueTier {
  if (value >= BATTLE_VALUE_CONFIG.tierThresholds.S) return "S";
  if (value >= BATTLE_VALUE_CONFIG.tierThresholds.A) return "A";
  if (value >= BATTLE_VALUE_CONFIG.tierThresholds.B) return "B";
  if (value >= BATTLE_VALUE_CONFIG.tierThresholds.C) return "C";
  if (value >= BATTLE_VALUE_CONFIG.tierThresholds.D) return "D";
  return "E";
}
