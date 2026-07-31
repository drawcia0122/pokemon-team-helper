import type { AdvisorEvidenceConfidence } from "@/lib/advisorEvidence";
import type { BattleTag } from "@/types/semanticCombat";

export type TeamBuilderGoal =
  | "balance"
  | "bulky-offense"
  | "stall"
  | "hyper-offense"
  | "rain"
  | "sand"
  | "sun"
  | "trick-room"
  | "hazard-stack"
  | "pivot-cycle";

export type TeamBuilderCoreAxis =
  | "offensiveCore"
  | "defensiveCore"
  | "abilityCore"
  | "pivotCore"
  | "setupCore"
  | "cleanupCore"
  | "winCondition"
  | "cycleViability";

export type TeamBuilderCoreQuality = Record<TeamBuilderCoreAxis, number> & {
  overall: number;
};

export type CandidateIdentity =
  | "setup-sweeper"
  | "cleaner"
  | "wall-breaker"
  | "trapper"
  | "pivot"
  | "defensive-anchor"
  | "hazard-setter"
  | "hazard-remover"
  | "tempo-support"
  | "weather-enabler"
  | "trick-room-enabler"
  | "utility-support"
  | "hybrid";

export type CandidateIdentityEvidence = {
  source:
    | "semantic"
    | "archetype"
    | "battle-value"
    | "environment"
    | "base-stats"
    | "contestability";
  key: string;
  label: string;
  strength: number;
  adoptionRate: number | null;
};

export type CandidateIdentityProfile = {
  primary: CandidateIdentity;
  secondary: CandidateIdentity | null;
  confidence: AdvisorEvidenceConfidence;
  scores: Record<CandidateIdentity, number>;
  evidence: CandidateIdentityEvidence[];
  adoptionRate: number;
  semanticPresence: Partial<Record<BattleTag, number>>;
};

export type TeamBuilderGoalRole = "primary" | "support" | "conflict";

export type TeamBuilderGoalScoreBreakdown = {
  identityCompatibility: number;
  currentTeamConnection: number;
  coreFit: number;
  goalEvidence: number;
  supportFeasibility: number;
  identityConflictPenalty: number;
  total: number;
};

export type TeamBuilderGoalInference = {
  goal: TeamBuilderGoal;
  label: string;
  score: number;
  confidence: AdvisorEvidenceConfidence;
  missingAxes: TeamBuilderCoreAxis[];
  evidence: string[];
  identityGoalCompatibility: number;
  identityConflictPenalty: number;
  candidateRole: TeamBuilderGoalRole;
  scoreBreakdown: TeamBuilderGoalScoreBreakdown;
};

export type TeamBuilderChainStep = {
  step: number;
  slug: string;
  name: string;
  score: number;
  goalFit: number;
  goalAffinity: number;
  coreGain: number;
  naturalness: number;
  goal: TeamBuilderGoal;
  goalLabel: string;
  goalCompatibility: number;
  goalRole: TeamBuilderGoalRole;
  identitySupport: number;
  primaryIdentity: CandidateIdentity;
  secondaryIdentity: CandidateIdentity | null;
  identityConfidence: AdvisorEvidenceConfidence;
  reasons: string[];
};

export type GoalOrientedCandidatePlan = {
  schemaVersion: 2;
  candidateSlug: string;
  candidateIdentity: CandidateIdentityProfile;
  inferredGoals: TeamBuilderGoalInference[];
  selectedGoal: TeamBuilderGoalInference;
  goalAffinity: number;
  identityGoalCompatibility: number;
  identityConflictPenalty: number;
  currentFit: number;
  futurePotential: number;
  currentCoreQuality: TeamBuilderCoreQuality;
  coreQuality: TeamBuilderCoreQuality;
  deadEndRisk: number;
  goalScore: number;
  goalScoreBreakdown: {
    currentFit: number;
    futurePotential: number;
    coreQuality: number;
    identityGoalCompatibility: number;
    deadEndRisk: number;
    identityConflictPenalty: number;
  };
  nextCandidates: TeamBuilderChainStep[];
  chain: TeamBuilderChainStep[];
  explanations: string[];
  cautions: string[];
  remainingSlotsAfterCandidate: number;
  evaluatedFutureCandidateCount: number;
};

export type GoalOrientedTeamBuilderResult = {
  metadata: {
    schemaVersion: 2;
    mode: "core-goal-planning";
    planningPriority: "candidate-identity-first";
    deterministic: true;
    maximumChainDepth: number;
    beamSearch: false;
    formula: string;
  };
  input: {
    team: string[];
    regulation: string;
    profile: "standard" | "trick-room";
    datasetId: string;
  };
  candidates: GoalOrientedCandidatePlan[];
  ranking: string[];
  computation: {
    candidateCount: number;
    futureComparisonCount: number;
    chainStepCount: number;
  };
};
