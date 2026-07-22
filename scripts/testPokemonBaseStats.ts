import { readFileSync } from "node:fs";
import path from "node:path";
import pokemonData from "@/data/pokemon.json";
import {
  getPokemonBaseStatTotal,
  getRadarPoint,
  getRadarPolygonPoints,
  isPokemonBaseStats,
  POKEMON_BASE_STAT_CHART_MAX,
  POKEMON_BASE_STAT_DEFINITIONS
} from "@/lib/pokemonBaseStats";
import type { PokemonEntry } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const pokemon = pokemonData as PokemonEntry[];
const bulbasaur = pokemon.find((entry) => entry.slug === "bulbasaur");
const deoxysAttack = pokemon.find((entry) => entry.slug === "deoxys-attack");
const blissey = pokemon.find((entry) => entry.slug === "blissey");
const shedinja = pokemon.find((entry) => entry.slug === "shedinja");
const requiredFormSlugs = [
  "charizard",
  "charizard-mega-x",
  "charizard-mega-y",
  "rotom",
  "rotom-wash",
  "giratina-altered",
  "giratina-origin",
  "tauros",
  "tauros-paldea-aqua-breed"
] as const;

assert(pokemon.length === 1350, "既存のポケモン1350件を維持できません");
assert(
  pokemon.every((entry) => isPokemonBaseStats(entry.baseStats)),
  "全ポケモンに完全な種族値がありません"
);
assert(
  bulbasaur?.baseStats?.hp === 45 &&
    bulbasaur.baseStats.attack === 49 &&
    bulbasaur.baseStats.defense === 49 &&
    bulbasaur.baseStats.specialAttack === 65 &&
    bulbasaur.baseStats.specialDefense === 65 &&
    bulbasaur.baseStats.speed === 45 &&
    getPokemonBaseStatTotal(bulbasaur.baseStats) === 318,
  "通常ポケモンの種族値が不正です"
);
assert(
  deoxysAttack?.baseStats?.attack === 180 &&
    deoxysAttack.baseStats.defense === 20 &&
    deoxysAttack.baseStats.specialAttack === 180 &&
    deoxysAttack.baseStats.specialDefense === 20 &&
    getPokemonBaseStatTotal(deoxysAttack.baseStats) === 600,
  "特殊フォーム固有の種族値を保持できません"
);
assert(blissey?.baseStats?.hp === 255, "極端に高い種族値を保持できません");
assert(shedinja?.baseStats?.hp === 1, "極端に低い種族値を保持できません");
const requiredForms = requiredFormSlugs.map((slug) =>
  pokemon.find((entry) => entry.slug === slug)
);
assert(
  requiredForms.every((entry) => entry && isPokemonBaseStats(entry.baseStats)),
  "必須フォームの種族値を解決できません"
);
for (const [leftIndex, rightIndex] of [[0, 1], [1, 2], [3, 4], [5, 6], [7, 8]]) {
  assert(
    JSON.stringify(requiredForms[leftIndex]?.baseStats) !==
      JSON.stringify(requiredForms[rightIndex]?.baseStats),
    `${requiredFormSlugs[leftIndex]}と${requiredFormSlugs[rightIndex]}の種族値差を反映できません`
  );
}
assert(isPokemonBaseStats(bulbasaur?.baseStats), "正常な種族値を判定できません");
assert(!isPokemonBaseStats(undefined), "未定義の種族値を拒否できません");
assert(
  !isPokemonBaseStats({
    hp: 45,
    attack: 49,
    defense: 49,
    specialAttack: 65,
    specialDefense: 65
  }),
  "不足した種族値を拒否できません"
);

assert(
  POKEMON_BASE_STAT_DEFINITIONS.map(({ shortLabel }) => shortLabel).join(",") ===
    "HP,A,B,C,D,S",
  "カード用の種族値ラベルが不正です"
);
assert(
  Math.max(
    ...pokemon.flatMap((entry) =>
      entry.baseStats ? Object.values(entry.baseStats) : []
    )
  ) === POKEMON_BASE_STAT_CHART_MAX,
  "全ポケモン共通のレーダーチャート最大値が不正です"
);
const maximumPoint = getRadarPoint(0, POKEMON_BASE_STAT_CHART_MAX);
const minimumPoint = getRadarPoint(0, 0);
assert(
  maximumPoint.x === 100 && maximumPoint.y === 22,
  "最大値のレーダー座標が不正です"
);
assert(
  minimumPoint.x === 100 && minimumPoint.y === 100,
  "0のレーダー座標が不正です"
);
assert(
  getRadarPolygonPoints([1, 2, 3, 4, 5, 6]).split(" ").length === 6,
  "6項目のレーダーポリゴンを生成できません"
);

const root = process.cwd();
const generatorSource = readFileSync(
  path.join(root, "scripts/fetchPokemonData.ts"),
  "utf8"
);
const inputSource = readFileSync(
  path.join(root, "components/team/TeamInputPanel.tsx"),
  "utf8"
);
const panelSource = readFileSync(
  path.join(root, "components/team/PokemonStatsPanel.tsx"),
  "utf8"
);
const styleSource = readFileSync(
  path.join(root, "components/team/TeamWorkspace.module.css"),
  "utf8"
);

assert(
  generatorSource.includes('getBaseStat(pokemon, "hp")') &&
    generatorSource.includes('getBaseStat(pokemon, "special-attack")') &&
    generatorSource.includes('getBaseStat(pokemon, "speed")'),
  "PokéAPIデータ生成処理へフォーム別種族値を追加できません"
);
assert(
  inputSource.includes("<dl") &&
    inputSource.includes("種族値データなし") &&
    inputSource.includes("slotStatsTotal") &&
    inputSource.includes("getPokemonBaseStatTotal") &&
    styleSource.includes("grid-template-columns: repeat(3,minmax(0,1fr))") &&
    !inputSource.includes("種族値を見る") &&
    !inputSource.includes("種族値を表示中"),
  "TASK019のカード内数値表示またはフォールバックを維持できません"
);
assert(
  panelSource.includes('role="img"') &&
    panelSource.includes('aria-label="種族値を表示するポケモン"') &&
    panelSource.includes("POKEMON_BASE_STAT_CHART_MAX") &&
    panelSource.includes("resolveSelectedPokemonSlotId") &&
    !panelSource.includes("<dl") &&
    styleSource.includes(".radarChart"),
  "詳細パネルのレーダーチャートまたは6枠切り替えが不足しています"
);

console.log(
  `[ok] 種族値 ${pokemon.length}件・カード内数値・最大255のレーダー表示を検証しました`
);
