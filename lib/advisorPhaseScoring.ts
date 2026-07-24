import type { AdvisorBuildPhase } from "@/lib/advisorBuildPhase";
import type { AdvisorPartnerSynergy } from "@/lib/advisorPartnerSynergy";
import {
  buildAdvisorExplanationPresentation,
  type AdvisorExplanationPresentation
} from "@/lib/advisorExplanation";
import {
  deduplicateAdvisorEvidence,
  scoreAdvisorEvidence,
  type AdvisorEvidence,
  type AdvisorEvidenceDimension
} from "@/lib/advisorEvidence";
import type { AdvisorSwapPlan } from "@/lib/advisorSwapSimulator";

export type ProgressiveAdvisorMode =
  | "overall"
  | "defensive"
  | "offensive"
  | "role"
  | "typeSpecific";

export const PROGRESSIVE_ADVISOR_MODE_LABELS: Record<
  ProgressiveAdvisorMode,
  string
> = {
  overall: "総合",
  defensive: "防御補完",
  offensive: "攻撃補完",
  role: "役割補完",
  typeSpecific: "タイプ別"
};

/**
 * Every phase uses a single, bounded score card. TASK037 Evidence is mapped
 * once into these dimensions; a fact is never awarded in more than one phase
 * dimension.
 */
export const ADVISOR_PHASE_WEIGHTS = {
  partner: {
    defensiveMutuality: 30,
    offensiveMutuality: 20,
    roleComplement: 20,
    sharedWeaknessRisk: -20,
    majorMatchupRisk: -15,
    teammateSynergy: 5,
    environmentValidity: 5,
    normalizationBase: 80,
    scoreMinimum: 0,
    scoreMaximum: 100
  },
  coreCompletion: {
    sharedIssueImprovement: 25,
    defensiveImprovement: 20,
    offensiveImprovement: 20,
    roleImprovement: 15,
    targetCounterplay: 10,
    newRisk: -30,
    environmentValidity: 5,
    profileFit: 5,
    scoreMinimum: 0,
    scoreMaximum: 100
  },
  situationalCoverage: {
    primaryNeed: 30,
    targetCounterplay: 25,
    threatExpectation: 15,
    roleImprovement: 10,
    offensiveImprovement: 5,
    defensiveImprovement: 5,
    newRisk: -40,
    environmentValidity: 5,
    remainingSlotScarcity: 5,
    scoreMinimum: 0,
    scoreMaximum: 100
  },
  completeOptimization: {
    source: "TASK037-evidence-score",
    scoreMinimum: -40,
    scoreMaximum: 100
  }
} as const;

export type AdvisorPhaseScoreBreakdown = {
  primaryNeed: number;
  defensive: number;
  offensive: number;
  role: number;
  counterplay: number;
  threatExpectation: number;
  environment: number;
  profileFit: number;
  scarcity: number;
  riskPenalty: number;
};

export type ProgressiveAdvisorCandidate = {
  plan: AdvisorSwapPlan;
  phase: AdvisorBuildPhase;
  fitScore: number;
  modeScores: Record<ProgressiveAdvisorMode, number>;
  breakdown: AdvisorPhaseScoreBreakdown;
  reasonsByMode: Record<ProgressiveAdvisorMode, string[]>;
  explanationsByMode: Record<
    ProgressiveAdvisorMode,
    AdvisorExplanationPresentation
  >;
  cautions: string[];
  evidence: AdvisorEvidence[];
  partnerSynergy: AdvisorPartnerSynergy | null;
};

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function dimension(
  plan: AdvisorSwapPlan,
  name: AdvisorEvidenceDimension
): number {
  return plan.evidenceScore.dimensionTotals[name];
}

function positiveRatio(value: number, maximum: number): number {
  if (maximum <= 0) return 0;
  return Math.max(0, Math.min(1, value / maximum));
}

function riskMagnitude(plan: AdvisorSwapPlan): number {
  return Math.abs(Math.min(0, dimension(plan, "riskPenalty")));
}

function phaseText(value: string): string {
  return value
    .replaceAll("交換後", "追加後")
    .replaceAll("交換前後", "追加前後");
}

