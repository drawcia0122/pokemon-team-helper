import { calculateBattleValueAxes } from "@/lib/battleValueAxes";
import {
  BATTLE_VALUE_CONFIG,
  battleValueTier
} from "@/lib/battleValueConfig";
import { battleValueInteractions } from "@/lib/battleValueInteractions";
import {
  battleValueReliability,
  battleValueRiskAdjustment
} from "@/lib/battleValueReliability";
import { battleValueTeamFit } from "@/lib/battleValueTeamFit";
import type { RecommendationAnalyzerResult } from "@/lib/recommendationAnalyzer";
import type {
  EnvironmentPokemon,
  EnvironmentSnapshot
} from "@/types/environmentData";
import type { PokemonEntry } from "@/types/pokemon";
import type {
  BattleValueCandidate,
  BattleValueResult
} from "@/types/battleValue";

const REPRESENTATIVE_SLUGS = [
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
] as const;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

type BattleValuePrecision = {
  final: number;
  reliability: number;
  intrinsic: number;
};

function compareBattleValue(
  left: BattleValueCandidate,
  right: BattleValueCandidate,
  precision: ReadonlyMap<string, BattleValuePrecision>
): number {
  const leftPrecision = precision.get(left.slug);
  const rightPrecision = precision.get(right.slug);
  return (
    (rightPrecision?.final ?? right.finalBattleValue) -
      (leftPrecision?.final ?? left.finalBattleValue) ||
    (rightPrecision?.reliability ?? right.reliability) -
      (leftPrecision?.reliability ?? left.reliability) ||
    (rightPrecision?.intrinsic ?? right.intrinsicBattleValue) -
      (leftPrecision?.intrinsic ?? left.intrinsicBattleValue) ||
    (left.recommendationRank ?? Number.POSITIVE_INFINITY) -
      (right.recommendationRank ?? Number.POSITIVE_INFINITY) ||
    left.slug.localeCompare(right.slug)
  );
}

