import { CONTESTABILITY_CONFIG } from "@/lib/contestabilityConfig";
import type { AdvisorSwapPlan } from "@/lib/advisorSwapSimulator";
import type { BattleValueCandidate } from "@/types/battleValue";
import type {
  ContestabilityAxis,
  ContestabilityCandidate,
  ContestabilityReason
} from "@/types/contestability";
import type { EnvironmentPokemon } from "@/types/environmentData";
import type {
  BattleTagProfile,
  SemanticCandidateProfile
} from "@/types/semanticRecommendationGap";

const ROLE_NEED_TAGS = [
  "PriorityFinish",
  "Cleanup",
  "Pivot",
  "Setup",
  "WinCondition"
] as const;

const ANSWER_VALUES = {
  stableSwitch: 1,
  revengeKill: 0.82,
  softCheck: 0.42,
  coverageOnly: 0.16,
  notCounter: 0
} as const;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function presence(profile: SemanticCandidateProfile, tag: string): number {
  return (
    profile.tagProfiles[tag as keyof typeof profile.tagProfiles]
      ?.semanticPresence ?? 0
  );
}

function evidence(
  profile: SemanticCandidateProfile,
  predicate: (entry: BattleTagProfile["evidence"][number]) => boolean
): BattleTagProfile["evidence"] {
  return Object.values(profile.tagProfiles).flatMap((tag) =>
    tag.evidence.filter(predicate)
  );
}

function usageConfidence(rate: number | null): number {
  if (rate === null || rate < CONTESTABILITY_CONFIG.minimumUsageRate) {
    return 0;
  }
  return Math.min(
    1,
    Math.sqrt(rate / CONTESTABILITY_CONFIG.normalUsageConfidenceRate)
  );
}

function environmentAxis(plan: AdvisorSwapPlan): {
  score: number;
  usageConfidence: number;
} {
  const coverage = plan.recommendationThreatCoverage;
  const answers = coverage.threatAnswers.slice(
    0,
    CONTESTABILITY_CONFIG.evaluatedThreatLimit
  );
  const totalWeight = answers.reduce(
    (total, answer) => total + answer.importanceWeight,
    0
  );
  const matchupQuality =
    totalWeight === 0
      ? 0
      : answers.reduce(
          (total, answer) =>
            total +
            ANSWER_VALUES[answer.answerClass] * answer.importanceWeight,
          0
        ) / totalWeight;
  const defensiveAccess = Math.min(
    1,
    (plan.metrics.threatMoveImmunityCount * 1.5 +
      plan.metrics.threatMoveResistanceCount) /
      Math.max(8, answers.length * 1.5)
  );
  const confidence = usageConfidence(coverage.candidateUsage);
  return {
    score: clamp(
      matchupQuality * 28 + defensiveAccess * 12 + confidence * 60
    ),
    usageConfidence: confidence
  };
}

function matchupAxis(plan: AdvisorSwapPlan): {
  score: number;
  minimumJobRate: number;
  stableJobRate: number;
} {
  const answers = plan.recommendationThreatCoverage.threatAnswers.slice(
    0,
    CONTESTABILITY_CONFIG.evaluatedThreatLimit
  );
  if (answers.length === 0) {
    return { score: 0, minimumJobRate: 0, stableJobRate: 0 };
  }
  const minimumJobs = answers.filter(
    (answer) => answer.answerClass !== "notCounter"
  ).length;
  const stableJobs = answers.filter(
    (answer) =>
      answer.answerClass === "stableSwitch" ||
      answer.answerClass === "revengeKill"
  ).length;
  const pressureJobs = answers.filter((answer) =>
    answer.counterplayMethods.some(
      (method) =>
        method === "stable-switch" ||
        method === "priority" ||
        method === "outspeed" ||
        method === "offensive-pressure"
    )
  ).length;
  const failureLoad =
    answers.reduce(
      (total, answer) => total + Math.min(3, answer.failureReasons.length),
      0
    ) /
    (answers.length * 3);
  const directActionRate = Math.max(
    Math.min(1, plan.metrics.profileSpeedAdvantageCount / 4),
    plan.metrics.priorityMoveShare
  );
  const minimumJobRate = minimumJobs / answers.length;
  const stableJobRate = stableJobs / answers.length;
  return {
    score: clamp(
      plan.recommendationThreatCoverage.weightedThreatCoverage * 40 +
        minimumJobRate * 15 +
        stableJobRate * 35 +
        (pressureJobs / answers.length) * 20 -
        failureLoad * 10 +
        directActionRate * 30
    ),
    minimumJobRate,
    stableJobRate
  };
}

