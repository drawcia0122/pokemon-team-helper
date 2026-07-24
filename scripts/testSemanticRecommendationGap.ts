import { readFileSync } from "node:fs";
import { formatRecommendationAnalyzerReport } from "@/lib/recommendationAnalyzer";
import {
  buildRecommendationAnalyzerFixture,
  runRecommendationAnalyzer
} from "@/scripts/lib/recommendationAnalyzerHarness";
import type { RecommendationAnalyzerOptions } from "@/scripts/lib/recommendationAnalyzerHarness";
import type { BattleTag } from "@/types/semanticCombat";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

type Result = ReturnType<typeof runRecommendationAnalyzer>;

function profile(result: Result, slug: string) {
  const found = result.semanticProfiles.find((entry) => entry.slug === slug);
  assert(found, `${slug}のSemantic Profileがありません`);
  return found;
}

function hasTag(result: Result, slug: string, tag: BattleTag): boolean {
  return profile(result, slug).tagProfiles[tag].semanticPresence > 0;
}

const fixture = buildRecommendationAnalyzerFixture();
const before = recommendationState(fixture);
const first = runRecommendationAnalyzer();
const second = runRecommendationAnalyzer();
const after = recommendationState(fixture);

assert(before === after, "AnalyzerがRecommendationまたはThreat状態を変更しました");
assert(
  JSON.stringify(first) === JSON.stringify(second),
  "同一入力でAnalyzer結果が再現しません"
);
for (const key of [
  "metadata",
  "input",
  "datasetSummary",
  "recommendationRanking",
  "contributionSummary",
  "recommendationTop20",
  "contributionAverages",
  "representationMap",
  "battleTagSummary",
  "archetypeSummary",
  "semanticGapRanking",
  "semanticUnderestimationCandidates",
  "staticSupportCandidates",
  "riskDominatedCandidates",
  "representativeComparison",
  "contributionInvestigation",
  "unclassifiedSummary"
] as const) {
  assert(key in first, `JSON出力型に${key}がありません`);
}
assert(
  first.metadata.deterministic &&
    first.metadata.presenceMethod.includes("max") &&
    first.metadata.tieBreak.includes("slug"),
  "Presence計算またはtie-breakの仕様が明示されていません"
);
assert(
  first.representationMap.length === 14 &&
    first.semanticProfiles.every(
      (entry) =>
        entry.semanticGap >= 0 &&
        entry.semanticGap <= 100 &&
        Object.keys(entry.tagProfiles).length === 14
    ),
  "Representation Map、Semantic Gap、Battle Tag Profileが不正です"
);
assert(
  first.semanticUnderestimationCandidates.length >= 15 &&
    first.staticSupportCandidates.length >= 15 &&
    first.riskDominatedCandidates.length >= 15,
  "分析候補を15体以上出力できていません"
);
assert(
  !first.semanticUnderestimationCandidates.some(
    (entry) => entry.recommendationRank === null
  ),
  "species重複・eligibility除外をSemantic過小評価へ混同しました"
);

const starmie = profile(first, "starmie-mega");
const jolteon = profile(first, "jolteon");
assert(
  starmie.recommendationRank === 113 &&
    hasTag(first, "starmie-mega", "PriorityFinish") &&
    hasTag(first, "starmie-mega", "Pivot") &&
    (hasTag(first, "starmie-mega", "Cleanup") ||
      hasTag(first, "starmie-mega", "RevengeKill")) &&
    starmie.semanticGap > jolteon.semanticGap,
  "メガスターミーGoldenが基準と一致しません"
);
const gengar = profile(first, "gengar-mega");
assert(
  gengar.recommendationRank === 32 &&
    gengar.archetype.hasTrapSemantic &&
    hasTag(first, "gengar-mega", "Trade") &&
    (hasTag(first, "gengar-mega", "WallBreak") ||
      hasTag(first, "gengar-mega", "WinCondition")),
  "メガゲンガーGoldenが基準と一致しません"
);
assert(
  hasTag(first, "kingambit", "PriorityFinish") &&
    hasTag(first, "kingambit", "Snowball") &&
    hasTag(first, "kingambit", "Setup"),
  "ドドゲザンのSemanticを検出できません"
);
const volcarona = profile(first, "volcarona");
const quiverDance = volcarona.tagProfiles.Setup.evidence.find(
  (entry) => entry.entityId === "quiverdance"
);
assert(
  hasTag(first, "volcarona", "Setup") &&
    hasTag(first, "volcarona", "WinCondition") &&
    quiverDance &&
    quiverDance.adoptionRate > 0.9 &&
    quiverDance.adoptionRate < 1 &&
    volcarona.tagProfiles.Setup.semanticPresence <= 1,
  "ウルガモスの採用率を考慮したPresenceが不正です"
);
assert(
  hasTag(first, "jolteon", "Pivot") &&
    first.staticSupportCandidates.some((entry) => entry.slug === "jolteon") &&
    jolteon.semanticGap < starmie.semanticGap,
  "サンダースGoldenが基準と一致しません"
);
const sylveon = profile(first, "sylveon");
const quickAttack = sylveon.tagProfiles.PriorityFinish.evidence.find(
  (entry) => entry.entityId === "quickattack"
);
assert(
  quickAttack?.entityKind === "move" &&
    quickAttack.adoptionRate > 0.3 &&
    quickAttack.source.length > 0,
  "ニンフィアの先制技判定が実採用技に基づいていません"
);

