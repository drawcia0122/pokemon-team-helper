import { classifyCandidateArchetype } from "@/lib/candidateArchetype";
import type {
  RecommendationCandidateAnalysis,
  RecommendationContributionCategory
} from "@/lib/recommendationAnalyzer";
import { analyzeSemanticCoverage } from "@/lib/semanticCombatCoverage";
import {
  BATTLE_TAG_DEFINITIONS,
  getSemanticClassification
} from "@/lib/semanticCombatRegistry";
import {
  SEMANTIC_RECOMMENDATION_REPRESENTATION_MAP,
  SEMANTIC_REPRESENTATION_BY_TAG
} from "@/lib/semanticRepresentationMap";
import type {
  EnvironmentPokemon,
  EnvironmentSnapshot,
  WeightedEnvironmentValue
} from "@/types/environmentData";
import type {
  BattleTag,
  SemanticEntityKind,
  SemanticMetadata,
  SemanticCategory
} from "@/types/semanticCombat";
import type {
  BattleTagDatasetSummary,
  BattleTagProfile,
  CandidateArchetypeName,
  ContributionInvestigation,
  SemanticCandidateProfile,
  SemanticEvidence,
  SemanticOutlierCandidate,
  SemanticRecommendationGapAnalysis
} from "@/types/semanticRecommendationGap";
import type { PokemonEntry } from "@/types/pokemon";

const MINIMUM_USAGE_RATE = 0.001;
const MINIMUM_EVIDENCE_SHARE = 0.01;
const CONFIDENCE_WEIGHT = { high: 1, medium: 0.75 } as const;
const REPRESENTATIVE_SLUGS = [
  "gengar-mega",
  "starmie-mega",
  "lucario-mega",
  "blaziken-mega",
  "lopunny-mega",
  "kingambit",
  "volcarona",
  "dragapult",
  "jolteon",
  "sylveon"
] as const;
const ARCHETYPE_NAMES: CandidateArchetypeName[] = [
  "Breaker",
  "Cleaner",
  "Setup Sweeper",
  "Trapper",
  "Pivot",
  "Defensive Anchor",
  "Hazard Control",
  "Hybrid",
  "Unclassified Archetype"
];

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function classificationFor(
  entityKind: Exclude<SemanticEntityKind, "stat-change">,
  id: string
) {
  if (entityKind === "move") return getSemanticClassification("move", id);
  if (entityKind === "ability") {
    return getSemanticClassification("ability", id);
  }
  return getSemanticClassification("item", id);
}

function evidenceForEntity(
  entityKind: Exclude<SemanticEntityKind, "stat-change">,
  value: WeightedEnvironmentValue
): SemanticEvidence[] {
  if (value.share < MINIMUM_EVIDENCE_SHARE) return [];
  const classification = classificationFor(entityKind, value.id);
  if (classification.status === "unclassified") return [];
  const evidence: SemanticEvidence[] = [];
  for (const semantic of classification.semantics as readonly SemanticMetadata<SemanticCategory>[]) {
    for (const battleTag of semantic.battleTags) {
      evidence.push({
        entityKind,
        entityId: value.id,
        sourceName: value.sourceName,
        adoptionRate: value.share,
        semanticCategory: semantic.category,
        confidence: semantic.confidence,
        confidenceWeight: CONFIDENCE_WEIGHT[semantic.confidence],
        source: semantic.source,
        description: semantic.description,
        battleTag
      });
    }
  }
  return evidence;
}

/**
 * V1 Presence is intentionally conservative. Within each entity kind, where
 * moves may be mutually exclusive and abilities/items are distributions, only
 * the strongest adoption×confidence evidence is counted. Across move, ability,
 * and item kinds the strongest value is kept and only 25% of the remaining
 * bounded support is added. No marginal adoption rates are treated as a full
 * independent joint distribution.
 */
function semanticPresence(evidence: SemanticEvidence[]): number {
  const byEntity = new Map<string, number>();
  for (const entry of evidence) {
    const key = `${entry.entityKind}:${entry.entityId}`;
    byEntity.set(
      key,
      Math.max(
        byEntity.get(key) ?? 0,
        entry.adoptionRate * entry.confidenceWeight
      )
    );
  }
  const byKind = new Map<SemanticEntityKind, number>();
  for (const [key, value] of byEntity) {
    const kind = key.split(":", 1)[0] as SemanticEntityKind;
    byKind.set(kind, Math.max(byKind.get(kind) ?? 0, value));
  }
  const values = [...byKind.values()].sort((left, right) => right - left);
  if (values.length === 0) return 0;
  const strongest = values[0];
  const secondarySupport = Math.min(
    1 - strongest,
    values.slice(1).reduce((total, value) => total + value, 0)
  );
  return round(clamp(strongest + secondarySupport * 0.25));
}

