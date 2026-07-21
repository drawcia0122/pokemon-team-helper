import pokemonData from "@/data/pokemon.json";
import regulationBData from "@/data/regulations/regulation-m-b.json";
import {
  filterAllowedPokemon,
  getRegulationAvailabilitySummary
} from "@/lib/regulations";
import { isTeamSlotAllowed } from "@/lib/teamUi";
import type { PokemonEntry, RegulationDefinition, TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const pokemon = pokemonData as PokemonEntry[];
const regulationB = regulationBData as RegulationDefinition;
const available = filterAllowedPokemon(pokemon, regulationB);
const availableSlugs = new Set(available.map((entry) => entry.slug));
const summary = getRegulationAvailabilitySummary(pokemon, regulationB);

assert(
  summary.speciesCount === 208 &&
    summary.selectableFormCount === 313 &&
    summary.explicitFormCount === 235 &&
    summary.inheritedMegaCount === 78,
  "M-Bの使用可能種数とフォーム数を分離できません"
);

for (const slug of ["charizard", "charizard-mega-x", "charizard-mega-y"]) {
  assert(availableSlugs.has(slug), `リザードの使用可否継承が不正です: ${slug}`);
}
for (const slug of ["mewtwo", "mewtwo-mega-x", "mewtwo-mega-y"]) {
  assert(!availableSlugs.has(slug), `使用不可speciesのメガを許可しました: ${slug}`);
}
assert(
  availableSlugs.has("qwilfish") && !availableSlugs.has("qwilfish-hisui"),
  "リージョンフォームへメガ用の継承を適用しました"
);
assert(
  ["rotom", "rotom-heat", "rotom-wash", "rotom-frost", "rotom-fan", "rotom-mow"]
    .every((slug) => availableSlugs.has(slug)),
  "ロトムのslug単位判定が変わりました"
);
assert(
  !available.some((entry) => entry.formKind === "gmax" || entry.formSelection === "excluded"),
  "G-MAXまたは非表示フォームに継承が影響しました"
);

const charizardMegaXSlot: TeamSlot = {
  id: "mega-x",
  mode: "pokemon",
  pokemonSlug: "charizard-mega-x"
};
assert(
  isTeamSlotAllowed(charizardMegaXSlot, available),
  "フォーム切り替え後のメガXを使用可と判定できません"
);

const charizardGroup = pokemon.filter((entry) => entry.speciesId === 6);
const explicitMegaAllowed: RegulationDefinition = {
  ...regulationB,
  id: "TEST-EXPLICIT-MEGA",
  allowedPokemonSlugs: ["charizard-mega-x"],
  bannedPokemonSlugs: []
};
assert(
  filterAllowedPokemon(charizardGroup, explicitMegaAllowed).map((entry) => entry.slug).join() ===
    "charizard-mega-x",
  "メガslugの明示許可をdefault formより優先できません"
);

const explicitlyBannedMega: RegulationDefinition = {
  ...regulationB,
  id: "TEST-BANNED-MEGA",
  allowedPokemonSlugs: ["charizard", "charizard-mega-x"],
  bannedPokemonSlugs: ["charizard-mega-x"]
};
const explicitlyBannedSlugs = filterAllowedPokemon(charizardGroup, explicitlyBannedMega)
  .map((entry) => entry.slug);
assert(
  explicitlyBannedSlugs.includes("charizard") &&
    !explicitlyBannedSlugs.includes("charizard-mega-x") &&
    explicitlyBannedSlugs.includes("charizard-mega-y"),
  "メガslugの明示禁止を継承より優先できません"
);

const megaWithoutDefault = charizardGroup.filter((entry) => entry.formKind === "mega");
const unsafeDefaultRegulation: RegulationDefinition = {
  ...regulationB,
  id: "TEST-MISSING-DEFAULT",
  allowedPokemonSlugs: ["charizard"],
  bannedPokemonSlugs: []
};
assert(
  filterAllowedPokemon(megaWithoutDefault, unsafeDefaultRegulation).length === 0,
  "default formを特定できないメガを許可しました"
);

console.log(
  `[ok] M-B 明示${summary.explicitFormCount}フォーム + 継承メガ${summary.inheritedMegaCount}件 = ${summary.selectableFormCount}フォーム / ${summary.speciesCount}種を検証しました`
);
