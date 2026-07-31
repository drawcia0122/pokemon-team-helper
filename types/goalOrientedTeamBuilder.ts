import type { AdvisorEvidenceConfidence } from "@/lib/advisorEvidence";

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

export type TeamBuilderGoalInference = {
  goal: TeamBuilderGoal;
  label: string;
  score: number;
  confidence: AdvisorEvidenceConfidence;
  missingAxes: TeamBuilderCoreAxis[];
  evidence: string[];
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
  reasons: string[];
};

export type GoalOrientedCandidatePlan = {
  schemaVersion: 1;
  candidateSlug: string;
  inferredGoals: TeamBuilderGoalInference[];
  selectedGoal: TeamBuilderGoalInference;
  goalAffinity: number;
  currentFit: number;
  futurePotential: number;
  currentCoreQuality: TeamBuilderCoreQuality;
  coreQuality: TeamBuilderCoreQuality;
  deadEndRisk: number;
  goalScore: number;
  nextCandidates: TeamBuilderChainStep[];
  chain: TeamBuilderChainStep[];
  explanations: string[];
  cautions: string[];
  remainingSlotsAfterCandidate: number;
  evaluatedFutureCandidateCount: number;
};

export type GoalOrientedTeamBuilderResult = {
  metadata: {
    schemaVersion: 1;
    mode: "core-goal-planning";
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
