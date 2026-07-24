export const RECOMMENDATION_FUSION_CONFIG = {
  weights: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5],
  protectionMaximumDrop: 10,
  safe: {
    minimumTop20Retention: 0.75,
    minimumTop50Retention: 0.82,
    maximumAverageMovement: 12,
    minimumBattleValueReflection: 0.04,
    maximumBattleValueReflection: 0.4
  },
  danger: {
    maximumTop20Retention: 0.5,
    maximumTop50Retention: 0.65,
    minimumAverageMovement: 25,
    minimumBattleValueReflection: 0.65
  }
} as const;

export const FUSION_REPRESENTATIVE_SLUGS = [
  "gengar-mega",
  "starmie-mega",
  "lucario-mega",
  "blaziken-mega",
  "mawile-mega",
  "kingambit",
  "dragapult",
  "volcarona",
  "jolteon",
  "sylveon"
] as const;
