import { readFileSync } from "node:fs";
import { formatBattleValueReport } from "@/lib/battleValueEngine";
import { BATTLE_VALUE_CONFIG } from "@/lib/battleValueConfig";
import {
  buildRecommendationAnalyzerFixture,
  runRecommendationAnalyzer
} from "@/scripts/lib/recommendationAnalyzerHarness";
import { runBattleValue } from "@/scripts/lib/battleValueHarness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Result = ReturnType<typeof runBattleValue>;

function candidate(result: Result, slug: string) {
  const found = result.candidates.find((entry) => entry.slug === slug);
  assert(found, `${slug}のBattle Valueがありません`);
  return found;
}

function recommendationState(
  fixture: ReturnType<typeof buildRecommendationAnalyzerFixture>
): string {
  return JSON.stringify({
    advisor: fixture.advisor,
    threatSnapshot: fixture.threatSnapshot,
    plans: fixture.simulation.evaluatedPlans.map((plan) => ({
      slug: plan.candidate.pokemon.slug,
      action: plan.action,
      score: plan.improvementScore,
      categoryScores: plan.categoryScores,
      eligibility: plan.isRecommendationByCategory,
      evidence: plan.evidence,
      currentTop5: plan.threatSnapshot.currentDisplayedTop5,
      postActionTop5: plan.postActionThreatSnapshot.currentDisplayedTop5,
      trackedThreats: plan.threatSnapshot.trackedThreats,
      threatUnion: plan.threatUnion
    })),
    selectedPlans: fixture.simulation.plans,
    additions: fixture.simulation.additionPlans,
    megaStats: fixture.simulation.megaRecommendationStats
  });
}

const fixture = buildRecommendationAnalyzerFixture();
const recommendationBefore = recommendationState(fixture);
const recommendationBaseline = runRecommendationAnalyzer();
const first = runBattleValue();
const second = runBattleValue();
const focused = runBattleValue({
  candidateSlug: "starmie-mega",
  datasetId: first.input.datasetId,
  compareDatasetId: "previous-season-fixture"
});
const recommendationAfter = recommendationState(fixture);

assert(
  recommendationBefore === recommendationAfter &&
    first.recommendationUnchanged,
  "Battle ValueがRecommendationまたはThreat状態を変更しました"
);
assert(
  JSON.stringify(first) === JSON.stringify(second),
  "同一入力でBattle Value結果が再現しません"
);
assert(
  focused.candidates.length === 1 &&
    focused.candidates[0].slug === "starmie-mega" &&
    focused.datasetComparison?.supported === false &&
    focused.datasetComparison.requestedDatasetId ===
      "previous-season-fixture",
  "--candidate・--dataset・--compare-datasetの解析結果が不正です"
);
for (const key of [
  "metadata",
  "input",
  "datasetSummary",
  "weights",
  "tierThresholds",
  "battleValueRanking",
  "recommendationComparison",
  "battleValueUnderrecognized",
  "staticRecommendationLeaders",
  "balancedCandidates",
  "highValueButExcluded",
  "archetypeSummary",
  "battleTagSummary",
  "reliabilitySummary",
  "riskAdjustmentSummary",
  "representativeComparison",
  "hazardControlInvestigation",
  "unclassifiedSummary",
  "recommendationUnchanged"
] as const) {
  assert(key in first, `JSON出力型に${key}がありません`);
}
assert(
  first.metadata.mode === "shadow" &&
    first.metadata.deterministic &&
    first.metadata.tieBreak.includes("slug"),
  "Shadow Modeまたは決定的tie-breakが明示されていません"
);
const starmieSemantic = recommendationBaseline.semanticProfiles.find(
  (entry) => entry.slug === "starmie-mega"
);
const jolteonSemantic = recommendationBaseline.semanticProfiles.find(
  (entry) => entry.slug === "jolteon"
);
assert(
  starmieSemantic?.semanticGap === 74.6 &&
    jolteonSemantic?.semanticGap === 47.4 &&
    recommendationBaseline.representationMap.length === 14,
  "TASK045 Semantic Presence・Gap・Representation Map基準が変化しました"
);
assert(
  Object.values(BATTLE_VALUE_CONFIG.weights).reduce(
    (total, weight) => total + weight,
    0
  ) === 110 &&
    BATTLE_VALUE_CONFIG.weights.interactionBonus <= 20 &&
    BATTLE_VALUE_CONFIG.weights.roleCompression <= 15 &&
    BATTLE_VALUE_CONFIG.teamFit.minimum === -15 &&
    BATTLE_VALUE_CONFIG.teamFit.maximum === 15 &&
    BATTLE_VALUE_CONFIG.riskAdjustment.minimum === -10,
  "重み・Interaction・Role Compression・Team Fit・Riskの上限が不正です"
);
assert(
  first.candidates.every(
    (entry) =>
      entry.finalBattleValue >= 0 &&
      entry.finalBattleValue <= 100 &&
      entry.reliability >= 0 &&
      entry.reliability <= 1 &&
      entry.interactionBonus <= 10 &&
      entry.interactionBonus >= -10 &&
      entry.axisBreakdown.roleCompression <= 8 &&
      entry.teamFitModifier >= -15 &&
      entry.teamFitModifier <= 15 &&
      entry.riskAdjustment >= -10 &&
      entry.riskAdjustment <= 0
  ),
  "Battle Valueまたは補正値が範囲外です"
);

