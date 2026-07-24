import { readFileSync } from "node:fs";
import { getDefensiveAbilityImmunities } from "@/lib/battleEffectiveness";
import {
  BATTLE_TAG_DEFINITIONS,
  getBattleTagIndex,
  getSemanticClassification,
  SEMANTIC_COMBAT_REGISTRY
} from "@/lib/semanticCombatRegistry";
import {
  formatSemanticCombatInspection,
  inspectSemanticCombatRegistry
} from "@/scripts/lib/semanticCombatHarness";
import { runRecommendationAnalyzer } from "@/scripts/lib/recommendationAnalyzerHarness";
import type {
  AbilitySemanticCategory,
  BattleTag,
  ItemSemanticCategory,
  MoveSemanticCategory,
  SemanticCategory,
  SemanticMetadata
} from "@/types/semanticCombat";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hasCategory<Category extends SemanticCategory>(
  semantics: readonly SemanticMetadata<Category>[],
  category: Category
): boolean {
  return semantics.some((entry) => entry.category === category);
}

function assertMove(moveId: string, category: MoveSemanticCategory): void {
  const classification = getSemanticClassification("move", moveId);
  assert(
    classification.status === "classified" &&
      hasCategory(classification.semantics, category),
    `${moveId}が${category}へ分類されていません`
  );
}

function assertAbility(
  abilityId: string,
  category: AbilitySemanticCategory
): void {
  const classification = getSemanticClassification("ability", abilityId);
  assert(
    classification.status === "classified" &&
      hasCategory(classification.semantics, category),
    `${abilityId}が${category}へ分類されていません`
  );
}

function assertItem(itemId: string, category: ItemSemanticCategory): void {
  const classification = getSemanticClassification("item", itemId);
  assert(
    classification.status === "classified" &&
      hasCategory(classification.semantics, category),
    `${itemId}が${category}へ分類されていません`
  );
}

for (const abilityId of [
  "hugepower",
  "purepower",
  "adaptability",
  "toughclaws",
  "sheerforce",
  "ironfist",
  "strongjaw"
]) {
  assertAbility(abilityId, "OffensiveMultiplier");
}
for (const abilityId of [
  "speedboost",
  "swiftswim",
  "chlorophyll",
  "sandrush",
  "slushrush"
]) {
  assertAbility(abilityId, "Speed");
}
for (const abilityId of [
  "moxie",
  "beastboost",
  "supremeoverlord",
  "grimneigh"
]) {
  assertAbility(abilityId, "Snowball");
}
for (const abilityId of ["shadowtag", "arenatrap", "magnetpull"]) {
  assertAbility(abilityId, "Trap");
}
for (const abilityId of [
  "multiscale",
  "furcoat",
  "icescales",
  "unaware"
]) {
  assertAbility(abilityId, "Defensive");
}
for (const abilityId of [
  "regenerator",
  "intimidate",
  "magicbounce",
  "prankster"
]) {
  assertAbility(abilityId, "Utility");
}

for (const moveId of ["dragondance", "quiverdance"]) {
  assertMove(moveId, "Setup");
}
for (const moveId of ["aquajet", "suckerpunch"]) {
  assertMove(moveId, "Priority");
}
assertMove("uturn", "Pivot");
assertMove("destinybond", "Trade");
assertMove("fakeout", "Tempo");
assertMove("fakeout", "Priority");

for (const [itemId, category] of [
  ["choicescarf", "ChoiceSpeed"],
  ["choiceband", "OffensiveBoost"],
  ["choicespecs", "OffensiveBoost"],
  ["lifeorb", "OffensiveBoost"],
  ["focussash", "Survival"],
  ["leftovers", "Recovery"],
  ["heavydutyboots", "HazardProtection"],
  ["assaultvest", "DefensiveBoost"],
  ["weaknesspolicy", "Snowball"],
  ["rockyhelmet", "ContactPunish"]
] as const) {
  assertItem(itemId, category);
}

const immunitySource = getDefensiveAbilityImmunities().find(
  (entry) => entry.abilityId === "levitate"
);
const levitate = getSemanticClassification("ability", "levitate");
assert(
  immunitySource?.immuneTypes.includes("ground") &&
    levitate.status === "classified" &&
    hasCategory(levitate.semantics, "Immunity") &&
    levitate.semantics
      .filter((entry) => entry.category === "Immunity")
      .every((entry) => entry.source.includes("TASK031")),
  "TASK031の無効特性定義をSemantic Registryから再利用できていません"
);

