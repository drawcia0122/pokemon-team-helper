import type { BattleTag } from "@/types/semanticCombat";
import type {
  CandidateArchetypeName,
  SemanticCandidateProfile
} from "@/types/semanticRecommendationGap";

export type BattleValueAxis =
  | "immediateBreak"
  | "cleanup"
  | "setupWinCondition"
  | "priorityRevenge"
  | "trade"
  | "tempo"
  | "snowball"
  | "trapTargetRemoval"
  | "roleCompression";

export type BattleValueTier = "S" | "A" | "B" | "C" | "D" | "E";

export type BattleValueInteraction = {
  id: string;
  kind: "synergy" | "conflict";
  points: number;
  tags: BattleTag[];
  reason: string;
};

export type BattleValueCandidate = {
  slug: string;
  name: string;
  eligibility: boolean;
  exclusionClass: SemanticCandidateProfile["disposition"];
  recommendationRank: number | null;
  recommendationScore: number | null;
  semanticGap: number;
  archetype: CandidateArchetypeName;
  battleTags: BattleTag[];
  intrinsicBattleValue: number;
  teamFitModifier: number;
  rawBattleValue: number;
  reliability: number;
  reliabilityReasons: string[];
  riskContribution: number;
  riskAdjustment: number;
  finalBattleValue: number;
  tier: BattleValueTier;
  axisBreakdown: Record<BattleValueAxis, number>;
  interactionBonus: number;
  interactions: BattleValueInteraction[];
  evidence: string[];
  unclassified: SemanticCandidateProfile["unclassified"];
};

export type BattleValueDatasetComparison = {
  supported: false;
  requestedDatasetId: string;
  reason: string;
};

export type BattleValueResult = {
  metadata: {
    schemaVersion: 1;
    mode: "shadow";
    deterministic: true;
    tieBreak: string;
  };
  input: {
    team: string[];
    regulation: string;
    profile: "standard" | "trick-room";
    datasetId: string;
    candidate: string | null;
    compareDataset: string | null;
  };
  datasetSummary: {
    pokemonCount: number;
    analyzedCount: number;
    coverage: { moves: number; abilities: number; items: number };
  };
  config: {
    minimumEvidenceShare: number;
    shadowMode: true;
    formula: string;
  };
  weights: Record<BattleValueAxis | "interactionBonus", number>;
  tierThresholds: Record<BattleValueTier, number>;
  candidates: BattleValueCandidate[];
  battleValueRanking: BattleValueCandidate[];
  recommendationComparison: BattleValueCandidate[];
  battleValueUnderrecognized: BattleValueCandidate[];
  staticRecommendationLeaders: BattleValueCandidate[];
  balancedCandidates: BattleValueCandidate[];
  highValueButExcluded: BattleValueCandidate[];
  archetypeSummary: Record<string, number>;
  battleTagSummary: Record<BattleTag, number>;
  reliabilitySummary: {
    average: number;
    minimum: number;
    maximum: number;
  };
  riskAdjustmentSummary: {
    average: number;
    minimum: number;
    adjustedCandidates: number;
  };
  representativeComparison: BattleValueCandidate[];
  hazardControlInvestigation: {
    archetypeCount: number;
    requiresBothTags: false;
    scoreThreshold: number;
    bothTagCandidates: string[];
    matchedArchetypeCandidates: string[];
    scoreQualifiedCandidateCount: number;
    maximumArchetypeScore: number;
    setterCandidates: number;
    removalCandidates: number;
    registryClassificationMissing: false;
    implementationBugDetected: false;
    cause: string;
    recommendation: string;
  };
  unclassifiedSummary: SemanticCandidateProfile["unclassified"];
  recommendationUnchanged: boolean;
  datasetComparison: BattleValueDatasetComparison | null;
};