const representativeSlugs = [
  "gengar-mega",
  "starmie-mega",
  "lucario-mega",
  "blaziken-mega",
  "lopunny-mega",
  "mawile-mega",
  "kingambit",
  "volcarona",
  "dragapult",
  "scizor",
  "azumarill",
  "espathra",
  "scolipede",
  "jolteon",
  "sylveon"
];
assert(
  first.representativeComparison.map((entry) => entry.slug).join("|") ===
    representativeSlugs.join("|"),
  "代表15体の比較が揃っていません"
);

const starmie = candidate(first, "starmie-mega");
const gengar = candidate(first, "gengar-mega");
const kingambit = candidate(first, "kingambit");
const volcarona = candidate(first, "volcarona");
const jolteon = candidate(first, "jolteon");
const sylveon = candidate(first, "sylveon");
assert(
  starmie.recommendationRank === 113 &&
    starmie.axisBreakdown.cleanup > 0 &&
    starmie.axisBreakdown.priorityRevenge > 0 &&
    starmie.axisBreakdown.tempo > 0 &&
    starmie.finalBattleValue > jolteon.finalBattleValue,
  "メガスターミーのBattle Value Goldenが不正です"
);
assert(
  gengar.recommendationRank === 32 &&
    gengar.axisBreakdown.immediateBreak > 0 &&
    gengar.axisBreakdown.trade > 0 &&
    gengar.axisBreakdown.trapTargetRemoval >
      jolteon.axisBreakdown.trapTargetRemoval,
  "メガゲンガーのBattle Value Goldenが不正です"
);
assert(
  kingambit.axisBreakdown.priorityRevenge > 0 &&
    kingambit.axisBreakdown.setupWinCondition > 0 &&
    kingambit.axisBreakdown.snowball > 0 &&
    kingambit.finalBattleValue > jolteon.finalBattleValue,
  "ドドゲザンのBattle Value Goldenが不正です"
);
assert(
  volcarona.axisBreakdown.setupWinCondition > 0 &&
    volcarona.axisBreakdown.setupWinCondition <= 15 &&
    volcarona.finalBattleValue > 0,
  "ウルガモスの採用率・上限を考慮した評価が不正です"
);
assert(
  jolteon.axisBreakdown.tempo > 0 &&
    jolteon.axisBreakdown.cleanup < 15 &&
    jolteon.finalBattleValue > 0,
  "サンダースの部分評価が不正です"
);
assert(
  sylveon.finalBattleValue > 0 &&
    sylveon.axisBreakdown.priorityRevenge <
      starmie.axisBreakdown.priorityRevenge,
  "ニンフィアの物理先制技を特攻で評価している可能性があります"
);