function getPartnerEvidence(
  plan: AdvisorSwapPlan,
  partner: AdvisorPartnerSynergy
): AdvisorEvidence[] {
  const sharedWeaknesses = new Set(partner.sharedWeaknesses);
  const reusablePlanEvidence = plan.evidence.filter((entry) => {
    // The partner analysis replaces TASK037's broad type-count deltas with
    // bidirectional, ability-aware defense and actual-move offense Evidence.
    if (
      entry.primaryDimension === "defensiveImprovement" ||
      entry.primaryDimension === "offensiveImprovement" ||
      entry.primaryDimension === "roleImprovement" ||
      entry.primaryDimension === "speedImprovement"
    ) {
      return false;
    }
    // A shared weakness is represented once by the partner-specific risk.
    return !(
      entry.id.startsWith("risk:type:") &&
      entry.type &&
      sharedWeaknesses.has(entry.type)
    );
  });
  return deduplicateAdvisorEvidence([
    ...partner.evidence,
    ...reusablePlanEvidence
  ]);
}

function getModeScores(
  fitScore: number,
  plan: AdvisorSwapPlan,
  breakdown: AdvisorPhaseScoreBreakdown,
  partner: AdvisorPartnerSynergy | null
): Record<ProgressiveAdvisorMode, number> {
  const defensiveSignal = partner
    ? positiveRatio(breakdown.defensive, 30)
    : positiveRatio(plan.evidenceScore.defensive, 65);
  const offensiveSignal = partner
    ? positiveRatio(breakdown.offensive, 20)
    : positiveRatio(plan.evidenceScore.offensive, 65);
  const roleSignal = partner
    ? positiveRatio(breakdown.role, 20)
    : positiveRatio(
        dimension(plan, "roleImprovement") +
          dimension(plan, "speedImprovement"),
        10
      );
  const blend = (signal: number) =>
    clamp(fitScore * 0.35 + signal * 100 * 0.65);
  return {
    overall: fitScore,
    defensive: blend(defensiveSignal),
    offensive: blend(offensiveSignal),
    role: blend(roleSignal),
    typeSpecific: fitScore
  };
}

function scorePartner(
  evidence: AdvisorEvidence[]
): {
  fitScore: number;
  breakdown: AdvisorPhaseScoreBreakdown;
} {
  const weights = ADVISOR_PHASE_WEIGHTS.partner;
  const evidenceScore = scoreAdvisorEvidence(evidence);
  const positivePoints = (
    predicate: (entry: AdvisorEvidence) => boolean
  ): number =>
    evidence
      .filter((entry) => entry.points > 0 && predicate(entry))
      .reduce((total, entry) => total + entry.points, 0);
  const negativeMagnitude = (
    predicate: (entry: AdvisorEvidence) => boolean
  ): number =>
    Math.abs(
      evidence
        .filter((entry) => entry.points < 0 && predicate(entry))
        .reduce((total, entry) => total + entry.points, 0)
    );
  const defensive =
    positiveRatio(
      positivePoints((entry) =>
        entry.id.startsWith("partner:") &&
        entry.primaryDimension === "defensiveImprovement"
      ),
      16
    ) * weights.defensiveMutuality;
  const offensive =
    positiveRatio(
      evidenceScore.dimensionTotals.offensiveImprovement +
        evidenceScore.dimensionTotals.targetCounterplay,
      40
    ) * weights.offensiveMutuality;
  const role =
    positiveRatio(
      positivePoints((entry) => entry.id.startsWith("partner:role:")),
      10
    ) * weights.roleComplement;
  const teammateSynergy = Math.min(
    weights.teammateSynergy,
    positivePoints((entry) => entry.id === "partner:teammate-synergy")
  );
  const environmentValidity = Math.min(
    weights.environmentValidity,
    positivePoints((entry) => entry.id === "environment:usage")
  );
  const sharedWeaknessRisk = Math.min(
    Math.abs(weights.sharedWeaknessRisk),
    negativeMagnitude((entry) => entry.id === "partner:shared-weakness")
  );
  const postChangeThreatRisk = Math.min(
    8,
    negativeMagnitude(
      (entry) => entry.id === "risk:post-swap-threat-summary"
    ) * 0.4
  );
  const megaOpportunityCost = Math.min(
    5,
    negativeMagnitude(
      (entry) => entry.id === "risk:mega-opportunity-cost"
    )
  );
  const redundancyRisk = Math.min(
    5,
    negativeMagnitude((entry) => entry.id.startsWith("redundancy:")) *
      0.25
  );
  const newWeaknessRisk = Math.min(
    2,
    Math.max(
      0,
      ...evidence
        .filter(
          (entry) =>
            entry.points < 0 && entry.id.startsWith("risk:type:")
        )
        .map((entry) => Math.abs(entry.points) * 0.1)
    )
  );
  const categorizedRiskIds = new Set([
    "partner:shared-weakness",
    "risk:post-swap-threat-summary",
    "risk:mega-opportunity-cost"
  ]);
  const otherMajorRisk = Math.min(
    3,
    negativeMagnitude(
      (entry) =>
        !categorizedRiskIds.has(entry.id) &&
        !entry.id.startsWith("redundancy:") &&
        !entry.id.startsWith("risk:type:")
    ) * 0.15
  );
  const majorMatchupRisk = Math.min(
    Math.abs(weights.majorMatchupRisk),
    postChangeThreatRisk +
      megaOpportunityCost +
      redundancyRisk +
      newWeaknessRisk +
      otherMajorRisk
  );
  const positive =
    defensive +
    offensive +
    role +
    teammateSynergy +
    environmentValidity;
  const riskPenalty = sharedWeaknessRisk + majorMatchupRisk;
  return {
    fitScore: clamp(
      ((positive - riskPenalty) / weights.normalizationBase) * 100
    ),
    breakdown: {
      primaryNeed: defensive,
      defensive,
      offensive,
      role,
      counterplay: 0,
      threatExpectation: 0,
      environment: teammateSynergy + environmentValidity,
      profileFit: 0,
      scarcity: 0,
      riskPenalty
    }
  };
}

