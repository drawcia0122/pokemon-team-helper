import {
  GOAL_ORIENTED_TEAM_BUILDER_CONFIG
} from "@/lib/goalOrientedTeamBuilderConfig";
import { buildGoalBuilderFixture } from "@/scripts/lib/goalBuilderHarness";
import type { TeamProfile } from "@/lib/teamProfile";

type Options = {
  team: string[];
  regulation: string;
  profile: TeamProfile;
  top: number;
  candidate: string | null;
  json: boolean;
};

function parseOptions(argv: string[]): Options {
  const options: Options = {
    team: ["scizor-mega", "garchomp", "rotom-wash"],
    regulation: "M-B",
    profile: "standard",
    top: 10,
    candidate: null,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") {
      options.json = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next) throw new Error(`${value}の値がありません。`);
    if (value === "--team") options.team = next.split(",").filter(Boolean);
    else if (value === "--regulation") options.regulation = next;
    else if (value === "--profile") {
      if (next !== "standard" && next !== "trick-room") {
        throw new Error(`不明なprofileです: ${next}`);
      }
      options.profile = next;
    } else if (value === "--top") options.top = Number.parseInt(next, 10);
    else if (value === "--candidate") options.candidate = next;
    else throw new Error(`不明な引数です: ${value}`);
    index += 1;
  }
  if (!Number.isInteger(options.top) || options.top < 1 || options.top > 100) {
    throw new Error("--topは1〜100の整数で指定してください。");
  }
  return options;
}

const options = parseOptions(process.argv.slice(2));
const { runtime } = buildGoalBuilderFixture({
  teamSlugs: options.team,
  regulation: options.regulation,
  profile: options.profile
});
const result = runtime.goalBuilder;
if (options.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}
const candidates = options.candidate
  ? result.candidates.filter(
      (entry) => entry.candidateSlug === options.candidate
    )
  : result.candidates.slice(0, options.top);
const lines = [
  "Goal-Oriented Multi-step Team Builder",
  `Team: ${result.input.team.join(", ")}`,
  `Regulation/Profile: ${result.input.regulation} / ${result.input.profile}`,
  `Mode: ${result.metadata.mode} / Beam Search=${result.metadata.beamSearch}`,
  `Future pool: ${GOAL_ORIENTED_TEAM_BUILDER_CONFIG.futurePoolSize}`,
  ""
];
for (const [index, candidate] of candidates.entries()) {
  lines.push(
    `${index + 1}. ${candidate.candidateSlug} Goal=${candidate.selectedGoal.label} Score=${candidate.goalScore} Affinity=${candidate.goalAffinity}`,
    `   Current=${candidate.currentFit} Future=${candidate.futurePotential} Core=${candidate.coreQuality.overall} DeadEnd=${candidate.deadEndRisk}`,
    `   Current axes: ${Object.entries(candidate.currentCoreQuality).map(([axis, value]) => `${axis}=${value}`).join(" ")}`,
    `   Projected axes: ${Object.entries(candidate.coreQuality).map(([axis, value]) => `${axis}=${value}`).join(" ")}`,
    `   Next: ${candidate.nextCandidates.map((entry) => `${entry.name}(${entry.score}; affinity=${entry.goalAffinity})`).join(" / ") || "なし"}`,
    `   Chain: ${candidate.chain.map((entry) => `${entry.step}:${entry.name}`).join(" -> ") || "なし"}`,
    `   Reasons: ${candidate.explanations.join(" / ")}`
  );
}
lines.push(
  "",
  `Computed: candidates=${result.computation.candidateCount} comparisons=${result.computation.futureComparisonCount} chainSteps=${result.computation.chainStepCount}`
);
process.stdout.write(`${lines.join("\n")}\n`);