const trickOptions = {
  teamSlugs: ["dragonite", "garchomp", "gliscor"],
  regulation: "M-B",
  topLimit: 20
};
const standard = runBattleValue({ ...trickOptions, profile: "standard" });
const trickRoom = runBattleValue({ ...trickOptions, profile: "trick-room" });
assert(
  standard.input.datasetId === trickRoom.input.datasetId &&
    candidate(trickRoom, "torkoal").axisBreakdown.cleanup >=
      candidate(standard, "torkoal").axisBreakdown.cleanup,
  "通常・トリックルームのDatasetまたは低速評価が不正です"
);
const megaEarly = runBattleValue({
  teamSlugs: ["gengar-mega", "garchomp"],
  regulation: "M-B",
  profile: "standard"
});
assert(
  !candidate(megaEarly, "starmie-mega").eligibility,
  "Battle ValueがTASK039の序盤Mega候補制御を変更しました"
);
assert(
  megaEarly.highValueButExcluded.length > 0 &&
    megaEarly.highValueButExcluded.every((entry) => !entry.eligibility),
  "序盤Mega FixtureでHigh Value but Excludedを分類できません"
);
const defensive = runBattleValue({
  teamSlugs: ["umbreon", "corviknight", "toxapex"],
  regulation: "M-B",
  profile: "standard"
});
assert(
  defensive.battleValueRanking.length === standard.battleValueRanking.length &&
    defensive.candidates.some(
      (entry) =>
        entry.battleTags.includes("DefensiveAnchor") &&
        entry.finalBattleValue > 0
    ),
  "守備寄りFixtureで候補集合が変化しました"
);

const expectedTop20 = recommendationBaseline.recommendationTop20
  .map((entry) => `${entry.slug}:${entry.recommendationScore}`)
  .join("|");
assert(
  runRecommendationAnalyzer().recommendationTop20
    .map((entry) => `${entry.slug}:${entry.recommendationScore}`)
    .join("|") === expectedTop20,
  "Recommendation順位またはScoreが変化しました"
);
for (const relativePath of [
  "lib/advisorSwapSimulator.ts",
  "lib/advisorExplanation.ts",
  "lib/teamThreats.ts",
  "lib/threatSnapshot.ts",
  "lib/teamAdvisor.ts",
  "lib/recommendationAnalyzer.ts"
]) {
  assert(
    !readFileSync(relativePath, "utf8").includes(
      'from "@/lib/battleValueEngine"'
    ),
    `${relativePath}がBattle Value Engineへ直接依存しています`
  );
}
assert(
  readFileSync(
    "lib/recommendationBattleValueIntegration.ts",
    "utf8"
  ).includes('from "@/lib/battleValueEngine"') &&
    readFileSync("app/page.tsx", "utf8").includes(
      "getIntegratedAdvisorSwapSimulation"
    ),
  "TASK048の正式Integration境界がありません"
);
assert(
  first.hazardControlInvestigation.archetypeCount === 0 &&
    !first.hazardControlInvestigation.requiresBothTags &&
    first.hazardControlInvestigation.scoreThreshold === 0.25 &&
    first.hazardControlInvestigation.matchedArchetypeCandidates.length === 4 &&
    !first.hazardControlInvestigation.registryClassificationMissing &&
    !first.hazardControlInvestigation.implementationBugDetected &&
    first.hazardControlInvestigation.cause.length > 0 &&
    first.hazardControlInvestigation.recommendation.length > 0,
  "Hazard Control 0件の原因調査がありません"
);
assert(
  first.unclassifiedSummary.length > 0 &&
    first.candidates.some((entry) => entry.unclassified.length > 0),
  "Unclassifiedを黙って除外しています"
);
const report = formatBattleValueReport(first, 20);
for (const heading of [
  "Battle Value TOP",
  "Recommendation vs Battle Value",
  "Battle Value Underrecognized",
  "Static Recommendation Leaders",
  "Balanced Candidates",
  "High Value but Excluded",
  "Archetype Summary",
  "Battle Tag Summary",
  "Reliability Summary",
  "Risk Adjustment Summary",
  "Representative Comparison",
  "Hazard Control Investigation",
  "Unclassified Summary",
  "Recommendation Unchanged Check"
]) {
  assert(report.includes(heading), `CLIレポートに${heading}がありません`);
}

console.log(
  `[ok] TASK046 Battle Value Shadow: candidates=${first.candidates.length}, underrecognized=${first.battleValueUnderrecognized.length}, excluded=${first.highValueButExcluded.length}, starmie=${starmie.finalBattleValue}, gengar=${gengar.finalBattleValue}, kingambit=${kingambit.finalBattleValue}, jolteon=${jolteon.finalBattleValue}, recommendation=unchanged`
);
