import generatedContentData from "@/data/pokemonContent.generated.json";
import manualContentData from "@/data/pokemonContent.manual.json";
import pokemonData from "@/data/pokemon.json";
import type {
  GeneratedPokemonContentItem,
  PokemonContentItem
} from "@/types/pokemonContent";
import type { PokemonEntry } from "@/types/pokemon";

const manualItems = manualContentData as PokemonContentItem[];
const generatedItems = generatedContentData as GeneratedPokemonContentItem[];
const pokemon = pokemonData as PokemonEntry[];

export function normalizeContentUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLocaleLowerCase("en");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  const entries = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLocaleLowerCase("en").startsWith("utm_"))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of entries) url.searchParams.append(key, value);
  return url.toString();
}

export function mergePokemonContent(
  manual: PokemonContentItem[],
  generated: GeneratedPokemonContentItem[]
): PokemonContentItem[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const merged: PokemonContentItem[] = [];

  for (const item of [...manual, ...generated]) {
    const url = normalizeContentUrl(item.url);
    if (seenIds.has(item.id) || seenUrls.has(url)) continue;
    seenIds.add(item.id);
    seenUrls.add(url);
    merged.push(item);
  }

  return merged.sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)
  );
}

export function getPokemonContent(): PokemonContentItem[] {
  return mergePokemonContent(manualItems, generatedItems);
}

export function getContentPokemonLabels(): Record<string, string> {
  return Object.fromEntries(pokemon.map((entry) => [entry.slug, entry.nameJa]));
}
