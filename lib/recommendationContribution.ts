import {
  deduplicateAdvisorEvidence,
  type AdvisorEvidence,
  type AdvisorEvidenceDimension
} from "@/lib/advisorEvidence";
import type {
  AdvisorRecommendationCategory,
  AdvisorSwapPlan
} from "@/lib/advisorSwapSimulator";
import type { ContestabilityCandidate } from "@/types/contestability";
import type { ThreatEnvironmentDataset } from "@/types/environmentThreat";

export const RECOMMENDATION_CONTRIBUTION_CATEGORIES = [
  "Threat",
  "Coverage",
  "Role",
  "Speed",
  "Type",
  "Ability",
  "Move",
  "Usage",
  "Environment",
  "Risk"
] as const;

export type RecommendationContributionCategory =
  (typeof RECOMMENDATION_CONTRIBUTION_CATEGORIES)[number];

export type RecommendationContributionEvidence = {
  id: string;
  text: string;
  points: number;
  dimension: AdvisorEvidenceDimension | "context";
  confidence: AdvisorEvidence["confidence"] | "high";
};

export type RecommendationCandidateAnalysis = {
  rank: number;
  speciesRank: number | null;
  slug: string;
  name: string;
  action: AdvisorSwapPlan["action"];
  recommendationEligible: boolean;
  recommendationScore: number;
  baselineRecommendationScore: number;
  battleValueContribution: number;
  battleValueExplanation: string[];
  contestability: number;
  contestabilityBreakdown: ContestabilityCandidate["axes"] | null;
  contestabilityReasons: string[];
  contestabilityContribution: number;
  abilityMatchupValue: number;
  abilityContribution: number;
  abilityExplanation: string[];
  contestabilityRatio: number;
  preContestabilityRecommendation: number;
  finalRecommendation: number;
  battleValueRatio: number;
  contributionRatios: Record<string, number>;
  categoryScores: Record<AdvisorRecommendationCategory, number>;
  contributions: Record<RecommendationContributionCategory, number>;
  topContributions: Array<{
    category: RecommendationContributionCategory;
    points: number;
  }>;
  evidenceByCategory: Record<
    RecommendationContributionCategory,
    RecommendationContributionEvidence[]
  >;
  riskMagnitude: number;
  eligibilityConstraints: {
    megaLimitPassed: boolean;
    megaRecommendationPassed: boolean;
  };
};

export function emptyRecommendationContributionRecord(): Record<
  RecommendationContributionCategory,
  number
> {
  return Object.fromEntries(
    RECOMMENDATION_CONTRIBUTION_CATEGORIES.map((category) => [category, 0])
  ) as Record<RecommendationContributionCategory, number>;
}

function emptyEvidenceRecord(): Record<
  RecommendationContributionCategory,
  RecommendationContributionEvidence[]
