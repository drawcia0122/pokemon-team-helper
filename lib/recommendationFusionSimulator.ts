import type {
  RecommendationAnalyzerResult,
  RecommendationCandidateAnalysis
} from "@/lib/recommendationAnalyzer";
import {
  FUSION_REPRESENTATIVE_SLUGS,
  RECOMMENDATION_FUSION_CONFIG
} from "@/lib/recommendationFusionConfig";
import type { BattleValueResult } from "@/types/battleValue";
import type {
  FusionCandidate,
  FusionProtectionCategory,
  FusionProtectionMetric,
  FusionStability,
  FusionWeightResult,
  FusionZone,
  RecommendationFusionResult
} from "@/types/recommendationFusion";

type SourceCandidate = {
  slug: string;
  name: string;
  eligibility: boolean;
  recommendationRank: number | null;
  recommendationReferenceRank: number;
  recommendationScore: number | null;
  recommendationNormalized: number;
  battleValueRank: number;
  battleValue: number;
  battleValueNormalized: number;
};

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(rank: number, count: number): number {
  if (count <= 1) return 100;
  return round(((count - rank) / (count - 1)) * 100, 6);
}

function retention(
  baseline: SourceCandidate[],
  fusion: FusionCandidate[],
  limit: number
): number {
  const effectiveLimit = Math.min(limit, baseline.length);
  if (effectiveLimit === 0) return 1;
  const original = new Set(
    baseline.slice(0, effectiveLimit).map((candidate) => candidate.slug)
  );
  const retained = fusion
    .slice(0, effectiveLimit)
    .filter((candidate) => original.has(candidate.slug)).length;
  return retained / effectiveLimit;
}

function classifyZone(stability: FusionStability, weight: number): {
  zone: FusionZone;
  reasons: string[];
} {
  const { safe, danger } = RECOMMENDATION_FUSION_CONFIG;
  const dangerReasons = [
    stability.top20RetentionRate <= danger.maximumTop20Retention
      ? "TOP20残留率がDanger閾値以下"
      : null,
    stability.top50RetentionRate <= danger.maximumTop50Retention
      ? "TOP50残留率がDanger閾値以下"
      : null,
    stability.averageRankMovement >= danger.minimumAverageMovement
      ? "平均順位変動がDanger閾値以上"
      : null,
    stability.battleValueReflectionRate >= danger.minimumBattleValueReflection
      ? "Battle Value反映率がDanger閾値以上"
      : null
  ].filter((reason): reason is string => reason !== null);
  if (dangerReasons.length > 0) {
    return { zone: "danger", reasons: dangerReasons };
  }
  const safeReasons = [
    stability.top20RetentionRate >= safe.minimumTop20Retention,
    stability.top50RetentionRate >= safe.minimumTop50Retention,
    stability.averageRankMovement <= safe.maximumAverageMovement,
    stability.battleValueReflectionRate >= safe.minimumBattleValueReflection,
    stability.battleValueReflectionRate <= safe.maximumBattleValueReflection,
    weight > 0
  ];
  if (safeReasons.every(Boolean)) {
    return {
      zone: "safe",
      reasons: [
        "Recommendation上位を維持",
        "平均順位変動を制限",
        "Battle Valueを適度に反映"
      ]
    };
  }
  return {
    zone: "neutral",
    reasons:
      weight === 0
        ? ["Recommendation基準値（Battle Value未反映）"]
        : ["Safe・Dangerのいずれの閾値にも該当しません"]
  };
}

