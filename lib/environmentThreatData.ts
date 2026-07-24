import { localizeEnvironmentValue } from "@/lib/environmentLocalization";
import type {
  EnvironmentDatasetMetadata,
  EnvironmentSnapshot
} from "@/types/environmentData";
import type { EnvironmentLocalizationDictionary } from "@/types/environmentLocalization";
import type {
  EnvironmentMoveMetadataRegistry,
  ThreatEnvironmentCatalog,
  ThreatEnvironmentDataset,
  ThreatEnvironmentRelation
} from "@/types/environmentThreat";
import type { PokemonEntry } from "@/types/pokemon";

const MOVE_LIMIT = 8;
const ITEM_LIMIT = 1;
const RELATION_LIMIT = 3;

function buildRelation(
  relation: EnvironmentSnapshot["pokemon"][number]["teammates"][number],
  pokemonBySlug: Map<string, PokemonEntry>
): ThreatEnvironmentRelation {
  const definition = relation.slug ? pokemonBySlug.get(relation.slug) : undefined;
  return {
    slug: relation.slug,
    name: definition?.nameJa ?? "未対応",
    share: relation.share
  };
}

export function buildThreatEnvironmentDataset(
  snapshot: EnvironmentSnapshot,
  pokemon: PokemonEntry[],
  localization: EnvironmentLocalizationDictionary,
  moveMetadata: EnvironmentMoveMetadataRegistry,
  metadata: EnvironmentDatasetMetadata
): ThreatEnvironmentDataset {
  const pokemonBySlug = new Map(pokemon.map((entry) => [entry.slug, entry]));

  return {
    snapshotId: snapshot.snapshotId,
    metadata,
    source: "Pokemon Showdown",
    period: snapshot.period.value,
    regulationId: snapshot.regulationId,
    battleFormat: snapshot.battleFormat,
    ratingCutoff: snapshot.ratingCutoff,
    investmentSystem: snapshot.normalization.investmentSystem,
    pokemon: snapshot.pokemon.map((entry) => {
      const offenseProfile = entry.statSpreads.reduce(
        (profile, spread) => {
          if (spread.values.attack > spread.values.specialAttack) {
            profile.physicalShare += spread.share;
          } else if (spread.values.specialAttack > spread.values.attack) {
            profile.specialShare += spread.share;
          } else {
            profile.neutralShare += spread.share;
          }
          return profile;
        },
        { physicalShare: 0, specialShare: 0, neutralShare: 0 }
      );
      return {
        slug: entry.slug,
        usageRank: entry.usage.rank,
        usageRate: entry.usage.rate,
        choiceScarfShare:
          entry.items.find((item) => item.id === "choicescarf")?.share ?? 0,
        offenseProfile,
        moves: entry.moves.slice(0, MOVE_LIMIT).flatMap((move) => {
          const metadata = moveMetadata.moves[move.id];
          if (!metadata) return [];
          return [
            {
              id: move.id,
              name: localizeEnvironmentValue(
                localization,
                "moves",
                move.id
              ).name,
              share: move.share,
              ...metadata
            }
          ];
        }),
        abilities: entry.abilities.slice(0, 4).map((ability) => ({
          id: ability.id,
          name: localizeEnvironmentValue(
            localization,
            "abilities",
            ability.id
          ).name,
          share: ability.share
        })),
        items: entry.items.slice(0, ITEM_LIMIT).map((item) => ({
          id: item.id,
          share: item.share
        })),
        teammates: entry.teammates
          .slice(0, RELATION_LIMIT)
          .map((relation) => buildRelation(relation, pokemonBySlug)),
        checksAndCounters: entry.checksAndCounters
          .slice(0, RELATION_LIMIT)
          .map((relation) => buildRelation(relation, pokemonBySlug))
      };
    })
  };
}

export function findThreatEnvironmentDataset(
  catalog: ThreatEnvironmentCatalog | null,
  regulationId: string
): ThreatEnvironmentDataset | null {
  if (!catalog) return null;
  return (
    catalog.datasets.find(
      (dataset) =>
        dataset.regulationId === regulationId &&
        dataset.battleFormat === "single" &&
        dataset.ratingCutoff === 1760
    ) ??
    catalog.datasets.find(
      (dataset) =>
        dataset.regulationId === regulationId &&
        dataset.battleFormat === "single"
    ) ??
    null
  );
}