function teamAxis({
  plan,
  candidate,
  profile,
  teamProfiles
}: {
  plan: AdvisorSwapPlan;
  candidate: BattleValueCandidate;
  profile: SemanticCandidateProfile;
  teamProfiles: SemanticCandidateProfile[];
}): {
  score: number;
  roleNeedCoverage: number;
  roleOverlap: number;
} {
  const needScores = ROLE_NEED_TAGS.map((tag) => {
    const current = Math.max(
      0,
      ...teamProfiles.map((entry) => presence(entry, tag))
    );
    return Math.max(0, presence(profile, tag) - current * 0.65);
  });
  const roleNeedCoverage =
    needScores.reduce((total, value) => total + value, 0) /
    ROLE_NEED_TAGS.length;
  const candidateTags = new Set(
    profile.battleTags.filter((tag) => presence(profile, tag) >= 0.15)
  );
  const roleOverlap = Math.max(
    0,
    ...teamProfiles.map((member) => {
      const memberTags = new Set(
        member.battleTags.filter((tag) => presence(member, tag) >= 0.15)
      );
      const union = new Set([...candidateTags, ...memberTags]).size;
      const intersection = [...candidateTags].filter((tag) =>
        memberTags.has(tag)
      ).length;
      const tagOverlap = union === 0 ? 0 : intersection / union;
      const archetypeOverlap =
        profile.archetype.primary === member.archetype.primary ? 0.2 : 0;
      return Math.min(1, tagOverlap + archetypeOverlap);
    })
  );
  const planFit = Math.min(
    1,
    Math.max(
      0,
      Math.min(1, plan.metrics.issueReduction) * 0.18 +
        Math.min(1, plan.metrics.consistencyReduction) * 0.12 +
        Math.min(1, plan.metrics.defensiveImprovement) * 0.08 +
        Math.min(1, plan.metrics.offensiveImprovement) * 0.08 +
        Math.min(1, plan.metrics.speedRoleImprovement) * 0.18 +
        (plan.metrics.priorityMoveShare > 0.2 ? 0.18 : 0)
    )
  );
  const battleReadiness = Math.min(1, candidate.finalBattleValue / 45);
  const functionalNovelty = Math.min(
    1,
    plan.metrics.threatMoveImmunityCount / 5 +
      (plan.metrics.physicalAttackerImprovement > 0 ? 0.15 : 0) +
      (plan.metrics.specialAttackerImprovement > 0 ? 0.15 : 0)
  );
  const directActionFit =
    Math.max(
      Math.min(1, plan.metrics.profileSpeedAdvantageCount / 4),
      plan.metrics.priorityMoveShare
    ) *
    usageConfidence(plan.recommendationThreatCoverage.candidateUsage) **
      2;
  const speedAccessFit =
    Math.min(1, plan.metrics.profileSpeedAdvantageCount / 4) *
    usageConfidence(plan.recommendationThreatCoverage.candidateUsage) **
      2;
  return {
    score: clamp(
      32 +
        roleNeedCoverage * 30 +
        planFit * 30 +
        battleReadiness * 15 +
        functionalNovelty * 20 -
        roleOverlap * 6 +
        directActionFit * 25 +
        speedAccessFit * 10
    ),
    roleNeedCoverage,
    roleOverlap
  };
}

function reliabilityAxis({
  profile,
  environment,
  usage
}: {
  profile: SemanticCandidateProfile;
  environment: EnvironmentPokemon | null;
  usage: number | null;
}): { score: number; conditionality: number } {
  const activeTags = Object.values(profile.tagProfiles).filter(
    (tag) => tag.semanticPresence >= 0.1
  );
  const evidenceStrength =
    activeTags.length === 0
      ? 0
      : activeTags
          .map(
            (tag) => tag.maximumAdoptionRate * tag.averageConfidence
          )
          .sort((left, right) => right - left)
          .slice(0, 6)
          .reduce((total, value) => total + value, 0) /
        Math.min(6, activeTags.length);
  const focusSashShare =
    environment?.items.find((entry) => entry.id === "focussash")?.share ??
    0;
  const weatherShare = Math.min(
    1,
    evidence(
      profile,
      (entry) => entry.semanticCategory === "Weather"
    ).reduce((total, entry) => total + entry.adoptionRate, 0)
  );
  const conditionalPriorityShare = Math.min(
    1,
    evidence(
      profile,
      (entry) =>
        entry.entityKind === "move" &&
        CONTESTABILITY_CONFIG.conditionalPriorityMoveIds.includes(
          entry.entityId
        )
    ).reduce((total, entry) => total + entry.adoptionRate, 0)
  );
  const inaccurateMoveShare = Math.min(
    1,
    (environment?.moves ?? [])
      .filter((move) =>
        CONTESTABILITY_CONFIG.lowAccuracyMoveIds.includes(move.id)
      )
      .reduce((total, move) => total + move.share, 0) / 4
  );
  const setupDependency = Math.max(
    0,
    presence(profile, "Setup") -
      Math.max(
        presence(profile, "DefensiveAnchor"),
        presence(profile, "Tempo") * 0.6
      )
  );
  const conditionality = Math.min(
    1,
    focusSashShare * 0.28 +
      weatherShare * 0.28 +
      conditionalPriorityShare * 0.16 +
      setupDependency * 0.18 +
      inaccurateMoveShare * 0.22
  );
  return {
    score: clamp(
      42 +
        evidenceStrength * 22 +
        usageConfidence(usage) * 30 +
        (1 - profile.unclassifiedRate) * 7 -
        conditionality * 42
    ),
    conditionality
  };
}

