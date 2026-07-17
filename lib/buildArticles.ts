import buildArticleData from "@/data/buildArticles.json";
import pokemonData from "@/data/pokemon.json";
import type { BuildArticle, PokemonLabelMap } from "@/types/buildArticle";
import type { PokemonEntry } from "@/types/pokemon";

const articles = buildArticleData as BuildArticle[];
const pokemon = pokemonData as PokemonEntry[];

export function getBuildArticles(): BuildArticle[] {
  return [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getPokemonLabelMap(): PokemonLabelMap {
  return Object.fromEntries(pokemon.map((entry) => [entry.slug, entry.nameJa]));
}
