import type { PokemonEntry, TypeName } from "@/types/pokemon";

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase("ja").replace(/[()（）・\s_-]/g, "");
}

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
