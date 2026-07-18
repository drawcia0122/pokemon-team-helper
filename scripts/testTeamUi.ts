import { getAvailablePokemonBySeason } from "@/lib/regulations";
import { getPokemonCandidateScores, getTypeCandidateScores } from "@/lib/scoring";
import {
  getTeamUiSummary,
  getTopRecommendations,
  isTeamSlotAllowed,
  TEAM_DETAIL_SECTIONS
} from "@/lib/teamUi";
import { summarizeTeam } from "@/lib/typeChart";
import type { TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const twoPokemonTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "empoleon" },
  { id: "slot-2", mode: "pokemon", pokemonSlug: "landorus-therian" }
];
const sixPokemonTeam: TeamSlot[] = [
  ...twoPokemonTeam,
  { id: "slot-3", mode: "pokemon", pokemonSlug: "charizard" },
  { id: "slot-4", mode: "pokemon", pokemonSlug: "gardevoir" },
  { id: "slot-5", mode: "pokemon", pokemonSlug: "garchomp" },
  { id: "slot-6", mode: "pokemon", pokemonSlug: "corviknight" }
];
const typeTeam: TeamSlot[] = [
  { id: "slot-type-1", mode: "type", primaryType: "water", secondaryType: "steel" },
  { id: "slot-type-2", mode: "type", primaryType: "ground" }
];

const twoSummary = getTeamUiSummary(summarizeTeam(twoPokemonTeam), twoPokemonTeam.length);
assert(twoSummary.canAnalyze, "2体入力時に分析を表示できません");
assert(twoSummary.emptySlots === 4, "空き4枠を表示できません");

const sixSummary = getTeamUiSummary(summarizeTeam(sixPokemonTeam), sixPokemonTeam.length);
assert(sixSummary.filledSlots === 6, "6体入力を表示できません");
assert(sixSummary.emptySlots === 0, "6体入力時に空き枠が残っています");

const typeSummary = getTeamUiSummary(summarizeTeam(typeTeam), typeTeam.length);
assert(typeSummary.canAnalyze, "タイプ直接指定時に分析を表示できません");

const seasonPokemon = getAvailablePokemonBySeason("season-m1");
assert(
  isTeamSlotAllowed(twoPokemonTeam[0], seasonPokemon),
  "使用可能ポケモンを使用不可と判定しました"
);
assert(
  !isTeamSlotAllowed(
    { id: "unavailable", mode: "pokemon", pokemonSlug: "bulbasaur" },
    seasonPokemon
  ),
  "使用不可ポケモンの警告条件を判定できません"
);

const typeCandidates = getTypeCandidateScores(twoPokemonTeam);
const pokemonCandidates = getPokemonCandidateScores(twoPokemonTeam, seasonPokemon);
assert(getTopRecommendations(typeCandidates).length === 3, "補完タイプ上位3件を表示できません");
assert(getTopRecommendations(pokemonCandidates).length === 3, "補完ポケモン上位3件を表示できません");
assert(
  pokemonCandidates[0]?.delta !== undefined,
  "候補選択前後の比較データを取得できません"
);
assert(
  TEAM_DETAIL_SECTIONS.every((section) => section.defaultOpen === false),
  "詳細パネルが初期状態で閉じていません"
);

console.log("[ok] 構築補助UIの表示条件と候補要約を検証しました");
