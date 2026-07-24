import {
  formatRecommendationIntegrationReport,
  integrateBattleValueRecommendation
} from "@/lib/recommendationBattleValueIntegration";
import {
  buildRecommendationAnalyzerFixture,
  type RecommendationAnalyzerOptions
} from "@/scripts/lib/recommendationAnalyzerHarness";

export type RecommendationIntegrationOptions =
  RecommendationAnalyzerOptions & {
    candidateSlug?: string;
  };

export function runRecommendationIntegration(
  options: RecommendationIntegrationOptions = {}
) {
  const fixture = buildRecommendationAnalyzerFixture(options);
  const result = integrateBattleValueRecommendation({
    input: {
      team: fixture.team,
      advisor: fixture.advisor,
      availablePokemon: fixture.analyzerInput.availablePokemon,
      environmentDataset: fixture.analyzerInput.environmentDataset,
      threatSnapshot: fixture.threatSnapshot,
      profile: fixture.analyzerInput.context.profile
    },
    baseline: fixture.simulation,
    environmentSnapshot: fixture.analyzerInput.environmentSnapshot
  });
  if (!result.analysis) {
    throw new Error("Recommendation Integrationを解析できませんでした。");
  }
  if (
    options.candidateSlug &&
    !result.analysis.candidates.some(
      (candidate) => candidate.slug === options.candidateSlug
    )
  ) {
    throw new Error(
      `Integration対象候補がありません: ${options.candidateSlug}`
    );
  }
  return result;
}

export function formatRecommendationIntegration(
  result: ReturnType<typeof runRecommendationIntegration>,
  topLimit: number,
  candidateSlug?: string
): string {
  if (!result.analysis) return "";
  return formatRecommendationIntegrationReport(
    result.analysis,
    topLimit,
    candidateSlug
  );
}
