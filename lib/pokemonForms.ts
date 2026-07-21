import { getPokemonFormLabel } from "@/lib/pokemonFormPolicy";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/[()（）・\s_-]/g, "");
}

function compareForms(a: PokemonEntry, b: PokemonEntry): number {
  if (a.isDefaultForm !== b.isDefaultForm) return a.isDefaultForm ? -1 : 1;
  return a.formOrder - b.formOrder || a.id - b.id || a.slug.localeCompare(b.slug, "en");
}

export function getSelectableForms(
  pokemonList: PokemonEntry[],
  speciesId: number
): PokemonEntry[] {
  return pokemonList
    .filter((pokemon) => pokemon.speciesId === speciesId && pokemon.formSelection === "team")
    .sort(compareForms);
}

export function getSpeciesRepresentative(
  pokemonList: PokemonEntry[],
  speciesId: number
): PokemonEntry | undefined {
  const group = pokemonList.filter((pokemon) => pokemon.speciesId === speciesId).sort(compareForms);
  return group.find((pokemon) => pokemon.isDefaultForm) ??
    group.find((pokemon) => pokemon.formSelection === "team") ??
    group[0];
}

export function getFormOptionLabel(pokemon: PokemonEntry): string {
  const parenthetical = pokemon.nameJa.match(/[（(]([^）)]+)[）)]/)?.[1];
  const fallback = parenthetical ?? (pokemon.isDefaultForm ? "通常" : pokemon.nameJa);
  return getPokemonFormLabel(pokemon.slug, fallback);
}

export function searchPokemonSpeciesRepresentatives(
  allPokemon: PokemonEntry[],
  inputOptions: PokemonEntry[],
  query: string
): PokemonEntry[] {
  const searchableSpeciesIds = new Set(
    inputOptions
      .filter((pokemon) => pokemon.formSelection === "team")
      .map((pokemon) => pokemon.speciesId)
  );
  const normalizedQuery = normalizeSearchText(query);
  const representatives: PokemonEntry[] = [];
  const seenSpeciesIds = new Set<number>();

  for (const pokemon of inputOptions) {
    if (seenSpeciesIds.has(pokemon.speciesId) || !searchableSpeciesIds.has(pokemon.speciesId)) {
      continue;
    }

    seenSpeciesIds.add(pokemon.speciesId);
    const selectableForms = getSelectableForms(allPokemon, pokemon.speciesId);
    const matches = !normalizedQuery || selectableForms.some((form) =>
      [form.nameJa, form.nameEn, form.slug, getFormOptionLabel(form)]
        .map(normalizeSearchText)
        .some((field) => field.includes(normalizedQuery))
    );

    if (matches) {
      const representative = getSpeciesRepresentative(allPokemon, pokemon.speciesId);
      if (representative) representatives.push(representative);
    }
  }

  return representatives;
}

export function selectInitialFormForSpecies(
  allPokemon: PokemonEntry[],
  inputOptions: PokemonEntry[],
  speciesId: number
): PokemonEntry | undefined {
  const selectableInputSlugs = new Set(
    inputOptions
      .filter((pokemon) => pokemon.formSelection === "team")
      .map((pokemon) => pokemon.slug)
  );
  const selectableForms = getSelectableForms(allPokemon, speciesId);
  return selectableForms.find(
    (pokemon) => pokemon.isDefaultForm && selectableInputSlugs.has(pokemon.slug)
  ) ?? selectableForms.find((pokemon) => selectableInputSlugs.has(pokemon.slug));
}

export function switchTeamSlotForm(
  slot: Extract<TeamSlot, { mode: "pokemon" }>,
  pokemonSlug: string
): Extract<TeamSlot, { mode: "pokemon" }> {
  return { ...slot, pokemonSlug };
}