const fixtureOptions: RecommendationAnalyzerOptions = {
  teamSlugs: ["dragonite", "garchomp", "gliscor"],
  regulation: "M-B",
  topLimit: 20
};
const dragonStandard = runRecommendationAnalyzer({
  ...fixtureOptions,
  profile: "standard"
});
const dragonTrickRoom = runRecommendationAnalyzer({
  ...fixtureOptions,
  profile: "trick-room"
});
assert(
  dragonStandard.datasetSummary.datasetId ===
    dragonTrickRoom.datasetSummary.datasetId &&
    profile(dragonStandard, "torkoal").tagProfiles.Cleanup.semanticPresence ===
      profile(dragonTrickRoom, "torkoal").tagProfiles.Cleanup.semanticPresence,
  "Fixture B/CでDatasetまたは低速候補Presenceが一致しません"
);
const megaEarly = runRecommendationAnalyzer({
  teamSlugs: ["gengar-mega", "garchomp"],
  regulation: "M-B",
  profile: "standard",
  topLimit: 20
});
assert(
  !profile(megaEarly, "starmie-mega").recommendationEligible,
  "Semantic GapがTASK039の序盤Mega候補制御を変更しました"
);
assert(
  first.staticSupportCandidates.length >= 15 &&
    first.semanticUnderestimationCandidates.some((entry) =>
      entry.mainTags.some((tag) =>
        ["WinCondition", "Cleanup"].includes(tag)
      )
    ),
  "Fixture EでStatic補完と勝ち筋候補を比較できません"
);

const expectedTop20 = [
  "zoroark-hisui:12", "hydreigon:10", "sableye:7", "gholdengo:6",
  "mimikyu-disguised:5", "overqwil:3", "floette-mega:2", "archaludon:0",
  "tauros-paldea-blaze-breed:0", "umbreon:0", "polteageist:0",
  "banette-mega:-1", "bellibolt:-2", "jolteon:-2", "scizor-mega:-3",
  "houndstone:-3", "cofagrigus:-3", "raichu-mega-y:-4",
  "kingambit:-5", "staraptor-mega:-5"
];
assert(
  first.recommendationTop20
    .map((entry) => `${entry.slug}:${entry.recommendationScore}`)
    .join("|") === expectedTop20.join("|"),
  "TASK043 Recommendation順位またはScoreが変化しました"
);
for (const relativePath of [
  "lib/advisorSwapSimulator.ts",
  "lib/advisorExplanation.ts",
  "lib/teamThreats.ts",
  "lib/threatSnapshot.ts",
  "lib/teamAdvisor.ts"
]) {
  assert(
    !readFileSync(relativePath, "utf8").includes("semanticRecommendationGap"),
    `${relativePath}へSemantic Gapが接続されています`
  );
}
const report = formatRecommendationAnalyzerReport(first);
for (const heading of [
  "Recommendation TOP20",
  "Contribution平均 TOP20",
  "Semantic Coverage",
  "Battle Tag Profile",
  "Underrepresented Battle Tags",
  "Candidate Archetypes",
  "Semantic Gap Ranking",
  "Semantic Underestimation Candidates",
  "Static Support Candidates",
  "Risk-Dominated Candidates",
  "Representative Comparison",
  "Role / Ability / Environment Investigation",
  "Unclassified Summary",
  "Dataset Summary"
]) {
  assert(report.includes(heading), `CLIレポートに${heading}がありません`);
}

console.log(
  `[ok] TASK045 Semantic Recommendation Gap: profiles=${first.semanticProfiles.length}, underestimation=${first.semanticUnderestimationCandidates.length}, static=${first.staticSupportCandidates.length}, risk=${first.riskDominatedCandidates.length}, starmieGap=${starmie.semanticGap}, jolteonGap=${jolteon.semanticGap}, recommendation=unchanged`
);