function scoreCore(plan: AdvisorSwapPlan): {
  fitScore: number;
  breakdown: AdvisorPhaseScoreBreakdown;
} {
  const weights = ADVISOR_PHASE_WEIGHTS.coreCompletion;
  const primaryNeed =
    positiveRatio(dimension(plan, "teamIssueImprovement"), 15) *
    weights.sharedIssueImprovement;
  const defensive =
    positiveRatio(dimension(plan, "defensiveImprovement"), 10) *
    weights.defensiveImprovement;
  const offensive =
    positiveRatio(dimension(plan, "offensiveImprovement"), 10) *
    weights.offensiveImprovement;
  const role =
    positiveRatio(dimension(plan, "roleImprovement"), 5) *
    weights.roleImprovement;
  const counterplay =
    positiveRatio(dimension(plan, "targetCounterplay"), 30) *
    weights.targetCounterplay;
  const environment =
    positiveRatio(dimension(plan, "environmentValidity"), 5) *
    weights.environmentValidity;
  const profileFit =
    positiveRatio(dimension(plan, "speedImprovement"), 5) *
    weights.profileFit;
  const riskPenalty =
    positiveRatio(riskMagnitude(plan), 40) * Math.abs(weights.newRisk);
  return {
    fitScore: clamp(
      primaryNeed +
        defensive +
        offensive +
        role +
        counterplay +
        environment +
        profileFit -
        riskPenalty
    ),
    breakdown: {
      primaryNeed,
      defensive,
      offensive,
      role,
      counterplay,
      threatExpectation: 0,
      environment,
      profileFit,
      scarcity: 0,
      riskPenalty
    }
  };
}

