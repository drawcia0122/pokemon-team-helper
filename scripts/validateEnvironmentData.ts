import { readFile } from "node:fs/promises";
import path from "node:path";
import aliasesData from "@/data/environment/sourcePokemonAliases.json";
import formatRegistryData from "@/data/environment/formatRegistry.json";
import indexData from "@/data/environment/index.json";
import pokemonData from "@/data/pokemon.json";
import {
  validateEnvironmentAliases,
  validateEnvironmentIndex,
  validateEnvironmentRegistry,
  validateEnvironmentSnapshot
} from "@/lib/validateEnvironmentData";
import type {
  EnvironmentFormatRegistry,
  EnvironmentPokemonAliases,
  EnvironmentSnapshot,
  EnvironmentSnapshotIndex
} from "@/types/environmentData";
import type { PokemonEntry } from "@/types/pokemon";

async function main() {
  const registry = formatRegistryData as EnvironmentFormatRegistry;
  const aliases = aliasesData as EnvironmentPokemonAliases;
  const index = indexData as EnvironmentSnapshotIndex;
  const pokemon = pokemonData as PokemonEntry[];
  const errors = [
    ...validateEnvironmentRegistry(registry).errors,
    ...validateEnvironmentAliases(aliases, pokemon).errors
  ];
  const snapshotsByPath = new Map<string, EnvironmentSnapshot>();
  for (const entry of index.snapshots) {
    if (
      !entry.path.startsWith("data/environment/snapshots/pokemon-showdown/") ||
      entry.path.includes("..") ||
      path.isAbsolute(entry.path)
    ) {
      errors.push(`environment index: 危険なpathです ${entry.path}`);
      continue;
    }
    try {
      const snapshot = JSON.parse(
        await readFile(path.join(process.cwd(), entry.path), "utf8")
      ) as EnvironmentSnapshot;
      snapshotsByPath.set(entry.path, snapshot);
      errors.push(
        ...validateEnvironmentSnapshot(snapshot, { pokemon, registry, aliases }).map(
          (error) => `${entry.path}: ${error}`
        )
      );
    } catch (error) {
      errors.push(
        `${entry.path}: 読み取りに失敗しました (${error instanceof Error ? error.message : String(error)})`
      );
    }
  }
  errors.push(...validateEnvironmentIndex(index, snapshotsByPath));
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    throw new Error(`環境データ検証に失敗しました: ${errors.length}件`);
  }
  const unresolved = [...snapshotsByPath.values()].reduce(
    (sum, snapshot) => sum + snapshot.normalization.unresolvedPokemonCount,
    0
  );
  console.log(
    `[ok] 環境データ: registry ${registry.formats.length}形式 / alias ${Object.keys(aliases.aliases).length}件 / snapshot ${index.snapshots.length}件 / unresolved ${unresolved}件`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
