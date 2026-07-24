import { getAdvisorBuildPhaseForCount } from "@/lib/advisorBuildPhase";
import { buildAdvisorExplanationPresentation } from "@/lib/advisorExplanation";
import {
  analyzeRecommendations,
  BATTLE_CANDIDATE_SIGNALS,
  formatRecommendationAnalyzerReport,
  RECOMMENDATION_CONTRIBUTION_CATEGORIES
} from "@/lib/recommendationAnalyzer";
import { getThreatSnapshotIds } from "@/lib/threatSnapshot";
import { buildRecommendationAnalyzerFixture } from "@/scripts/lib/recommendationAnalyzerHarness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function recommendationState(
  fixture: ReturnType<typeof buildRecommendationAnalyzerFixture>
): string {
  const planState = (plan: (typeof fixture.simulation.evaluatedPlans)[number]) => ({
    slug: plan.candidate.pokemon.slug,
    action: plan.action,
    recommendationScore: plan.improvementScore,
    categoryScores: plan.categoryScores,
    eligible: plan.isRecommendationByCategory,
    evidence: plan.evidence
  });
  return JSON.stringify({
    displayedTop5: getThreatSnapshotIds(
      fixture.threatSnapshot.currentDisplayedTop5
    ),
    trackedThreats: getThreatSnapshotIds(
      fixture.threatSnapshot.trackedThreats
    ),
    plans: fixture.simulation.plans.map(planState),
    additions: fixture.simulation.additionPlans.map(planState),
    categories: Object.fromEntries(
      Object.entries(fixture.simulation.plansByCategory).map(
        ([category, plans]) => [category, plans.map(planState)]
      )
    ),
    evaluatedPlans: fixture.simulation.evaluatedPlans.map(planState),
    explanations: fixture.simulation.evaluatedPlans
      .slice(0, 12)
      .map((plan) =>
        buildAdvisorExplanationPresentation({
          phase: getAdvisorBuildPhaseForCount(
            fixture.analyzerInput.context.team.length
          ),
          plan,
          mode: "overall"
        })
      )
  });
}

const fixture = buildRecommendationAnalyzerFixture();
const stateBefore = recommendationState(fixture);
const result = analyzeRecommendations(fixture.analyzerInput);
const stateAfter = recommendationState(fixture);

assert(
  stateAfter === stateBefore,
  "Golden: AnalyzerがRecommendation、Explanation、Threat Analysisを変更しました"
);
assert(
  result.recommendationTop20.length === 20,
  `Recommendation TOP20が20体ではありません: ${result.recommendationTop20.length}`
);
assert(
  result.recommendationTop20.every(
    (candidate, index) => candidate.speciesRank === index + 1
  ),
  "Recommendation species順位が連番ではありません"
);
assert(
  result.recommendationTop20.every(
    (candidate, index, candidates) =>
      index === 0 ||
      candidates[index - 1].recommendationScore >=
        candidate.recommendationScore
  ),
  "Recommendation TOP20が既存Score順ではありません"
);

for (const candidate of result.candidates) {
  const categories = Object.keys(candidate.contributions);
  assert(
    RECOMMENDATION_CONTRIBUTION_CATEGORIES.every((category) =>
      categories.includes(category)
    ),
    `${candidate.slug}のContributionカテゴリが不足しています`
  );
  const contributionTotal = Object.values(candidate.contributions).reduce(
    (total, points) => total + points,
    0
  );
  assert(
    Math.abs(contributionTotal - candidate.recommendationScore) < 0.001,
    `${candidate.slug}のContribution合計がRecommendation Scoreと一致しません`
  );
  assert(
    candidate.topContributions.length <= 5,
    `${candidate.slug}の上位Contributionが5件を超えています`
  );
  const evidenceIds = RECOMMENDATION_CONTRIBUTION_CATEGORIES.flatMap(
    (category) =>
      candidate.evidenceByCategory[category]
        .filter((evidence) => evidence.dimension !== "context")
        .map((evidence) => evidence.id)
  );
  assert(
    new Set(evidenceIds).size === evidenceIds.length,
    `${candidate.slug}のEvidenceを複数カテゴリへ重複表示しました`
  );
}

assert(
  result.battleCandidates.length > 0 &&
    result.battleCandidates.every(
      (candidate) =>
        candidate.signalCount ===
        BATTLE_CANDIDATE_SIGNALS.filter(
          (signal) => candidate.signals[signal].length > 0
        ).length
    ),
  "Battle Candidateシグナル集計が不正です"
);
assert(
  result.representativeComparison.length === 10 &&
    result.representativeComparison.every(
      (entry) => entry.candidate && entry.battleCandidate
    ),
  "代表10体の比較データが揃っていません"
);
const megaGengar = result.representativeComparison.find(
  (entry) => entry.slug === "gengar-mega"
);
assert(
  megaGengar?.battleCandidate?.signals.trapping.length,
  "メガゲンガーの拘束シグナルを検出できません"
);
const sylveon = result.representativeComparison.find(
  (entry) => entry.slug === "sylveon"
);
assert(
  sylveon?.battleCandidate &&
    sylveon.battleCandidate.signals.highPowerPriority.length === 0,
  "ニンフィアの特殊攻撃を物理先制技へ誤適用しました"
);

const report = formatRecommendationAnalyzerReport(result);
for (const heading of [
  "Recommendation TOP20",
  "Contribution平均 TOP20",
  "Recommendation TOP20 Evidence",
  "代表ポケモン比較",
  "過小評価候補",
  "過大評価候補",
  "Battle Candidate一覧"
]) {
  assert(report.includes(heading), `CLIレポートに${heading}がありません`);
}
for (const category of RECOMMENDATION_CONTRIBUTION_CATEGORIES) {
  assert(report.includes(category), `CLIレポートに${category}がありません`);
}

console.log(
  `[ok] TASK043 Recommendation Analyzer Golden: plans=${result.candidates.length}, top20=${result.recommendationTop20.length}, battleCandidates=${result.battleCandidates.length}, underestimated=${result.underestimatedCandidates.length}, overestimated=${result.overestimatedCandidates.length}`
);
