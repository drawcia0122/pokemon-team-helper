import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildIntegratedRecommendationRuntime,
  calculateDeferredGoalBuilderPlan,
  getDeferredGoalBuilderCacheMetrics,
  getIntegratedAdvisorSwapSimulation,
  MAX_GOAL_BUILDER_CONTEXT_CACHE_ENTRIES,
  MAX_GOAL_BUILDER_RESULT_CACHE_ENTRIES,
  resetDeferredGoalBuilderCacheForTests
} from "@/lib/recommendationIntegrationRuntime";
import { getProgressiveTeamAdvisor } from "@/lib/progressiveTeamAdvisor";
import { buildRecommendationAnalyzerFixture } from "@/scripts/lib/recommendationAnalyzerHarness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const fixture = buildRecommendationAnalyzerFixture({
  teamSlugs: ["scizor-mega", "garchomp", "rotom-wash"]
});
const input = {
  team: fixture.team,
  advisor: fixture.advisor,
  availablePokemon: fixture.analyzerInput.availablePokemon,
  environmentDataset: fixture.analyzerInput.environmentDataset,
  threatSnapshot: fixture.threatSnapshot,
  profile: fixture.analyzerInput.context.profile
};

resetDeferredGoalBuilderCacheForTests();
const simulation = getIntegratedAdvisorSwapSimulation(input);
assert(
  simulation.additionPlans.every((plan) => !plan.goalBuilderPlan),
  "overall表示用simulationでGoal Builderが先行計算されました"
);
assert(
  getDeferredGoalBuilderCacheMetrics().computations === 0,
  "overallモードのGoal Builder計算回数が0ではありません"
);

const progressive = getProgressiveTeamAdvisor({
  team: fixture.team,
  advisor: fixture.advisor,
  simulation,
  availablePokemon: fixture.analyzerInput.availablePokemon,
  environmentDataset: fixture.analyzerInput.environmentDataset,
  profile: fixture.analyzerInput.context.profile
});
const displayed = progressive.candidatesByMode.future;
assert(displayed.length > 0 && displayed.length <= 6, "表示候補数が不正です");

const eager = buildIntegratedRecommendationRuntime({
  input,
  baseline: fixture.simulation
});
assert(eager, "比較用Goal Builder runtimeを生成できません");
const eagerBySlug = new Map(
  eager.goalBuilder.candidates.map((candidate) => [
    candidate.candidateSlug,
    candidate
  ])
);

for (const candidate of displayed) {
  const slug = candidate.plan.candidate.pokemon.slug;
  const result = calculateDeferredGoalBuilderPlan({
    simulation,
    candidateSlug: slug,
    phase: progressive.phase
  });
  assert(result.plan && !result.cacheHit, `${slug}の初回計算に失敗しました`);
  assert(
    JSON.stringify(result.plan) === JSON.stringify(eagerBySlug.get(slug)),
    `${slug}の遅延計算結果が変更前と一致しません`
  );
}

const firstMetrics = getDeferredGoalBuilderCacheMetrics();
assert(
  firstMetrics.computations === displayed.length,
  `表示対象外の候補が計算されました: ${firstMetrics.computations}/${displayed.length}`
);
for (const candidate of displayed) {
  const result = calculateDeferredGoalBuilderPlan({
    simulation,
    candidateSlug: candidate.plan.candidate.pokemon.slug,
    phase: progressive.phase
  });
  assert(result.cacheHit, "同一入力・同一候補の再表示がcache missになりました");
}
const cachedMetrics = getDeferredGoalBuilderCacheMetrics();
assert(
  cachedMetrics.computations === firstMetrics.computations &&
    cachedMetrics.cacheHits === displayed.length,
  "再表示時にGoal Builderが再計算されました"
);

const volcarona = calculateDeferredGoalBuilderPlan({
  simulation,
  candidateSlug: "volcarona",
  phase: progressive.phase
}).plan;
const eagerVolcarona = eagerBySlug.get("volcarona");
assert(volcarona && eagerVolcarona, "ウルガモスのGoal Planを取得できません");
assert(
  JSON.stringify(volcarona) === JSON.stringify(eagerVolcarona) &&
    volcarona.selectedGoal.label ===
      "起点作成から積みエースを通す構築" &&
    volcarona.selectedGoal.goal !== "hazard-stack",
  "ウルガモスのTASK056結果が変わりました"
);

const pageSource = readFileSync(resolve("app/page.tsx"), "utf8");
const cardSource = readFileSync(
  resolve("components/team/AdvisorNextCandidateCard.tsx"),
  "utf8"
);
assert(
  pageSource.includes("getIntegratedAdvisorSwapSimulation") &&
    cardSource.includes('mode === "future"') &&
    cardSource.includes("完成形を計算中…") &&
    cardSource.includes("完成形を計算できませんでした"),
  "遅延計算UIまたは本番経路を確認できません"
);
assert(
  MAX_GOAL_BUILDER_CONTEXT_CACHE_ENTRIES === 4 &&
    MAX_GOAL_BUILDER_RESULT_CACHE_ENTRIES === 96,
  "Goal Builder cacheの上限が意図した値と異なります"
);

console.log(
  `[ok] TASK057 Goal Builder Performance Golden: overallComputations=0, displayed=${displayed.length}, firstComputations=${firstMetrics.computations}, repeatComputations=0, cacheHits=${cachedMetrics.cacheHits}, contextCache=${MAX_GOAL_BUILDER_CONTEXT_CACHE_ENTRIES}, resultCache=${MAX_GOAL_BUILDER_RESULT_CACHE_ENTRIES}, volcarona=${volcarona.selectedGoal.goal}`
);