function buildSources(
  recommendation: RecommendationAnalyzerResult,
  battleValue: BattleValueResult
): SourceCandidate[] {
  const semanticBySlug = new Map(
    recommendation.semanticProfiles.map((profile) => [profile.slug, profile])
  );
  const battleRankBySlug = new Map(
    battleValue.battleValueRanking.map((candidate, index) => [
      candidate.slug,
      index + 1
    ])
  );
  const ordered = [...battleValue.candidates].sort((left, right) => {
    const leftSemantic = semanticBySlug.get(left.slug);
    const rightSemantic = semanticBySlug.get(right.slug);
    return (
      (leftSemantic?.recommendationRawRank ?? Number.POSITIVE_INFINITY) -
        (rightSemantic?.recommendationRawRank ?? Number.POSITIVE_INFINITY) ||
      (right.recommendationScore ?? Number.NEGATIVE_INFINITY) -
        (left.recommendationScore ?? Number.NEGATIVE_INFINITY) ||
      (leftSemantic?.usageRank ?? Number.POSITIVE_INFINITY) -
        (rightSemantic?.usageRank ?? Number.POSITIVE_INFINITY) ||
      left.slug.localeCompare(right.slug)
    );
  });
  return ordered.map((candidate, index) => {
    const recommendationReferenceRank = index + 1;
    const battleValueRank =
      battleRankBySlug.get(candidate.slug) ?? ordered.length;
    return {
      slug: candidate.slug,
      name: candidate.name,
      eligibility: candidate.eligibility,
      recommendationRank: candidate.recommendationRank,
      recommendationReferenceRank,
      recommendationScore: candidate.recommendationScore,
      recommendationNormalized: percentile(
        recommendationReferenceRank,
        ordered.length
      ),
      battleValueRank,
      battleValue: candidate.finalBattleValue,
      battleValueNormalized: percentile(battleValueRank, ordered.length)
    };
  });
}

function simulateWeight(
  sources: SourceCandidate[],
  weight: number,
  baselineDistance: number
): FusionWeightResult {
  const ranking = sources
    .map((candidate) => ({
      ...candidate,
      fusionScore:
        candidate.recommendationNormalized * (1 - weight) +
        candidate.battleValueNormalized * weight
    }))
    .sort(
      (left, right) =>
        right.fusionScore - left.fusionScore ||
        left.recommendationReferenceRank -
          right.recommendationReferenceRank ||
        left.battleValueRank - right.battleValueRank ||
        left.slug.localeCompare(right.slug)
    )
    .map<FusionCandidate>((candidate, index) => {
      const fusionRank = index + 1;
      return {
        ...candidate,
        fusionScore: round(candidate.fusionScore, 6),
        fusionRank,
        rankDeltaVsRecommendation:
          candidate.recommendationReferenceRank - fusionRank,
        rankDifferenceVsBattleValue: candidate.battleValueRank - fusionRank,
        absoluteRankMovement: Math.abs(
          candidate.recommendationReferenceRank - fusionRank
        )
      };
    });
  const movements = ranking.map((candidate) => candidate.absoluteRankMovement);
  const currentDistance = average(
    ranking.map((candidate) =>
      Math.abs(candidate.fusionRank - candidate.battleValueRank)
    )
  );
  const top20RetentionRate = retention(sources, ranking, 20);
  const top50RetentionRate = retention(sources, ranking, 50);
  const top100RetentionRate = retention(sources, ranking, 100);
  const stability: FusionStability = {
    totalRankMovement: movements.reduce((total, value) => total + value, 0),
    averageRankMovement: round(average(movements)),
    medianRankMovement: round(median(movements)),
    top20RetentionRate: round(top20RetentionRate),
    top50RetentionRate: round(top50RetentionRate),
    top20ChangeRate: round(1 - top20RetentionRate),
    top50ChangeRate: round(1 - top50RetentionRate),
    top100ChangeRate: round(1 - top100RetentionRate),
    battleValueReflectionRate:
      baselineDistance === 0
        ? 1
        : round(1 - currentDistance / baselineDistance)
  };
  const zone = classifyZone(stability, weight);
  return {
    weight,
    weightPercent: round(weight * 100),
    zone: zone.zone,
    zoneReasons: zone.reasons,
    stability,
    ranking
  };
}

function protectionSlugs(
  category: FusionProtectionCategory,
  recommendation: RecommendationAnalyzerResult,
  battleValue: BattleValueResult
): Set<string> {
  const recommendationBySlug = new Map(
    recommendation.candidates.map((candidate) => [candidate.slug, candidate])
  );
  if (category === "threat-support") {
    return new Set(
      battleValue.candidates
        .filter(
          (candidate) =>
            (recommendationBySlug.get(candidate.slug)?.contributions.Threat ??
              0) > 0
        )
        .map((candidate) => candidate.slug)
    );
  }
  if (category === "static-support") {
    return new Set(
      battleValue.staticRecommendationLeaders.map(
        (candidate) => candidate.slug
      )
    );
  }
  if (category === "battle-candidate") {
    return new Set(
      recommendation.battleCandidates
        .filter((candidate) => candidate.signalCount > 0)
        .map((candidate) => candidate.slug)
    );
  }
  if (category === "balanced") {
    return new Set(
      battleValue.balancedCandidates.map((candidate) => candidate.slug)
    );
  }
  return new Set(
    battleValue.highValueButExcluded.map((candidate) => candidate.slug)
  );
}

