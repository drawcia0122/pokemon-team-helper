import type { AdvisorBuildPhase } from "@/lib/advisorBuildPhase";
import {
  deduplicateAdvisorEvidence,
  type AdvisorEvidence,
  type AdvisorEvidenceDimension,
  type AdvisorEvidenceScope
} from "@/lib/advisorEvidence";
import type { AdvisorSwapPlan } from "@/lib/advisorSwapSimulator";
import { MIN_THREAT_USAGE_RATE } from "@/lib/teamThreats";

export type AdvisorExplanationMode =
  | "overall"
  | "defensive"
  | "offensive"
  | "role"
  | "speed"
  | "typeSpecific";

export type AdvisorExplanationPresentation = {
  label: "チーム全体の補完候補" | null;
  primaryReasons: string[];
  otherImprovements: string[];
  cautions: string[];
  hasDirectThreatEvidence: boolean;
  eligibleForPrimaryRecommendation: boolean;
  displayedEvidence: AdvisorEvidence[];
  hiddenEvidence: AdvisorEvidence[];
};

type AdvisorExplanationInput = {
  phase: AdvisorBuildPhase;
  plan: AdvisorSwapPlan;
  mode?: AdvisorExplanationMode;
  selectedThreatId?: string | null;
  evidence?: AdvisorEvidence[];
};

const PRIMARY_REASON_LIMIT = 3;
const OTHER_IMPROVEMENT_LIMIT = 3;
const CAUTION_LIMIT = 3;

const PARTNER_DIMENSION_PRIORITY: Record<
  AdvisorEvidenceDimension,
  number
> = {
  defensiveImprovement: 600,
  offensiveImprovement: 500,
  roleImprovement: 400,
  speedImprovement: 390,
  teamIssueImprovement: 300,
  targetCounterplay: 200,
  postSwapThreatRisk: 100,
  environmentValidity: 50,
  riskPenalty: 0
};

const CORE_DIMENSION_PRIORITY: Record<AdvisorEvidenceDimension, number> = {
  teamIssueImprovement: 700,
  defensiveImprovement: 600,
  offensiveImprovement: 590,
  roleImprovement: 580,
  speedImprovement: 570,
  targetCounterplay: 400,
  postSwapThreatRisk: 300,
  environmentValidity: 100,
  riskPenalty: 0
};

function evidenceKey(evidence: AdvisorEvidence): string {
  return `${evidence.displayText}:${
    evidence.targetThreatId ?? evidence.targetThreat ?? ""
  }`;
}

function uniqueEvidence(evidence: AdvisorEvidence[]): AdvisorEvidence[] {
  const selected = new Map<string, AdvisorEvidence>();
  for (const entry of evidence) {
    const key = evidenceKey(entry);
    if (!selected.has(key)) selected.set(key, entry);
  }
  return [...selected.values()];
}

function isDisplayableImprovement(evidence: AdvisorEvidence): boolean {
  return (
    evidence.primaryDimension !== "riskPenalty" &&
    evidence.primaryDimension !== "environmentValidity" &&
    (evidence.points > 0 ||
      (evidence.kind === "counterplay" &&
        Boolean(evidence.targetThreatId ?? evidence.targetThreat)))
  );
}

function isDirectThreatEvidence(
  evidence: AdvisorEvidence,
  selectedThreatId: string | null
): boolean {
  const targetThreatId =
    evidence.targetThreatId ?? evidence.targetThreat ?? null;
  if (!targetThreatId || evidence.kind !== "counterplay") return false;
  if (selectedThreatId) {
    return targetThreatId === selectedThreatId;
  }
  return evidence.scope === "current-top5";
}

function counterplayPriority(
  plan: AdvisorSwapPlan,
  evidence: AdvisorEvidence
): number {
  const targetThreatId =
    evidence.targetThreatId ?? evidence.targetThreat ?? null;
  const answer = plan.threatCoverage.threatAnswers.find(
    (entry) => entry.threatId === targetThreatId
  );
  if (answer?.answerClass === "stableSwitch") return 40;
  if (answer?.answerClass === "revengeKill") return 30;
  if (answer?.answerClass === "softCheck") return 20;
  return 0;
}

