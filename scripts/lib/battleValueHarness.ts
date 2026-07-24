import {
  analyzeBattleValue,
  formatBattleValueReport
} from "@/lib/battleValueEngine";
import {
  buildRecommendationAnalyzerFixture,
  runRecommendationAnalyzer,
  type RecommendationAnalyzerOptions
} from "@/scripts/lib/recommendationAnalyzerHarness";

export type BattleValueOptions = RecommendationAnalyzerOptions & {
  candidateSlug?: string;
  datasetId?: string;
  compareDatasetId?: string;
};

export function runBattleValue(options: BattleValueOptions = {}) {
  const fixture = buildRecommendationAnalyzerFixture(options);
  if (
    options.datasetId &&
    options.datasetId !== fixture.analyzerInput.context.datasetId
  ) {
    throw new Error(
      `指定Datasetは現在のRegulationで利用できません: ${options.datasetId}`
    );
  }
  const recommendation = runRecommendationAnalyzer(options);
  return analyzeBattleValue({
    recommendation,
    environmentSnapshot: fixture.analyzerInput.environmentSnapshot,
    availablePokemon: fixture.analyzerInput.availablePokemon,
    candidateSlug: options.candidateSlug,
    compareDataset: options.compareDatasetId,
    recommendationUnchanged: true
  });
}

export function formatBattleValue(
  result: ReturnType<typeof runBattleValue>,
  topLimit: number
): string {
  return formatBattleValueReport(result, topLimit);
}
