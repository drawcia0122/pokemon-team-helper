import { readFileSync } from "node:fs";
import path from "node:path";
import formatRegistryData from "@/data/environment/formatRegistry.json";
import indexData from "@/data/environment/index.json";
import localizationData from "@/data/environment/localization/ja.json";
import pokemonData from "@/data/pokemon.json";
import { findLatestEnvironmentSnapshotReference } from "@/lib/environmentData";
import {
  buildEnvironmentPokemonDetail,
  buildEnvironmentRankingDataset,
  environmentDetailRelativePath
} from "@/lib/environmentPresentation";
import type {
  EnvironmentFormatRegistry,
  EnvironmentSnapshot,
  EnvironmentSnapshotIndex,
  EnvironmentSnapshotIndexEntry
} from "@/types/environmentData";
import type { PokemonEntry } from "@/types/pokemon";
import type { EnvironmentLocalizationDictionary } from "@/types/environmentLocalization";
import type {
  EnvironmentPokemonDetailDto,
  EnvironmentRankingCatalogDto,
  EnvironmentSelection
} from "@/types/environmentUi";

const registry = formatRegistryData as EnvironmentFormatRegistry;
const index = indexData as EnvironmentSnapshotIndex;
const pokemon = pokemonData as PokemonEntry[];
const localization = localizationData as EnvironmentLocalizationDictionary;
const snapshotCache = new Map<string, EnvironmentSnapshot>();

function assertSnapshotPath(relativePath: string): void {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("..") ||
    !relativePath.startsWith("data/environment/snapshots/pokemon-showdown/")
  ) {
    throw new Error(`environment snapshot pathが不正です: ${relativePath}`);
  }
}

export function readEnvironmentSnapshot(
  reference: EnvironmentSnapshotIndexEntry
): EnvironmentSnapshot {
  const cached = snapshotCache.get(reference.path);
  if (cached) return cached;
  assertSnapshotPath(reference.path);
  const snapshot = JSON.parse(
    readFileSync(path.join(process.cwd(), reference.path), "utf8")
  ) as EnvironmentSnapshot;
  if (
    snapshot.snapshotId !== reference.snapshotId ||
    snapshot.contentHash !== reference.contentHash
  ) {
    throw new Error(`environment snapshotとindexが一致しません: ${reference.path}`);
  }
  snapshotCache.set(reference.path, snapshot);
  return snapshot;
}

function availableReferences(): EnvironmentSnapshotIndexEntry[] {
  const references: EnvironmentSnapshotIndexEntry[] = [];
  for (const format of registry.formats.filter((entry) => entry.enabled)) {
    for (const ratingCutoff of registry.allowedCutoffs) {
      const reference = findLatestEnvironmentSnapshotReference(index, {
        sourceFormatId: format.sourceFormatId,
        ratingCutoff
      });
      if (reference) references.push(reference);
    }
  }
  return references;
}

function defaultSelection(
  datasets: EnvironmentRankingCatalogDto["datasets"]
): EnvironmentSelection {
  const preferred = datasets.find(
    (entry) =>
      entry.battleFormat === "single" &&
      entry.regulationId === "M-B" &&
      entry.ratingCutoff === 1760
  );
  const fallback = preferred ?? datasets[0];
  return fallback
    ? {
        battleFormat: fallback.battleFormat,
        regulationId: fallback.regulationId,
        ratingCutoff: fallback.ratingCutoff
      }
    : { battleFormat: "single", regulationId: "M-B", ratingCutoff: 1760 };
}

export function getEnvironmentRankingCatalog(): EnvironmentRankingCatalogDto {
  const datasets = availableReferences().map((reference) =>
    buildEnvironmentRankingDataset(
      readEnvironmentSnapshot(reference),
      pokemon,
      localization.dictionaryVersion
    )
  );
  return {
    source: "Pokemon Showdown",
    datasets,
    initialSelection: defaultSelection(datasets)
  };
}

export type EnvironmentDetailExport = {
  relativePath: string;
  detail: EnvironmentPokemonDetailDto;
};

export function getEnvironmentDetailExports(): EnvironmentDetailExport[] {
  return availableReferences().flatMap((reference) => {
    const snapshot = readEnvironmentSnapshot(reference);
    return snapshot.pokemon.slice(0, 50).flatMap((entry) => {
      const detail = buildEnvironmentPokemonDetail(
        snapshot,
        entry.slug,
        pokemon,
        localization
      );
      return detail
        ? [
            {
              relativePath: environmentDetailRelativePath(
                snapshot,
                entry.slug,
                localization.dictionaryVersion
              ),
              detail
            }
          ]
        : [];
    });
  });
}
