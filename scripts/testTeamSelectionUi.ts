import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveSelectedPokemonSlotId } from "@/lib/pokemonBaseStats";
import {
  addTeamSlotToFirstEmpty,
  clearTeamSlotAtPosition,
  getTeamSlotsByPosition,
  setTeamSlotAtPosition,
  TEAM_SLOT_COUNT
} from "@/lib/teamSlotLayout";
import type { TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  getTeamSlotsByPosition([]).length === TEAM_SLOT_COUNT &&
    getTeamSlotsByPosition([]).every((slot) => slot === null),
  "初期状態で6枠すべてを空欄表示できません"
);

let team: TeamSlot[] = [];
team = setTeamSlotAtPosition(team, 3, {
  mode: "pokemon",
  pokemonSlug: "charizard"
});
assert(
  team.length === 1 &&
    team[0]?.id === "slot-4" &&
    getTeamSlotsByPosition(team)[3]?.mode === "pokemon",
  "任意の空欄へ直接ポケモンを設定できません"
);

team = setTeamSlotAtPosition(team, 0, {
  mode: "pokemon",
  pokemonSlug: "bulbasaur"
});
team = setTeamSlotAtPosition(team, 5, {
  mode: "type",
  primaryType: "water"
});
assert(
  getTeamSlotsByPosition(team).filter(Boolean).length === 3,
  "1〜6枠の独立した入力を維持できません"
);

team = clearTeamSlotAtPosition(team, 3);
assert(
  getTeamSlotsByPosition(team)[3] === null &&
    getTeamSlotsByPosition(team)[5]?.mode === "type",
  "削除時に他の枠の位置が変わりました"
);

team = addTeamSlotToFirstEmpty(team, {
  mode: "pokemon",
  pokemonSlug: "garchomp"
});
assert(
  getTeamSlotsByPosition(team)[1]?.mode === "pokemon",
  "補完候補を最初の空き枠へ追加できません"
);

const legacyTeam: TeamSlot[] = [
  { id: "saved-a", mode: "pokemon", pokemonSlug: "charizard" },
  { id: "saved-b", mode: "pokemon", pokemonSlug: "rotom-wash" }
];
assert(
  getTeamSlotsByPosition(legacyTeam)[0]?.id === "saved-a" &&
    getTeamSlotsByPosition(legacyTeam)[1]?.id === "saved-b",
  "既存localStorageの配列順を復元できません"
);

const selectionTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "charizard" },
  { id: "slot-3", mode: "pokemon", pokemonSlug: "rotom-wash" },
  { id: "slot-5", mode: "pokemon", pokemonSlug: "garchomp" }
];
assert(
  resolveSelectedPokemonSlotId(selectionTeam, "slot-3") === "slot-3",
  "表示中のポケモン枠を維持できません"
);
assert(
  resolveSelectedPokemonSlotId(
    selectionTeam.filter((slot) => slot.id !== "slot-3"),
    "slot-3"
  ) === "slot-5",
  "表示中の枠を削除した後に次の選択済み枠へ移動できません"
);
assert(
  resolveSelectedPokemonSlotId([], "slot-3") === null,
  "全枠空欄で種族値表示対象を解除できません"
);

const root = process.cwd();
const pageSource = readFileSync(path.join(root, "app/page.tsx"), "utf8");
const inputSource = readFileSync(
  path.join(root, "components/team/TeamInputPanel.tsx"),
  "utf8"
);
const statsSource = readFileSync(
  path.join(root, "components/team/PokemonStatsPanel.tsx"),
  "utf8"
);
assert(
  pageSource.includes("useState<TeamSlot[]>([])") &&
    !pageSource.includes("sampleTeam"),
  "localStorageがない初期状態を空パーティにできません"
);
assert(
  inputSource.includes('role="combobox"') &&
    inputSource.includes('role="listbox"') &&
    inputSource.includes('role="option"') &&
    inputSource.includes('event.key === "Enter"') &&
    inputSource.includes('event.key === "Escape"') &&
    inputSource.includes("closeAndRestore()"),
  "統合comboboxの検索・確定・取消・アクセシビリティが不足しています"
);
assert(
  !inputSource.includes("種族値を見る") &&
    !inputSource.includes("種族値を表示中") &&
    !inputSource.includes("メンバーを追加") &&
    !inputSource.includes("サンプルに戻す") &&
    inputSource.includes("PokemonCardBaseStats") &&
    inputSource.includes("slotStatsTotal"),
  "カード操作の簡略化またはカード内種族値表示が未完了です"
);
assert(
  pageSource.includes("<PokemonStatsPanel team={team} />") &&
    statsSource.includes('aria-label="種族値を表示するポケモン"') &&
    statsSource.includes("setPreferredSlotId(option.slotId)") &&
    statsSource.includes("resolveSelectedPokemonSlotId"),
  "種族値詳細パネルの枠切り替えまたは削除追従が不足しています"
);

console.log("[ok] 6枠固定表示・統合combobox・カード内数値・レーダー切り替えを検証しました");
