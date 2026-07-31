import { getDefensiveAbilityImmunities } from "@/lib/battleEffectiveness";
import { getSemanticClassification } from "@/lib/semanticCombatRegistry";
import type {
  AbilityDenialCategory,
  AbilityDenialProfile,
  AbilityDenialSemantic
} from "@/types/matchupCore";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";

const descriptions: Record<AbilityDenialCategory, string> = {
  SetupDenial: "相手の能力上昇をそのまま勝ち筋にさせにくくします。",
  StatDropDenial: "能力下降を使った崩しを抑えます。",
  ResidualDamageDenial: "攻撃技以外の定数ダメージを抑えます。",
  StatusDenial: "状態異常を使った展開を抑えます。",
  HazardDenial: "設置技による負荷を抑えます。",
  TypeImmunity: "特定タイプの攻撃を無効化します。",
  DamageReduction: "条件を満たす攻撃のダメージを軽減します。",
  RecoverySupport: "繰り返し行動するための回復を支えます。",
  ContactPunish: "接触技を使う相手へ追加の負荷を与えます。",
  EntryPunish: "場へ出た相手や補助行動へ負荷を与えます。",
  TrapDenial: "交代を封じる戦術への回答を持ちます。",
  WeatherDenial: "天候を利用する攻めを抑えます。",
  PrioritySupport: "優先度を利用した行動を支えます。",
  SpeedControl: "行動順を有利にする手段を持ちます。",
  PivotSupport: "交代を繰り返す動きを支えます。",
  Reflection: "対象となる妨害を相手へ返します。",
  AbilitySuppression: "相手の特性を無効化・変更します。",
  PassiveProgress: "受けながら相手へ継続的な負荷を与えます。",
  DefensiveSnowballControl: "能力上昇による連続突破を抑えます。"
};

const categories: Record<string, AbilityDenialCategory[]> = {
  unaware: ["SetupDenial", "DefensiveSnowballControl"],
  magicguard: ["ResidualDamageDenial", "HazardDenial"],
  mirrorarmor: ["StatDropDenial", "Reflection"],
  magicbounce: ["Reflection", "StatusDenial", "HazardDenial", "EntryPunish"],
  regenerator: ["RecoverySupport", "PivotSupport"],
  intimidate: ["DamageReduction", "PivotSupport"],
  multiscale: ["DamageReduction"],
  shadowshield: ["DamageReduction"],
  furcoat: ["DamageReduction"],
  icescales: ["DamageReduction"],
  filter: ["DamageReduction"],
  solidrock: ["DamageReduction"],
  prismarmor: ["DamageReduction"],
  roughskin: ["ContactPunish", "PassiveProgress"],
  ironbarbs: ["ContactPunish", "PassiveProgress"],
  flamebody: ["ContactPunish", "StatusDenial"],
  poisonpoint: ["ContactPunish", "StatusDenial"],
  waterveil: ["StatusDenial"],
  immunity: ["StatusDenial"],
  purifyingsalt: ["StatusDenial", "DamageReduction"],
  naturalcure: ["StatusDenial", "PivotSupport"],
  overcoat: ["ResidualDamageDenial", "WeatherDenial"],
  sandveil: ["WeatherDenial"],
  airlock: ["WeatherDenial"],
  cloudnine: ["WeatherDenial"],
  prankster: ["PrioritySupport", "SpeedControl"],
  speedboost: ["SpeedControl"],
  commander: ["AbilitySuppression"],
  neutralizinggas: ["AbilitySuppression"],
  goodasgold: ["StatusDenial"],
  armortail: ["PrioritySupport"],
  queenlymajesty: ["PrioritySupport"]
};

for (const immunity of getDefensiveAbilityImmunities()) {
  categories[immunity.abilityId] = [
    ...new Set<AbilityDenialCategory>([
      ...(categories[immunity.abilityId] ?? []),
      "TypeImmunity"
    ])
  ];
}

export function getAbilityDenialSemantics(
  abilityId: string
): readonly AbilityDenialSemantic[] {
  return (categories[abilityId.toLowerCase()] ?? []).map((category) => ({
    category,
    confidence: "high",
    source:
      category === "TypeImmunity"
        ? "TASK031 immunity registry"
        : "Semantic Combat Registry",
    description: descriptions[category]
  }));
}

const moveDemand: Partial<Record<AbilityDenialCategory, string[]>> = {
  SetupDenial: ["Setup"],
  DefensiveSnowballControl: ["Setup"],
  ResidualDamageDenial: ["Hazard"],
  HazardDenial: ["Hazard"],
  StatusDenial: ["Tempo"],
  StatDropDenial: ["Tempo"],
  Reflection: ["Tempo", "Hazard"],
  PivotSupport: ["Pivot"],
  RecoverySupport: ["Recovery"],
  PrioritySupport: ["Priority"],
  SpeedControl: ["Priority", "Tempo"]
};