function unclassifiedElements(
  environment: EnvironmentPokemon
): SemanticCandidateProfile["unclassified"] {
  return (
    [
      ["move", environment.moves],
      ["ability", environment.abilities],
      ["item", environment.items]
    ] as const
  )
    .flatMap(([kind, values]) =>
      values
        .filter(
          (value) =>
            value.share >= MINIMUM_EVIDENCE_SHARE &&
            classificationFor(kind, value.id).status === "unclassified"
        )
        .map((value) => ({
          entityKind: kind,
          entityId: value.id,
          adoptionRate: round(value.share)
        }))
    )
    .sort(
      (left, right) =>
        right.adoptionRate - left.adoptionRate ||
        left.entityKind.localeCompare(right.entityKind) ||
        left.entityId.localeCompare(right.entityId)
    );
}

function tagProfile(
  tag: BattleTag,
  evidence: SemanticEvidence[],
  candidate: RecommendationCandidateAnalysis | undefined
): BattleTagProfile {
  const relevant = evidence
    .filter((entry) => entry.battleTag === tag)
    .sort(
      (left, right) =>
        right.adoptionRate * right.confidenceWeight -
          left.adoptionRate * left.confidenceWeight ||
        left.entityKind.localeCompare(right.entityKind) ||
        left.entityId.localeCompare(right.entityId) ||
        left.semanticCategory.localeCompare(right.semanticCategory)
    );
  const representation = SEMANTIC_REPRESENTATION_BY_TAG[tag];
  const direct = representation.directCategories.reduce(
    (total, category) =>
      total + Math.max(0, candidate?.contributions[category] ?? 0),
    0
  );
  const indirect = representation.indirectCategories.reduce(
    (total, category) =>
      total + Math.max(0, candidate?.contributions[category] ?? 0),
    0
  );
  const recommendationContribution = direct + indirect * 0.5;
  const presence = semanticPresence(relevant);
  const contributionDiscount = 1 - Math.min(0.35, recommendationContribution / 60);
  return {
    tag,
    semanticPresence: presence,
    evidenceCount: relevant.length,
    evidence: relevant,
    maximumAdoptionRate: round(
      Math.max(0, ...relevant.map((entry) => entry.adoptionRate))
    ),
    averageConfidence:
      relevant.length === 0
        ? 0
        : round(
            relevant.reduce(
              (total, entry) => total + entry.confidenceWeight,
              0
            ) / relevant.length
          ),
    classification:
      presence === 0 ? "unavailable" : representation.classification,
    directRecommendationCategories: [...representation.directCategories],
    indirectRecommendationCategories: [...representation.indirectCategories],
    relevantRecommendationContribution: round(recommendationContribution),
    gapContribution: round(
      presence * representation.gapWeight * contributionDiscount * 100
    )
  };
}

