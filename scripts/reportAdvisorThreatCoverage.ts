import { getAdvisorCounterplayMethodLabel } from "@/lib/advisorThreatCoverage";
import { analyzeAdvisorTeam } from "@/scripts/lib/trickRoomAdvisorHarness";

const fixtures = [
  {
    label: "バランス6体",
    team: [
      "charizard",
      "garchomp",
      "rotom-wash",
      "corviknight",
      "clefable",
      "kingambit"
    ]
  },
  {
    label: "こおり一貫3体",
    team: ["dragonite", "garchomp", "gliscor"]
  },
  {
    label: "ほのお中心3体",
    team: ["charizard", "volcarona", "talonflame"]
  }
] as const;

for (const fixture of fixtures) {
  const result = analyzeAdvisorTeam([...fixture.team], "standard");
  console.log(`\n${fixture.label}: ${fixture.team.join(",")}`);
  console.log(
    `現在の要警戒TOP5: ${result.threats
      .map(
        (threat, index) =>
          `${index + 1}.${threat.pokemon.nameJa}(${threat.score}点/${((threat.environment?.usageRate ?? 0) * 100).toFixed(1)}%)`
      )
      .join(" / ")}`
  );
  console.log(
    `旧単体評価候補: ${result.advisor.candidates
      .map((candidate) => candidate.pokemon.nameJa)
      .join(" / ") || "なし"}`
  );
  const plans = result.simulation.plansByCategory.overall;
  console.log(
    `新TOP5カバレッジ候補: ${plans
      .map((plan) => {
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
        const usage = plan.threatCoverage.candidateUsage;
        return `${plan.candidate.pokemon.nameJa}[${plan.threatCoverage.distinctThreatCount}/5,${plan.threatCoverage.weightedThreatCoverage.toFixed(3)},${usage === null ? "unknown" : `${(usage * 100).toFixed(1)}%`},${methods || "none"}]`;
      })
      .join(" / ") || "なし"}`
  );
}
