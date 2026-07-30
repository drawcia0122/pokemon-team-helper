import type { TeamProfile } from "@/lib/teamProfile";
import {
  runRecommendationIntegration,
  type RecommendationIntegrationOptions
} from "@/scripts/lib/recommendationIntegrationHarness";

type CliOptions = RecommendationIntegrationOptions & { json: boolean };

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
      const top = Number(value(args, index, arg));
      if (!Number.isInteger(top) || top < 1 || top > 100) {
        throw new Error("--topは1〜100の整数で指定してください。");
      }
      options.topLimit = top;
      index += 1;
      continue;
    }
    if (arg === "--candidate") {
      options.candidateSlug = value(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`不明なoptionです: ${arg}`);
  }
  return options;
}

function format(
  result: ReturnType<typeof runRecommendationIntegration>,
  options: CliOptions
): string {
  const analysis = result.analysis;
  if (!analysis) return "";
  const candidates = options.candidateSlug
    ? analysis.candidates.filter(
        (candidate) => candidate.slug === options.candidateSlug
      )
    : analysis.candidates.slice(0, options.topLimit ?? 20);
  const lines = [
    "Contestability Engine V1",
    `Team: ${analysis.input.team.join(", ")}`,
    `Regulation/Profile: ${analysis.input.regulation} / ${analysis.input.profile}`,
    `Weight: ${analysis.config.contestabilityWeight * 100}%`,
    `TOP20 retention: ${(analysis.top20RetentionRate * 100).toFixed(1)}%`,
    `TOP50 retention: ${(analysis.top50RetentionRate * 100).toFixed(1)}%`,
    "",
    "Ranking"
  ];
  for (const candidate of candidates) {
    lines.push(
      `${candidate.integratedRank}. ${candidate.name} (${candidate.slug}) Final=${candidate.finalRecommendation} Contestability=${candidate.contestability} actual=${(candidate.contestabilityRatio * 100).toFixed(1)}%`,
      `  Environment=${candidate.contestabilityAxes.environment} Team=${candidate.contestabilityAxes.team} Matchup=${candidate.contestabilityAxes.matchup} Reliability=${candidate.contestabilityAxes.reliability}`,
      `  Recommendation confidence=${candidate.recommendationConfidence}`,
      `  Reasons: ${candidate.contestabilityReasons.map((reason) => reason.text).join(" / ")}`
    );
  }
  return `${lines.join("\n")}\n`;
}

const options = parseArgs(process.argv.slice(2));
const result = runRecommendationIntegration(options);
process.stdout.write(
  options.json
    ? `${JSON.stringify(result.analysis, null, 2)}\n`
    : format(result, options)
);
