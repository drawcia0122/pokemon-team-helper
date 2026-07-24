import {
  formatBattleValue,
  runBattleValue,
  type BattleValueOptions
} from "@/scripts/lib/battleValueHarness";
import type { TeamProfile } from "@/lib/teamProfile";

type CliOptions = BattleValueOptions & { json: boolean };

function value(args: string[], index: number, option: string): string {
  const result = args[index + 1];
  if (!result || result.startsWith("--")) {
    throw new Error(`${option}の値を指定してください。`);
  }
  return result;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--team") {
      options.teamSlugs = value(args, index, arg)
        .split(",")
        .map((slug) => slug.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--regulation") {
      options.regulation = value(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      const profile = value(args, index, arg) as TeamProfile;
      if (profile !== "standard" && profile !== "trick-room") {
        throw new Error(`不明なProfileです: ${profile}`);
      }
      options.profile = profile;
      index += 1;
      continue;
    }
    if (arg === "--top") {
      options.topLimit = Number(value(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--candidate") {
      options.candidateSlug = value(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--dataset") {
      options.datasetId = value(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--compare-dataset") {
      options.compareDatasetId = value(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`不明なoptionです: ${arg}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const result = runBattleValue(options);
process.stdout.write(
  options.json
    ? `${JSON.stringify(result, null, 2)}\n`
    : formatBattleValue(result, options.topLimit ?? 20)
);
