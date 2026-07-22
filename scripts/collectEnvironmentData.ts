import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectEnvironmentSnapshot } from "./environment-data/collector";

export function parseEnvironmentCollectionArgs(argv: string[]): {
  period: string;
  sourceFormatId: string;
  cutoff: number;
  dryRun: boolean;
} {
  let period = "";
  let sourceFormatId = "";
  let cutoff: number | null = null;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (argument === "--period" && value) period = value;
    else if (argument === "--format" && value) sourceFormatId = value;
    else if (argument === "--cutoff" && value) cutoff = Number(value);
    else throw new Error(`不明または値が不足している引数です: ${argument}`);
    index += 1;
  }
  if (!period || !sourceFormatId || cutoff === null || !Number.isInteger(cutoff)) {
    throw new Error("--period、--format、--cutoffを指定してください");
  }
  return { period, sourceFormatId, cutoff, dryRun };
}

async function main() {
  const args = parseEnvironmentCollectionArgs(process.argv.slice(2));
  const result = await collectEnvironmentSnapshot(args);
  console.log(JSON.stringify({
    snapshotId: result.snapshot.snapshotId,
    sourceUrl: result.sourceUrl,
    battleCount: result.snapshot.battleCount,
    pokemonCount: result.snapshot.pokemon.length,
    unresolvedPokemonCount: result.snapshot.normalization.unresolvedPokemonCount,
    unresolvedReferenceCount: result.snapshot.normalization.unresolvedReferenceCount,
    unresolvedNames: result.snapshot.normalization.unresolvedNames,
    contentHash: result.snapshot.contentHash,
    snapshotPath: result.snapshotPath,
    dryRun: result.dryRun,
    changed: result.changed,
    hashMatched: result.hashMatched,
    wroteFiles: result.wroteFiles
  }, null, 2));
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error("[fatal] Pokemon Showdown環境データの収集に失敗しました");
    console.error(error);
    process.exitCode = 1;
  });
}