function protectionMetrics(
  results: FusionWeightResult[],
  recommendation: RecommendationAnalyzerResult,
  battleValue: BattleValueResult
): FusionProtectionMetric[] {
  const categories: FusionProtectionCategory[] = [
    "threat-support",
    "static-support",
    "battle-candidate",
    "balanced",
    "high-value-but-excluded"
  ];
  return categories.flatMap((category) => {
    const slugs = protectionSlugs(category, recommendation, battleValue);
    return results.map((result) => {
      const candidates = result.ranking.filter((candidate) =>
        slugs.has(candidate.slug)
      );
      return {
        category,
        candidateCount: candidates.length,
        weightPercent: result.weightPercent,
        averageRankDelta: round(
          average(
            candidates.map(
              (candidate) => candidate.rankDeltaVsRecommendation
            )
          )
        ),
        averageAbsoluteRankMovement: round(
          average(
            candidates.map((candidate) => candidate.absoluteRankMovement)
          )
        ),
        protectedRate:
          candidates.length === 0
            ? 1
            : round(
                candidates.filter(
                  (candidate) =>
                    candidate.rankDeltaVsRecommendation >=
                    -RECOMMENDATION_FUSION_CONFIG.protectionMaximumDrop
                ).length / candidates.length
              )
      };
    });
  });
}

function unchangedCandidateState(candidate: RecommendationCandidateAnalysis) {
  return {
    slug: candidate.slug,
    rank: candidate.rank,
    speciesRank: candidate.speciesRank,
    score: candidate.recommendationScore,
    eligible: candidate.recommendationEligible,
    contributions: candidate.contributions
  };
}

