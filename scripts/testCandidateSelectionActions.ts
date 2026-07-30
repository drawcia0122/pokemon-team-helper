import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applyAdvisorCandidateAction,
  getAdvisorCandidateActionability,
  getAdvisorTeamStateSignature
} from "@/lib/advisorCandidateActions";
import {
  filterPokemonSelectionByTypes,
  sortPokemonSelectionOptions
} from "@/lib/teamCandidateSelection";
import { getTeamSlotsByPosition } from "@/lib/teamSlotLayout";
import {
  getAvailablePokemonBySeason,
  getSeasonDefinitions
} from "@/lib/regulations";
import { getAllTypes, getPokemonBySlug } from "@/lib/typeChart";
import type { TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const seasons = getSeasonDefinitions();
assert(seasons.length >= 2, "レギュレーション変更fixtureが不足しています");
const alternateSeason = seasons.find(
  (season) => season.regulationId !== seasons[0].regulationId
);
assert(alternateSeason, "異なるレギュレーションのseason fixtureが不足しています");
const available = getAvailablePokemonBySeason(seasons[0].id);
const alternateAvailable = getAvailablePokemonBySeason(alternateSeason.id);
const availableSlugs = new Set(available.map((pokemon) => pokemon.slug));
const alternateSlugs = new Set(alternateAvailable.map((pokemon) => pokemon.slug));
const candidate = available.find((pokemon) => pokemon.slug === "garchomp") ?? available[0];
assert(candidate, "追加候補fixtureが不足しています");

const gapTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "dragonite" },
  { id: "slot-3", mode: "pokemon", pokemonSlug: "corviknight" }
];
const addResult = applyAdvisorCandidateAction({
  team: gapTeam,
  sourceTeam: gapTeam.map((slot) => ({ ...slot })),
  candidate,
  action: { kind: "add", removedSlotId: null, removedLabel: null },
  availablePokemon: available
});
const addedSlot = getTeamSlotsByPosition(addResult.team)[1];
assert(
  addResult.actionability.allowed &&
    addedSlot?.mode === "pokemon" &&
    addedSlot.id === "slot-2" &&
    gapTeam.length === 2,
  "候補を最初の空き枠へ非破壊で追加できません"
);

const fullTeam: TeamSlot[] = [
  "dragonite",
  "corviknight",
  "rotom-wash",
  "kingambit",
  "volcarona",
  "primarina"
].map((pokemonSlug, index) => ({
  id: `slot-${index + 1}`,
  mode: "pokemon" as const,
  pokemonSlug
}));
assert(
  getAdvisorCandidateActionability({
    team: fullTeam,
    sourceTeam: fullTeam,
    candidate,
    action: { kind: "add", removedSlotId: null, removedLabel: null },
    availablePokemon: available
  }).code === "team-full",
  "6枠満杯の追加操作を無効化できません"
);

const replacement = available.find((pokemon) => pokemon.slug === "gengar");
assert(replacement, "交換候補fixtureが不足しています");
const replaceResult = applyAdvisorCandidateAction({
  team: fullTeam,
  sourceTeam: fullTeam.map((slot) => ({ ...slot })),
  candidate: replacement,
  action: {
    kind: "replace",
    removedSlotId: "slot-2",
    removedLabel: "アーマーガア"
  },
  availablePokemon: available
});
const replacedSlot = getTeamSlotsByPosition(replaceResult.team)[1];
assert(
  replaceResult.actionability.allowed &&
    replaceResult.team.length === 6 &&
    replacedSlot?.mode === "pokemon" &&
    replacedSlot.id === "slot-2" &&
    replacedSlot.pokemonSlug === replacement.slug,
  "交換候補を同じ枠へatomicに適用できません"
);

const charizard = getPokemonBySlug("charizard");
const charizardMegaX = getPokemonBySlug("charizard-mega-x");
assert(
  charizard && charizardMegaX && availableSlugs.has(charizardMegaX.slug),
  "フォーム変更fixtureが不足しています"
);
const formTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: charizard.slug }
];
const formResult = applyAdvisorCandidateAction({
  team: formTeam,
  sourceTeam: formTeam,
  candidate: charizardMegaX,
  action: {
    kind: "form-change",
    removedSlotId: "slot-1",
    removedLabel: charizard.nameJa
  },
  availablePokemon: available
});
assert(
  formResult.actionability.allowed &&
    formResult.team[0]?.id === "slot-1" &&
    formResult.team[0]?.mode === "pokemon" &&
    formResult.team[0].pokemonSlug === charizardMegaX.slug,
  "フォーム変更を同じ枠へ保存できません"
);

const staleTeam: TeamSlot[] = [...gapTeam, {
  id: "slot-2",
  mode: "pokemon",
  pokemonSlug: "rotom-wash"
}];
assert(
  getAdvisorTeamStateSignature(gapTeam) !== getAdvisorTeamStateSignature(staleTeam) &&
    getAdvisorCandidateActionability({
      team: staleTeam,
      sourceTeam: gapTeam,
      candidate,
      action: { kind: "add", removedSlotId: null, removedLabel: null },
      availablePokemon: available
    }).code === "stale-suggestion",
  "古い提案を現在チームへ適用できないようにできません"
);

