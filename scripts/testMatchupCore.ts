import { readFileSync } from "node:fs";
import { buildRecommendationAnalyzerFixture } from "@/scripts/lib/recommendationAnalyzerHarness";
import {
  createMatchupVerdictContext,
  evaluateMatchupVerdict,
  resolveMatchupPokemon
} from "@/lib/matchupVerdictEngine";
import {
  evaluateDefensiveCore,
  resolveCoreMembers
} from "@/lib/defensiveCoreEvaluation";
import {
  buildAbilityDenialProfile,
  getAbilityDenialSemantics
} from "@/lib/abilityDenialProfile";
import { evaluateMoveAgainstPokemon } from "@/lib/battleEffectiveness";
import { integrateBattleValueRecommendation } from "@/lib/recommendationBattleValueIntegration";
import type {
  AbilityDenialCategory,
  MatchupVerdict
} from "@/types/matchupCore";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type MatchupCoreBenchmarkCase = {
  id: string;
  title: string;
  candidate?: string;
  threat?: string;
  team?: string[];
  ability?: string;
  expectedVerdicts?: MatchupVerdict[];
  forbiddenVerdicts?: MatchupVerdict[];
  minimumConfidence?: "low" | "medium" | "high";
  requiredDenialCategories?: AbilityDenialCategory[];
  forbiddenDenialCategories?: AbilityDenialCategory[];
  minimumCoreSynergy?: number;
  maximumRedundancyBonus?: number;
  maximumRoleOverlap?: number;
  maximumCycleViability?: number;
  explanationContains?: string[];
  explanationForbids?: string[];
  abilityAdoptionRate?: number;
  maximumAbilityMatchupValue?: number;
  attacker?: string;
  defender?: string;
  attackerAbility?: string;
  defenderAbility?: string;
  requiredAbilityBypass?: boolean;
};

const cases = JSON.parse(
  readFileSync("benchmarks/matchup-core-cases.json", "utf8")
) as { schemaVersion: number; cases: MatchupCoreBenchmarkCase[] };
const golden = JSON.parse(
  readFileSync("benchmarks/matchup-core-golden.json", "utf8")
) as {
  schemaVersion: number;
  minimumOverallScore: number;
  maximumFailCount: number;
  requiredCases: string[];
};
assert(cases.schemaVersion === 1 && cases.cases.length >= 12, "Matchup / Core Benchmark Caseが不足しています");
assert(
  golden.requiredCases.every((id) => cases.cases.some((entry) => entry.id === id)),
  "必須Matchup / Core Caseがありません"
);

const fixture = buildRecommendationAnalyzerFixture({
  teamSlugs: ["corviknight", "clefable", "skeledirge"],
  regulation: "M-B",
  profile: "standard",
  topLimit: 100
});
const dataset = fixture.analyzerInput.environmentDataset;
const context = createMatchupVerdictContext(dataset, "standard");
const sylveon = resolveMatchupPokemon("sylveon");
const charizardY = resolveMatchupPokemon("charizard-mega-y");
const delphoxMega = resolveMatchupPokemon("delphox-mega");
const charizardMatchup = evaluateMatchupVerdict({
  candidate: sylveon,
  threat: charizardY,
  context
});
const delphoxMatchup = evaluateMatchupVerdict({
  candidate: sylveon,
  threat: delphoxMega,
  context
});
for (const matchup of [charizardMatchup, delphoxMatchup]) {
  assert(
    matchup.verdict !== "hard-answer" && matchup.verdict !== "favorable",
    `${matchup.threat}へニンフィアを安定対策として誤判定しました: ${matchup.verdict}`
  );
  assert(matchup.speedRelation === "unfavored", `${matchup.threat}との素早さ不利を認識できません`);
  assert(
    matchup.returnPressure < 50 &&
      matchup.explanation.some(
        (text) => text.includes("反撃圧力") || text.includes("半減以下")
      ),
    `${matchup.threat}へのReturn Pressureを保守的に評価できません`
  );
  assert(
    matchup.candidateCommonMoves.every((move) => move.share >= 0.1),
    `${matchup.threat}へ低採用率技を常時所持として扱っています`
  );
}
assert(
  charizardMatchup.weatherEvidence.some((text) => text.includes("晴れ")) &&
    charizardMatchup.explanation.some((text) => text.includes("半減")),
  "メガリザードンYの晴れ、またはフェアリー一致技への耐性を認識できません"
);

