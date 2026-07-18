import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const pokemonPath = path.join(root, "data/pokemon.json");
const regulationAPath = path.join(root, "data/regulations/regulation-m-a.json");
const sourcePath = path.join(root, "data/regulations/season1-ja.txt");

const aliasToSlug = {
  "アローラライチュウ": "raichu-alola",
  "アローラキュウコン": "ninetales-alola",
  "ヒスイウインディ": "arcanine-hisui",
  "ガラルヤドラン": "slowbro-galar",
  "ガラルヤドキング": "slowking-galar",
  "パルデアケンタロス(かくとう)": "tauros-paldea-combat-breed",
  "パルデアケンタロス(ほのお)": "tauros-paldea-blaze-breed",
  "パルデアケンタロス(みず)": "tauros-paldea-aqua-breed",
  "ヒスイバクフーン": "typhlosion-hisui",
  "ヒートロトム": "rotom-heat",
  "ウォッシュロトム": "rotom-wash",
  "フロストロトム": "rotom-frost",
  "スピンロトム": "rotom-fan",
  "カットロトム": "rotom-mow",
  "ヒスイダイケンキ": "samurott-hisui",
  "ヒスイゾロアーク": "zoroark-hisui",
  "ガラルマッギョ": "stunfisk-galar",
  "ニャオニクス(オス)": "meowstic-male",
  "ニャオニクス(メス)": "meowstic-female",
  "ヒスイヌメルゴン": "goodra-hisui",
  "パンプジン(ちゅうだま)": "gourgeist-average",
  "パンプジン(こだま)": "gourgeist-small",
  "パンプジン(おおだま)": "gourgeist-large",
  "パンプジン(ギガだま)": "gourgeist-super",
  "パンプジンパンプジン(ちゅうだま)": "gourgeist-average",
  "パンプジンパンプジン(こだま)": "gourgeist-small",
  "パンプジンパンプジン(おおだま)": "gourgeist-large",
  "パンプジンパンプジン(ギガだま)": "gourgeist-super",
  "ヒスイクレベース": "avalugg-hisui",
  "ヒスイジュナイパー": "decidueye-hisui",
  "ミミッキュ": "mimikyu-disguised",
  "ギルガルド": "aegislash-shield",
  "ジャラランガ": "kommo-o",
  "バリコオル": "mr-rime",
  "モルペコ": "morpeko-full-belly",
  "イダイトウ(オス)": "basculegion-male",
  "イダイトウ(メス)": "basculegion-female",
  "イルカマン": "palafin-zero",
  "イッカネズミ": "maushold-family-of-four"
};

function normalizeToken(token) {
  return token.replace(/\u3000/g, "").trim();
}

function collapseRepeatedName(token) {
  if (token.length % 2 !== 0) {
    return token;
  }

  const half = token.length / 2;
  const left = token.slice(0, half);
  const right = token.slice(half);

  return left === right ? left : token;
}

async function main() {
  const [pokemonText, season1Text, sourceText] = await Promise.all([
    readFile(pokemonPath, "utf8"),
    readFile(regulationAPath, "utf8"),
    readFile(sourcePath, "utf8")
  ]);

  const pokemon = JSON.parse(pokemonText);
  const regulationA = JSON.parse(season1Text);

  const nameToSlug = new Map();
  const slugSet = new Set(pokemon.map((entry) => entry.slug));

  for (const entry of pokemon) {
    nameToSlug.set(entry.nameJa, entry.slug);
    nameToSlug.set(entry.slug, entry.slug);
  }

  const tokens = sourceText
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean)
    .map(collapseRepeatedName);

  const uniqueNames = [...new Set(tokens)];
  const unresolved = [];
  const allowedPokemonSlugs = [];

  for (const name of uniqueNames) {
    const aliasSlug = aliasToSlug[name];
    if (aliasSlug && slugSet.has(aliasSlug)) {
      allowedPokemonSlugs.push(aliasSlug);
      continue;
    }

    const directSlug = nameToSlug.get(name);
    if (directSlug) {
      allowedPokemonSlugs.push(directSlug);
      continue;
    }

    unresolved.push(name);
  }

  if (unresolved.length > 0) {
    console.error("[unresolved]", unresolved);
    process.exitCode = 1;
    return;
  }

  const nextRegulationA = {
    ...regulationA,
    allowedPokemonSlugs: [...new Set(allowedPokemonSlugs)].sort((a, b) => a.localeCompare(b, "en")),
    notes: [
      "Pokémon Champions レギュレーションM-Aの使用可能ポケモン",
      "season1-ja.txt の確認済み日本語リストから重複を除いて生成"
    ]
  };

  await writeFile(regulationAPath, JSON.stringify(nextRegulationA, null, 2) + "\n", "utf8");
  console.log(`[done] regulation M-A updated: ${nextRegulationA.allowedPokemonSlugs.length} slugs`);
}

main().catch((error) => {
  console.error("[fatal] seedSeason1FromJapaneseList failed");
  console.error(error);
  process.exitCode = 1;
});