assert(
  getAdvisorCandidateActionability({
    team: fullTeam,
    sourceTeam: fullTeam,
    candidate: getPokemonBySlug("dragonite")!,
    action: {
      kind: "replace",
      removedSlotId: "slot-2",
      removedLabel: "アーマーガア"
    },
    availablePokemon: available
  }).code === "duplicate-species" &&
    getAdvisorCandidateActionability({
      team: fullTeam,
      sourceTeam: fullTeam,
      candidate: replacement,
      action: {
        kind: "replace",
        removedSlotId: "slot-2",
        removedLabel: "アーマーガア"
      },
      availablePokemon: []
    }).code === "unavailable",
  "同種重複またはルール使用不可の理由を分離できません"
);
const invalidForm = getPokemonBySlug("charizard-gmax");
assert(
  invalidForm &&
    getAdvisorCandidateActionability({
      team: fullTeam,
      sourceTeam: fullTeam,
      candidate: invalidForm,
      action: {
        kind: "replace",
        removedSlotId: "slot-2",
        removedLabel: "アーマーガア"
      },
      availablePokemon: [invalidForm]
    }).code === "invalid-form",
  "表示専用フォームを適用不可にできません"
);
const gengarMega = getPokemonBySlug("gengar-mega");
assert(
  gengarMega && availableSlugs.has(gengarMega.slug) &&
    getAdvisorCandidateActionability({
      team: [{
        id: "slot-1",
        mode: "pokemon",
        pokemonSlug: charizardMegaX.slug
      }],
      sourceTeam: [{
        id: "slot-1",
        mode: "pokemon",
        pokemonSlug: charizardMegaX.slug
      }],
      candidate: gengarMega,
      action: { kind: "add", removedSlotId: null, removedLabel: null },
      availablePokemon: available
    }).code === "mega-limit",
  "構築序盤のメガ候補上限を候補操作でも維持できません"
);

const selectionOptions = sortPokemonSelectionOptions(available);
assert(
  selectionOptions.length === available.filter((pokemon) => pokemon.formSelection === "team").length &&
    selectionOptions.every((pokemon) => availableSlugs.has(pokemon.slug)),
  "現在ルールの使用可能な全フォームだけを選択候補にできません"
);
assert(
  ["charizard", "charizard-mega-x", "charizard-mega-y"].every((slug) =>
    selectionOptions.some((pokemon) => pokemon.slug === slug)
  ),
  "通常・メガを含む使用可能フォームをすべて選択候補へ含められません"
);
const environmentIndependentCandidate = selectionOptions.find((pokemon) => pokemon.slug === "pikachu") ?? selectionOptions.at(-1);
assert(
  environmentIndependentCandidate && selectionOptions.includes(environmentIndependentCandidate),
  "使用率に依存せず、ルール上使用可能な候補を選択肢へ残せません"
);

const waterFlying = filterPokemonSelectionByTypes({
  pokemon: available,
  primaryType: "water",
  secondaryType: "flying"
}).map((pokemon) => pokemon.slug);
const flyingWater = filterPokemonSelectionByTypes({
  pokemon: available,
  primaryType: "flying",
  secondaryType: "water"
}).map((pokemon) => pokemon.slug);
assert(
  waterFlying.length > 0 && waterFlying.join() === flyingWater.join(),
  "第1・第2タイプを順不同AND条件として扱えません"
);
assert(
  filterPokemonSelectionByTypes({
    pokemon: available,
    primaryType: "water",
    secondaryType: "water"
  }).length === 0,
  "同じタイプの重複指定を拒否できません"
);
const typeNames = getAllTypes().map((entry) => entry.nameEn);
const emptyPair = typeNames.flatMap((primaryType) =>
  typeNames.map((secondaryType) => [primaryType, secondaryType] as const)
).find(([primaryType, secondaryType]) =>
  primaryType !== secondaryType &&
  filterPokemonSelectionByTypes({ pokemon: available, primaryType, secondaryType }).length === 0
);
assert(emptyPair, "0件となるタイプ組み合わせfixtureが不足しています");
assert(
  availableSlugs.size !== alternateSlugs.size ||
    [...availableSlugs].some((slug) => !alternateSlugs.has(slug)),
  "レギュレーション変更で使用可能候補が再計算されません"
);

const root = process.cwd();
const pageSource = readFileSync(path.join(root, "app/page.tsx"), "utf8");
const sectionSource = readFileSync(path.join(root, "components/team/TeamAdvisorSection.tsx"), "utf8");
const inputSource = readFileSync(path.join(root, "components/team/TeamInputPanel.tsx"), "utf8");
const actionButtonSource = readFileSync(path.join(root, "components/team/AdvisorCandidateActionButton.tsx"), "utf8");
assert(
  actionButtonSource.includes("空き枠に追加") &&
    actionButtonSource.includes("この変更を適用") &&
    actionButtonSource.includes("aria-describedby") &&
    actionButtonSource.includes("disabled={!actionability.allowed}") &&
    sectionSource.includes("変更を元に戻す") &&
    pageSource.includes("applyAdvisorCandidateAction") &&
    pageSource.includes("ADVISOR_ADD_BACKUP_KEY"),
  "追加・交換・無効理由・UndoのUI統合が不足しています"
);
assert(
  inputSource.includes("filterPokemonSelectionByTypes") &&
    inputSource.includes("第1タイプ") &&
    inputSource.includes("第2タイプ") &&
    inputSource.includes("このタイプ条件に一致する使用可能なポケモンはいません") &&
    inputSource.includes('role="combobox"') &&
    inputSource.includes('event.key === "Enter"') &&
    inputSource.includes('event.key === "Escape"'),
  "タイプ絞り込み・0件表示・キーボード操作が不足しています"
);

console.log(
  `[ok] TASK051 Golden: 追加・満杯・交換・フォーム・stale・制約・全${selectionOptions.length}フォーム・タイプ絞り込み・レギュレーション再計算を検証しました`
);