function buildProfile(
  environment: EnvironmentPokemon,
  pokemon: PokemonEntry,
  candidate: RecommendationCandidateAnalysis | undefined,
  maximumRank: number
): SemanticCandidateProfile {
  const evidence = [
    ...environment.moves.flatMap((value) =>
      evidenceForEntity("move", value)
    ),
    ...environment.abilities.flatMap((value) =>
      evidenceForEntity("ability", value)
    ),
    ...environment.items.flatMap((value) =>
      evidenceForEntity("item", value)
    )
  ];
  const tagProfiles = Object.fromEntries(
    BATTLE_TAG_DEFINITIONS.map(({ tag }) => [
      tag,
      tagProfile(tag, evidence, candidate)
    ])
  ) as Record<BattleTag, BattleTagProfile>;
  const unclassified = unclassifiedElements(environment);
  const consideredElementCount =
    environment.moves.filter((entry) => entry.share >= MINIMUM_EVIDENCE_SHARE)
      .length +
    environment.abilities.filter(
      (entry) => entry.share >= MINIMUM_EVIDENCE_SHARE
    ).length +
    environment.items.filter((entry) => entry.share >= MINIMUM_EVIDENCE_SHARE)
      .length;
  const unclassifiedRate =
    consideredElementCount > 0
      ? unclassified.length / consideredElementCount
      : 1;
  const gapTotal = Object.values(tagProfiles).reduce(
    (total, profile) => total + profile.gapContribution,
    0
  );
  const rankFactor = candidate?.speciesRank
    ? 0.8 + 0.2 * clamp((candidate.speciesRank - 1) / Math.max(1, maximumRank - 1))
    : 1;
  const reliability = clamp(1 - unclassifiedRate * 0.5);
  const semanticGap = round(
    clamp((gapTotal / 4) * rankFactor * reliability, 0, 100),
    1
  );
  const hasTrapSemantic = evidence.some(
    (entry) => entry.semanticCategory === "Trap"
  );
  const archetype = classifyCandidateArchetype(tagProfiles, hasTrapSemantic);
  const riskContribution = candidate?.contributions.Risk ?? 0;
  let disposition: SemanticCandidateProfile["disposition"] = "represented";
  if (consideredElementCount === 0) disposition = "insufficient-data";
  else if (unclassifiedRate >= 0.35) disposition = "unclassified-heavy";
  else if (
    !candidate ||
    candidate.speciesRank === null ||
    !candidate.eligibilityConstraints.megaLimitPassed ||
    !candidate.eligibilityConstraints.megaRecommendationPassed
  ) {
    disposition = "eligibility-excluded";
  } else if (semanticGap >= 25) disposition = "semantic-underestimation";
  else if (riskContribution <= -10) disposition = "risk-dominated";
  return {
    slug: pokemon.slug,
    name: pokemon.nameJa,
    usageRank: environment.usage.rank,
    usageRate: environment.usage.rate,
    recommendationRank: candidate?.speciesRank ?? null,
    recommendationRawRank: candidate?.rank ?? null,
    recommendationScore: candidate?.recommendationScore ?? null,
    recommendationEligible: candidate?.recommendationEligible ?? false,
    riskContribution,
    scoreBeforeRisk: candidate
      ? round(candidate.recommendationScore - riskContribution)
      : null,
    rankWithoutRisk: null,
    tagProfiles,
    battleTags: BATTLE_TAG_DEFINITIONS.map(({ tag }) => tag).filter(
      (tag) => tagProfiles[tag].semanticPresence > 0
    ),
    archetype,
    semanticGap,
    semanticGapReliability: round(reliability),
    disposition,
    unclassified,
    unclassifiedRate: round(unclassifiedRate)
  };
}

function assignRiskFreeRanks(profiles: SemanticCandidateProfile[]): void {
  profiles
    .filter(
      (profile): profile is SemanticCandidateProfile & {
        scoreBeforeRisk: number;
      } => profile.scoreBeforeRisk !== null
    )
    .sort(
      (left, right) =>
        right.scoreBeforeRisk - left.scoreBeforeRisk ||
        (left.recommendationRawRank ?? Number.POSITIVE_INFINITY) -
          (right.recommendationRawRank ?? Number.POSITIVE_INFINITY) ||
        left.slug.localeCompare(right.slug)
    )
    .forEach((profile, index) => {
      profile.rankWithoutRisk = index + 1;
    });
}

function average(values: number[]): number | null {
  return values.length
    ? round(values.reduce((total, value) => total + value, 0) / values.length)
    : null;
}

function ranks(values: number[]): number[] {
  const indexed = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value || left.index - right.index);
  const result = new Array<number>(values.length);
  for (let index = 0; index < indexed.length; ) {
    let end = index + 1;
    while (end < indexed.length && indexed[end].value === indexed[index].value) {
      end += 1;
    }
    const rank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) {
      result[indexed[cursor].index] = rank;
    }
    index = end;
  }
  return result;
}

function pearson(left: number[], right: number[]): number | null {
  if (left.length < 2 || left.length !== right.length) return null;
  const leftMean = average(left) ?? 0;
  const rightMean = average(right) ?? 0;
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquare += leftDelta ** 2;
    rightSquare += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftSquare * rightSquare);
  return denominator === 0 ? null : round(numerator / denominator);
}

