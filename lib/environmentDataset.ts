import type {
  EnvironmentDatasetMetadata,
  EnvironmentSnapshot
} from "@/types/environmentData";

export const ENVIRONMENT_MINIMUM_USAGE_RATE = 0.001;

export function buildEnvironmentDatasetMetadata(
  snapshot: EnvironmentSnapshot,
  publishedAt: string
): EnvironmentDatasetMetadata {
  return {
    schemaVersion: 1,
    datasetId: snapshot.snapshotId,
    source: "Pokemon Showdown",
    sourceUrl: snapshot.sourceUrl,
    fetchedAt: snapshot.retrievedAt,
    publishedAt,
    regulation: snapshot.regulationId,
    season: snapshot.period.value,
    cutoff: snapshot.ratingCutoff,
    minimumUsageRate: ENVIRONMENT_MINIMUM_USAGE_RATE,
    checksum: snapshot.contentHash,
    pokemonCount: snapshot.pokemon.length
  };
}
