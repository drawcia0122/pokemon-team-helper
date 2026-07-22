import { writeFileSync } from "node:fs";
import { getAdvisorRoleCounts } from "@/lib/advisorSwapSimulator";
import { getAdvisorCounterplayMethodLabel } from "@/lib/advisorThreatCoverage";
import { TEAM_SPEED_THRESHOLDS } from "@/lib/teamProfile";
import {
  analyzeTrickRoomFixture,
  TRICK_ROOM_DIVERSITY_FIXTURES
} from "@/scripts/lib/trickRoomAdvisorHarness";

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
const lines: string[] = [];

for (const fixture of TRICK_ROOM_DIVERSITY_FIXTURES) {
  const result = analyzeTrickRoomFixture(fixture);
  const roles = getAdvisorRoleCounts(result.team);
  lines.push(`${fixture.label} (${fixture.id})`);
  lines.push(`team=${fixture.team.join(",")}`);
  lines.push(`speedRoles=fast:${roles.fast},medium:${roles.mediumSpeed},slow:${roles.slow}`);
  lines.push(
    `threatTop5=${result.threats
      .map((threat) => `${threat.pokemon.nameJa}:${threat.score}`)
      .join(" / ")}`
  );
  for (const category of ["overall", "defensive", "offensive", "speed"] as const) {
    const plans = result.simulation.plansByCategory[category];
    const slowCount = plans.filter(
      (plan) =>
        (plan.candidate.pokemon.baseStats?.speed ?? Infinity) <=
        TEAM_SPEED_THRESHOLDS.slowMaximum
    ).length;
    lines.push(
      `${category}[slow=${slowCount}/${plans.length}]=${plans
        .map(
          (plan) => {
            const methods = [...new Set(
              plan.threatCoverage.threatAnswers
                .filter((answer) => answer.answerStrength >= 0.6)
                .flatMap((answer) => answer.counterplayMethods)
                .filter(
                  (method) => method !== "conditional" && method !== "none"
                )
            )]
              .slice(0, 3)
              .map(getAdvisorCounterplayMethodLabel)
              .join("+");
            return `${plan.candidate.pokemon.nameJa}(S${plan.candidate.pokemon.baseStats?.speed ?? "?"},roles:${plan.profileRoles.join("+") || "none"},${plan.action.removedLabel ?? "空き枠"},score:${plan.categoryScores[category]},threat:${plan.beforeThreatAverage}->${plan.afterThreatAverage},coverage:${plan.threatCoverage.distinctThreatCount}/5@${plan.threatCoverage.weightedThreatCoverage.toFixed(3)},usage:${plan.threatCoverage.candidateUsage === null ? "unknown" : `${(plan.threatCoverage.candidateUsage * 100).toFixed(1)}%`},methods:${methods || "none"})`;
          }
        )
        .join(" / ")}`
    );
  }
  lines.push("");
}

const report = `${lines.join("\n")}\n`;
if (outputPath) {
  writeFileSync(outputPath, report, "utf8");
  console.log(`トリックルーム推薦レポートを出力しました: ${outputPath}`);
} else {
  process.stdout.write(report);
}