function buildReasons(
  axes: Record<ContestabilityAxis, number>,
  diagnostics: ContestabilityCandidate["diagnostics"]
): ContestabilityReason[] {
  const reasons: ContestabilityReason[] = [];
  if (axes.environment >= 65) {
    reasons.push({
      axis: "environment",
      impact: "positive",
      text: "環境上位に対して、複数の対処手段を持っています。"
    });
  } else if (axes.environment < 45) {
    reasons.push({
      axis: "environment",
      impact: "caution",
      text: "環境上位へ安定して仕事をしにくいです。"
    });
  }
  if (diagnostics.roleNeedCoverage >= 0.15) {
    reasons.push({
      axis: "team",
      impact: "positive",
      text: "現在のチームに不足している役割を補えます。"
    });
  } else if (diagnostics.roleOverlap >= 0.65) {
    reasons.push({
      axis: "team",
      impact: "caution",
      text: "現在のチームでは役割が重複しやすいです。"
    });
  }
  if (diagnostics.stableJobRate >= 0.3) {
    reasons.push({
      axis: "matchup",
      impact: "positive",
      text: "主要な相手に対して、安定した対面処理を期待できます。"
    });
  } else if (diagnostics.minimumJobRate < 0.7) {
    reasons.push({
      axis: "matchup",
      impact: "caution",
      text: "主要な相手に完全に止められる対面があります。"
    });
  }
  if (axes.reliability >= 72) {
    reasons.push({
      axis: "reliability",
      impact: "positive",
      text: "条件に左右されにくく、安定した選出を期待できます。"
    });
  } else if (diagnostics.conditionality >= 0.2) {
    reasons.push({
      axis: "reliability",
      impact: "caution",
      text: "特定の条件や技構成への依存が大きい候補です。"
    });
  }
  return reasons.slice(0, 4);
}

export function analyzeContestabilityCandidate({
  plan,
  candidate,
  profile,
  teamProfiles,
  environment
}: {
  plan: AdvisorSwapPlan;
  candidate: BattleValueCandidate;
  profile: SemanticCandidateProfile;
  teamProfiles: SemanticCandidateProfile[];
  environment: EnvironmentPokemon | null;
}): ContestabilityCandidate {
  const environmentResult = environmentAxis(plan);
  const teamResult = teamAxis({
    plan,
    candidate,
    profile,
    teamProfiles
  });
  const matchupResult = matchupAxis(plan);
  const reliabilityResult = reliabilityAxis({
    profile,
    environment,
    usage: plan.recommendationThreatCoverage.candidateUsage
  });
  const axes = {
    environment: round(environmentResult.score),
    team: round(teamResult.score),
    matchup: round(matchupResult.score),
    reliability: round(reliabilityResult.score)
  };
  const score = round(
    (Object.keys(axes) as ContestabilityAxis[]).reduce(
      (total, axis) =>
        total +
        axes[axis] * CONTESTABILITY_CONFIG.axisWeights[axis],
      0
    )
  );
  const logistic =
    1 /
    (1 +
      Math.exp(
        -CONTESTABILITY_CONFIG.recommendationConfidenceSlope *
          (score - CONTESTABILITY_CONFIG.recommendationConfidenceMidpoint)
      ));
  const directActionAccess = Math.max(
    Math.min(1, plan.metrics.profileSpeedAdvantageCount / 4),
    plan.metrics.priorityMoveShare,
    matchupResult.stableJobRate
  );
  const recommendationConfidence = round(
    Math.min(
      CONTESTABILITY_CONFIG.recommendationConfidenceMaximum +
        CONTESTABILITY_CONFIG.directActionConfidenceBoost,
      CONTESTABILITY_CONFIG.recommendationConfidenceFloor +
        (CONTESTABILITY_CONFIG.recommendationConfidenceMaximum -
          CONTESTABILITY_CONFIG.recommendationConfidenceFloor) *
          logistic +
        directActionAccess *
          environmentResult.usageConfidence *
          CONTESTABILITY_CONFIG.directActionConfidenceBoost
    ),
    4
  );
  const diagnostics = {
    evaluatedThreatCount: Math.min(
      plan.recommendationThreatCoverage.threatAnswers.length,
      CONTESTABILITY_CONFIG.evaluatedThreatLimit
    ),
    minimumJobRate: round(matchupResult.minimumJobRate, 4),
    stableJobRate: round(matchupResult.stableJobRate, 4),
    roleNeedCoverage: round(teamResult.roleNeedCoverage, 4),
    roleOverlap: round(teamResult.roleOverlap, 4),
    usageConfidence: round(environmentResult.usageConfidence, 4),
    conditionality: round(reliabilityResult.conditionality, 4)
  };
  return {
    score,
    axes,
    reasons: buildReasons(axes, diagnostics),
    recommendationConfidence,
    diagnostics
  };
}
