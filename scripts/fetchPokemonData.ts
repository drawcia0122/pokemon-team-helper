import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PokemonEntry, TypeEntry, TypeName } from "../types/pokemon";

const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const OUTPUT_DIR = path.resolve(process.cwd(), "data");
const TYPES_PATH = path.join(OUTPUT_DIR, "types.json");
const POKEMON_PATH = path.join(OUTPUT_DIR, "pokemon.json");
const POKEMON_LIST_LIMIT = 100000;
const CONCURRENCY = 10;
const REQUEST_DELAY_MS = 40;

const typeNames: TypeName[] = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy"
];

type NamedApiResource = {
  name: string;
  url: string;
};

type PokeApiNamedName = {
  language: { name: string };
  name: string;
};

type PokeApiType = {
  name: TypeName;
  names: PokeApiNamedName[];
  damage_relations: {
    double_damage_to: NamedApiResource[];
    half_damage_to: NamedApiResource[];
    no_damage_to: NamedApiResource[];
  };
};

type PokeApiPokemonSpecies = {
  name: string;
  names: PokeApiNamedName[];
};

type PokeApiPokemonList = {
  results: NamedApiResource[];
};

type PokeApiPokemon = {
  id: number;
  name: string;
  species: NamedApiResource;
  types: Array<{
    slot: number;
    type: NamedApiResource;
  }>;
  stats: Array<{
    base_stat: number;
    stat: NamedApiResource;
  }>;
};

function getBaseStat(pokemon: PokeApiPokemon, statName: string): number {
  const value = pokemon.stats.find((entry) => entry.stat.name === statName)?.base_stat;

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Missing base stat ${statName} for ${pokemon.name} (${pokemon.id})`);
  }

  return value;
}

const formJaSuffixMap: Record<string, string> = {
  alola: "アローラ",
  galar: "ガラル",
  hisui: "ヒスイ",
  paldea: "パルデア",
  mega: "メガ",
  therian: "れいじゅう",
  incarnate: "けしん",
  wash: "ウォッシュ",
  heat: "ヒート",
  frost: "フロスト",
  fan: "スピン",
  mow: "カット",
  origin: "オリジン",
  altered: "アナザー",
  attack: "アタック",
  defense: "ディフェンス",
  speed: "スピード",
  ordinary: "",
  resolute: "かくご",
  school: "むれた",
  solo: "たんどく",
  midnight: "まよなか",
  midday: "まひる",
  dusk: "たそがれ",
  small: "ちいさい",
  large: "おおきい",
  super: "スーパ",
  crowned: "れきせん",
  eternal: "えいえん",
  complete: "パーフェクト"
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText} (${url})`);
  }

  return (await response.json()) as T;
}

function getJapaneseName(names: PokeApiNamedName[], fallback: string) {
  return names.find((entry) => entry.language.name === "ja-Hrkt")?.name ??
    names.find((entry) => entry.language.name === "ja")?.name ??
    fallback;
}

function toTitleCase(value: string) {
  return value
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join("-");
}

function formatEnglishName(slug: string, speciesNameEn: string): string {
  if (!slug.includes("-")) {
    return toTitleCase(speciesNameEn);
  }

  return slug
    .split("-")
    .map((part) => toTitleCase(part))
    .join("-");
}

function formatJapaneseName(slug: string, speciesNameJa: string): string {
  const slugParts = slug.split("-");
  const suffixParts = slugParts.slice(1).map((part) => formJaSuffixMap[part] ?? part);
  const cleanedSuffix = suffixParts.filter(Boolean).join("・");

  if (!cleanedSuffix) {
    return speciesNameJa;
  }

  return `${speciesNameJa}(${cleanedSuffix})`;
}

async function fetchTypes(): Promise<TypeEntry[]> {
  const entries: TypeEntry[] = [];

  for (const typeName of typeNames) {
    const typeData = await fetchJson<PokeApiType>(`${POKEAPI_BASE}/type/${typeName}`);
    entries.push({
      nameEn: typeData.name,
      nameJa: getJapaneseName(typeData.names, typeData.name),
      attack: {
        doubleTo: typeData.damage_relations.double_damage_to.map((entry) => entry.name as TypeName),
        halfTo: typeData.damage_relations.half_damage_to.map((entry) => entry.name as TypeName),
        zeroTo: typeData.damage_relations.no_damage_to.map((entry) => entry.name as TypeName)
      }
    });
    await sleep(REQUEST_DELAY_MS);
  }

  return entries;
}

async function fetchAllPokemonResources(): Promise<NamedApiResource[]> {
  const list = await fetchJson<PokeApiPokemonList>(`${POKEAPI_BASE}/pokemon?limit=${POKEMON_LIST_LIMIT}`);
  return list.results;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function fetchPokemonEntries(resources: NamedApiResource[]): Promise<PokemonEntry[]> {
  const speciesNameCache = new Map<string, Promise<{ nameJa: string; nameEn: string }>>();

  return mapWithConcurrency(resources, async (resource, index) => {
    const pokemon = await fetchJson<PokeApiPokemon>(resource.url);

    if (!speciesNameCache.has(pokemon.species.url)) {
      speciesNameCache.set(
        pokemon.species.url,
        (async () => {
          const species = await fetchJson<PokeApiPokemonSpecies>(pokemon.species.url);
          return {
            nameJa: getJapaneseName(species.names, species.name),
            nameEn: species.name
          };
        })()
      );
    }

    const speciesName = await speciesNameCache.get(pokemon.species.url)!;
    const entry: PokemonEntry = {
      id: pokemon.id,
      slug: pokemon.name,
      nameJa: formatJapaneseName(pokemon.name, speciesName.nameJa),
      nameEn: formatEnglishName(pokemon.name, speciesName.nameEn),
      types: pokemon.types
        .sort((a, b) => a.slot - b.slot)
        .map((typeEntry) => typeEntry.type.name as TypeName),
      baseStats: {
        hp: getBaseStat(pokemon, "hp"),
        attack: getBaseStat(pokemon, "attack"),
        defense: getBaseStat(pokemon, "defense"),
        specialAttack: getBaseStat(pokemon, "special-attack"),
        specialDefense: getBaseStat(pokemon, "special-defense"),
        speed: getBaseStat(pokemon, "speed")
      }
    };

    if ((index + 1) % 50 === 0 || index === resources.length - 1) {
      console.log(`[progress] pokemon ${index + 1}/${resources.length}`);
    }

    await sleep(REQUEST_DELAY_MS);
    return entry;
  });
}

function sortPokemonEntries(pokemon: PokemonEntry[]): PokemonEntry[] {
  return pokemon
    .filter((entry) => entry.types.length > 0)
    .sort((a, b) => a.id - b.id || a.slug.localeCompare(b.slug, "en"));
}

async function writeJson(filepath: string, data: unknown) {
  await mkdir(path.dirname(filepath), { recursive: true });
  await writeFile(filepath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`[write] ${filepath}`);
}

async function main() {
  console.log("[start] fetchPokemonData (all pokemon mode)");
  const [types, pokemonResources] = await Promise.all([fetchTypes(), fetchAllPokemonResources()]);
  console.log(`[info] fetched pokemon resource list: ${pokemonResources.length}`);

  const pokemon = sortPokemonEntries(await fetchPokemonEntries(pokemonResources));

  await writeJson(TYPES_PATH, types);
  await writeJson(POKEMON_PATH, pokemon);

  console.log(`[done] generated ${types.length} types / ${pokemon.length} pokemon entries`);
}

main().catch((error) => {
  console.error("[fatal] fetchPokemonData failed");
  console.error(error);
  process.exitCode = 1;
});
