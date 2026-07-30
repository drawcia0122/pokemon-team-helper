import type { ContestabilityAxis } from "@/types/contestability";

export const CONTESTABILITY_CONFIG = {
  weight: 0.1,
  recommendationConfidenceFloor: 0.18,
  recommendationConfidenceMaximum: 1.05,
  directActionConfidenceBoost: 0.35,
  recommendationConfidenceMidpoint: 55,
  recommendationConfidenceSlope: 0.4,
  axisWeights: {
    environment: 0.45,
    team: 0.3,
    matchup: 0.1,
    reliability: 0.15
  } satisfies Record<ContestabilityAxis, number>,
  evaluatedThreatLimit: 10,
  minimumUsageRate: 0.001,
  normalUsageConfidenceRate: 0.03,
  conditionalPriorityMoveIds: ["suckerpunch"] as readonly string[],
  lowAccuracyMoveIds: [
    "blizzard",
    "dynamicpunch",
    "fireblast",
    "focusblast",
    "gunkshot",
    "hurricane",
    "hydropump",
    "megahorn",
    "stoneedge",
    "thunder",
    "thunderwave",
    "willowisp",
    "zapcannon"
  ] as readonly string[]
} as const;
