import { readFileSync } from "node:fs";
import { buildAdvisorExplanationPresentation } from "@/lib/advisorExplanation";
import {
  getIntegratedAdvisorSwapSimulation,
  integrateBattleValueRecommendation
} from "@/lib/recommendationBattleValueIntegration";
import { RECOMMENDATION_INTEGRATION_CONFIG } from "@/lib/recommendationIntegrationConfig";
import {
  analyzeRecommendations,
  RECOMMENDATION_CONTRIBUTION_CATEGORIES
} from "@/lib/recommendationAnalyzer";
import { getAdvisorBuildPhaseForCount } from "@/lib/advisorBuildPhase";
import { buildRecommendationAnalyzerFixture } from "@/scripts/lib/recommendationAnalyzerHarness";
import { runRecommendationIntegration } from "@/scripts/lib/recommendationIntegrationHarness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Result = ReturnType<typeof runRecommendationIntegration>;

function analysis(result: Result) {
  assert(result.analysis, "Recommendation Integration結果がありません");
  return result.analysis;
}

function candidate(result: Result, slug: string) {
  const found = analysis(result).candidates.find(
    (entry) => entry.slug === slug
  );
  assert(found, `${slug}のIntegration結果がありません`);
  return found;
}

const fixture = buildRecommendationAnalyzerFixture();
const baselineState = JSON.stringify(
  fixture.simulation.evaluatedPlans.map((plan) => ({
    slug: plan.candidate.pokemon.slug,
    score: plan.improvementScore,
    eligibility: plan.isRecommendationByCategory,
    megaLimit: plan.metrics.megaLimitPassed,
    megaRecommendation: plan.metrics.megaRecommendationPassed,
    evidence: plan.evidence
  }))
);
const first = runRecommendationIntegration();
const second = runRecommendationIntegration();
const firstAnalysis = analysis(first);

assert(
  JSON.stringify(first.analysis) === JSON.stringify(second.analysis) &&
    JSON.stringify(
      first.simulation.evaluatedPlans.map((plan) => ({
        slug: plan.candidate.pokemon.slug,
        final: plan.finalRecommendation,
        contribution: plan.battleValueContribution
      }))
    ) ===
      JSON.stringify(
        second.simulation.evaluatedPlans.map((plan) => ({
          slug: plan.candidate.pokemon.slug,
          final: plan.finalRecommendation,
          contribution: plan.battleValueContribution
        }))
      ),
  "同一入力でRecommendation Integrationが再現しません"
);
assert(
  JSON.stringify(
    fixture.simulation.evaluatedPlans.map((plan) => ({
      slug: plan.candidate.pokemon.slug,
      score: plan.improvementScore,
      eligibility: plan.isRecommendationByCategory,
      megaLimit: plan.metrics.megaLimitPassed,
      megaRecommendation: plan.metrics.megaRecommendationPassed,
      evidence: plan.evidence
    }))
  ) === baselineState,
  "Integrationが既存Simulationを破壊的に変更しました"
);

assert(
  RECOMMENDATION_INTEGRATION_CONFIG.battleValueWeight === 0.15 &&
    RECOMMENDATION_INTEGRATION_CONFIG.baselineContinuityWeight === 0.95 &&
    RECOMMENDATION_INTEGRATION_CONFIG.contributionWeight === 0.05 &&
    Math.abs(
      Object.values(
        RECOMMENDATION_INTEGRATION_CONFIG.contributionWeights
      ).reduce((total, value) => total + value, 0) - 1
    ) < 0.000001,
  "統合WeightまたはContribution Weightが不正です"
);
assert(
  firstAnalysis.metadata.mode === "integrated" &&
    firstAnalysis.metadata.normalization === "percentile-rank" &&
    firstAnalysis.config.battleValueWeight === 0.15 &&
    firstAnalysis.metadata.formula.includes("15%"),
  "Integration mode・正規化・設定値が明示されていません"
);