function semantic(
  ability: string,
  required: AbilityDenialCategory[],
  forbidden: AbilityDenialCategory[] = []
): AbilityDenialCategory[] {
  const categories = getAbilityDenialSemantics(ability).map((entry) => entry.category);
  assert(required.every((entry) => categories.includes(entry)), `${ability}の拒否分類が不足しています`);
  assert(forbidden.every((entry) => !categories.includes(entry)), `${ability}へ誤った拒否分類があります`);
  return categories;
}
const unawareSemantic = semantic("unaware", ["SetupDenial", "DefensiveSnowballControl"]);
const magicGuardSemantic = semantic("magicguard", ["ResidualDamageDenial", "HazardDenial"], ["StatusDenial"]);
const mirrorArmorSemantic = semantic("mirrorarmor", ["StatDropDenial", "Reflection"]);
const magicBounceSemantic = semantic("magicbounce", ["Reflection", "StatusDenial", "HazardDenial"], ["ResidualDamageDenial"]);

const clefableProfile = buildAbilityDenialProfile({
  pokemonSlug: "clefable",
  environment: context.environmentBySlug.get("clefable"),
  demand: context.demand
});
assert(
  clefableProfile.entries.every(
    (entry) =>
      !(entry.denialCategories.includes("SetupDenial") &&
        entry.denialCategories.includes("ResidualDamageDenial"))
  ),
  "ピクシーの排他的な特性を同時所持として扱っています"
);
const core = evaluateDefensiveCore(
  resolveCoreMembers(["corviknight", "clefable", "skeledirge"]),
  context
);
assert(
  core.setupDenial > 0 &&
    core.residualDamageDenial > 0 &&
    core.statDropDenial > 0 &&
    core.denialDiversity > 0 &&
    core.cycleViability >= 50 &&
    core.coreSynergy >= 50,
  `代表Defensive Coreを認識できません: ${JSON.stringify(core)}`
);
assert(
  core.redundancyBonus <= 35 && core.roleOverlapPenalty >= 0,
  "重複拒否性能へ逓減を適用できません"
);

const corviknightEnvironment = context.environmentBySlug.get("corviknight");
assert(corviknightEnvironment, "アーマーガアの環境データがありません");
const lowAdoption = buildAbilityDenialProfile({
  pokemonSlug: "synthetic-low-adoption",
  environment: {
    ...corviknightEnvironment,
    slug: "synthetic-low-adoption",
    abilities: [{ id: "mirrorarmor", name: "ミラーアーマー", share: 0.1 }]
  },
  demand: context.demand
});
assert(lowAdoption.expectedValue <= 10, "低採用率特性を確定所持として過大評価しました");

const bypass = evaluateMoveAgainstPokemon({
  move: { type: "ground", damageClass: "physical" },
  attacker: resolveMatchupPokemon("excadrill"),
  defender: resolveMatchupPokemon("rotom-wash"),
  attackerAbilityUsage: [{ id: "moldbreaker", name: "かたやぶり", share: 1 }],
  defenderAbilityUsage: [{ id: "levitate", name: "ふゆう", share: 1 }]
});
assert(
  bypass.immunityProbability === 0 &&
    bypass.ignoredDefensiveAbilities.some((entry) => entry.attackerAbilityId === "moldbreaker"),
  "特性無視を考慮せずType Immunityを過大評価しました"
);

const integration = integrateBattleValueRecommendation({
  input: {
    team: fixture.team,
    advisor: fixture.advisor,
    availablePokemon: fixture.analyzerInput.availablePokemon,
    environmentDataset: dataset,
    threatSnapshot: fixture.threatSnapshot,
    profile: "standard"
  },
  baseline: fixture.simulation,
  environmentSnapshot: fixture.analyzerInput.environmentSnapshot
});
assert(integration.analysis, "Recommendation統合結果がありません");
assert(
  integration.analysis.candidates.some(
    (candidate) =>
      candidate.contributionNormalized.Ability > 0 &&
      candidate.finalRecommendation > 0
  ),
  "Ability ContributionがRecommendationへ接続されていません"
);
assert(
  integration.simulation.evaluatedPlans.every(
    (plan) =>
      plan.abilityMatchupValue >= 0 &&
      plan.abilityMatchupValue <= 100 &&
      plan.finalRecommendation === plan.categoryScores.overall
  ),
  "Ability評価後のFinal Score経路が不正です"
);
assert(
  integration.simulation.evaluatedPlans.every((plan) => {
    if (!plan.defensiveCoreProfile) return true;
    const postActionSlugs = new Set(
      plan.afterTeam.flatMap((slot) =>
        slot.mode === "pokemon" ? [slot.pokemonSlug] : []
      )
    );
    return (
      plan.defensiveCoreProfile.members.includes(plan.candidate.pokemon.slug) &&
      plan.defensiveCoreProfile.members.every((slug) =>
        postActionSlugs.has(slug)
      )
    );
  }),
  "交換後に残らないメンバーをDefensive Coreへ含めています"
);