function scoreSituational(
  plan: AdvisorSwapPlan,
  memberCount: number
): {
  fitScore: number;
  breakdown: AdvisorPhaseScoreBreakdown;
} {
  const weights = ADVISOR_PHASE_WEIGHTS.situationalCoverage;
  const targetRatio = positiveRatio(
    dimension(plan, "targetCounterplay"),
    30
  );
  const primaryNeed =
    positiveRatio(dimension(plan, "teamIssueImprovement"), 15) *
    weights.primaryNeed;
  const counterplay = targetRatio * weights.targetCounterplay;
  const threatExpectation =
    positiveRatio(dimension(plan, "postSwapThreatRisk"), 25) *
    weights.threatExpectation;
  const role =
    positiveRatio(dimension(plan, "roleImprovement"), 5) *
    weights.roleImprovement;
  const offensive =
    positiveRatio(dimension(plan, "offensiveImprovement"), 10) *
    weights.offensiveImprovement;
  const defensive =
    positiveRatio(dimension(plan, "defensiveImprovement"), 10) *
    weights.defensiveImprovement;
  const environment =
    positiveRatio(dimension(plan, "environmentValidity"), 5) *
    weights.environmentValidity;
  const scarcity =
    memberCount === 5 &&
    (targetRatio >= 0.25 || threatExpectation >= 5 || primaryNeed >= 10)
      ? weights.remainingSlotScarcity
      : memberCount === 4
        ? 3
        : 1;
  const riskPenalty =
    positiveRatio(riskMagnitude(plan), 40) * Math.abs(weights.newRisk);
  return {
    fitScore: clamp(
      primaryNeed +
        counterplay +
        threatExpectation +
        role +
        offensive +
        defensive +
        environment +
        scarcity -
        riskPenalty
    ),
    breakdown: {
      primaryNeed,
      defensive,
      offensive,
      role,
      counterplay,
      threatExpectation,
      environment,
      profileFit: 0,
      scarcity,
      riskPenalty
    }
  };
}

export function scoreAdvisorPhasePlan({
  phase,
  plan,
  memberCount,
  partnerSynergy = null
}: {
  phase: AdvisorBuildPhase;
  plan: AdvisorSwapPlan;
  memberCount: number;
  partnerSynergy?: AdvisorPartnerSynergy | null;
}): ProgressiveAdvisorCandidate {
  const evidence =
    phase === "partner" && partnerSynergy
      ? getPartnerEvidence(plan, partnerSynergy)
      : deduplicateAdvisorEvidence(plan.evidence);
  const scored =
    phase === "partner" && partnerSynergy
      ? scorePartner(evidence)
      : phase === "coreCompletion"
        ? scoreCore(plan)
        : phase === "situationalCoverage"
          ? scoreSituational(plan, memberCount)
          : {
              fitScore: clamp(plan.improvementScore),
              breakdown: {
                primaryNeed: 0,
                defensive: 0,
                offensive: 0,
                role: 0,
                counterplay: 0,
                threatExpectation: 0,
                environment: 0,
                profileFit: 0,
                scarcity: 0,
                riskPenalty: riskMagnitude(plan)
              }
            };
  const modeScores = getModeScores(
    scored.fitScore,
    plan,
    scored.breakdown,
    partnerSynergy
  );
  const explanationsByMode = Object.fromEntries(
    (
      [
        "overall",
        "defensive",
        "offensive",
        "role",
        "typeSpecific"
      ] as ProgressiveAdvisorMode[]
    ).map((mode) => [
      mode,
      buildAdvisorExplanationPresentation({
        phase,
        plan,
        mode,
        evidence
      })
    ])
  ) as Record<ProgressiveAdvisorMode, AdvisorExplanationPresentation>;
  const reasonsByMode = Object.fromEntries(
    (
      [
        "overall",
        "defensive",
        "offensive",
        "role",
        "typeSpecific"
      ] as ProgressiveAdvisorMode[]
    ).map((mode) => [
      mode,
      explanationsByMode[mode].primaryReasons
    ])
  ) as Record<ProgressiveAdvisorMode, string[]>;
  return {
    plan,
    phase,
    fitScore: scored.fitScore,
    modeScores,
    breakdown: scored.breakdown,
    reasonsByMode,
    explanationsByMode,
    cautions: explanationsByMode.overall.cautions.map(phaseText),
    evidence,
    partnerSynergy
  };
}

export function compareProgressiveCandidates(
  mode: ProgressiveAdvisorMode,
  left: ProgressiveAdvisorCandidate,
  right: ProgressiveAdvisorCandidate
): number {
  return (
    right.modeScores[mode] - left.modeScores[mode] ||
    right.fitScore - left.fitScore ||
    (right.plan.threatCoverage.candidateUsage ?? 0) -
      (left.plan.threatCoverage.candidateUsage ?? 0) ||
    left.plan.candidate.pokemon.speciesId -
      right.plan.candidate.pokemon.speciesId
  );
}