export function analyzeBattleValue({
  recommendation,
  environmentSnapshot,
  availablePokemon,
  candidateSlug = null,
  compareDataset = null,
  recommendationUnchanged = true
}: {
  recommendation: RecommendationAnalyzerResult;
  environmentSnapshot: EnvironmentSnapshot;
  availablePokemon: PokemonEntry[];
  candidateSlug?: string | null;
  compareDataset?: string | null;
  recommendationUnchanged?: boolean;
}): BattleValueResult {
  const pokemonBySlug = new Map(
    availablePokemon.map((pokemon) => [pokemon.slug, pokemon])
  );
  const environmentBySlug = new Map(
    environmentSnapshot.pokemon.map((pokemon) => [pokemon.slug, pokemon])
  );
  const semanticBySlug = new Map(
    recommendation.semanticProfiles.map((profile) => [profile.slug, profile])
  );
  const teamProfiles = recommendation.input.team.flatMap((slug) => {
    const profile = semanticBySlug.get(slug);
    return profile ? [profile] : [];
  });
  const datasetCoverage =
    (recommendation.datasetSummary.coverage.moves +
      recommendation.datasetSummary.coverage.abilities +
      recommendation.datasetSummary.coverage.items) /
    3;
  const precisionBySlug = new Map<string, BattleValuePrecision>();

  const candidates = recommendation.semanticProfiles.flatMap((profile) => {
    if (candidateSlug && profile.slug !== candidateSlug) return [];
    if (!candidateSlug && recommendation.input.team.includes(profile.slug)) {
      return [];
    }
    const pokemon = pokemonBySlug.get(profile.slug);
    const environment = environmentBySlug.get(profile.slug);
    if (!pokemon || !environment) return [];
    const axisResult = calculateBattleValueAxes({
      profile,
      pokemon,
      environment,
      teamProfile: recommendation.input.profile,
      battleProfile: {
        tempoSupport: profile.tagProfiles.Tempo.maximumAdoptionRate
      }
    });
    const interaction = battleValueInteractions(profile, pokemon, environment);
    const teamFitModifier = battleValueTeamFit(profile, teamProfiles);
    const reliability = battleValueReliability({
      profile,
      datasetCoverage,
      usageRate: environment.usage.rate,
      teamProfile: recommendation.input.profile
    });
    const riskAdjustment = battleValueRiskAdjustment(
      profile,
      pokemon,
      environment
    );
    const intrinsicBattleValue = clamp100(
      Object.values(axisResult.axes).reduce(
        (total, value) => total + value,
        0
      ) + interaction.points
    );
    const rawBattleValue = clamp100(
      intrinsicBattleValue + teamFitModifier + riskAdjustment
    );
    const finalBattleValue = clamp100(rawBattleValue * reliability.value);
    precisionBySlug.set(profile.slug, {
      final: finalBattleValue,
      reliability: reliability.value,
      intrinsic: intrinsicBattleValue
    });
    const result: BattleValueCandidate = {
      slug: profile.slug,
      name: profile.name,
      eligibility: profile.recommendationEligible,
      exclusionClass: profile.disposition,
      recommendationRank: profile.recommendationRank,
      recommendationScore: profile.recommendationScore,
      semanticGap: profile.semanticGap,
      archetype: profile.archetype.primary,
      battleTags: profile.battleTags,
      intrinsicBattleValue: round(intrinsicBattleValue),
      teamFitModifier: round(teamFitModifier),
      rawBattleValue: round(rawBattleValue),
      reliability: round(reliability.value, 3),
      reliabilityReasons: reliability.reasons,
      riskContribution: profile.riskContribution,
      riskAdjustment: round(riskAdjustment),
      finalBattleValue: round(finalBattleValue),
      tier: battleValueTier(finalBattleValue),
      axisBreakdown: Object.fromEntries(
        Object.entries(axisResult.axes).map(([key, value]) => [
          key,
          round(value)
        ])
      ) as BattleValueCandidate["axisBreakdown"],
      interactionBonus: round(interaction.points),
      interactions: interaction.interactions.map((entry) => ({
        ...entry,
        points: round(entry.points)
      })),
      evidence: [
        ...axisResult.evidence,
        ...profile.battleTags.flatMap((tag) =>
          profile.tagProfiles[tag].evidence
            .slice(0, 1)
            .map(
              (entry) =>
                `${tag}:${entry.entityKind}:${entry.entityId}:${round(entry.adoptionRate * 100, 1)}%`
            )
        )
      ].slice(0, 20),
      unclassified: profile.unclassified
    };
    return [result];
  }).sort((left, right) => left.slug.localeCompare(right.slug));
  const battleValueRanking = [...candidates].sort((left, right) =>
    compareBattleValue(left, right, precisionBySlug)
  );
  const median =
    battleValueRanking.length === 0
      ? 0
      : battleValueRanking[Math.floor(battleValueRanking.length / 2)]
          .finalBattleValue;
  const battleValueUnderrecognized = battleValueRanking
    .filter(
      (candidate) =>
        candidate.finalBattleValue >= 55 &&
        candidate.reliability >= 0.65 &&
        candidate.eligibility &&
        (candidate.recommendationRank ?? Number.POSITIVE_INFINITY) > 20
    )
    .slice(0, 30);
  const staticRecommendationLeaders = [...candidates]
    .filter(
      (candidate) =>
        candidate.recommendationRank !== null &&
        candidate.recommendationRank <= 20 &&
        candidate.finalBattleValue < median
    )
    .sort(
      (left, right) =>
        (left.recommendationRank ?? 999) -
          (right.recommendationRank ?? 999) ||
        left.slug.localeCompare(right.slug)
    );
  const balancedCandidates = battleValueRanking.filter(
    (candidate) =>
      candidate.finalBattleValue >= 55 &&
      candidate.eligibility &&
      candidate.recommendationRank !== null &&
      candidate.recommendationRank <= 20
  );
  const highValueButExcluded = battleValueRanking.filter(
    (candidate) =>
      candidate.finalBattleValue >= 55 && !candidate.eligibility
  );
  const archetypeSummary = Object.fromEntries(
    [...new Set(candidates.map((candidate) => candidate.archetype))]
      .sort()
      .map((archetype) => [
        archetype,
        candidates.filter((candidate) => candidate.archetype === archetype)
          .length
      ])
  );
  const battleTagSummary = Object.fromEntries(
    recommendation.battleTagSummary.map((entry) => [
      entry.tag,
      candidates.filter((candidate) => candidate.battleTags.includes(entry.tag))
        .length
    ])
  ) as BattleValueResult["battleTagSummary"];
  const reliabilityValues = candidates.map((candidate) => candidate.reliability);
  const riskValues = candidates.map((candidate) => candidate.riskAdjustment);
  const bothHazards = recommendation.semanticProfiles.filter(
    (profile) =>
      profile.tagProfiles.HazardSetter.semanticPresence > 0 &&
      profile.tagProfiles.HazardRemoval.semanticPresence > 0
  );
  const matchedHazardControl = recommendation.semanticProfiles.filter(
    (profile) => profile.archetype.matched.includes("Hazard Control")
  );
  const representativeBySlug = new Map(
    candidates.map((candidate) => [candidate.slug, candidate])
  );
  return {
    metadata: {
      schemaVersion: 1,
      mode: "shadow",
      deterministic: true,
      tieBreak:
        "Final desc, Reliability desc, Intrinsic desc, Recommendation rank asc, slug"
    },
    input: {
      team: recommendation.input.team,
      regulation: recommendation.input.regulation,
      profile: recommendation.input.profile,
      datasetId: recommendation.input.datasetId,
      candidate: candidateSlug,
      compareDataset
    },
    datasetSummary: {
      pokemonCount: environmentSnapshot.pokemon.length,
      analyzedCount: candidates.length,
      coverage: recommendation.datasetSummary.coverage
    },
    config: {
      minimumEvidenceShare: BATTLE_VALUE_CONFIG.minimumEvidenceShare,
      shadowMode: true,
      formula:
        "Final = clamp(clamp(clamp(sum(Axes) + Interaction, 0, 100) + TeamFit + Risk, 0, 100) × Reliability, 0, 100)"
    },
    weights: { ...BATTLE_VALUE_CONFIG.weights },
    tierThresholds: { ...BATTLE_VALUE_CONFIG.tierThresholds },
    candidates,
    battleValueRanking,
    recommendationComparison: [...candidates].sort(
      (left, right) =>
        (left.recommendationRank ?? Number.POSITIVE_INFINITY) -
          (right.recommendationRank ?? Number.POSITIVE_INFINITY) ||
        left.slug.localeCompare(right.slug)
    ),
    battleValueUnderrecognized,
    staticRecommendationLeaders,
    balancedCandidates,
    highValueButExcluded,
    archetypeSummary,
    battleTagSummary,
    reliabilitySummary: {
      average: round(
        reliabilityValues.reduce((total, value) => total + value, 0) /
          Math.max(1, reliabilityValues.length),
        3
      ),
      minimum: round(Math.min(1, ...reliabilityValues), 3),
      maximum: round(Math.max(0, ...reliabilityValues), 3)
    },
    riskAdjustmentSummary: {
      average: round(
        riskValues.reduce((total, value) => total + value, 0) /
          Math.max(1, riskValues.length)
      ),
      minimum: round(Math.min(0, ...riskValues)),
      adjustedCandidates: riskValues.filter((value) => value < 0).length
    },
    representativeComparison: REPRESENTATIVE_SLUGS.flatMap((slug) => {
      const candidate = representativeBySlug.get(slug);
      return candidate ? [candidate] : [];
    }),
    hazardControlInvestigation: {
      archetypeCount:
        recommendation.archetypeSummary["Hazard Control"] ?? 0,
      requiresBothTags: false,
      scoreThreshold: 0.25,
      bothTagCandidates: bothHazards.map((profile) => profile.slug).sort(),
      matchedArchetypeCandidates: matchedHazardControl
        .filter(
          (profile) =>
            profile.tagProfiles.HazardSetter.semanticPresence > 0 &&
            profile.tagProfiles.HazardRemoval.semanticPresence > 0
        )
        .map(
          (profile) =>
            `${profile.slug}:${profile.archetype.primary}:${profile.archetype.scores["Hazard Control"]}`
        )
        .sort(),
      scoreQualifiedCandidateCount: matchedHazardControl.length,
      maximumArchetypeScore: round(
        Math.max(
          0,
          ...recommendation.semanticProfiles.map(
            (profile) => profile.archetype.scores["Hazard Control"]
          )
        ),
        3
      ),
      setterCandidates:
        recommendation.datasetSummary.battleTagCounts.HazardSetter,
      removalCandidates:
        recommendation.datasetSummary.battleTagCounts.HazardRemoval,
      registryClassificationMissing: false,
      implementationBugDetected: false,
      cause:
        "Hazard Control scoreはSetter・Removal・Tempoの平均で、両Tagを厳密には必須化していません。両Tagを持つ4候補も閾値を満たしますが、3体はHybrid、1体はTrapperがprimaryとなるためprimary集計は0体です。",
      recommendation:
        "Semantic定義漏れや実装不具合ではありません。primary集計とは別にmatchedを表示し、将来はHazard SetterとHazard Removerを別Archetypeへ分ける設計が適切です。"
    },
    unclassifiedSummary: recommendation.unclassifiedSummary,
    recommendationUnchanged,
    datasetComparison: compareDataset
      ? {
          supported: false,
          requestedDatasetId: compareDataset,
          reason:
            "現在のrepositoryで同一Regulation・別seasonの比較可能な公開snapshotが1件だけのため、比較型だけを提供します。"
        }
      : null
  };
}

