import { readFileSync } from "node:fs";
import path from "node:path";
import pokemonData from "@/data/pokemon.json";
import {
  isAllowedPokemonSpriteUrl,
  POKEMON_SPRITE_IMAGE_ORIGIN,
  resolvePokemonImageState,
  resolvePokemonSpriteUrl,
  UNSUPPORTED_POKEMON_SPRITE_IDS
} from "@/lib/pokemonImage";
import {
  ALLOWED_EXTERNAL_IMAGE_ORIGINS,
  STATIC_CONTENT_SECURITY_POLICY
} from "@/lib/contentSecurityPolicy";
import type { PokemonEntry } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const pokemon = pokemonData as PokemonEntry[];
const unsupportedIds = new Set<number>(UNSUPPORTED_POKEMON_SPRITE_IDS);
const pikachu = pokemon.find((entry) => entry.slug === "pikachu");
const unsupportedForm = pokemon.find((entry) => entry.id === 10158);

assert(pikachu?.id === 25, "既存データのピカチュウIDが不正です");
assert(
  resolvePokemonSpriteUrl(pikachu) ===
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
  "正常な数値IDから許可された通常PNG URLを生成できません"
);
assert(
  resolvePokemonSpriteUrl(pikachu) === resolvePokemonSpriteUrl(pikachu),
  "同じポケモンから決定的なURLを生成できません"
);

for (const invalid of [
  null,
  undefined,
  {},
  { id: -1 },
  { id: 0 },
  { id: 1.5 },
  { id: "25" },
  { id: 9999 },
  { id: 10326 },
  { slug: "25" },
  { id: "https://example.com/image.png" }
]) {
  assert(
    resolvePokemonSpriteUrl(invalid as { id?: unknown } | null | undefined) ===
      null,
    `不明または不正なIDを拒否できません: ${JSON.stringify(invalid)}`
  );
}

assert(
  unsupportedForm &&
    resolvePokemonSpriteUrl(unsupportedForm) === null,
  "未対応フォームを文字フォールバックへ回せません"
);

for (const invalidUrl of [
  "http://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
  "https://github.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
  "https://raw.githubusercontent.com/Other/sprites/master/sprites/pokemon/25.png",
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/25.png",
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.gif",
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png?user=input",
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10158.png",
  "not-a-url"
]) {
  assert(
    !isAllowedPokemonSpriteUrl(invalidUrl),
    `許可外の画像URLを拒否できません: ${invalidUrl}`
  );
}

const pikachuUrl = resolvePokemonSpriteUrl(pikachu);
assert(pikachuUrl && isAllowedPokemonSpriteUrl(pikachuUrl), "生成URLの再検証に失敗しました");
assert(
  resolvePokemonImageState({
    spriteUrl: pikachuUrl,
    loadedImageUrl: null,
    failedImageUrl: null
  }) === "loading",
  "画像読込中に文字フォールバックを維持できません"
);
assert(
  resolvePokemonImageState({
    spriteUrl: pikachuUrl,
    loadedImageUrl: pikachuUrl,
    failedImageUrl: null
  }) === "image",
  "画像読込成功を判定できません"
);
assert(
  resolvePokemonImageState({
    spriteUrl: pikachuUrl,
    loadedImageUrl: null,
    failedImageUrl: pikachuUrl
  }) === "fallback",
  "画像読込失敗時にフォールバックできません"
);
assert(
  resolvePokemonImageState({
    spriteUrl: null,
    loadedImageUrl: null,
    failedImageUrl: null
  }) === "fallback",
  "画像なしをフォールバック表示できません"
);

const visualSource = readFileSync(
  path.join(root, "components/pokemon/PokemonVisual.tsx"),
  "utf8"
);
assert(
  visualSource.includes("resolvePokemonSpriteUrl({ id: pokemonId })") &&
    visualSource.includes("onError={() => setFailedImageUrl(spriteUrl)}") &&
    visualSource.includes("onLoad={() => setLoadedImageUrl(spriteUrl)}") &&
    visualSource.includes("imageState !== \"fallback\"") &&
    visualSource.includes("{initials(name)}") &&
    !visualSource.includes("imageUrl?:"),
  "PokemonVisualのURL解決または安全な文字フォールバックが不正です"
);

assert(
  ALLOWED_EXTERNAL_IMAGE_ORIGINS.includes(POKEMON_SPRITE_IMAGE_ORIGIN) &&
    ALLOWED_EXTERNAL_IMAGE_ORIGINS.filter(
      (origin) => origin.includes("github")
    ).join(",") === POKEMON_SPRITE_IMAGE_ORIGIN &&
    STATIC_CONTENT_SECURITY_POLICY.includes(
      `img-src 'self' data:`
    ) &&
    STATIC_CONTENT_SECURITY_POLICY.includes(POKEMON_SPRITE_IMAGE_ORIGIN) &&
    !STATIC_CONTENT_SECURITY_POLICY.includes("https://github.com") &&
    !STATIC_CONTENT_SECURITY_POLICY.includes("https://*") &&
    !STATIC_CONTENT_SECURITY_POLICY.includes("connect-src") &&
    !STATIC_CONTENT_SECURITY_POLICY.includes("script-src"),
  "CSPがraw.githubusercontent.comのimg-src以外へ拡張されています"
);

const resolved = pokemon.filter(
  (entry) => resolvePokemonSpriteUrl(entry) !== null
);
const unsupported = pokemon.filter(
  (entry) => resolvePokemonSpriteUrl(entry) === null
);
const normal = pokemon.filter((entry) => entry.id <= 1025);
const forms = pokemon.filter((entry) => entry.id >= 10001);

assert(pokemon.length === 1350, "既存ポケモン1350件を維持できません");
assert(resolved.length === 1339, "画像対応件数が調査結果と一致しません");
assert(unsupported.length === 11, "未対応フォーム件数が調査結果と一致しません");
assert(
  normal.every((entry) => resolvePokemonSpriteUrl(entry) !== null),
  "通常フォームに画像未対応があります"
);
assert(
  forms.filter((entry) => resolvePokemonSpriteUrl(entry) !== null).length ===
    314,
  "特殊フォームの画像対応件数が不正です"
);
assert(
  unsupported.every((entry) => unsupportedIds.has(entry.id)),
  "未確認の画像なしエントリーがあります"
);

console.log(
  `[ok] ポケモンスプライト 全${pokemon.length}件 / 画像${resolved.length}件 / フォールバック${unsupported.length}件を検証しました`
);
