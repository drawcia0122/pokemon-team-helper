import appMetaData from "@/data/appMeta.json";
import pokemonData from "@/data/pokemon.json";
import regulationAData from "@/data/regulations/regulation-m-a.json";
import regulationBData from "@/data/regulations/regulation-m-b.json";
import type {
  AppMeta,
  PokemonEntry,
  RegulationDefinition,
  SeasonDefinition
} from "@/types/pokemon";

const appMeta = appMetaData as AppMeta;
const allPokemon = pokemonData as PokemonEntry[];
const regulationDefinitions = [
  regulationAData as RegulationDefinition,
  regulationBData as RegulationDefinition
];
const regulationDefinitionMap = new Map<string, RegulationDefinition>(
  regulationDefinitions.map((definition) => [definition.id, definition])
);
const seasonDefinitionMap = new Map<string, SeasonDefinition>(
  appMeta.seasons.map((season) => [season.id, season])
);

function toTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function compareByNewest(
  a: SeasonDefinition,
  b: SeasonDefinition
): number {
  const aStart = toTimestamp(a.startAt);
  const bStart = toTimestamp(b.startAt);

  if (aStart !== null && bStart !== null && aStart !== bStart) {
    return bStart - aStart;
  }
  if (aStart !== null && bStart === null) {
    return -1;
  }
  if (aStart === null && bStart !== null) {
    return 1;
  }
  return b.displayOrder - a.displayOrder;
}

export function selectLatestSeasonDefinition(
  seasons: SeasonDefinition[],
  now: Date
): SeasonDefinition | null {
  if (seasons.length === 0) {
    return null;
  }

  const nowTimestamp = now.getTime();
  const activeSeasons = seasons
    .filter((season) => {
      const startAt = toTimestamp(season.startAt);
      const endAt = toTimestamp(season.endAt);
      return (
        startAt !== null &&
        startAt <= nowTimestamp &&
        (season.endAt === null || (endAt !== null && nowTimestamp <= endAt))
      );
    })
    .sort(compareByNewest);
  if (activeSeasons[0]) {
    return activeSeasons[0];
  }

  const seasonsWithStartDate = seasons
    .filter((season) => toTimestamp(season.startAt) !== null)
    .sort(compareByNewest);
  if (seasonsWithStartDate[0]) {
    return seasonsWithStartDate[0];
  }

  const orderedSeasons = [...seasons].sort(
    (a, b) => b.displayOrder - a.displayOrder
  );
  return orderedSeasons[0] ?? seasons[0] ?? null;
}

export function getAppMeta(): AppMeta {
  return appMeta;
}

export function getSeasonDefinitions(): SeasonDefinition[] {
  return [...appMeta.seasons].sort(compareByNewest);
}

export function getSeasonDefinition(id: string): SeasonDefinition | null {
  return seasonDefinitionMap.get(id) ?? null;
}

export function getLatestSeasonId(now = new Date()): string {
  return (
    selectLatestSeasonDefinition(appMeta.seasons, now)?.id ??
    appMeta.seasons[0]?.id ??
    ""
  );
}

export function resolveStoredSeasonId(
  savedSeasonId: string | null,
  now = new Date()
): string {
  const migratedSeasonId = savedSeasonId
    ? appMeta.legacySeasonIdMap[savedSeasonId] ?? savedSeasonId
    : null;

  if (migratedSeasonId && seasonDefinitionMap.has(migratedSeasonId)) {
    return migratedSeasonId;
  }

  return getLatestSeasonId(now);
}

export function getSeasonOptions(): Array<{ id: string; label: string }> {
  return getSeasonDefinitions().map((season) => ({
    id: season.id,
    label: season.label
  }));
}

export function getRegulationDefinitions(): RegulationDefinition[] {
  return [...regulationDefinitions].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
}

export function getRegulationDefinition(
  id: string
): RegulationDefinition | null {
  return regulationDefinitionMap.get(id) ?? null;
}

export function getRegulationLabel(id: string): string {
  return getRegulationDefinition(id)?.label ?? id;
}

export function getRegulationLabelMap(): Record<string, string> {
  return Object.fromEntries(
    getRegulationDefinitions().map((definition) => [
      definition.id,
      definition.label
    ])
  );
}

export function getSeasonLabelMap(): Record<string, string> {
  return Object.fromEntries(
    getSeasonDefinitions().map((season) => [season.id, season.label])
  );
}

export function getRegulationForSeason(
  seasonId: string
): RegulationDefinition | null {
  const season = getSeasonDefinition(seasonId);
  return season ? getRegulationDefinition(season.regulationId) : null;
}

export function resolveArticleSeasonId(
  regulationId: string,
  articleSeasonLabel: string,
  builderSeasonId: string
): string | null {
  const season = getSeasonDefinition(builderSeasonId);
  if (
    !season ||
    season.articleLabel !== articleSeasonLabel ||
    season.regulationId !== regulationId
  ) {
    return null;
  }

  return season.id;
}

export function getSeasonMeta(id: string): {
  id: string;
  label: string;
  regulationId: string;
  regulationLabel: string;
  startDate: string | null;
  endDate: string | null;
  notes: string[];
  allowedCount: number;
  isAllMode: false;
} {
  const season = getSeasonDefinition(id);
  const regulation = season
    ? getRegulationDefinition(season.regulationId)
    : null;
  const allowedCount = filterAllowedPokemon(allPokemon, regulation).length;

  return {
    id,
    label: season?.label ?? id,
    regulationId: regulation?.id ?? "",
    regulationLabel: regulation?.label ?? "未定義",
    startDate: season?.startAt?.slice(0, 10) ?? null,
    endDate: season?.endAt?.slice(0, 10) ?? null,
    notes: regulation?.notes ?? [],
    allowedCount,
    isAllMode: false
  };
}

export function filterAllowedPokemon(
  pokemonList: PokemonEntry[],
  regulation: RegulationDefinition | null
): PokemonEntry[] {
  if (!regulation) {
    return [];
  }

  const allowedSet = new Set(regulation.allowedPokemonSlugs);
  const bannedSet = new Set(regulation.bannedPokemonSlugs);

  return pokemonList.filter(
    (pokemon) =>
      allowedSet.has(pokemon.slug) && !bannedSet.has(pokemon.slug)
  );
}

export function getAvailablePokemonBySeason(
  seasonId: string
): PokemonEntry[] {
  return filterAllowedPokemon(
    allPokemon,
    getRegulationForSeason(seasonId)
  );
}