const allSemantics = [
  ...Object.values(SEMANTIC_COMBAT_REGISTRY.moves).flat(),
  ...Object.values(SEMANTIC_COMBAT_REGISTRY.abilities).flat(),
  ...Object.values(SEMANTIC_COMBAT_REGISTRY.items).flat(),
  ...Object.values(SEMANTIC_COMBAT_REGISTRY.statChanges).flat()
];
assert(
  allSemantics.every(
    (entry) =>
      entry.category.length > 0 &&
      (entry.confidence === "high" || entry.confidence === "medium") &&
      entry.source.length > 0 &&
      entry.description.length > 0 &&
      Array.isArray(entry.battleTags)
  ),
  "Semantic Metadataの必須項目が不足しています"
);

const expectedTags: BattleTag[] = [
  "WallBreak",
  "Cleanup",
  "Setup",
  "WinCondition",
  "PriorityFinish",
  "Trade",
  "Tempo",
  "Pivot",
  "RevengeKill",
  "Snowball",
  "HazardSetter",
  "HazardRemoval",
  "DefensiveAnchor",
  "Utility"
];
const tagIndex = getBattleTagIndex();
assert(
  BATTLE_TAG_DEFINITIONS.map((entry) => entry.tag).join("|") ===
    expectedTags.join("|") &&
    expectedTags.every((tag) => tagIndex[tag].length > 0),
  "Battle Tagsの定義またはRegistryからの生成結果が不足しています"
);

const unclassified = getSemanticClassification(
  "move",
  "semantic-fixture-unclassified"
);
assert(
  unclassified.status === "unclassified" &&
    unclassified.semantics.length === 0 &&
    unclassified.battleTags.length === 0,
  "未分類をUnclassifiedとして返していません"
);

const inspection = inspectSemanticCombatRegistry();
assert(
  inspection.coverage.coverage.moves.occurrenceCoverageRate >= 0.95,
  `Moves Coverageが95%未満です: ${inspection.coverage.coverage.moves.occurrenceCoverageRate}`
);
assert(
  inspection.coverage.coverage.abilities.occurrenceCoverageRate >= 0.95,
  `Abilities Coverageが95%未満です: ${inspection.coverage.coverage.abilities.occurrenceCoverageRate}`
);
assert(
  inspection.coverage.coverage.items.occurrenceCoverageRate >= 0.94,
  `Items Coverageが94%未満です: ${inspection.coverage.coverage.items.occurrenceCoverageRate}`
);
const report = formatSemanticCombatInspection(inspection);
for (const heading of [
  "技Semantic一覧",
  "特性Semantic一覧",
  "道具Semantic一覧",
  "能力変化Semantic一覧",
  "Battle Tags一覧",
  "未分類一覧",
  "Unclassified Moves",
  "Unclassified Abilities",
  "Unclassified Items"
]) {
  assert(report.includes(heading), `Debug出力に${heading}がありません`);
}
assert(!report.includes("Unknown"), "未分類へUnknown表記を使用しました");

for (const relativePath of [
  "lib/recommendationAnalyzer.ts",
  "lib/advisorSwapSimulator.ts",
  "lib/advisorExplanation.ts",
  "lib/teamThreats.ts",
  "lib/threatSnapshot.ts"
]) {
  const source = readFileSync(relativePath, "utf8");
  assert(
    !source.includes("semanticCombatRegistry"),
    `${relativePath}がTASK044 RegistryをRecommendationへ接続しています`
  );
}

const recommendation = runRecommendationAnalyzer();
const expectedTop20 = [
  "zoroark-hisui:12",
  "hydreigon:10",
  "sableye:7",
  "gholdengo:6",
  "mimikyu-disguised:5",
  "overqwil:3",
  "floette-mega:2",
  "archaludon:0",
  "tauros-paldea-blaze-breed:0",
  "umbreon:0",
  "polteageist:0",
  "banette-mega:-1",
  "bellibolt:-2",
  "jolteon:-2",
  "scizor-mega:-3",
  "houndstone:-3",
  "cofagrigus:-3",
  "raichu-mega-y:-4",
  "kingambit:-5",
  "staraptor-mega:-5"
];
assert(
  recommendation.recommendationTop20
    .map((entry) => `${entry.slug}:${entry.recommendationScore}`)
    .join("|") === expectedTop20.join("|"),
  "TASK043 Recommendation順位またはScoreが変化しました"
);

console.log(
  `[ok] TASK044 Semantic Combat Registry: moves=${inspection.stats.moveIds}/${inspection.stats.moveSemantics}, abilities=${inspection.stats.abilityIds}/${inspection.stats.abilitySemantics}, items=${inspection.stats.itemIds}/${inspection.stats.itemSemantics}, tags=${inspection.stats.battleTags}, coverage=${(inspection.coverage.coverage.moves.occurrenceCoverageRate * 100).toFixed(2)}%/${(inspection.coverage.coverage.abilities.occurrenceCoverageRate * 100).toFixed(2)}%/${(inspection.coverage.coverage.items.occurrenceCoverageRate * 100).toFixed(2)}%, recommendation=unchanged`
);
