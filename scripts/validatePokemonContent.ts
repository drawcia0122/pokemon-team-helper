import generatedContentData from "@/data/pokemonContent.generated.json";
import manualContentData from "@/data/pokemonContent.manual.json";
import collectionStatusData from "@/data/pokemonContentCollectionStatus.json";
import pokemonData from "@/data/pokemon.json";
import { mergePokemonContent } from "@/lib/pokemonContent";
import { validatePokemonContentCollectionState } from "@/lib/validatePokemonContentCollection";
import { validatePokemonContent } from "@/lib/validatePokemonContent";
import type { GeneratedPokemonContentItem, PokemonContentItem } from "@/types/pokemonContent";

const manual = manualContentData as PokemonContentItem[];
const generated = generatedContentData as GeneratedPokemonContentItem[];
const combined = [...manual, ...generated];

const errors = validatePokemonContent(
  combined,
  new Set(pokemonData.map((entry) => entry.slug))
);
errors.push(...validatePokemonContentCollectionState(collectionStatusData, generated));

if (manual.length !== 7) errors.push(`手動コンテンツは7件必要です: ${manual.length}件`);
if (mergePokemonContent(manual, generated).length !== combined.length) {
  errors.push("手動・自動コンテンツ間にIDまたはURLの重複があります");
}

if (errors.length > 0) {
  errors.forEach((error) => console.error(`[error] ${error}`));
  process.exitCode = 1;
} else {
  console.log(
    `[ok] ポケモン関連コンテンツ 手動${manual.length}件 + 自動${generated.length}件を検証しました`
  );
}