for (const entry of firstAnalysis.candidates) {
  assert(
    entry.recommendationNormalized >= 0 &&
      entry.recommendationNormalized <= 100 &&
      entry.battleValueNormalized >= 0 &&
      entry.battleValueNormalized <= 100 &&
      entry.finalRecommendation >= 0 &&
      entry.finalRecommendation <= 100,
    `${entry.slug}の正規化値またはFinal Scoreが範囲外です`
  );
  for (const category of RECOMMENDATION_CONTRIBUTION_CATEGORIES) {
    assert(
      entry.contributionNormalized[category] >= 0 &&
        entry.contributionNormalized[category] <= 100 &&
        entry.contributionRatios[category] >= 0 &&
        entry.contributionRatios[category] <= 1,
      `${entry.slug}の${category}正規化または寄与率が範囲外です`
    );
  }
  assert(
    entry.battleValueExplanation.length > 0 &&
      entry.battleValueExplanation.every(
        (reason) =>
          reason.score >= 0 &&
          reason.text.length > 0 &&
          reason.label.length > 0
      ),
    `${entry.slug}のBattle Value説明がありません`
  );
}

assert(
  firstAnalysis.top20RetentionRate >= 0.75 &&
    firstAnalysis.top50RetentionRate >= 0.9,
  `Recommendation保護率が不足しています: TOP20=${firstAnalysis.top20RetentionRate} TOP50=${firstAnalysis.top50RetentionRate}`
);
assert(
  firstAnalysis.representatives.map((entry) => entry.slug).join("|") ===
    [
      "starmie-mega",
      "gengar-mega",
      "kingambit",
      "mawile-mega",
      "volcarona",
      "dragapult",
      "jolteon",
      "sylveon"
    ].join("|"),
  "代表8体の比較が揃っていません"
);

const starmie = candidate(first, "starmie-mega");
const gengar = candidate(first, "gengar-mega");
const kingambit = candidate(first, "kingambit");
const mawile = candidate(first, "mawile-mega");
const volcarona = candidate(first, "volcarona");
const dragapult = candidate(first, "dragapult");
const jolteon = candidate(first, "jolteon");
const sylveon = candidate(first, "sylveon");
const skarmory = candidate(first, "skarmory-mega");

assert(
  kingambit.integratedRank <= jolteon.integratedRank,
  "ドドゲザンがサンダース未満です"
);
assert(
  starmie.rankDelta > 0 && gengar.rankDelta > 0,
  "メガスターミーまたはメガゲンガーが統合前より改善していません"
);
assert(
  jolteon.rankDelta <= 0,
  "サンダースがBattle Valueだけで上昇しました"
);
assert(
  kingambit.rankDelta > 0 &&
    kingambit.battleValueAxes.setupWinCondition > 0 &&
    kingambit.battleValueAxes.cleanup > 0 &&
    volcarona.rankDelta > 0 &&
    volcarona.battleValueAxes.setupWinCondition > 0,
  "Setup・Cleanup候補が適切に改善していません"
);
assert(
  skarmory.rankDelta > 0,
  "Defensive候補を一律低下させている可能性があります"
);
assert(
  [mawile, dragapult, sylveon].every(
    (entry) => Number.isFinite(entry.finalRecommendation)
  ),
  "代表候補のFinal Scoreが不正です"
);

assert(
  firstAnalysis.megaConstraintsPreserved &&
    first.simulation.plans.filter(
      (plan) => plan.candidate.pokemon.formKind === "mega"
    ).length <= 2 &&
    first.simulation.evaluatedPlans.every((plan) => {
      const before = fixture.simulation.evaluatedPlans.find(
        (entry) =>
          entry.candidate.pokemon.slug === plan.candidate.pokemon.slug &&
          entry.action.kind === plan.action.kind &&
          entry.action.removedSlotId === plan.action.removedSlotId
      );
      return (
        before &&
        before.metrics.megaLimitPassed === plan.metrics.megaLimitPassed &&
        before.metrics.megaRecommendationPassed ===
          plan.metrics.megaRecommendationPassed &&
        before.isRecommendation === plan.isRecommendation
      );
    }),
  "TASK039 Mega制御またはeligibilityが変化しました"
);