function candidateLine(candidate: BattleValueCandidate): string {
  return `${candidate.name} (${candidate.slug}) BV=${candidate.finalBattleValue} ${candidate.tier} intrinsic=${candidate.intrinsicBattleValue} fit=${candidate.teamFitModifier >= 0 ? "+" : ""}${candidate.teamFitModifier} reliability=${candidate.reliability} risk=${candidate.riskAdjustment} Recommendation=${candidate.recommendationRank ?? "圏外"}/${candidate.recommendationScore ?? "－"} Gap=${candidate.semanticGap}`;
}

function section(
  title: string,
  candidates: BattleValueCandidate[],
  limit: number
): string[] {
  return [
    title,
    ...(candidates.length
      ? candidates.slice(0, limit).map(candidateLine)
      : ["該当なし"]),
    ""
  ];
}

function detailedCandidate(candidate: BattleValueCandidate): string[] {
  return [
    candidateLine(candidate),
    `  axes=${JSON.stringify(candidate.axisBreakdown)}`,
    `  interactions=${candidate.interactions
      .map((entry) => `${entry.id}:${entry.points >= 0 ? "+" : ""}${entry.points}`)
      .join(",") || "none"}`,
    `  tags=${candidate.battleTags.join(",") || "none"} archetype=${candidate.archetype} eligibility=${candidate.eligibility}`,
    `  evidence=${candidate.evidence.join(",") || "none"}`,
    `  unclassified=${candidate.unclassified
      .map((entry) => `${entry.entityKind}:${entry.entityId}:${round(entry.adoptionRate * 100, 1)}%`)
      .join(",") || "none"}`
  ];
}