function outlier(profile: SemanticCandidateProfile): SemanticOutlierCandidate {
  const mainProfiles = Object.values(profile.tagProfiles)
    .filter((entry) => entry.semanticPresence > 0)
    .sort(
      (left, right) =>
        right.gapContribution - left.gapContribution ||
        left.tag.localeCompare(right.tag)
    )
    .slice(0, 5);
  return {
    slug: profile.slug,
    name: profile.name,
    recommendationRank: profile.recommendationRank,
    recommendationScore: profile.recommendationScore,
    semanticGap: profile.semanticGap,
    archetype: profile.archetype.primary,
    disposition: profile.disposition,
    mainTags: mainProfiles.map((entry) => entry.tag),
    evidence: mainProfiles.flatMap((entry) =>
      entry.evidence
        .slice(0, 1)
        .map(
          (evidence) =>
            `${entry.tag}:${evidence.entityId} ${(evidence.adoptionRate * 100).toFixed(1)}%`
        )
    ),
    riskContribution: profile.riskContribution,
    scoreBeforeRisk: profile.scoreBeforeRisk,
    rankWithoutRisk: profile.rankWithoutRisk
  };
}

function contributionInvestigation(
  candidates: RecommendationCandidateAnalysis[],
  topCandidates: RecommendationCandidateAnalysis[]
): ContributionInvestigation[] {
  const causes: Record<ContributionInvestigation["category"], string> = {
    Role:
      "RoleはroleImprovement/teamIssueImprovement Evidenceがある候補だけに発生します。TOP内0はfixtureの上位候補に該当Evidenceがないためです。",
    Ability:
      "Abilityはrole:defensive-ability Evidence専用です。特性データの存在自体や攻撃特性はScoreへ接続されないため、多くのfixtureで0になります。",
    Environment:
      "environment:usageはUsageへ配賦され、Dataset contextは0点です。その他のenvironmentValidity EvidenceがないためEnvironmentは0になります。"
  };
  return (["Role", "Ability", "Environment"] as const).map((category) => ({
    category,
    topCandidateAverage: round(
      topCandidates.reduce(
        (total, candidate) => total + candidate.contributions[category],
        0
      ) / Math.max(1, topCandidates.length)
    ),
    nonZeroCandidateCount: candidates.filter(
      (candidate) => candidate.contributions[category] !== 0
    ).length,
    evidenceCount: candidates.reduce(
      (total, candidate) =>
        total +
        candidate.evidenceByCategory[category].filter(
          (entry) => entry.dimension !== "context"
        ).length,
      0
    ),
    cause: causes[category]
  }));
}

