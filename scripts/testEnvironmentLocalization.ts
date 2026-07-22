import { readFileSync } from "node:fs";
import path from "node:path";
import localizationData from "@/data/environment/localization/ja.json";
import moveMetadataData from "@/data/environment/moveMetadata.json";
import overridesData from "@/data/environment/localization/showdown-ja-overrides.json";
import {
  localizeEnvironmentValue,
  resetEnvironmentLocalizationWarningsForTests
} from "@/lib/environmentLocalization";
import type { EnvironmentSnapshot } from "@/types/environmentData";
import type {
  EnvironmentLocalizationCategory,
  EnvironmentLocalizationDictionary,
  EnvironmentLocalizationOverrides
} from "@/types/environmentLocalization";
import type { EnvironmentMoveMetadataRegistry } from "@/types/environmentThreat";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const dictionary = localizationData as EnvironmentLocalizationDictionary;
const moveMetadata = moveMetadataData as EnvironmentMoveMetadataRegistry;
const overrides = overridesData as EnvironmentLocalizationOverrides;
const expectedCounts: Record<EnvironmentLocalizationCategory, number> = {
  moves: 937,
  items: 2136,
  abilities: 314,
  natures: 25
};

assert(dictionary.schemaVersion === 1 && dictionary.locale === "ja", "辞書schemaが不正です");
assert(dictionary.fallbackLabel === "未対応", "フォールバック表示が不正です");
assert(
  moveMetadata.schemaVersion === 1 &&
    Object.keys(moveMetadata.moves).length === 919,
  "技タイプ・物理特殊メタデータが不正です"
);
assert(/^[a-f0-9]{16}$/.test(dictionary.dictionaryVersion), "辞書version hashが不正です");
for (const category of Object.keys(expectedCounts) as EnvironmentLocalizationCategory[]) {
  assert(
    Object.keys(dictionary.categories[category]).length === expectedCounts[category],
    `${category}辞書件数が不正です`
  );
}

const examples: Array<[EnvironmentLocalizationCategory, string, string]> = [
  ["moves", "moonblast", "ムーンフォース"],
  ["moves", "calmmind", "めいそう"],
  ["moves", "drainingkiss", "ドレインキッス"],
  ["moves", "protect", "まもる"],
  ["items", "floettite", "フラエッテナイト"],
  ["items", "focussash", "きあいのタスキ"],
  ["items", "leftovers", "たべのこし"],
  ["items", "choiceband", "こだわりハチマキ"],
  ["items", "choicescarf", "こだわりスカーフ"],
  ["abilities", "fairyaura", "フェアリーオーラ"],
  ["abilities", "roughskin", "さめはだ"],
  ["abilities", "intimidate", "いかく"],
  ["abilities", "eelevate", "うなぎのぼり"],
  ["abilities", "firemane", "ほのおのたてがみ"],
  ["natures", "timid", "おくびょう"],
  ["natures", "modest", "ひかえめ"],
  ["natures", "jolly", "ようき"],
  ["natures", "adamant", "いじっぱり"]
];
for (const [category, id, expected] of examples) {
  const localized = localizeEnvironmentValue(dictionary, category, id);
  assert(localized.status === "localized" && localized.name === expected, `${category}:${id}を日本語化できません`);
}

const observed: Record<EnvironmentLocalizationCategory, Set<string>> = {
  moves: new Set(),
  items: new Set(),
  abilities: new Set(),
  natures: new Set()
};
const environmentIndex = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/environment/index.json"), "utf8")
) as { snapshots: Array<{ path: string }> };
for (const reference of environmentIndex.snapshots) {
  const snapshot = JSON.parse(
    readFileSync(path.join(process.cwd(), reference.path), "utf8")
  ) as EnvironmentSnapshot;
  for (const pokemon of snapshot.pokemon) {
    pokemon.moves.forEach((entry) => observed.moves.add(entry.id));
    pokemon.items.forEach((entry) => observed.items.add(entry.id));
    pokemon.abilities.forEach((entry) => observed.abilities.add(entry.id));
    pokemon.statSpreads.forEach((entry) => observed.natures.add(entry.natureId));
  }
}

let unresolved = 0;
for (const category of Object.keys(observed) as EnvironmentLocalizationCategory[]) {
  for (const sourceId of observed[category]) {
    const localized = localizeEnvironmentValue(dictionary, category, sourceId);
    if (localized.status === "missing") unresolved += 1;
    assert(localized.name !== sourceId, `${category}:${sourceId}の内部IDが表示名に残っています`);
  }
}
assert(unresolved === 0, `snapshotに未対応名称が${unresolved}件あります`);
const missingMoveMetadata = [...observed.moves].filter(
  (sourceId) => !moveMetadata.moves[sourceId]
);
assert(
  missingMoveMetadata.length === 0,
  `snapshotの技メタデータが不足しています: ${missingMoveMetadata.join(",")}`
);

const originalWarn = console.warn;
const warnings: string[] = [];
console.warn = (...values: unknown[]) => warnings.push(values.join(" "));
resetEnvironmentLocalizationWarningsForTests();
try {
  const first = localizeEnvironmentValue(dictionary, "moves", "futureunknownmove");
  const second = localizeEnvironmentValue(dictionary, "moves", "futureunknownmove");
  assert(first.name === "未対応" && first.status === "missing", "未対応のフォールバックが不正です");
  assert(second.name === "未対応", "フォールバック表示が安定していません");
  assert(warnings.length === 1 && warnings[0].includes("moves:futureunknownmove"), "未対応warningを1回だけ出力できません");
} finally {
  console.warn = originalWarn;
  resetEnvironmentLocalizationWarningsForTests();
}

const overrideCounts = Object.fromEntries(
  Object.entries(overrides.categories).map(([category, entries]) => [
    category,
    Object.keys(entries ?? {}).length
  ])
);
const observedCounts = Object.fromEntries(
  Object.entries(observed).map(([category, entries]) => [category, entries.size])
);
console.log(
  `[ok] 環境日本語辞書 ${JSON.stringify(expectedCounts)} / snapshot ${JSON.stringify(observedCounts)} / 技メタデータ919件 / 未対応0件 / override ${JSON.stringify(overrideCounts)}`
);
