import appMetaData from "@/data/appMeta.json";
import pokemonData from "@/data/pokemon.json";
import season1Data from "@/data/regulations/season1.json";
import season2Data from "@/data/regulations/season2.json";
import type { AppMeta, PokemonEntry, Regulation } from "@/types/pokemon";

const appMeta = appMetaData as AppMeta;
const allPokemon = pokemonData as PokemonEntry[];
const regulationMap = new Map<string, Regulation>(
  [season1Data, season2Data].map((regulation) => [regulation.id, regulation as Regulation])
);

export function getAppMeta(): AppMeta {
  return appMeta;
}

export function getSeasonOptions(): Array<{ id: string; label: string }> {
  return appMeta.seasonIds.map((id) => ({
    id,
    label: id === "all" ? "全件対応版（全ポケモン）" : getRegulationById(id)?.label ?? id
  }));
}

export function getRegulationById(id: string): Regulation | null {
  return regulationMap.get(id) ?? null;
}

export function getSeasonMeta(id: string): {
  id: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  notes: string[];
  allowedCount: number;
  isAllMode: boolean;
} {
  if (id === "all") {
    return {
      id: "all",
      label: "全件対応版（全ポケモン）",
      startDate: null,
      endDate: null,
      notes: ["シーズン制限を無視して全ポケモンを候補表示します"],
      allowedCount: allPokemon.length,
      isAllMode: true
    };
  }

  const regulation = getRegulationById(id);
  const allowedCount = filterAllowedPokemon(allPokemon, regulation).length;

  return {
    id,
    label: regulation?.label ?? id,
    startDate: regulation?.startDate ?? null,
    endDate: regulation?.endDate ?? null,
    notes: regulation?.notes ?? [],
    allowedCount,
    isAllMode: false
  };
}

export function filterAllowedPokemon(pokemonList: PokemonEntry[], regulation: Regulation | null): PokemonEntry[] {
  if (!regulation) {
    return [];
  }

  const allowedSet = new Set(regulation.allowedPokemonSlugs);
  const bannedSet = new Set(regulation.bannedPokemonSlugs);

  return pokemonList.filter((pokemon) => allowedSet.has(pokemon.slug) && !bannedSet.has(pokemon.slug));
}

export function getAvailablePokemonBySeason(seasonId: string): PokemonEntry[] {
  if (seasonId === "all") {
    return allPokemon;
  }

  const regulation = getRegulationById(seasonId);
  if (!regulation) {
    return [];
  }

  return filterAllowedPokemon(allPokemon, regulation);
}