export function analyzeSemanticRecommendationGap({
  context,
  candidates,
  recommendationTop,
  environmentSnapshot,
  availablePokemon,
  topLimit
}: {
  context: {
    datasetId: string;
    regulation: string;
    ratingCutoff: number;
    profile: "standard" | "trick-room";
  };
  candidates: RecommendationCandidateAnalysis[];
  recommendationTop: RecommendationCandidateAnalysis[];
  environmentSnapshot: EnvironmentSnapshot;
  availablePokemon: PokemonEntry[];
  topLimit: number;
}): SemanticRecommendationGapAnalysis {
  const candidateBySlug = new Map(
    candidates.map((candidate) => [candidate.slug, candidate])
  );
  const availableBySlug = new Map(
    availablePokemon.map((pokemon) => [pokemon.slug, pokemon])
  );
  const profiles = environmentSnapshot.pokemon
    .filter(
      (environment) =>
        environment.usage.rate >= MINIMUM_USAGE_RATE &&
        availableBySlug.has(environment.slug)
    )
    .map((environment) =>
      buildProfile(
        environment,
        availableBySlug.get(environment.slug)!,
        candidateBySlug.get(environment.slug),
        candidates.length
      )
    )
    .sort(
      (left, right) =>
        (left.recommendationRawRank ?? Number.POSITIVE_INFINITY) -
          (right.recommendationRawRank ?? Number.POSITIVE_INFINITY) ||
        left.usageRank - right.usageRank ||
        left.slug.localeCompare(right.slug)
    );
  assignRiskFreeRanks(profiles);
  const semanticGapRanking = [...profiles].sort(
    (left, right) =>
      right.semanticGap - left.semanticGap ||
      (left.recommendationRank ?? Number.POSITIVE_INFINITY) -
        (right.recommendationRank ?? Number.POSITIVE_INFINITY) ||
      left.slug.localeCompare(right.slug)
  );
  const battleTagSummary: BattleTagDatasetSummary[] =
    BATTLE_TAG_DEFINITIONS.map(({ tag }) => {
      const applicable = profiles.filter(
        (profile) => profile.tagProfiles[tag].semanticPresence > 0
      );
      const recommendationRanks = applicable.flatMap((profile) =>
        profile.recommendationRank === null ? [] : [profile.recommendationRank]
      );
      return {
        tag,
        candidateCount: applicable.length,
        averagePresence:
          average(
            applicable.map(
              (profile) => profile.tagProfiles[tag].semanticPresence
            )
          ) ?? 0,
        averageRecommendationRank: average(recommendationRanks),
        averageRecommendationContribution:
          average(
            applicable.map(
              (profile) =>
                profile.tagProfiles[tag].relevantRecommendationContribution
            )
          ) ?? 0,
        representedCount: applicable.filter(
          (profile) =>
            profile.tagProfiles[tag].classification === "represented"
        ).length,
        partiallyRepresentedCount: applicable.filter(
          (profile) =>
            profile.tagProfiles[tag].classification ===
            "partially-represented"
        ).length,
        unrepresentedCount: applicable.filter(
          (profile) =>
            profile.tagProfiles[tag].classification === "unrepresented"
        ).length,
        averageGapContribution:
          average(
            applicable.map(
              (profile) => profile.tagProfiles[tag].gapContribution
            )
          ) ?? 0,
        representativeSlugs: [...applicable]
          .sort(
            (left, right) =>
              right.tagProfiles[tag].gapContribution -
                left.tagProfiles[tag].gapContribution ||
              left.slug.localeCompare(right.slug)
          )
          .slice(0, 5)
          .map((profile) => profile.slug)
      };
    });
  const archetypeCounts = Object.fromEntries(
    ARCHETYPE_NAMES.map((name) => [
      name,
      profiles.filter((profile) => profile.archetype.primary === name).length
    ])
  ) as Record<CandidateArchetypeName, number>;
  const coverage = analyzeSemanticCoverage(environmentSnapshot);
  const rankedProfiles = profiles.filter(
    (profile): profile is SemanticCandidateProfile & {
      recommendationRank: number;
    } => profile.recommendationRank !== null
  );
  const unclassifiedSummary = profiles
    .flatMap((profile) => profile.unclassified)
    .filter(
      (entry, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.entityKind === entry.entityKind &&
            candidate.entityId === entry.entityId
        ) === index
    )
    .sort(
      (left, right) =>
        left.entityKind.localeCompare(right.entityKind) ||
        left.entityId.localeCompare(right.entityId)
    );
  const semanticUnderestimationCandidates = semanticGapRanking
    .filter(
      (profile) =>
        profile.disposition === "semantic-underestimation" &&
        (profile.recommendationRank ?? Number.POSITIVE_INFINITY) > topLimit &&
        profile.battleTags.length >= 2
    )
    .slice(0, Math.max(15, topLimit))
    .map(outlier);
  const offensiveTags: BattleTag[] = [
    "WallBreak",
    "Cleanup",
    "Setup",
    "WinCondition",
    "PriorityFinish",
    "Snowball"
  ];
  const staticSupportCandidates = profiles
    .filter(
      (profile) =>
        profile.recommendationRank !== null &&
        Math.max(
          ...offensiveTags.map(
            (tag) => profile.tagProfiles[tag].semanticPresence
          )
        ) < 0.35
    )
    .sort(
      (left, right) =>
        (left.recommendationRank ?? Number.POSITIVE_INFINITY) -
          (right.recommendationRank ?? Number.POSITIVE_INFINITY) ||
        left.slug.localeCompare(right.slug)
    )
    .slice(0, Math.max(15, topLimit))
    .map(outlier);
  const riskDominatedCandidates = profiles
    .filter((profile) => profile.riskContribution < 0)
    .sort(
      (left, right) =>
        left.riskContribution - right.riskContribution ||
        right.semanticGap - left.semanticGap ||
        left.slug.localeCompare(right.slug)
    )
    .slice(0, Math.max(15, topLimit))
    .map(outlier);
  const profileBySlug = new Map(
    profiles.map((profile) => [profile.slug, profile])
  );
  return {
    metadata: {
      schemaVersion: 1,
      analyzer: "semantic-recommendation-gap",
      deterministic: true,
      presenceMethod:
        "max(adoption×confidence) per entity kind + 25% bounded cross-kind support",
      gapMethod:
        "clamp(sum(presence×representationWeight×contributionDiscount) / 4 × rankFactor × coverageReliability, 0, 100)",
      tieBreak:
        "Semantic Gap desc, Recommendation rank asc, slug lexicographic"
    },
    datasetSummary: {
      datasetId: context.datasetId,
      regulation: context.regulation,
      ratingCutoff: context.ratingCutoff,
      format: environmentSnapshot.sourceFormatId,
      pokemonCount: environmentSnapshot.pokemon.length,
      semanticAnalyzableCount: profiles.length,
      coverage: {
        moves: coverage.coverage.moves.occurrenceCoverageRate,
        abilities: coverage.coverage.abilities.occurrenceCoverageRate,
        items: coverage.coverage.items.occurrenceCoverageRate
      },
      unclassifiedElementCount: unclassifiedSummary.length,
      archetypeCounts,
      battleTagCounts: Object.fromEntries(
        battleTagSummary.map((entry) => [entry.tag, entry.candidateCount])
      ) as Record<BattleTag, number>,
      semanticGapDistribution: {
        low: profiles.filter((profile) => profile.semanticGap < 25).length,
        moderate: profiles.filter(
          (profile) =>
            profile.semanticGap >= 25 && profile.semanticGap < 50
        ).length,
        high: profiles.filter(
          (profile) =>
            profile.semanticGap >= 50 && profile.semanticGap < 75
        ).length,
        veryHigh: profiles.filter((profile) => profile.semanticGap >= 75)
          .length
      },
      correlations: {
        recommendationRankSpearman: pearson(
          ranks(rankedProfiles.map((profile) => profile.semanticGap)),
          ranks(rankedProfiles.map((profile) => profile.recommendationRank))
        ),
        riskPearson: pearson(
          rankedProfiles.map((profile) => profile.semanticGap),
          rankedProfiles.map((profile) => Math.abs(profile.riskContribution))
        ),
        methods: {
          recommendationRank: "Spearman",
          risk: "Pearson"
        }
      },
      limitations: [
        "技構成の同時分布がないため、採用率は保守的なmax/bounded supportで統合します。",
        "Datasetに能力変化の直接分布はなく、技・特性Semanticに登録済みのBattle Tagsだけを使用します。",
        `Profile=${context.profile}はRecommendation順位にのみ従い、Semantic Presence自体を変更しません。`
      ]
    },
    representationMap: [...SEMANTIC_RECOMMENDATION_REPRESENTATION_MAP],
    semanticProfiles: profiles,
    battleTagSummary,
    archetypeSummary: archetypeCounts,
    semanticGapRanking,
    semanticUnderestimationCandidates,
    staticSupportCandidates,
    riskDominatedCandidates,
    representativeComparison: REPRESENTATIVE_SLUGS.flatMap((slug) => {
      const profile = profileBySlug.get(slug);
      return profile ? [profile] : [];
    }),
    contributionInvestigation: contributionInvestigation(
      candidates,
      recommendationTop
    ),
    unclassifiedSummary
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatOutliers(
  title: string,
  candidates: SemanticOutlierCandidate[],
  limit: number
): string[] {
  const lines = [title];
  if (candidates.length === 0) return [...lines, "該当なし", ""];
  for (const candidate of candidates.slice(0, limit)) {
    lines.push(
      `${candidate.name} (${candidate.slug}) rank=${candidate.recommendationRank ?? "圏外"} score=${candidate.recommendationScore ?? "－"} gap=${candidate.semanticGap} archetype=${candidate.archetype} class=${candidate.disposition}`
    );
    lines.push(
      `  tags=${candidate.mainTags.join(",") || "なし"} evidence=${candidate.evidence.join(" / ") || "なし"}`
    );
    lines.push(
      `  risk=${candidate.riskContribution} beforeRisk=${candidate.scoreBeforeRisk ?? "－"} rankWithoutRisk=${candidate.rankWithoutRisk ?? "－"}`
    );
  }
  lines.push("");
  return lines;
}

export function formatSemanticRecommendationGapReport(
  analysis: SemanticRecommendationGapAnalysis,
  topLimit: number
): string {
  const lines: string[] = [
    "Semantic Coverage",
    `Pokemon=${analysis.datasetSummary.semanticAnalyzableCount}/${analysis.datasetSummary.pokemonCount} Moves=${percent(analysis.datasetSummary.coverage.moves)} Abilities=${percent(analysis.datasetSummary.coverage.abilities)} Items=${percent(analysis.datasetSummary.coverage.items)}`,
    `Presence=${analysis.metadata.presenceMethod}`,
    "",
    "Battle Tag Profile"
  ];
  for (const profile of analysis.semanticGapRanking.slice(0, topLimit)) {
    const tags = profile.battleTags
      .map(
        (tag) =>
          `${tag}:${profile.tagProfiles[tag].semanticPresence.toFixed(3)}(${profile.tagProfiles[tag].classification})`
      )
      .join(" ");
    lines.push(
      `${profile.name} (${profile.slug}) gap=${profile.semanticGap} archetype=${profile.archetype.primary} ${tags}`
    );
  }
  lines.push("", "Underrepresented Battle Tags");
  for (const tag of [...analysis.battleTagSummary]
    .sort(
      (left, right) =>
        right.averageGapContribution - left.averageGapContribution ||
        left.tag.localeCompare(right.tag)
    )
    .slice(0, topLimit)) {
    lines.push(
      `${tag.tag}: candidates=${tag.candidateCount} presence=${tag.averagePresence} rank=${tag.averageRecommendationRank ?? "－"} contribution=${tag.averageRecommendationContribution} represented=${tag.representedCount} partial=${tag.partiallyRepresentedCount} unrepresented=${tag.unrepresentedCount} gap=${tag.averageGapContribution} representatives=${tag.representativeSlugs.join(",")}`
    );
  }
  lines.push("", "Candidate Archetypes");
  for (const [name, count] of Object.entries(analysis.archetypeSummary)) {
    lines.push(`${name}: ${count}`);
  }
  lines.push("", "Semantic Gap Ranking");
  analysis.semanticGapRanking.slice(0, topLimit).forEach((profile, index) =>
    lines.push(
      `${index + 1}. ${profile.name} (${profile.slug}) gap=${profile.semanticGap} Recommendation=${profile.recommendationRank ?? "圏外"} eligible=${profile.recommendationEligible ? "yes" : "no"}`
    )
  );
  lines.push("");
  lines.push(
    ...formatOutliers(
      "Semantic Underestimation Candidates",
      analysis.semanticUnderestimationCandidates,
      topLimit
    ),
    ...formatOutliers(
      "Static Support Candidates",
      analysis.staticSupportCandidates,
      topLimit
    ),
    ...formatOutliers(
      "Risk-Dominated Candidates",
      analysis.riskDominatedCandidates,
      topLimit
    )
  );
  lines.push("Representative Comparison");
  for (const profile of analysis.representativeComparison) {
    lines.push(
      `${profile.name} (${profile.slug}) rank=${profile.recommendationRank ?? "圏外"} score=${profile.recommendationScore ?? "－"} gap=${profile.semanticGap} archetype=${profile.archetype.primary}`
    );
    for (const tag of profile.battleTags) {
      const entry = profile.tagProfiles[tag];
      lines.push(
        `  ${tag} presence=${entry.semanticPresence} evidence=${entry.evidence.slice(0, 3).map((item) => `${item.entityId}:${percent(item.adoptionRate)}:${item.confidence}`).join("/")}`
      );
    }
  }
  lines.push("", "Role / Ability / Environment Investigation");
  for (const entry of analysis.contributionInvestigation) {
    lines.push(
      `${entry.category}: TOP平均=${entry.topCandidateAverage} nonZeroCandidates=${entry.nonZeroCandidateCount} evidence=${entry.evidenceCount}`
    );
    lines.push(`  ${entry.cause}`);
  }
  lines.push("", "Unclassified Summary");
  for (const entry of analysis.unclassifiedSummary) {
    lines.push(
      `${entry.entityKind}:${entry.entityId} maxAdoption=${percent(entry.adoptionRate)}`
    );
  }
  lines.push("", "Dataset Summary");
  lines.push(
    `Dataset=${analysis.datasetSummary.datasetId} Regulation=${analysis.datasetSummary.regulation} Format=${analysis.datasetSummary.format} Rating=${analysis.datasetSummary.ratingCutoff}`
  );
  lines.push(
    `Gap distribution=${JSON.stringify(analysis.datasetSummary.semanticGapDistribution)} Spearman(rank,gap)=${analysis.datasetSummary.correlations.recommendationRankSpearman ?? "－"} Pearson(risk,gap)=${analysis.datasetSummary.correlations.riskPearson ?? "－"}`
  );
  return `${lines.join("\n")}\n`;
}