function scopePriority(
  phase: AdvisorBuildPhase,
  scope: AdvisorEvidenceScope | undefined
): number {
  if (phase === "partner") {
    if (scope === "phase-specific") return 700;
    if (scope === "team-general") return 500;
    if (scope === "current-top5") return 300;
    return 0;
  }
  if (phase === "coreCompletion") {
    if (scope === "team-general") return 700;
    if (scope === "current-top5") return 500;
    if (scope === "phase-specific") return 400;
    return 0;
  }
  if (phase === "situationalCoverage") {
    if (scope === "current-top5") return 800;
    if (scope === "phase-specific") return 500;
    if (scope === "team-general") return 400;
    return 0;
  }
  if (scope === "selected-threat") return 900;
  if (scope === "current-top5") return 700;
  if (scope === "team-general") return 400;
  return 0;
}

function dimensionPriority(
  phase: AdvisorBuildPhase,
  dimension: AdvisorEvidenceDimension
): number {
  if (phase === "partner") return PARTNER_DIMENSION_PRIORITY[dimension];
  if (phase === "coreCompletion") {
    return CORE_DIMENSION_PRIORITY[dimension];
  }
  if (phase === "situationalCoverage") {
    if (dimension === "targetCounterplay") return 700;
    if (dimension === "teamIssueImprovement") return 500;
    if (dimension === "roleImprovement") return 400;
    if (dimension === "offensiveImprovement") return 300;
    if (dimension === "defensiveImprovement") return 290;
    return 100;
  }
  if (dimension === "targetCounterplay") return 700;
  if (dimension === "teamIssueImprovement") return 400;
  return 300;
}

function isAllowedCaution(evidence: AdvisorEvidence): boolean {
  if (evidence.scope === "tracked-threat") return false;
  if (evidence.id.startsWith("risk:post-action-top5:")) {
    return (
      evidence.scope === "post-action-top5" &&
      evidence.afterRank !== null &&
      evidence.afterRank !== undefined &&
      evidence.afterRank <= 5 &&
      (evidence.beforeRank === null ||
        evidence.beforeRank === undefined ||
        evidence.beforeRank > 5) &&
      evidence.usageRate !== null &&
      evidence.usageRate !== undefined &&
      evidence.usageRate >= MIN_THREAT_USAGE_RATE
    );
  }
  if (evidence.id.startsWith("risk:threat-rank-rise:")) {
    return (
      evidence.scope === "post-action-top5" &&
      evidence.beforeRank !== null &&
      evidence.beforeRank !== undefined &&
      evidence.afterRank !== null &&
      evidence.afterRank !== undefined &&
      evidence.afterRank <= 5 &&
      evidence.afterRank < evidence.beforeRank &&
      (evidence.beforeRank - evidence.afterRank >= 3 ||
        (evidence.afterRank <= 5 && evidence.beforeRank > 5)) &&
      evidence.beforeScore !== null &&
      evidence.beforeScore !== undefined &&
      evidence.afterScore !== null &&
      evidence.afterScore !== undefined &&
      evidence.afterScore - evidence.beforeScore >= 3 &&
      evidence.usageRate !== null &&
      evidence.usageRate !== undefined &&
      evidence.usageRate >= MIN_THREAT_USAGE_RATE
    );
  }
  return (
    evidence.id.startsWith("risk:type:") ||
    evidence.id === "risk:mega-opportunity-cost" ||
    evidence.id.startsWith("risk:profile:") ||
    evidence.id === "partner:shared-weakness"
  );
}

function toSelectedThreatScope(
  evidence: AdvisorEvidence,
  selectedThreatId: string | null
): AdvisorEvidence {
  const targetThreatId =
    evidence.targetThreatId ?? evidence.targetThreat ?? null;
  return selectedThreatId && targetThreatId === selectedThreatId
    ? { ...evidence, scope: "selected-threat" }
    : evidence;
}

