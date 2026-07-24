import type {
  EnvironmentDatasetMetadata,
  EnvironmentSnapshot
} from "@/types/environmentData";
import { findEnvironmentPokemon } from "@/lib/environmentData";
import { localizeEnvironmentValue } from "@/lib/environmentLocalization";
import type { PokemonEntry } from "@/types/pokemon";
import type {
  EnvironmentLocalizationCategory,
  EnvironmentLocalizationDictionary
} from "@/types/environmentLocalization";
import type {
  EnvironmentPokemonDetailDto,
  EnvironmentRankingDatasetDto,
  EnvironmentSelection
} from "@/types/environmentUi";

const RANKING_LIMIT = 50;
const DETAIL_DISTRIBUTION_LIMIT = 10;

function pokemonBySlug(pokemon: PokemonEntry[]): Map<string, PokemonEntry> {
  return new Map(pokemon.map((entry) => [entry.slug, entry]));
}

export function environmentDetailRelativePath(
  snapshot: EnvironmentSnapshot,
  slug: string,
  localizationVersion: string
): string {
  return `environment-data/${snapshot.contentHash.slice(0, 16)}-${localizationVersion}/${slug}.json`;
}

export function environmentDetailFetchUrl(
  snapshot: EnvironmentSnapshot,
  slug: string,
  localizationVersion: string
): string {
  return `../${environmentDetailRelativePath(snapshot, slug, localizationVersion)}`;
}

export function buildEnvironmentRankingDataset(
  snapshot: EnvironmentSnapshot,
  pokemon: PokemonEntry[],
  localizationVersion: string,
  metadata: EnvironmentDatasetMetadata
): EnvironmentRankingDatasetDto {
  const lookup = pokemonBySlug(pokemon);
  const ranking = snapshot.pokemon.slice(0, RANKING_LIMIT).map((entry) => {
    const definition = lookup.get(entry.slug);
    if (!definition) throw new Error(`environment ranking: pokemonがありません ${entry.slug}`);
    return {
      rank: entry.usage.rank,
      slug: entry.slug,
      name: definition.nameJa,
      pokemonId: definition.id,
      usageRate: entry.usage.rate,
      detailUrl: environmentDetailFetchUrl(snapshot, entry.slug, localizationVersion)
    };
  });
  return {
    snapshotId: snapshot.snapshotId,
    metadata,
    sourceFormatId: snapshot.sourceFormatId,
    period: snapshot.period.value,
    retrievedAt: snapshot.retrievedAt,
    battleCount: snapshot.battleCount,
    contentHash: snapshot.contentHash,
    battleFormat: snapshot.battleFormat,
    regulationId: snapshot.regulationId,
    ratingCutoff: snapshot.ratingCutoff as 0 | 1760,
    ranking
  };
}

export function buildEnvironmentPokemonDetail(
  snapshot: EnvironmentSnapshot,
  slug: string,
  pokemon: PokemonEntry[],
  localization: EnvironmentLocalizationDictionary
): EnvironmentPokemonDetailDto | null {
  const source = findEnvironmentPokemon(snapshot, slug);
  if (!source) return null;
  const lookup = pokemonBySlug(pokemon);
  const definition = lookup.get(source.slug);
  if (!definition) return null;
  const distributions = (
    category: EnvironmentLocalizationCategory,
    values: typeof source.moves
  ) =>
    values.slice(0, DETAIL_DISTRIBUTION_LIMIT).map((entry) => ({
      id: entry.id,
      name: localizeEnvironmentValue(localization, category, entry.id).name,
      rate: entry.share
    }));
  const relations = (values: typeof source.teammates) =>
    values.slice(0, DETAIL_DISTRIBUTION_LIMIT).map((entry) => {
      const related = entry.slug ? lookup.get(entry.slug) : undefined;
      return {
        slug: entry.slug,
        name: related?.nameJa ?? entry.sourceName,
        pokemonId: related?.id ?? null,
        rate: entry.share
      };
    });
  return {
    schemaVersion: 1,
    snapshotId: snapshot.snapshotId,
    slug: source.slug,
    name: definition.nameJa,
    pokemonId: definition.id,
    rank: source.usage.rank,
    usageRate: source.usage.rate,
    moves: distributions("moves", source.moves),
    items: distributions("items", source.items),
    abilities: distributions("abilities", source.abilities),
    statSpreads: source.statSpreads.slice(0, DETAIL_DISTRIBUTION_LIMIT).map((entry) => ({
      natureId: entry.natureId,
      natureName: localizeEnvironmentValue(localization, "natures", entry.natureId).name,
      investmentSystem: entry.investmentSystem,
      values: entry.values,
      rate: entry.share
    })),
    teammates: relations(source.teammates),
    checksAndCounters: relations(source.checksAndCounters)
  };
}

export function findEnvironmentRankingDataset(
  datasets: EnvironmentRankingDatasetDto[],
  selection: EnvironmentSelection
): EnvironmentRankingDatasetDto | null {
  return (
    datasets.find(
      (entry) =>
        entry.battleFormat === selection.battleFormat &&
        entry.regulationId === selection.regulationId &&
        entry.ratingCutoff === selection.ratingCutoff
    ) ?? null
  );
}
