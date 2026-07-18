import contentData from "@/data/pokemonContent.json";
import pokemonData from "@/data/pokemon.json";
import type { PokemonContentItem } from "@/types/pokemonContent";
import type { PokemonEntry } from "@/types/pokemon";

const items = contentData as PokemonContentItem[];
const pokemon = pokemonData as PokemonEntry[];

export function getPokemonContent(): PokemonContentItem[] {
  return [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getContentPokemonLabels(): Record<string, string> {
  return Object.fromEntries(pokemon.map((entry) => [entry.slug, entry.nameJa]));
}
