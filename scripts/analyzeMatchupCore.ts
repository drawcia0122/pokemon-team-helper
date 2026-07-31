import { buildRecommendationAnalyzerFixture } from "@/scripts/lib/recommendationAnalyzerHarness";
import {
  buildDefensiveResponseProfile,
  buildOffensiveProfile,
  createMatchupVerdictContext,
  evaluateMatchupVerdict,
  resolveMatchupPokemon
} from "@/lib/matchupVerdictEngine";
import {
  evaluateDefensiveCore,
  resolveCoreMembers
} from "@/lib/defensiveCoreEvaluation";
import {
  buildAbilityDenialProfile
} from "@/lib/abilityDenialProfile";
import { integrateBattleValueRecommendation } from "@/lib/recommendationBattleValueIntegration";
import type { TeamProfile } from "@/lib/teamProfile";

type Options = {
  team: string[];
  candidate?: string;
  threat?: string;
  regulation: string;
  profile: TeamProfile;
  top: number;
  json: boolean;
};

function read(args: string[], index: number): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${args[index]}の値がありません。`);
  return value;
}

function parse(args: string[]): Options {
  const options: Options = {
    team: ["corviknight", "clefable", "skeledirge"],
    regulation: "M-B",
    profile: "standard",
    top: 20,
    json: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--team") options.team = read(args, index++).split(",").filter(Boolean);
    else if (arg === "--candidate") options.candidate = read(args, index++);
    else if (arg === "--threat") options.threat = read(args, index++);
    else if (arg === "--regulation") options.regulation = read(args, index++);
    else if (arg === "--profile") {
      const profile = read(args, index++) as TeamProfile;
      if (profile !== "standard" && profile !== "trick-room") throw new Error(`不明なprofileです: ${profile}`);
      options.profile = profile;
    } else if (arg === "--top") options.top = Number(read(args, index++));
    else throw new Error(`不明なoptionです: ${arg}`);
  }
  return options;
}

const options = parse(process.argv.slice(2));
const fixture = buildRecommendationAnalyzerFixture({
  teamSlugs: options.team,
  regulation: options.regulation,
  profile: options.profile,
  topLimit: Math.min(100, Math.max(1, options.top))
});
const dataset = fixture.analyzerInput.environmentDataset;
const context = createMatchupVerdictContext(dataset, options.profile);
const core = evaluateDefensiveCore(resolveCoreMembers(options.team.slice(0, 3)), context);
const candidate = options.candidate
  ? resolveMatchupPokemon(options.candidate)
  : null;
const offensiveProfile = candidate
  ? buildOffensiveProfile(candidate, context)
  : null;
const defensiveResponseProfile = candidate
  ? buildDefensiveResponseProfile(candidate, context)
  : null;
const matchup =
  candidate && options.threat
    ? evaluateMatchupVerdict({
        candidate,
        threat: resolveMatchupPokemon(options.threat),
        context
      })
    : null;
const candidateAbility = options.candidate
  ? buildAbilityDenialProfile({
      pokemonSlug: options.candidate,
      environment: context.environmentBySlug.get(options.candidate),
      demand: context.demand
    })
  : null;
const integration = integrateBattleValueRecommendation({
  input: {
    team: fixture.team,
    advisor: fixture.advisor,
    availablePokemon: fixture.analyzerInput.availablePokemon,
    environmentDataset: dataset,
    threatSnapshot: fixture.threatSnapshot,
    profile: options.profile
  },
  baseline: fixture.simulation,
  environmentSnapshot: fixture.analyzerInput.environmentSnapshot
});
const result = {
  metadata: {
    schemaVersion: 1,
    datasetId: dataset.snapshotId,
    regulation: options.regulation,
    profile: options.profile
  },
  input: options,
  matchup,
  offensiveProfile,
  defensiveResponseProfile,
  abilityDenialProfile: candidateAbility,
  abilityMatchupValue: candidateAbility?.expectedValue ?? null,
  defensiveCoreProfile: core,
  defensiveCoreSynergy: core.coreSynergy,
  cycleViability: core.cycleViability,
  sharedVulnerabilities: core.sharedVulnerabilities,
  commonBreakers: core.commonBreakers,
  recommendationImpact: options.candidate
    ? integration.analysis?.candidates.find((entry) => entry.slug === options.candidate) ?? null
    : null,
  unclassified: [
    ...(candidateAbility?.unclassified ?? []),
    ...core.unclassified,
    ...(matchup?.unclassifiedEvidence ?? [])
  ],
  explanation: [...(matchup?.explanation ?? []), ...core.explanations],
  performance: {
    cacheKey: `${dataset.snapshotId}:${dataset.metadata.checksum}:${options.profile}`,
    cacheMaximums: {
      datasetContexts: 4,
      profilesPerContext: 512,
      matchupsPerContext: 4096
    },
    ...context.metrics
  }
};

if (options.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  const lines = [
    "Matchup / Defensive Core Analyzer",
    `Dataset: ${result.metadata.datasetId}`,
    matchup
      ? `Matchup Verdict: ${matchup.candidate} vs ${matchup.threat} = ${matchup.verdict} (confidence ${matchup.confidence})`
      : "Matchup Verdict: candidate / threat未指定",
    matchup
      ? `Survival=${matchup.survivalScore} Return Pressure=${matchup.returnPressure} Speed=${matchup.speedRelation}`
      : "",
    offensiveProfile
      ? `Offensive Profile: physical=${offensiveProfile.physicalUsageProbability} special=${offensiveProfile.specialUsageProbability} mixed=${offensiveProfile.mixedUsageProbability} confidence=${offensiveProfile.evidenceConfidence}`
      : "",
    defensiveResponseProfile
      ? `Defensive Response: physical=${defensiveResponseProfile.physicalBulk.toFixed(2)} special=${defensiveResponseProfile.specialBulk.toFixed(2)} recovery=${Math.round(defensiveResponseProfile.recoveryAdoptionRate * 100)}% hazard=${defensiveResponseProfile.hazardSensitivity.toFixed(2)}`
      : "",
    `Ability Matchup Value: ${result.abilityMatchupValue ?? "candidate未指定"}`,
    candidateAbility
      ? `Ability Denial: ${
          candidateAbility.entries
            .map(
              (entry) =>
                `${entry.abilityName} ${Math.round(entry.adoptionRate * 100)}% [${entry.denialCategories.join(",") || "戦闘補助"}]`
            )
            .join(" / ") || "Unclassified"
        }`
      : "",
    `Defensive Core: ${core.members.join(", ")}`,
    `Core Synergy=${core.coreSynergy} Cycle Viability=${core.cycleViability}`,
    `Denial: Setup=${core.setupDenial} Residual=${core.residualDamageDenial} Stat drop=${core.statDropDenial} Diversity=${core.denialDiversity}`,
    `Shared vulnerabilities: ${core.sharedVulnerabilities.join(", ") || "none"}`,
    `Common breakers: ${core.commonBreakers.join(", ") || "none"}`,
    result.recommendationImpact
      ? `Recommendation: ${result.recommendationImpact.baselineRank} -> ${result.recommendationImpact.integratedRank} (Δ${result.recommendationImpact.rankDelta >= 0 ? "+" : ""}${result.recommendationImpact.rankDelta}) Final=${result.recommendationImpact.finalRecommendation} Ability=${result.recommendationImpact.abilityContribution}`
      : "",
    `Unclassified: ${result.unclassified.join(", ") || "none"}`,
    `Cache: offense=${context.metrics.offensiveProfileBuilds} defense=${context.metrics.defensiveProfileBuilds} matchup=${context.metrics.matchupBuilds} hits=${context.metrics.cacheHits}`,
    ...result.explanation.map((text) => `- ${text}`)
  ].filter(Boolean);
  process.stdout.write(`${lines.join("\n")}\n`);
}
