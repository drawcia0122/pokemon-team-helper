import { readFileSync } from "node:fs";
import path from "node:path";
import pokemonData from "@/data/pokemon.json";
import {
  getPokemonBaseStatTotal,
  getRadarPoint,
  getRadarPolygonPoints,
  isPokemonBaseStats,
  POKEMON_BASE_STAT_CHART_MAX,
  resolveSelectedPokemonSlotId
} from "@/lib/pokemonBaseStats";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

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
assert(
  Math.max(
    ...pokemon.flatMap((entry) => Object.values(entry.baseStats ?? {}))
  ) === POKEMON_BASE_STAT_CHART_MAX,
  "全ポケモン共通のグラフ最大値がデータ最大値と一致しません"
);

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

const maximumPoint = getRadarPoint(0, POKEMON_BASE_STAT_CHART_MAX);
const minimumPoint = getRadarPoint(0, 0);
assert(
  maximumPoint.x === 100 && maximumPoint.y === 22,
  "最大値をレーダーチャート外周へ配置できません"
);
assert(
  minimumPoint.x === 100 && minimumPoint.y === 100,
  "ゼロ値をレーダーチャート中心へ配置できません"
);
assert(
  getRadarPolygonPoints([45, 49, 49, 65, 65, 45]).split(" ").length === 6,
  "6軸のレーダーポリゴンを生成できません"
);

const team: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "bulbasaur" },
  { id: "slot-2", mode: "type", primaryType: "water" },
  { id: "slot-3", mode: "pokemon", pokemonSlug: "deoxys-attack" }
];
assert(
  resolveSelectedPokemonSlotId(team, null) === "slot-1",
  "初期表示で最初のポケモンを選択できません"
);
assert(
  resolveSelectedPokemonSlotId(team, "slot-3") === "slot-3",
  "利用者が選んだポケモンを維持できません"
);
assert(
  resolveSelectedPokemonSlotId(team.slice(0, 2), "slot-3") === "slot-1",
  "選択中ポケモン削除後に表示を更新できません"
);
assert(
  resolveSelectedPokemonSlotId([team[1]], "slot-3") === null,
  "ポケモンがいない状態を判定できません"
);

const root = process.cwd();
const generatorSource = readFileSync(
  path.join(root, "scripts/fetchPokemonData.ts"),
  "utf8"
);
const panelSource = readFileSync(
  path.join(root, "components/team/PokemonStatsPanel.tsx"),
  "utf8"
);
const inputSource = readFileSync(
  path.join(root, "components/team/TeamInputPanel.tsx"),
  "utf8"
);

assert(
  generatorSource.includes('getBaseStat(pokemon, "hp")') &&
    generatorSource.includes('getBaseStat(pokemon, "special-attack")') &&
    generatorSource.includes('getBaseStat(pokemon, "speed")'),
  "PokéAPIデータ生成処理へフォーム別種族値を追加できません"
);
assert(
  panelSource.includes('role="img"') &&
    panelSource.includes("<dl") &&
    panelSource.includes("このポケモンの種族値データはまだありません") &&
    inputSource.includes('aria-pressed={isStatsSelected}'),
  "数値で理解できるUI、フォールバック、キーボード操作が不足しています"
);

console.log(
  `[ok] 種族値 ${pokemon.length}件・通常/特殊フォーム・極端値・選択更新・SVG座標を検証しました`
);