const source = [
  readFileSync("lib/matchupVerdictEngine.ts", "utf8"),
  readFileSync("lib/abilityDenialProfile.ts", "utf8"),
  readFileSync("lib/defensiveCoreEvaluation.ts", "utf8")
].join("\n");
for (const forbidden of [
  "applyRecommendationRetentionGuard",
  "scoreSlots",
  "previousTop20",
  "recommendationProtectionAdjustment"
]) {
  assert(!source.includes(forbidden), `禁止された順位事後補正が含まれています: ${forbidden}`);
}
const fixedSpeciesTokens = [
  "\"sylveon\"", "\"corviknight\"", "\"clefable\"", "\"skeledirge\"",
  "\"charizard-mega-y\"", "\"delphox-mega\""
];
assert(
  fixedSpeciesTokens.every((token) => !source.includes(token)),
  "本番Engineへポケモン名固定評価が含まれています"
);

const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
const results = cases.cases.map((entry) => {
  const checks: Array<{ label: string; passed: boolean }> = [];
  const caseMatchup =
    entry.candidate && entry.threat
      ? evaluateMatchupVerdict({
          candidate: resolveMatchupPokemon(entry.candidate),
          threat: resolveMatchupPokemon(entry.threat),
          context
        })
      : null;
  const caseCore = entry.team
    ? evaluateDefensiveCore(resolveCoreMembers(entry.team), context)
    : null;
  const caseSemantics = entry.ability
    ? getAbilityDenialSemantics(entry.ability).map(
        (semantic) => semantic.category
      )
    : [];
  const caseAbilityProfile =
    entry.ability && entry.abilityAdoptionRate !== undefined
      ? buildAbilityDenialProfile({
          pokemonSlug: `synthetic-${entry.id}`,
          environment: {
            ...corviknightEnvironment,
            slug: `synthetic-${entry.id}`,
            abilities: [
              {
                id: entry.ability,
                name: entry.ability,
                share: entry.abilityAdoptionRate
              }
            ]
          },
          demand: context.demand
        })
      : null;
  const caseDenialCategories = new Set<AbilityDenialCategory>(caseSemantics);
  if (entry.team) {
    for (const member of resolveCoreMembers(entry.team)) {
      const memberProfile = buildAbilityDenialProfile({
        pokemonSlug: member.slug,
        environment: context.environmentBySlug.get(member.slug),
        demand: context.demand
      });
      for (const category of Object.keys(
        memberProfile.categoryCoverage
      ) as AbilityDenialCategory[]) {
        if ((memberProfile.categoryCoverage[category] ?? 0) > 0) {
          caseDenialCategories.add(category);
        }
      }
    }
  }
  if (entry.expectedVerdicts) {
    checks.push({
      label: "expected verdict",
      passed:
        caseMatchup !== null &&
        entry.expectedVerdicts.includes(caseMatchup.verdict)
    });
  }
  if (entry.forbiddenVerdicts) {
    checks.push({
      label: "forbidden verdict",
      passed:
        caseMatchup !== null &&
        !entry.forbiddenVerdicts.includes(caseMatchup.verdict)
    });
  }
  if (entry.minimumConfidence) {
    checks.push({
      label: "minimum confidence",
      passed:
        caseMatchup !== null &&
        confidenceRank[caseMatchup.confidence] >=
          confidenceRank[entry.minimumConfidence]
    });
  }
  for (const category of entry.requiredDenialCategories ?? []) {
    checks.push({
      label: `required ${category}`,
      passed: caseDenialCategories.has(category)
    });
  }
  for (const category of entry.forbiddenDenialCategories ?? []) {
    checks.push({
      label: `forbidden ${category}`,
      passed: !caseDenialCategories.has(category)
    });
  }
  if (entry.minimumCoreSynergy !== undefined) {
    checks.push({
      label: "minimum core synergy",
      passed:
        caseCore !== null &&
        caseCore.coreSynergy >= entry.minimumCoreSynergy
    });
  }
  if (entry.maximumRedundancyBonus !== undefined) {
    checks.push({
      label: "maximum redundancy bonus",
      passed:
        caseCore !== null &&
        caseCore.redundancyBonus <= entry.maximumRedundancyBonus
    });
  }
  if (entry.maximumRoleOverlap !== undefined) {
    checks.push({
      label: "maximum role overlap",
      passed:
        caseCore !== null &&
        caseCore.roleOverlapPenalty <= entry.maximumRoleOverlap
    });
  }
  if (entry.maximumCycleViability !== undefined) {
    checks.push({
      label: "maximum cycle viability",
      passed:
        caseCore !== null &&
        caseCore.cycleViability <= entry.maximumCycleViability
    });
  }
  const explanations = [
    ...(caseMatchup?.explanation ?? []),
    ...(caseCore?.explanations ?? [])
  ].join(" ");
  for (const concept of entry.explanationContains ?? []) {
    checks.push({
      label: `explanation contains ${concept}`,
      passed: explanations.includes(concept)
    });
  }
  for (const concept of entry.explanationForbids ?? []) {
    checks.push({
      label: `explanation forbids ${concept}`,
      passed: !explanations.includes(concept)
    });
  }
  if (entry.maximumAbilityMatchupValue !== undefined) {
    checks.push({
      label: "maximum ability matchup value",
      passed:
        caseAbilityProfile !== null &&
        caseAbilityProfile.expectedValue <= entry.maximumAbilityMatchupValue
    });
  }
  if (
    entry.requiredAbilityBypass &&
    entry.attacker &&
    entry.defender &&
    entry.attackerAbility &&
    entry.defenderAbility
  ) {
    const abilityBypass = evaluateMoveAgainstPokemon({
      move: { type: "ground", damageClass: "physical" },
      attacker: resolveMatchupPokemon(entry.attacker),
      defender: resolveMatchupPokemon(entry.defender),
      attackerAbilityUsage: [
        { id: entry.attackerAbility, name: entry.attackerAbility, share: 1 }
      ],
      defenderAbilityUsage: [
        { id: entry.defenderAbility, name: entry.defenderAbility, share: 1 }
      ]
    });
    checks.push({
      label: "ability bypass",
      passed:
        abilityBypass.immunityProbability === 0 &&
        abilityBypass.ignoredDefensiveAbilities.some(
          (ability) => ability.attackerAbilityId === entry.attackerAbility
        )
    });
  }
  const passedCount = checks.filter((check) => check.passed).length;
  const score =
    checks.length === 0 ? 0 : Math.round((passedCount / checks.length) * 100);
  return {
    id: entry.id,
    status:
      score === 100 ? "PASS" : score >= 50 ? "PARTIAL" : "FAIL",
    score,
    failures: checks
      .filter((check) => !check.passed)
      .map((check) => check.label)
  };
});
const summary = {
  overallScore:
    results.reduce((sum, entry) => sum + entry.score, 0) / results.length,
  passCount: results.filter((entry) => entry.status === "PASS").length,
  partialCount: results.filter((entry) => entry.status === "PARTIAL").length,
  failCount: results.filter((entry) => entry.status === "FAIL").length
};
assert(
  summary.overallScore >= golden.minimumOverallScore &&
    summary.failCount <= golden.maximumFailCount,
  "Matchup / Core Benchmark基準を満たしていません"
);
process.stdout.write(
  [
    "Matchup / Core Benchmark",
    ...results.map(
      (entry) =>
        `${entry.id} ${entry.status} ${entry.score}${
          entry.failures.length ? ` (${entry.failures.join(", ")})` : ""
        }`
    ),
    `Overall ${summary.overallScore}`,
    `PASS ${summary.passCount} PARTIAL ${summary.partialCount} FAIL ${summary.failCount}`,
    `Sylveon vs Mega Charizard Y: ${charizardMatchup.verdict}`,
    `Sylveon vs Mega Delphox: ${delphoxMatchup.verdict}`,
    `Corviknight / Clefable / Skeledirge: Synergy ${core.coreSynergy}, Cycle ${core.cycleViability}`,
    "TASK053 Matchup/Core Golden fixtures passed."
  ].join("\n") + "\n"
);