export function analyzeRecommendationFusion({
  recommendation,
  battleValue,
  candidateSlug = null,
  weights = [...RECOMMENDATION_FUSION_CONFIG.weights],
  recommendationBefore,
  battleValueBefore,
  semanticGapBefore
}: {
  recommendation: RecommendationAnalyzerResult;
  battleValue: BattleValueResult;
  candidateSlug?: string | null;
  weights?: number[];
  recommendationBefore?: string;
  battleValueBefore?: string;
  semanticGapBefore?: string;
}): RecommendationFusionResult {
  if (
    weights.length === 0 ||
    weights.some((weight) => weight < 0 || weight > 1)
  ) {
    throw new Error("Fusion Weightは0〜1で1件以上指定してください。");
  }
  const uniqueWeights = [...new Set(weights)].sort((left, right) => left - right);
  const sources = buildSources(recommendation, battleValue);
  if (
    candidateSlug &&
    !sources.some((candidate) => candidate.slug === candidateSlug)
  ) {
    throw new Error(`Fusion対象候補がありません: ${candidateSlug}`);
  }
  const baselineDistance = average(
    sources.map((candidate) =>
      Math.abs(
        candidate.recommendationReferenceRank - candidate.battleValueRank
      )
    )
  );
  const weightResults = uniqueWeights.map((weight) =>
    simulateWeight(sources, weight, baselineDistance)
  );
  const maximumWeightResult = weightResults[weightResults.length - 1];
  const bySensitivity = [...maximumWeightResult.ranking].sort(
    (left, right) =>
      right.absoluteRankMovement - left.absoluteRankMovement ||
      left.slug.localeCompare(right.slug)
  );
  const safeWeights = weightResults
    .filter((result) => result.zone === "safe")
    .map((result) => result.weightPercent);
  const dangerWeights = weightResults
    .filter((result) => result.zone === "danger")
    .map((result) => result.weightPercent);
  const recommendedWeight =
    safeWeights.length === 0 ? null : Math.max(...safeWeights);
  const sourceBySlug = new Map(
    sources.map((candidate) => [candidate.slug, candidate])
  );
  const representativeResults = FUSION_REPRESENTATIVE_SLUGS.flatMap((slug) => {
    const source = sourceBySlug.get(slug);
    if (!source) return [];
    return [
      {
        slug,
        name: source.name,
        eligibility: source.eligibility,
        recommendationRank: source.recommendationRank,
        recommendationReferenceRank: source.recommendationReferenceRank,
        battleValueRank: source.battleValueRank,
        battleValue: source.battleValue,
        trajectories: weightResults.map((result) => {
          const candidate = result.ranking.find(
            (entry) => entry.slug === slug
          );
          if (!candidate) throw new Error(`${slug}のFusion結果がありません`);
          return {
            weightPercent: result.weightPercent,
            fusionRank: candidate.fusionRank,
            rankDeltaVsRecommendation: candidate.rankDeltaVsRecommendation
          };
        })
      }
    ];
  });
  const recommendationState = JSON.stringify(
    recommendation.candidates.map(unchangedCandidateState)
  );
  const battleValueState = JSON.stringify(
    battleValue.candidates.map((candidate) => ({
      slug: candidate.slug,
      value: candidate.finalBattleValue,
      rank: candidate.recommendationRank,
      eligible: candidate.eligibility
    }))
  );
  const semanticGapState = JSON.stringify(
    recommendation.semanticProfiles.map((profile) => ({
      slug: profile.slug,
      gap: profile.semanticGap,
      disposition: profile.disposition
    }))
  );
  return {
    metadata: {
      schemaVersion: 1,
      mode: "shadow",
      deterministic: true,
      normalization: "percentile-rank",
      formula:
        "Fusion = RecommendationNormalized × (1 - weight) + BattleValueNormalized × weight",
      tieBreak:
        "Fusion desc, Recommendation reference rank asc, Battle Value rank asc, slug"
    },
    input: {
      team: recommendation.input.team,
      regulation: recommendation.input.regulation,
      profile: recommendation.input.profile,
      datasetId: recommendation.input.datasetId,
      candidate: candidateSlug
    },
    weights: uniqueWeights.map((weight) => round(weight * 100)),
    candidateCount: sources.length,
    baseline: {
      recommendationRanking:
        weightResults.find((result) => result.weight === 0)?.ranking ??
        simulateWeight(sources, 0, baselineDistance).ranking,
      battleValueRanking: battleValue.battleValueRanking,
      averageRecommendationDistanceFromBattleValue: round(baselineDistance)
    },
    weightResults,
    safeZone: {
      weights: safeWeights,
      recommendedWeight,
      rationale:
        recommendedWeight === null
          ? "設定したWeight内に、Recommendation保護とBattle Value反映を同時に満たす帯域はありません。"
          : `Safe条件を満たす最大Weightは${recommendedWeight}%です。`
    },
    dangerZone: {
      weights: dangerWeights,
      rationale:
        dangerWeights.length === 0
          ? "設定したWeight内にDanger条件へ到達する帯域はありません。"
          : `${dangerWeights.join("%, ")}%でRecommendationの大幅な変動を検出しました。`
    },
    sensitivity: {
      mostAffected: bySensitivity.slice(0, 10),
      leastAffected: [...bySensitivity]
        .sort(
          (left, right) =>
            left.absoluteRankMovement - right.absoluteRankMovement ||
            left.slug.localeCompare(right.slug)
        )
        .slice(0, 10)
    },
    protectionMetrics: protectionMetrics(
      weightResults,
      recommendation,
      battleValue
    ),
    representatives: representativeResults,
    megaConstraintsPreserved: battleValue.candidates
      .filter((candidate) => candidate.slug.includes("-mega"))
      .every(
        (candidate) =>
          sourceBySlug.get(candidate.slug)?.eligibility ===
            candidate.eligibility &&
          weightResults.every(
            (result) =>
              result.ranking.find((entry) => entry.slug === candidate.slug)
                ?.eligibility === candidate.eligibility
          )
      ),
    recommendationUnchanged:
      recommendationBefore === undefined ||
      recommendationBefore === recommendationState,
    battleValueUnchanged:
      battleValueBefore === undefined || battleValueBefore === battleValueState,
    semanticGapUnchanged:
      semanticGapBefore === undefined || semanticGapBefore === semanticGapState
  };
}

function percent(value: number): string {
  return `${round(value * 100, 1)}%`;
}

