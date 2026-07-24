import {
  analyzeRecommendationFusion,
  formatRecommendationFusionReport
} from "@/lib/recommendationFusionSimulator";
import {
  runRecommendationAnalyzer,
  type RecommendationAnalyzerOptions
} from "@/scripts/lib/recommendationAnalyzerHarness";
import { runBattleValue } from "@/scripts/lib/battleValueHarness";

export type RecommendationFusionOptions = RecommendationAnalyzerOptions & {
  candidateSlug?: string;
  weights?: number[];
};

function recommendationState(
  result: ReturnType<typeof runRecommendationAnalyzer>
): string {
  return JSON.stringify(
    result.candidates.map((candidate) => ({
      slug: candidate.slug,
      rank: candidate.rank,
      speciesRank: candidate.speciesRank,
      score: candidate.recommendationScore,
      eligible: candidate.recommendationEligible,
      contributions: candidate.contributions
    }))
  );
}

function battleValueState(result: ReturnType<typeof runBattleValue>): string {
  return JSON.stringify(
    result.candidates.map((candidate) => ({
      slug: candidate.slug,
      value: candidate.finalBattleValue,
      rank: candidate.recommendationRank,
      eligible: candidate.eligibility
    }))
  );
}

function semanticGapState(
  result: ReturnType<typeof runRecommendationAnalyzer>
): string {
  return JSON.stringify(
    result.semanticProfiles.map((profile) => ({
      slug: profile.slug,
      gap: profile.semanticGap,
      disposition: profile.disposition
    }))
  );
}

export function runRecommendationFusion(
  options: RecommendationFusionOptions = {}
) {
  const analyzerOptions: RecommendationAnalyzerOptions = {
    teamSlugs: options.teamSlugs,
    regulation: options.regulation,
    profile: options.profile,
    topLimit: options.topLimit
  };
  const recommendation = runRecommendationAnalyzer(analyzerOptions);
  const battleValue = runBattleValue(analyzerOptions);
  return analyzeRecommendationFusion({
    recommendation,
    battleValue,
    candidateSlug: options.candidateSlug,
    weights: options.weights,
    recommendationBefore: recommendationState(recommendation),
    battleValueBefore: battleValueState(battleValue),
    semanticGapBefore: semanticGapState(recommendation)
  });
}

export function formatRecommendationFusion(
  result: ReturnType<typeof runRecommendationFusion>,
  topLimit: number,
  candidateSlug?: string
): string {
  return formatRecommendationFusionReport(result, topLimit, candidateSlug);
}
