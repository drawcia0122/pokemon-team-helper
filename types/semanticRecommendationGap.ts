import type {
  RecommendationContributionCategory
} from "@/lib/recommendationAnalyzer";
import type {
  BattleTag,
  SemanticCategory,
  SemanticConfidence,
  SemanticEntityKind
} from "@/types/semanticCombat";

export type SemanticRepresentationClassification =
  | "represented"
  | "partially-represented"
  | "unrepresented"
  | "unavailable";

export type SemanticEvidence = {
  entityKind: SemanticEntityKind;
  entityId: string;
  sourceName: string;
  adoptionRate: number;
  semanticCategory: SemanticCategory;
  confidence: SemanticConfidence;
  confidenceWeight: number;
  source: string;
  description: string;
  battleTag: BattleTag;
};

export type BattleTagProfile = {
  tag: BattleTag;
  semanticPresence: number;
  evidenceCount: number;
  evidence: SemanticEvidence[];
  maximumAdoptionRate: number;
  averageConfidence: number;
  classification: SemanticRepresentationClassification;
  directRecommendationCategories: RecommendationContributionCategory[];
  indirectRecommendationCategories: RecommendationContributionCategory[];
  relevantRecommendationContribution: number;
  gapContribution: number;
};

export type CandidateArchetypeName =
  | "Breaker"
  | "Cleaner"
  | "Setup Sweeper"
  | "Trapper"
  | "Pivot"
  | "Defensive Anchor"
  | "Hazard Control"
  | "Hybrid"
  | "Unclassified Archetype";

export type CandidateArchetype = {
  primary: CandidateArchetypeName;
  scores: Record<
    Exclude<
      CandidateArchetypeName,
      "Hybrid" | "Unclassified Archetype"
    >,
    number
  >;
  matched: CandidateArchetypeName[];
  hasTrapSemantic: boolean;
};

export type SemanticGapDisposition =
  | "semantic-underestimation"
  | "eligibility-excluded"
  | "regulation-excluded"
  | "risk-dominated"
  | "insufficient-data"
  | "unclassified-heavy"
  | "represented";

export type SemanticCandidateProfile = {
  slug: string;
  name: string;
  usageRank: number;
  usageRate: number;
  recommendationRank: number | null;
  recommendationRawRank: number | null;
  recommendationScore: number | null;
  recommendationEligible: boolean;
  riskContribution: number;
  scoreBeforeRisk: number | null;
  rankWithoutRisk: number | null;
  tagProfiles: Record<BattleTag, BattleTagProfile>;
  battleTags: BattleTag[];
  archetype: CandidateArchetype;
  semanticGap: number;
  semanticGapReliability: number;
  disposition: SemanticGapDisposition;
  unclassified: Array<{
    entityKind: "move" | "ability" | "item";
    entityId: string;
    adoptionRate: number;
  }>;
  unclassifiedRate: number;
};

export type RecommendationRepresentationMapEntry = {
  tag: BattleTag;
  classification: Exclude<
    SemanticRepresentationClassification,
    "unavailable"
  >;
  directCategories: RecommendationContributionCategory[];
  indirectCategories: RecommendationContributionCategory[];
  gapWeight: number;
  rationale: string;
};

export type BattleTagDatasetSummary = {
  tag: BattleTag;
  candidateCount: number;
  averagePresence: number;
  averageRecommendationRank: number | null;
  averageRecommendationContribution: number;
  representedCount: number;
  partiallyRepresentedCount: number;
  unrepresentedCount: number;
  averageGapContribution: number;
  representativeSlugs: string[];
};

export type SemanticDatasetSummary = {
  datasetId: string;
  regulation: string;
  ratingCutoff: number;
  format: string;
  pokemonCount: number;
  semanticAnalyzableCount: number;
  coverage: {
    moves: number;
    abilities: number;
    items: number;
  };
  unclassifiedElementCount: number;
  archetypeCounts: Record<CandidateArchetypeName, number>;
  battleTagCounts: Record<BattleTag, number>;
  semanticGapDistribution: {
    low: number;
    moderate: number;
    high: number;
    veryHigh: number;
  };
  correlations: {
    recommendationRankSpearman: number | null;
    riskPearson: number | null;
    methods: {
      recommendationRank: "Spearman";
      risk: "Pearson";
    };
  };
  limitations: string[];
};

export type SemanticOutlierCandidate = {
  slug: string;
  name: string;
  recommendationRank: number | null;
  recommendationScore: number | null;
  semanticGap: number;
  archetype: CandidateArchetypeName;
  disposition: SemanticGapDisposition;
  mainTags: BattleTag[];
  evidence: string[];
  riskContribution: number;
  scoreBeforeRisk: number | null;
  rankWithoutRisk: number | null;
};

export type ContributionInvestigation = {
  category: "Role" | "Ability" | "Environment";
  topCandidateAverage: number;
  nonZeroCandidateCount: number;
  evidenceCount: number;
  cause: string;
};

export type SemanticRecommendationGapAnalysis = {
  metadata: {
    schemaVersion: 1;
    analyzer: "semantic-recommendation-gap";
    deterministic: true;
    presenceMethod: string;
    gapMethod: string;
    tieBreak: string;
  };
  datasetSummary: SemanticDatasetSummary;
  representationMap: RecommendationRepresentationMapEntry[];
  semanticProfiles: SemanticCandidateProfile[];
  battleTagSummary: BattleTagDatasetSummary[];
  archetypeSummary: SemanticDatasetSummary["archetypeCounts"];
  semanticGapRanking: SemanticCandidateProfile[];
  semanticUnderestimationCandidates: SemanticOutlierCandidate[];
  staticSupportCandidates: SemanticOutlierCandidate[];
  riskDominatedCandidates: SemanticOutlierCandidate[];
  representativeComparison: SemanticCandidateProfile[];
  contributionInvestigation: ContributionInvestigation[];
  unclassifiedSummary: SemanticCandidateProfile["unclassified"];
};
