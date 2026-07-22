import type {
  EnvironmentPokemon,
  EnvironmentSnapshot,
  EnvironmentSnapshotIndex,
  EnvironmentSnapshotIndexEntry
} from "@/types/environmentData";

export type EnvironmentSnapshotSelection = {
  sourceFormatId: string;
  ratingCutoff: number;
  period?: string;
};

/**
 * formatとcutoffを必須にし、異なる母集団の統計を混在させない。
 */
export function listEnvironmentSnapshotReferences(
  index: EnvironmentSnapshotIndex,
  selection: EnvironmentSnapshotSelection
): EnvironmentSnapshotIndexEntry[] {
  return index.snapshots
    .filter(
      (entry) =>
        entry.sourceFormatId === selection.sourceFormatId &&
        entry.ratingCutoff === selection.ratingCutoff &&
        (selection.period === undefined || entry.period === selection.period)
    )
    .sort(
      (left, right) =>
        right.period.localeCompare(left.period, "en") ||
        right.retrievedAt.localeCompare(left.retrievedAt, "en")
    );
}

export function findLatestEnvironmentSnapshotReference(
  index: EnvironmentSnapshotIndex,
  selection: Omit<EnvironmentSnapshotSelection, "period">
): EnvironmentSnapshotIndexEntry | null {
  const latest = index.latest.find(
    (entry) =>
      entry.sourceFormatId === selection.sourceFormatId &&
      entry.ratingCutoff === selection.ratingCutoff
  );
  if (!latest) return null;
  return (
    index.snapshots.find(
      (entry) =>
        entry.snapshotId === latest.snapshotId &&
        entry.path === latest.path &&
        entry.sourceFormatId === selection.sourceFormatId &&
        entry.ratingCutoff === selection.ratingCutoff
    ) ?? null
  );
}

export function findEnvironmentPokemon(
  snapshot: EnvironmentSnapshot,
  slug: string
): EnvironmentPokemon | null {
  return snapshot.pokemon.find((entry) => entry.slug === slug) ?? null;
}
