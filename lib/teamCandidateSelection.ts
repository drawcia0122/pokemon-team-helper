import type { PokemonEntry, TypeName } from "@/types/pokemon";
import {
  getFormOptionLabel,
  getSpeciesRepresentative,
  getSelectableForms
} from "@/lib/pokemonForms";

const MAX_TYPE_FILTER_CACHE_ENTRIES = 171;

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase("ja").replace(/[()（）・\s_-]/g, "");
}

export type PokemonSelectionIndex = {
  options: PokemonEntry[];
  availableSlugs: ReadonlySet<string>;
  representatives: PokemonEntry[];
  selectableFormsBySpecies: ReadonlyMap<number, PokemonEntry[]>;
  initialFormBySpecies: ReadonlyMap<number, PokemonEntry>;
  searchTextBySpecies: ReadonlyMap<number, string[]>;
  normalizedSearchTextBySlug: ReadonlyMap<string, string[]>;
  typeFilterCache: Map<string, PokemonEntry[]>;
};

export function sortPokemonSelectionOptions(
  pokemon: readonly PokemonEntry[]
): PokemonEntry[] {
  const unique = new Map<string, PokemonEntry>();
  for (const entry of pokemon) {
    if (entry.formSelection === "team") unique.set(entry.slug, entry);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.nameJa.localeCompare(right.nameJa, "ja") ||
      left.speciesId - right.speciesId ||
      left.formOrder - right.formOrder ||
      left.slug.localeCompare(right.slug, "en")
  );
}

export function createPokemonSelectionIndex(
  allPokemon: PokemonEntry[],
  availablePokemon: PokemonEntry[]
): PokemonSelectionIndex {
  const options = sortPokemonSelectionOptions(availablePokemon);
  const availableSlugs = new Set(options.map((pokemon) => pokemon.slug));
  const speciesIds = new Set(options.map((pokemon) => pokemon.speciesId));
  const selectableFormsBySpecies = new Map<number, PokemonEntry[]>();
  const initialFormBySpecies = new Map<number, PokemonEntry>();
  const searchTextBySpecies = new Map<number, string[]>();
  const representatives: PokemonEntry[] = [];

  for (const speciesId of speciesIds) {
    const allSelectableForms = getSelectableForms(allPokemon, speciesId);
    const availableForms = allSelectableForms.filter((form) =>
      availableSlugs.has(form.slug)
    );
    selectableFormsBySpecies.set(speciesId, availableForms);
    const initialForm =
      availableForms.find((pokemon) => pokemon.isDefaultForm) ??
      availableForms[0];
    if (initialForm) initialFormBySpecies.set(speciesId, initialForm);
    const representative = getSpeciesRepresentative(allPokemon, speciesId);
    if (representative) representatives.push(representative);
    searchTextBySpecies.set(
      speciesId,
      allSelectableForms.flatMap((form) =>
        [form.nameJa, form.nameEn, form.slug, getFormOptionLabel(form)].map(
          normalizeSearchText
        )
      )
    );
  }

  representatives.sort(
    (left, right) =>
      left.nameJa.localeCompare(right.nameJa, "ja") ||
      left.speciesId - right.speciesId ||
      left.slug.localeCompare(right.slug, "en")
  );
  return {
    options,
    availableSlugs,
    representatives,
    selectableFormsBySpecies,
    initialFormBySpecies,
    searchTextBySpecies,
    normalizedSearchTextBySlug: new Map(
      options.map((entry) => [
        entry.slug,
        [entry.nameJa, entry.nameEn, entry.slug].map(normalizeSearchText)
      ])
    ),
    typeFilterCache: new Map()
  };
}

export function searchPokemonSelectionIndex(
  index: PokemonSelectionIndex,
  query: string
): PokemonEntry[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return index.representatives;
  return index.representatives.filter((pokemon) =>
    (index.searchTextBySpecies.get(pokemon.speciesId) ?? []).some((field) =>
      field.includes(normalizedQuery)
    )
  );
}

export function getPokemonSelectionForms(
  index: PokemonSelectionIndex,
  speciesId: number
): PokemonEntry[] {
  return index.selectableFormsBySpecies.get(speciesId) ?? [];
}

export function getPokemonSelectionInitialForm(
  index: PokemonSelectionIndex,
  speciesId: number
): PokemonEntry | undefined {
  return index.initialFormBySpecies.get(speciesId);
}

export function getPokemonTypeFilterCacheKey(
  primaryType: TypeName | "",
  secondaryType: TypeName | "" = ""
): string {
  if (!primaryType || primaryType === secondaryType) return "";
  return [primaryType, secondaryType]
    .filter((type): type is TypeName => type !== "")
    .sort()
    .join("|");
}

export function filterPokemonSelectionIndexByTypes({
  index,
  primaryType,
  secondaryType,
  query = ""
}: {
  index: PokemonSelectionIndex;
  primaryType: TypeName | "";
  secondaryType?: TypeName | "";
  query?: string;
}): PokemonEntry[] {
  const key = getPokemonTypeFilterCacheKey(primaryType, secondaryType);
  if (!key) return [];
  let matches = index.typeFilterCache.get(key);
  if (!matches) {
    const requiredTypes = key.split("|") as TypeName[];
    matches = index.options.filter((entry) =>
      requiredTypes.every((type) => entry.types.includes(type))
    );
    if (index.typeFilterCache.size >= MAX_TYPE_FILTER_CACHE_ENTRIES) {
      const oldestKey = index.typeFilterCache.keys().next().value;
      if (oldestKey !== undefined) index.typeFilterCache.delete(oldestKey);
    }
    index.typeFilterCache.set(key, matches);
  }
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return matches;
  return matches.filter((entry) =>
    (index.normalizedSearchTextBySlug.get(entry.slug) ?? []).some((field) =>
      field.includes(normalizedQuery)
    )
  );
}

export function filterPokemonSelectionByTypes({
  pokemon,
  primaryType,
  secondaryType,
  query = ""
}: {
  pokemon: readonly PokemonEntry[];
  primaryType: TypeName | "";
  secondaryType?: TypeName | "";
  query?: string;
}): PokemonEntry[] {
  if (!primaryType || secondaryType === primaryType) return [];
  const normalizedQuery = normalizeSearchText(query);
  return sortPokemonSelectionOptions(pokemon).filter((entry) => {
    const matchesTypes =
      entry.types.includes(primaryType) &&
      (!secondaryType || entry.types.includes(secondaryType));
    if (!matchesTypes) return false;
    if (!normalizedQuery) return true;
    return [entry.nameJa, entry.nameEn, entry.slug]
      .map(normalizeSearchText)
      .some((field) => field.includes(normalizedQuery));
  });
}
