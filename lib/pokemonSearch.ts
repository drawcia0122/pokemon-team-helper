import type { PokemonEntry } from "@/types/pokemon";

const normalizedJaFallbackMap: Record<string, string[]> = {
  "ランドロスれいじゅう": ["landorus-therian"],
  "ランドロスけしん": ["landorus-incarnate"],
  "ロトムウォッシュ": ["rotom-wash"]
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[()（）・\s-]/g, "");
}

export function searchPokemon(pokemonList: PokemonEntry[], query: string): PokemonEntry[] {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return pokemonList;
  }

  return pokemonList.filter((pokemon) => {
    const fields = [pokemon.nameJa, pokemon.nameEn, pokemon.slug].map(normalize);
    const fallbackMatches = Object.entries(normalizedJaFallbackMap).some(
      ([key, slugs]) => key.includes(normalizedQuery) && slugs.includes(pokemon.slug)
    );

    return fields.some((field) => field.includes(normalizedQuery)) || fallbackMatches;
  });
}