export function formatRecommendationFusionReport(
  result: RecommendationFusionResult,
  topLimit = 20,
  candidateSlug?: string
): string {
  const lines = [
    "Recommendation Fusion Simulator (Shadow)",
    `Team: ${result.input.team.join(", ")}`,
    `Regulation/Profile: ${result.input.regulation} / ${result.input.profile}`,
    `Dataset: ${result.input.datasetId}`,
    `Candidates: ${result.candidateCount}`,
    `Normalization: ${result.metadata.normalization}`,
    `Formula: ${result.metadata.formula}`,
    ""
  ];
  for (const weightResult of result.weightResults) {
    const stability = weightResult.stability;
    lines.push(
      `Weight ${weightResult.weightPercent}% [${weightResult.zone.toUpperCase()}]`,
      `  movement total=${stability.totalRankMovement} avg=${stability.averageRankMovement} median=${stability.medianRankMovement}`,
      `  TOP20 retention=${percent(stability.top20RetentionRate)} change=${percent(stability.top20ChangeRate)}`,
      `  TOP50 retention=${percent(stability.top50RetentionRate)} change=${percent(stability.top50ChangeRate)}`,
      `  TOP100 change=${percent(stability.top100ChangeRate)} BV reflection=${percent(stability.battleValueReflectionRate)}`
    );
    const ranking = candidateSlug
      ? weightResult.ranking.filter(
          (candidate) => candidate.slug === candidateSlug
        )
      : weightResult.ranking.slice(0, topLimit);
    for (const candidate of ranking) {
      lines.push(
        `  ${candidate.fusionRank}. ${candidate.name} (${candidate.slug}) Fusion=${round(candidate.fusionScore, 2)} Rec=${candidate.recommendationReferenceRank}/${round(candidate.recommendationNormalized, 2)} BV=${candidate.battleValueRank}/${round(candidate.battleValueNormalized, 2)} ΔRec=${candidate.rankDeltaVsRecommendation >= 0 ? "+" : ""}${candidate.rankDeltaVsRecommendation} ΔBV=${candidate.rankDifferenceVsBattleValue >= 0 ? "+" : ""}${candidate.rankDifferenceVsBattleValue}`
      );
    }
    lines.push("");
  }
  lines.push(
    `Safe Zone: ${result.safeZone.weights.length > 0 ? `${result.safeZone.weights.join("%, ")}%` : "none"}`,
    `Recommended Weight: ${result.safeZone.recommendedWeight === null ? "none" : `${result.safeZone.recommendedWeight}%`}`,
    `Danger Zone: ${result.dangerZone.weights.length > 0 ? `${result.dangerZone.weights.join("%, ")}%` : "none"}`,
    "",
    "Representative",
    ...result.representatives.map(
      (candidate) =>
        `${candidate.name} (${candidate.slug}) Rec=${candidate.recommendationRank ?? "圏外"}/${candidate.recommendationReferenceRank} BV=${candidate.battleValueRank} ${candidate.trajectories.map((entry) => `${entry.weightPercent}%:${entry.fusionRank}`).join(" ")}`
    ),
    "",
    "Recommendation Protection",
    ...result.protectionMetrics.map(
      (metric) =>
        `${metric.category} ${metric.weightPercent}% count=${metric.candidateCount} avgΔ=${metric.averageRankDelta} protected=${percent(metric.protectedRate)}`
    ),
    "",
    "Sensitivity (maximum configured weight)",
    `Most: ${result.sensitivity.mostAffected.map((candidate) => `${candidate.slug}:${candidate.rankDeltaVsRecommendation >= 0 ? "+" : ""}${candidate.rankDeltaVsRecommendation}`).join(" ")}`,
    `Least: ${result.sensitivity.leastAffected.map((candidate) => `${candidate.slug}:${candidate.rankDeltaVsRecommendation >= 0 ? "+" : ""}${candidate.rankDeltaVsRecommendation}`).join(" ")}`,
    "",
    `Mega constraints preserved: ${result.megaConstraintsPreserved ? "yes" : "no"}`,
    `Recommendation/Battle Value/Semantic Gap unchanged: ${result.recommendationUnchanged && result.battleValueUnchanged && result.semanticGapUnchanged ? "yes" : "no"}`,
    ""
  );
  return `${lines.join("\n")}\n`;
}
