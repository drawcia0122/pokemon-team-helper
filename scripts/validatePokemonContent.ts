import contentData from "@/data/pokemonContent.json";
import pokemonData from "@/data/pokemon.json";
import { validatePokemonContent } from "@/lib/validatePokemonContent";

const errors = validatePokemonContent(
  contentData,
  new Set(pokemonData.map((entry) => entry.slug))
);

if (errors.length > 0) {
  errors.forEach((error) => console.error(`[error] ${error}`));
  process.exitCode = 1;
} else {
  console.log(`[ok] ポケモン関連コンテンツ ${contentData.length}件を検証しました`);
}