> {
  return Object.fromEntries(
    RECOMMENDATION_CONTRIBUTION_CATEGORIES.map((category) => [
      category,
      [] as RecommendationContributionEvidence[]
    ])
  ) as Record<
    RecommendationContributionCategory,
    RecommendationContributionEvidence[]
  >;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function contributionCategory(
  evidence: AdvisorEvidence
): RecommendationContributionCategory {
  if (evidence.primaryDimension === "riskPenalty") return "Risk";
  if (
    evidence.primaryDimension === "targetCounterplay" ||
    evidence.primaryDimension === "postSwapThreatRisk"
  ) {
    return "Threat";
  }
  if (evidence.primaryDimension === "offensiveImprovement") {
    return "Coverage";
  }
  if (evidence.primaryDimension === "defensiveImprovement") return "Type";
  if (evidence.primaryDimension === "speedImprovement") return "Speed";
  if (evidence.primaryDimension === "environmentValidity") {
    return evidence.id === "environment:usage" ? "Usage" : "Environment";
  }
  if (evidence.primaryDimension === "teamIssueImprovement") return "Role";
  if (evidence.id === "role:defensive-ability") return "Ability";
  if (evidence.id === "role:recovery") return "Move";
  return "Role";
}

function comparePlans(left: AdvisorSwapPlan, right: AdvisorSwapPlan): number {
  return (
    right.categoryScores.overall - left.categoryScores.overall ||
    right.evidence.filter((entry) => entry.points > 0).length -
      left.evidence.filter((entry) => entry.points > 0).length ||
    right.metrics.usageTieBreaker - left.metrics.usageTieBreaker ||
    left.candidate.pokemon.speciesId - right.candidate.pokemon.speciesId ||
    left.candidate.pokemon.formOrder - right.candidate.pokemon.formOrder
  );
}

export function getBestRecommendationPlansBySlug(
  plans: AdvisorSwapPlan[]
): AdvisorSwapPlan[] {
  const best = new Map<string, AdvisorSwapPlan>();
  for (const plan of plans) {
    if (plan.action.kind === "form-change") continue;
    const slug = plan.candidate.pokemon.slug;
    const current = best.get(slug);
    if (!current || comparePlans(plan, current) < 0) {
      best.set(slug, plan);
    }
  }
  return [...best.values()].sort(comparePlans);
}

function allocateEvidence(
  plan: AdvisorSwapPlan,
  environmentDataset: ThreatEnvironmentDataset
): {
  contributions: Record<RecommendationContributionCategory, number>;
  evidenceByCategory: Record<
    RecommendationContributionCategory,
    RecommendationContributionEvidence[]
  >;
} {
  const evidence = deduplicateAdvisorEvidence(plan.evidence);
  const contributions = emptyRecommendationContributionRecord();
  const evidenceByCategory = emptyEvidenceRecord();
  const byDimension = new Map<AdvisorEvidenceDimension, AdvisorEvidence[]>();
  for (const entry of evidence) {
    byDimension.set(entry.primaryDimension, [
      ...(byDimension.get(entry.primaryDimension) ?? []),
      entry
    ]);
  }

  for (const [dimension, entries] of byDimension) {
    const rawTotal = entries.reduce((total, entry) => total + entry.points, 0);
    const dimensionTotal = plan.evidenceScore.dimensionTotals[dimension];
    const scale = rawTotal === 0 ? 0 : dimensionTotal / rawTotal;
    for (const entry of entries) {
      const category = contributionCategory(entry);
      const points = entry.points * scale;
      contributions[category] += points;
      evidenceByCategory[category].push({
        id: entry.id,
        text: entry.displayText,
        points: round(points),
        dimension,
        confidence: entry.confidence
      });
    }
  }

  evidenceByCategory.Environment.push({
    id: "environment:dataset-context",
    text: `${environmentDataset.snapshotId} / ${environmentDataset.period} / cutoff ${environmentDataset.ratingCutoff}`,
    points: 0,
    dimension: "context",
    confidence: "high"
  });

  for (const category of RECOMMENDATION_CONTRIBUTION_CATEGORIES) {
    contributions[category] = round(contributions[category]);
    evidenceByCategory[category].sort(
      (left, right) =>
        Math.abs(right.points) - Math.abs(left.points) ||
        left.id.localeCompare(right.id)
    );
  }
  const allocated = Object.values(contributions).reduce(
    (total, points) => total + points,
    0
  );
  const residual = round(plan.baselineRecommendationScore - allocated);
  if (residual !== 0) {
    const target =
      [...RECOMMENDATION_CONTRIBUTION_CATEGORIES].sort(
        (left, right) =>
          Math.abs(contributions[right]) - Math.abs(contributions[left])
      )[0] ?? "Environment";
    contributions[target] = round(contributions[target] + residual);
  }
  return { contributions, evidenceByCategory };
}

export function analyzeRecommendationPlan(
  plan: AdvisorSwapPlan,
  rank: number,
  environmentDataset: ThreatEnvironmentDataset
): RecommendationCandidateAnalysis {
  const { contributions, evidenceByCategory } = allocateEvidence(
    plan,
    environmentDataset
  );
  const topContributions = RECOMMENDATION_CONTRIBUTION_CATEGORIES
    .map((category) => ({ category, points: contributions[category] }))
    .filter((entry) => entry.points !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.points) - Math.abs(left.points) ||
        left.category.localeCompare(right.category)
    )
    .slice(0, 5);
  return {
    rank,
    speciesRank: null,
    slug: plan.candidate.pokemon.slug,
    name: plan.candidate.pokemon.nameJa,
    action: plan.action,
    recommendationEligible: plan.isRecommendationByCategory.overall,
    recommendationScore: plan.improvementScore,
    baselineRecommendationScore: plan.baselineRecommendationScore,
    battleValueContribution: plan.battleValueContribution,
    battleValueExplanation: [...plan.battleValueExplanation],
    contestability: plan.contestability?.score ?? 0,
    contestabilityBreakdown: plan.contestability
      ? { ...plan.contestability.axes }
      : null,
    contestabilityReasons: [...plan.contestabilityExplanation],
    contestabilityContribution: plan.contestabilityContribution,
    abilityMatchupValue: plan.abilityMatchupValue,
    abilityContribution: plan.abilityContribution,
    abilityExplanation: [...plan.abilityExplanation],
    contestabilityRatio:
      plan.recommendationIntegration?.contestabilityRatio ?? 0,
    preContestabilityRecommendation:
      plan.preContestabilityRecommendation,
    finalRecommendation: plan.finalRecommendation,
    battleValueRatio:
      plan.recommendationIntegration?.battleValueRatio ?? 0,
    contributionRatios: {
      ...(plan.recommendationIntegration?.contributionRatios ?? {})
    },
    categoryScores: { ...plan.categoryScores },
    contributions,
    topContributions,
    evidenceByCategory,
    riskMagnitude: Math.abs(Math.min(0, contributions.Risk)),
    eligibilityConstraints: {
      megaLimitPassed: plan.metrics.megaLimitPassed,
      megaRecommendationPassed: plan.metrics.megaRecommendationPassed
    }
  };
}
