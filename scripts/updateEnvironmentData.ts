import path from "node:path";
import { fileURLToPath } from "node:url";
import registryData from "../data/environment/formatRegistry.json";
import type { EnvironmentFormatRegistry } from "../types/environmentData";
import {
  runEnvironmentDataPipeline,
  type EnvironmentUpdateTarget
} from "./environment-data/pipeline";

export type EnvironmentUpdateArgs = {
  period: string;
  sourceFormatId: string;
  cutoffs: number[];
  dryRun: boolean;
};

export function previousCompleteMonth(now: Date): string {
  const previous = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
  );
  return `${previous.getUTCFullYear()}-${String(
    previous.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

export function parseEnvironmentUpdateArgs(
  argv: string[],
  now = new Date(),
  registry = registryData as EnvironmentFormatRegistry
): EnvironmentUpdateArgs {
  let period = previousCompleteMonth(now);
  let sourceFormatId = registry.automaticUpdate.sourceFormatId;
  const cutoffs: number[] = [];
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`引数の値がありません: ${argument}`);
    if (argument === "--period") period = value;
    else if (argument === "--format") sourceFormatId = value;
    else if (argument === "--cutoff") cutoffs.push(Number(value));
    else throw new Error(`不明な引数です: ${argument}`);
    index += 1;
  }
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(period)) {
    throw new Error(`periodはYYYY-MM形式で指定してください: ${period}`);
  }
  const selectedCutoffs =
    cutoffs.length > 0 ? cutoffs : registry.automaticUpdate.cutoffs;
  if (
    selectedCutoffs.some(
      (cutoff) =>
        !Number.isInteger(cutoff) ||
        !registry.allowedCutoffs.includes(cutoff)
    )
  ) {
    throw new Error(
      `許可されていないcutoffです: ${selectedCutoffs.join(", ")}`
    );
  }
  return {
    period,
    sourceFormatId,
    cutoffs: [...new Set(selectedCutoffs)],
    dryRun
  };
}

function targets(args: EnvironmentUpdateArgs): EnvironmentUpdateTarget[] {
  return args.cutoffs.map((cutoff) => ({
    period: args.period,
    sourceFormatId: args.sourceFormatId,
    cutoff
  }));
}

function milliseconds(value: number): string {
  return `${value.toFixed(2)}ms`;
}

async function main() {
  const args = parseEnvironmentUpdateArgs(process.argv.slice(2));
  console.log(
    `[environment:update] source=Pokemon Showdown period=${args.period} format=${args.sourceFormatId} cutoffs=${args.cutoffs.join(
      ","
    )} dryRun=${args.dryRun}`
  );
  try {
    const result = await runEnvironmentDataPipeline({
      targets: targets(args),
      dryRun: args.dryRun
    });
    for (const snapshot of result.snapshots) {
      console.log(
        `[environment:dataset] datasetId=${snapshot.snapshotId} fetchedAt=${snapshot.retrievedAt} regulation=${snapshot.regulationId} season=${snapshot.period.value} cutoff=${snapshot.ratingCutoff} pokemonCount=${snapshot.pokemon.length}`
      );
    }
    for (const comparison of result.comparisons) {
      console.log(
        `[environment:compare] datasetId=${comparison.datasetId} changed=${comparison.changed} validation=passed compare=passed pokemon=${comparison.pokemonCount.previous ?? "new"}->${comparison.pokemonCount.next} moves=${comparison.moveCount.previous ?? "new"}->${comparison.moveCount.next} abilities=${comparison.abilityCount.previous ?? "new"}->${comparison.abilityCount.next}`
      );
    }
    console.log(
      `[environment:publish] published=${result.published} noChange=${!result.changed} fallback=${result.fallbackUsed} dryRun=${result.dryRun}`
    );
    console.log(
      `[environment:timing] fetch=${milliseconds(
        result.timings.fetchMs
      )} normalize=${milliseconds(
        result.timings.normalizeMs
      )} validate=${milliseconds(
        result.timings.validateMs
      )} compare=${milliseconds(
        result.timings.compareMs
      )} publish=${milliseconds(
        result.timings.publishMs
      )} total=${milliseconds(result.timings.totalMs)} jsonBytes=${
        result.jsonBytes
      }`
    );
  } catch (error) {
    console.error(
      "[environment:error] publish=false fallback=previous-published-dataset"
    );
    throw error;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
