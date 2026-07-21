import pokemonData from "@/data/pokemon.json";
import pokemonFormPolicyData from "@/data/pokemonFormPolicy.json";
import pokemonSlugAliases from "@/data/pokemonSlugAliases.json";
import { resolvePokemonSpriteUrl } from "@/lib/pokemonImage";
import {
  getSelectableForms,
  getSpeciesRepresentative,
  searchPokemonSpeciesRepresentatives,
  switchTeamSlotForm
} from "@/lib/pokemonForms";
import { getPokemonBySlug } from "@/lib/typeChart";
import type { PokemonEntry } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const pokemon = pokemonData as PokemonEntry[];
const policy = pokemonFormPolicyData as {
  selectionByKind: Record<string, string>;
  overrides: Record<string, { formKind?: string; formSelection?: string; labelJa?: string }>;
};

assert(pokemon.length === 1350, "既存のポケモン1350件を維持できません");
assert(
  pokemon.every((entry) =>
    Number.isSafeInteger(entry.speciesId) &&
    entry.speciesId > 0 &&
    typeof entry.isDefaultForm === "boolean" &&
    Number.isSafeInteger(entry.formOrder) &&
    entry.formOrder > 0 &&
    typeof entry.isBattleOnly === "boolean" &&
    ["team", "excluded"].includes(entry.formSelection)
  ),
  "PokemonEntryのフォーム情報が不足しています"
);

const requiredGroups: Array<[string, string[]]> = [
  ["charizard", ["charizard", "charizard-mega-x", "charizard-mega-y"]],
  ["mewtwo", ["mewtwo", "mewtwo-mega-x", "mewtwo-mega-y"]],
  ["rotom", ["rotom", "rotom-heat", "rotom-wash", "rotom-frost", "rotom-fan", "rotom-mow"]],
  ["giratina-altered", ["giratina-altered", "giratina-origin"]],
  ["urshifu-single-strike", ["urshifu-single-strike", "urshifu-rapid-strike"]],
  ["tauros", ["tauros", "tauros-paldea-combat-breed", "tauros-paldea-blaze-breed", "tauros-paldea-aqua-breed"]]
];

for (const [representativeSlug, expectedSlugs] of requiredGroups) {
  const representative = getPokemonBySlug(representativeSlug);
  assert(representative, `必須代表フォームがありません: ${representativeSlug}`);
  const actualSlugs = getSelectableForms(pokemon, representative.speciesId).map((entry) => entry.slug);
  assert(
    JSON.stringify(actualSlugs) === JSON.stringify(expectedSlugs),
    `${representativeSlug}の選択可能フォームが不正です: ${actualSlugs.join(", ")}`
  );
  assert(
    getSpeciesRepresentative(pokemon, representative.speciesId)?.slug === representativeSlug,
    `${representativeSlug}をspecies代表として取得できません`
  );
}

const hiddenSlugs = pokemon
  .filter((entry) =>
    entry.slug.endsWith("-gmax") ||
    entry.slug.includes("-totem") ||
    entry.slug.startsWith("koraidon-") ||
    entry.slug.startsWith("miraidon-")
  );
assert(
  hiddenSlugs.every((entry) => entry.formSelection === "excluded"),
  "G-MAX・ぬし・移動形態をフォーム選択から除外できません"
);
assert(
  pokemon.filter((entry) => entry.formKind === "battle-only").every(
    (entry) => entry.formSelection === "excluded"
  ),
  "メガ以外の戦闘中限定フォームを除外できません"
);

const charizard = getPokemonBySlug("charizard");
const charizardMegaX = getPokemonBySlug("charizard-mega-x");
const charizardMegaY = getPokemonBySlug("charizard-mega-y");
assert(charizard && charizardMegaX && charizardMegaY, "リザードンのフォームデータが不足しています");
const searchByMegaName = searchPokemonSpeciesRepresentatives(
  pokemon,
  pokemon,
  "メガリザードンX"
);
assert(
  searchByMegaName.length === 1 && searchByMegaName[0]?.slug === "charizard",
  "フォーム名検索からspecies代表1件を返せません"
);
const taurosAqua = getPokemonBySlug("tauros-paldea-aqua-breed");
assert(taurosAqua, "パルデアケンタロスがありません");
const taurosFromOneAvailableForm = searchPokemonSpeciesRepresentatives(
  pokemon,
  [taurosAqua],
  ""
);
assert(
  taurosFromOneAvailableForm.length === 1 && taurosFromOneAvailableForm[0]?.slug === "tauros",
  "グループ内の1フォームだけ使用可能な場合にspecies代表を表示できません"
);
const allRepresentatives = searchPokemonSpeciesRepresentatives(pokemon, pokemon, "");
assert(
  new Set(allRepresentatives.map((entry) => entry.speciesId)).size === allRepresentatives.length,
  "検索結果で同一speciesが重複しています"
);

const initialSlot = { id: "slot-form-test", mode: "pokemon" as const, pokemonSlug: charizard.slug };
const megaXSlot = switchTeamSlotForm(initialSlot, charizardMegaX.slug);
const megaYSlot = switchTeamSlotForm(megaXSlot, charizardMegaY.slug);
assert(megaXSlot.id === initialSlot.id && megaYSlot.id === initialSlot.id, "フォーム切り替えでTeamSlot.idが変わりました");
assert(
  Object.keys(megaYSlot).sort().join(",") === "id,mode,pokemonSlug",
  "フォーム切り替えでlocalStorage保存形式が変わりました"
);
assert(
  charizard.types.join(",") !== charizardMegaX.types.join(",") &&
  JSON.stringify(charizard.baseStats) !== JSON.stringify(charizardMegaX.baseStats) &&
  resolvePokemonSpriteUrl(charizard) !== resolvePokemonSpriteUrl(charizardMegaX),
  "フォーム切り替えに必要な画像・タイプ・種族値の差を解決できません"
);

assert(
  pokemonSlugAliases["meowstic-mega"] === "meowstic-male-mega" &&
  getPokemonBySlug("meowstic-mega")?.slug === "meowstic-mega",
  "既存のmeowstic-mega保存値との互換性を維持できません"
);
assert(
  policy.selectionByKind.gmax === "excluded" &&
  policy.selectionByKind.mega === "team" &&
  Object.keys(policy.overrides).every((slug) => pokemon.some((entry) => entry.slug === slug)),
  "手動フォームpolicyが生成データと整合していません"
);

const selectable = pokemon.filter((entry) => entry.formSelection === "team");
const grouped = new Map<number, PokemonEntry[]>();
for (const entry of selectable) {
  grouped.set(entry.speciesId, [...(grouped.get(entry.speciesId) ?? []), entry]);
}
const switchableGroups = [...grouped.values()].filter((entries) => entries.length > 1);
console.log(
  `[ok] フォームpolicy 全${pokemon.length}件 / 選択可能${selectable.length}件 / 切替${switchableGroups.length}species・${switchableGroups.reduce((sum, entries) => sum + entries.length, 0)}フォームを検証しました`
);