const integratedPlan = first.simulation.evaluatedPlans.find(
  (plan) =>
    plan.battleValueExplanation.length > 0 &&
    plan.isRecommendationByCategory.overall
);
assert(integratedPlan, "説明確認用の統合候補がありません");
const explanation = buildAdvisorExplanationPresentation({
  phase: getAdvisorBuildPhaseForCount(
    fixture.analyzerInput.context.team.length
  ),
  plan: integratedPlan,
  mode: "overall"
});
assert(
  explanation.primaryReasons.some((reason) =>
    integratedPlan.battleValueExplanation.includes(reason)
  ),
  "Recommendation ExplanationへBattle Value理由が表示されません"
);

const integratedAnalyzer = analyzeRecommendations({
  ...fixture.analyzerInput,
  plans: first.simulation.evaluatedPlans
});
assert(
  integratedAnalyzer.candidates.every(
    (entry) =>
      "battleValueContribution" in entry &&
      "battleValueExplanation" in entry &&
      "finalRecommendation" in entry &&
      "contributionRatios" in entry
  ) &&
    integratedAnalyzer.candidates.some(
      (entry) =>
        entry.battleValueContribution > 0 &&
        entry.battleValueExplanation.length > 0 &&
        entry.finalRecommendation !== entry.baselineRecommendationScore
    ),
  "Recommendation Analyzerへ統合Contributionが出力されません"
);

const clientSimulation = getIntegratedAdvisorSwapSimulation({
  team: fixture.team,
  advisor: fixture.advisor,
  availablePokemon: fixture.analyzerInput.availablePokemon,
  environmentDataset: fixture.analyzerInput.environmentDataset,
  threatSnapshot: fixture.threatSnapshot,
  profile: fixture.analyzerInput.context.profile
});
const clientIntegration = integrateBattleValueRecommendation({
  input: {
    team: fixture.team,
    advisor: fixture.advisor,
    availablePokemon: fixture.analyzerInput.availablePokemon,
    environmentDataset: fixture.analyzerInput.environmentDataset,
    threatSnapshot: fixture.threatSnapshot,
    profile: fixture.analyzerInput.context.profile
  },
  baseline: fixture.simulation
});
const clientKingambit = clientIntegration.analysis?.candidates.find(
  (entry) => entry.slug === "kingambit"
);
const clientJolteon = clientIntegration.analysis?.candidates.find(
  (entry) => entry.slug === "jolteon"
);
const clientStarmie = clientIntegration.analysis?.candidates.find(
  (entry) => entry.slug === "starmie-mega"
);
const clientGengar = clientIntegration.analysis?.candidates.find(
  (entry) => entry.slug === "gengar-mega"
);
assert(
  clientSimulation.evaluatedPlans.some(
    (plan) =>
      plan.recommendationIntegration !== null &&
      plan.battleValueContribution > 0
  ) &&
    fixture.analyzerInput.environmentDataset.pokemon.every(
      (entry) => Array.isArray(entry.items)
    ) &&
    clientIntegration.analysis?.top20RetentionRate ===
      firstAnalysis.top20RetentionRate &&
    clientIntegration.analysis?.top50RetentionRate ===
      firstAnalysis.top50RetentionRate &&
    clientKingambit &&
    clientJolteon &&
    clientKingambit.integratedRank <= clientJolteon.integratedRank &&
    (clientStarmie?.rankDelta ?? 0) > 0 &&
    (clientGengar?.rankDelta ?? 0) > 0,
  "本番公開Dataset経路でBattle Valueが統合されません"
);

const appSource = readFileSync("app/page.tsx", "utf8");
const integrationSource = readFileSync(
  "lib/recommendationBattleValueIntegration.ts",
  "utf8"
);
assert(
  appSource.includes("getIntegratedAdvisorSwapSimulation") &&
    !integrationSource.includes("battleValueWeight: 0.15"),
  "本番Recommendationが統合経路を参照していないかWeightが重複しています"
);

JSON.stringify(firstAnalysis);
console.log(
  `[ok] TASK048 Integration: weight=${firstAnalysis.config.battleValueWeight * 100}%, TOP20=${firstAnalysis.top20RetentionRate}, TOP50=${firstAnalysis.top50RetentionRate}, kingambit=${kingambit.baselineRank}->${kingambit.integratedRank}, jolteon=${jolteon.baselineRank}->${jolteon.integratedRank}, starmie=${starmie.baselineRank}->${starmie.integratedRank}, gengar=${gengar.baselineRank}->${gengar.integratedRank}`
);