export function buildAdvisorExplanationPresentation({
  phase,
  plan,
  mode = "overall",
  selectedThreatId = null,
  evidence: rawEvidence = plan.evidence
}: AdvisorExplanationInput): AdvisorExplanationPresentation {
  const evidence = deduplicateAdvisorEvidence(rawEvidence).map((entry) =>
    toSelectedThreatScope(entry, selectedThreatId)
  );
  const directEvidence = evidence.filter((entry) =>
    isDirectThreatEvidence(entry, selectedThreatId)
  );
  const majorTeamIssueEvidence = evidence.filter(
    (entry) =>
      entry.primaryDimension === "teamIssueImprovement" &&
      entry.points > 0 &&
      entry.scope === "team-general"
  );
  const permitsTeamGeneral =
    mode === "typeSpecific" ||
    mode === "role" ||
    mode === "defensive" ||
    mode === "offensive" ||
    mode === "speed";
  const eligibleForPrimaryRecommendation =
    phase === "situationalCoverage" && mode === "overall"
      ? directEvidence.length > 0 || majorTeamIssueEvidence.length > 0
      : phase === "completeOptimization" && selectedThreatId
        ? directEvidence.length > 0
        : true;
  const label =
    phase === "situationalCoverage" &&
    directEvidence.length === 0 &&
    (majorTeamIssueEvidence.length > 0 || permitsTeamGeneral)
      ? "チーム全体の補完候補"
      : null;

  const rankedPrimary = evidence
    .filter((entry) => {
      if (!isDisplayableImprovement(entry)) return false;
      if (
        entry.scope === "tracked-threat" ||
        entry.scope === "post-action-top5"
      ) {
        return false;
      }
      if (phase === "completeOptimization" && selectedThreatId) {
        return isDirectThreatEvidence(entry, selectedThreatId);
      }
      if (phase === "situationalCoverage" && mode === "overall") {
        return (
          isDirectThreatEvidence(entry, null) ||
          entry.primaryDimension === "teamIssueImprovement"
        );
      }
      return true;
    })
    .sort(
      (left, right) =>
        scopePriority(phase, right.scope) -
          scopePriority(phase, left.scope) ||
        dimensionPriority(phase, right.primaryDimension) -
          dimensionPriority(phase, left.primaryDimension) ||
        counterplayPriority(plan, right) -
          counterplayPriority(plan, left) ||
        right.points - left.points ||
        left.id.localeCompare(right.id)
    );
  const primaryEvidence = uniqueEvidence(rankedPrimary).slice(
    0,
    PRIMARY_REASON_LIMIT
  );
  const primaryKeys = new Set(primaryEvidence.map(evidenceKey));
  const otherEvidence = uniqueEvidence(
    evidence
      .filter(
        (entry) =>
          isDisplayableImprovement(entry) &&
          entry.scope !== "tracked-threat" &&
          entry.scope !== "post-action-top5" &&
          !isDirectThreatEvidence(entry, selectedThreatId) &&
          !primaryKeys.has(evidenceKey(entry))
      )
      .sort(
        (left, right) =>
          right.points - left.points || left.id.localeCompare(right.id)
      )
  ).slice(0, OTHER_IMPROVEMENT_LIMIT);
  const cautionEvidence = uniqueEvidence(
    evidence
      .filter(isAllowedCaution)
      .sort(
        (left, right) =>
          Number(right.scope === "post-action-top5") -
            Number(left.scope === "post-action-top5") ||
          left.points - right.points ||
          left.id.localeCompare(right.id)
      )
  ).slice(0, CAUTION_LIMIT);
  const displayedKeys = new Set(
    [...primaryEvidence, ...otherEvidence, ...cautionEvidence].map(evidenceKey)
  );
  const battleValueReasons =
    mode === "overall" && !selectedThreatId
      ? plan.battleValueExplanation
      : [];
  const primaryReasons =
    battleValueReasons.length === 0
      ? primaryEvidence.map((entry) => entry.displayText)
      : [
          ...primaryEvidence
            .slice(0, Math.max(0, PRIMARY_REASON_LIMIT - 1))
            .map((entry) => entry.displayText),
          battleValueReasons[0]
        ];
  return {
    label,
    primaryReasons,
    otherImprovements: otherEvidence.map((entry) => entry.displayText),
    cautions: cautionEvidence.map((entry) => entry.displayText),
    hasDirectThreatEvidence: directEvidence.length > 0,
    eligibleForPrimaryRecommendation,
    displayedEvidence: [
      ...primaryEvidence,
      ...otherEvidence,
      ...cautionEvidence
    ],
    hiddenEvidence: evidence.filter(
      (entry) => !displayedKeys.has(evidenceKey(entry))
    )
  };
}
