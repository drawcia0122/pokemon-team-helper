import { formatRecommendationAnalyzerReport } from "@/lib/recommendationAnalyzer";
import { runRecommendationAnalyzer } from "@/scripts/lib/recommendationAnalyzerHarness";
import type { TeamProfile } from "@/lib/teamProfile";

type CliOptions = {
  teamSlugs?: string[];
  regulation?: string;
  profile?: TeamProfile;
  topLimit?: number;
  json: boolean;
};

function readValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option}の値を指定してください。`);
  }
  return value;
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
      options.teamSlugs = readValue(args, index, arg)
        .split(",")
        .map((slug) => slug.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === "--regulation") {
      options.regulation = readValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      const profile = readValue(args, index, arg);
      if (profile !== "standard" && profile !== "trick-room") {
        throw new Error(`--profileはstandardまたはtrick-roomです: ${profile}`);
      }
      options.profile = profile;
      index += 1;
      continue;
    }
    if (arg === "--top") {
      options.topLimit = Number(readValue(args, index, arg));
      index += 1;
      continue;
    }
    throw new Error(`不明なoptionです: ${arg}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const result = runRecommendationAnalyzer(options);
process.stdout.write(
  options.json
    ? `${JSON.stringify(result, null, 2)}\n`
    : formatRecommendationAnalyzerReport(result)
);