export function formatBattleValueReport(
  result: BattleValueResult,
  topLimit: number
): string {
  const lines = [
    "Battle Value Engine V1 — Shadow Mode",
    "Input",
    `Team=${result.input.team.join(",")} Regulation=${result.input.regulation} Profile=${result.input.profile} Dataset=${result.input.datasetId}`,
    `Candidate=${result.input.candidate ?? "all"} CompareDataset=${result.input.compareDataset ?? "none"}`,
    "",
    "Dataset Summary",
    `Pokemon=${result.datasetSummary.pokemonCount} Analyzed=${result.datasetSummary.analyzedCount} Coverage=${JSON.stringify(result.datasetSummary.coverage)}`,
    "",
    "Battle Value Weights",
    JSON.stringify(result.weights),
    `Tier=${JSON.stringify(result.tierThresholds)}`,
    `Formula=${result.config.formula}`,
    "",
    ...section("Battle Value TOP", result.battleValueRanking, topLimit),
    ...section(
      "Recommendation vs Battle Value",
      result.recommendationComparison,
      topLimit
    ),
    ...section(
      "Battle Value Underrecognized",
      result.battleValueUnderrecognized,
      topLimit
    ),
    ...section(
      "Static Recommendation Leaders",
      result.staticRecommendationLeaders,
      topLimit
    ),
    ...section("Balanced Candidates", result.balancedCandidates, topLimit),
    ...section(
      "High Value but Excluded",
      result.highValueButExcluded,
      topLimit
    ),
    "Archetype Summary",
    JSON.stringify(result.archetypeSummary),
    "",
    "Battle Tag Summary",
    JSON.stringify(result.battleTagSummary),
    "",
    "Reliability Summary",
    JSON.stringify(result.reliabilitySummary),
    "",
    "Risk Adjustment Summary",
    JSON.stringify(result.riskAdjustmentSummary),
    "",
    "Representative Comparison",
    ...result.representativeComparison.flatMap(detailedCandidate),
    "",
    "Hazard Control Investigation",
    JSON.stringify(result.hazardControlInvestigation),
    "",
    "Unclassified Summary",
    result.unclassifiedSummary
      .map(
        (entry) =>
          `${entry.entityKind}:${entry.entityId}:${round(entry.adoptionRate * 100, 1)}%`
      )
      .join(",") || "なし",
    "",
    "Recommendation Unchanged Check",
    result.recommendationUnchanged ? "PASS" : "FAIL"
  ];
  return `${lines.join("\n")}\n`;
}
