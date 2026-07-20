import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PokemonContentSource } from "../types/pokemonContent";
import { collectPokemonContent } from "./content-collectors/collector";

export function parseContentCollectionArgs(argv: string[]): {
  source?: PokemonContentSource;
  dryRun: boolean;
  backfill: boolean;
} {
  let source: PokemonContentSource | undefined;
  let dryRun = false;
  let backfill = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--backfill") {
      backfill = true;
      continue;
    }
    if (argument === "--source") {
      const value = argv[index + 1];
      if (value !== "pokemon-go-official-rss") {
        throw new Error(
          "--source には pokemon-go-official-rss を指定してください"
        );
      }
      source = value;
      index += 1;
      continue;
    }
    throw new Error(`不明な引数です: ${argument}`);
  }
  return { source, dryRun, backfill };
}

async function main() {
  const result = await collectPokemonContent(
    parseContentCollectionArgs(process.argv.slice(2))
  );
  console.log(JSON.stringify({
    sourceStats: result.sourceStats,
    communicatedDomains: result.communicatedDomains
  }, null, 2));
  console.log(
    `[${result.wroteFiles ? "write" : "no-write"}] 自動コンテンツ ${result.generatedItems.length}件`
  );
  if (result.failed) process.exitCode = 1;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error("[fatal] ポケモン関連コンテンツの収集に失敗しました");
    console.error(error);
    process.exitCode = 1;
  });
}