export type AbilityEnvironmentDemand = Partial<
  Record<AbilityDenialCategory, number>
>;

export function buildAbilityEnvironmentDemand(
  dataset: ThreatEnvironmentDataset
): AbilityEnvironmentDemand {
  const demand: AbilityEnvironmentDemand = {};
  let totalWeight = 0;
  for (const pokemon of dataset.pokemon.filter(
    (entry) => entry.usageRate >= dataset.metadata.minimumUsageRate
  )) {
    const usage = Math.sqrt(pokemon.usageRate);
    totalWeight += usage;
    for (const move of pokemon.moves) {
      const classification = getSemanticClassification("move", move.id);
      if (classification.status === "unclassified") continue;
      for (const [category, semanticCategories] of Object.entries(moveDemand)) {
        if (
          semanticCategories?.some((semanticCategory) =>
            classification.semantics.some(
              (semantic) => semantic.category === semanticCategory
            )
          )
        ) {
          const key = category as AbilityDenialCategory;
          demand[key] = (demand[key] ?? 0) + usage * Math.min(1, move.share);
        }
      }
    }
  }
  for (const key of Object.keys(demand) as AbilityDenialCategory[]) {
    demand[key] = Math.min(1, (demand[key] ?? 0) / Math.max(0.001, totalWeight));
  }
  const defaultDemand = 0.28;
  for (const category of Object.values(categories).flat()) {
    demand[category] ??= defaultDemand;
  }
  return demand;
}

function confidence(
  entry: ThreatEnvironmentPokemon | undefined,
  unclassified: string[]
): "high" | "medium" | "low" {
  if (!entry || entry.abilities.length === 0) return "low";
  return unclassified.length === 0 ? "high" : "medium";
}

export function buildAbilityDenialProfile({
  pokemonSlug,
  environment,
  demand,
  teamCoverage = {}
}: {
  pokemonSlug: string;
  environment: ThreatEnvironmentPokemon | undefined;
  demand: AbilityEnvironmentDemand;
  teamCoverage?: Partial<Record<AbilityDenialCategory, number>>;
}): AbilityDenialProfile {
  const abilities = environment?.abilities ?? [];
  const totalShare = abilities.reduce((sum, ability) => sum + ability.share, 0);
  const normalized = totalShare > 1 ? totalShare : 1;
  const unclassified: string[] = [];
  const entries = abilities.map((ability) => {
    const semantics = getAbilityDenialSemantics(ability.id);
    const combat = getSemanticClassification("ability", ability.id);
    const combatSemantics =
      combat.status === "classified" ? combat.semantics : [];
    const adoptionRate = Math.min(1, ability.share / normalized);
    if (semantics.length === 0 && combatSemantics.length === 0) {
      unclassified.push(ability.id);
    }
    const relevance =
      semantics.length === 0
        ? Math.max(
            0,
            ...combatSemantics.map((semantic) =>
              ["OffensiveMultiplier", "Snowball", "Trap", "Speed"].includes(
                semantic.category
              )
                ? 0.58
                : ["Defensive", "Utility", "Immunity"].includes(
                      semantic.category
                    )
                  ? 0.42
                  : 0.35
            )
          )
        : semantics.reduce(
            (sum, semantic) => sum + (demand[semantic.category] ?? 0.2),
            0
          ) / semantics.length;
    const need =
      semantics.length === 0
        ? combatSemantics.length > 0
          ? 0.5
          : 0
        : semantics.reduce(
            (sum, semantic) =>
              sum + (1 - Math.min(1, teamCoverage[semantic.category] ?? 0)),
            0
          ) / semantics.length;
    const matchupValue = Math.min(
      100,
      Math.round((relevance * 0.65 + need * 0.35) * adoptionRate * 100)
    );
    return {
      ability: ability.id,
      abilityName: ability.name,
      adoptionRate,
      denialCategories: semantics.map((semantic) => semantic.category),
      matchupValue,
      confidence:
        semantics.length === 0 && combatSemantics.length === 0
          ? ("low" as const)
          : ("high" as const),
      explanations:
        semantics.length > 0
          ? semantics.map((semantic) => semantic.description)
          : combatSemantics.map((semantic) => semantic.description)
    };
  });
  const categoryCoverage: AbilityDenialProfile["categoryCoverage"] = {};
  for (const entry of entries) {
    for (const category of entry.denialCategories) {
      categoryCoverage[category] =
        1 -
        (1 - (categoryCoverage[category] ?? 0)) *
          (1 - entry.adoptionRate);
    }
  }
  const expectedValue = Math.min(
    100,
    entries.reduce((sum, entry) => sum + entry.matchupValue, 0)
  );
  return {
    pokemonSlug,
    entries,
    categoryCoverage,
    expectedValue,
    confidence: confidence(environment, unclassified),
    unclassified: [...new Set(unclassified)].sort()
  };
}
