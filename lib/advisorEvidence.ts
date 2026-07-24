import type { TypeName } from "@/types/pokemon";

export type AdvisorEvidenceDimension =
  | "targetCounterplay"
  | "postSwapThreatRisk"
  | "teamIssueImprovement"
  | "defensiveImprovement"
  | "offensiveImprovement"
  | "speedImprovement"
  | "roleImprovement"
  | "environmentValidity"
  | "riskPenalty";

export type AdvisorEvidenceConfidence = "high" | "medium" | "low";

export type AdvisorEvidenceScope =
  | "selected-threat"
  | "current-top5"
  | "post-action-top5"
  | "tracked-threat"
  | "phase-specific"
  | "team-general";

export type AdvisorEvidence = {
  id: string;
  kind:
    | "counterplay"
    | "threat-delta"
    | "issue-delta"
    | "type-delta"
    | "offense-delta"
    | "speed-delta"
    | "role-delta"
    | "environment"
    | "risk";
  source: "team-delta" | "threat-union" | "role-delta" | "environment";
  primaryDimension: AdvisorEvidenceDimension;
  points: number;
  displayText: string;
  confidence: AdvisorEvidenceConfidence;
  scope?: AdvisorEvidenceScope;
  targetThreatId?: string | null;
  beforeRank?: number | null;
  afterRank?: number | null;
  beforeScore?: number | null;
  afterScore?: number | null;
  usageRate?: number | null;
  /**
   * Kept for TASK037 compatibility. New explanation code reads
   * `targetThreatId`.
   */
  targetThreat?: string;
  affectedTeamMembers?: string[];
  move?: string;
  ability?: string;
  type?: TypeName;
  beforeValue?: number;
  afterValue?: number;
};

function inferAdvisorEvidenceScope(
  evidence: AdvisorEvidence
): AdvisorEvidenceScope {
  if (evidence.targetThreatId || evidence.targetThreat) {
    return "tracked-threat";
  }
  if (evidence.source === "threat-union") {
    return "tracked-threat";
  }
  return "team-general";
}

export function normalizeAdvisorEvidence(
  evidence: AdvisorEvidence
): AdvisorEvidence {
  return {
    ...evidence,
    scope: evidence.scope ?? inferAdvisorEvidenceScope(evidence),
    targetThreatId:
      evidence.targetThreatId ?? evidence.targetThreat ?? null,
    beforeRank: evidence.beforeRank ?? null,
    afterRank: evidence.afterRank ?? null,
    beforeScore: evidence.beforeScore ?? null,
    afterScore: evidence.afterScore ?? null,
    usageRate: evidence.usageRate ?? null
  };
}

/**
 * All recommendation scores use this single scale.  In particular,
 * targetCounterplay is not added again as a separate "coverage score".
 */
export const ADVISOR_EVIDENCE_CAPS: Record<
  AdvisorEvidenceDimension,
  number
> = {
  targetCounterplay: 30,
  postSwapThreatRisk: 25,
  teamIssueImprovement: 15,
  defensiveImprovement: 10,
  offensiveImprovement: 10,
  speedImprovement: 5,
  roleImprovement: 5,
  environmentValidity: 5,
  riskPenalty: 40
};

export const ADVISOR_EVIDENCE_ITEM_CAPS: Record<
  AdvisorEvidenceDimension,
  number
> = {
  targetCounterplay: 15,
  postSwapThreatRisk: 15,
  teamIssueImprovement: 10,
  defensiveImprovement: 8,
  offensiveImprovement: 8,
  speedImprovement: 5,
  roleImprovement: 5,
  environmentValidity: 5,
  riskPenalty: 20
};

export const ADVISOR_EVIDENCE_CATEGORY_ALLOCATION = {
  overall: {
    targetCounterplay: 1,
    postSwapThreatRisk: 1,
    teamIssueImprovement: 1,
    defensiveImprovement: 1,
    offensiveImprovement: 1,
    speedImprovement: 1,
    roleImprovement: 1,
    environmentValidity: 1,
    riskPenalty: 1
  },
  defensive: {
    targetCounterplay: 0.4,
    postSwapThreatRisk: 0.65,
    teamIssueImprovement: 0.55,
    defensiveImprovement: 1,
    offensiveImprovement: 0,
    speedImprovement: 0,
    roleImprovement: 0.6,
    environmentValidity: 0.2,
    riskPenalty: 0.8
  },
  offensive: {
    targetCounterplay: 0.65,
    postSwapThreatRisk: 0.45,
    teamIssueImprovement: 0.35,
    defensiveImprovement: 0,
    offensiveImprovement: 1,
    speedImprovement: 0.25,
    roleImprovement: 0.45,
    environmentValidity: 0.2,
    riskPenalty: 0.8
  },
  speed: {
    targetCounterplay: 0.55,
    postSwapThreatRisk: 0.35,
    teamIssueImprovement: 0.25,
    defensiveImprovement: 0,
    offensiveImprovement: 0.2,
    speedImprovement: 1,
    roleImprovement: 0.35,
    environmentValidity: 0.15,
    riskPenalty: 0.65
  },
  typeSpecific: {
    targetCounterplay: 0.55,
    postSwapThreatRisk: 0.55,
    teamIssueImprovement: 0.45,
    defensiveImprovement: 0.75,
    offensiveImprovement: 0.75,
    speedImprovement: 0,
    roleImprovement: 0.25,
    environmentValidity: 0.1,
    riskPenalty: 0.8
  }
} as const;

export type AdvisorEvidenceScore = {
  dimensionTotals: Record<AdvisorEvidenceDimension, number>;
  overall: number;
  defensive: number;
  offensive: number;
  speed: number;
  typeSpecific: number;
};

export function deduplicateAdvisorEvidence(
  evidence: AdvisorEvidence[]
): AdvisorEvidence[] {
  const byId = new Map<string, AdvisorEvidence>();
  for (const entry of evidence) {
    const itemCap = ADVISOR_EVIDENCE_ITEM_CAPS[entry.primaryDimension];
    const cappedPoints =
      entry.primaryDimension === "riskPenalty"
        ? Math.max(-itemCap, Math.min(0, entry.points))
        : Math.max(0, Math.min(itemCap, entry.points));
    const normalized = normalizeAdvisorEvidence({
      ...entry,
      points: cappedPoints
    });
    const current = byId.get(entry.id);
    if (!current || Math.abs(normalized.points) > Math.abs(current.points)) {
      byId.set(entry.id, normalized);
    }
  }
  return [...byId.values()];
}

function capDimension(
  dimension: AdvisorEvidenceDimension,
  value: number
): number {
  const cap = ADVISOR_EVIDENCE_CAPS[dimension];
  if (dimension === "riskPenalty") {
    return Math.max(-cap, Math.min(0, value));
  }
  return Math.max(0, Math.min(cap, value));
}

export function scoreAdvisorEvidence(
  rawEvidence: AdvisorEvidence[]
): AdvisorEvidenceScore {
  const evidence = deduplicateAdvisorEvidence(rawEvidence);
  const dimensionTotals = Object.fromEntries(
    (Object.keys(ADVISOR_EVIDENCE_CAPS) as AdvisorEvidenceDimension[]).map(
      (dimension) => {
        const total = evidence
          .filter((entry) => entry.primaryDimension === dimension)
          .reduce((sum, entry) => sum + entry.points, 0);
        return [dimension, capDimension(dimension, total)];
      }
    )
  ) as Record<AdvisorEvidenceDimension, number>;

  const scoreFor = (
    allocation: Record<AdvisorEvidenceDimension, number>
  ): number =>
    Math.round(
      Object.entries(allocation).reduce(
        (total, [dimension, multiplier]) =>
          total +
          dimensionTotals[dimension as AdvisorEvidenceDimension] * multiplier,
        0
      )
    );

  return {
    dimensionTotals,
    overall: Math.max(
      -40,
      Math.min(
        100,
        scoreFor(ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.overall)
      )
    ),
    defensive: scoreFor(ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.defensive),
    offensive: scoreFor(ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.offensive),
    speed: scoreFor(ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.speed),
    typeSpecific: scoreFor(
      ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.typeSpecific
    )
  };
}

export function selectAdvisorEvidence(
  rawEvidence: AdvisorEvidence[],
  category: keyof typeof ADVISOR_EVIDENCE_CATEGORY_ALLOCATION,
  limit = 3
): AdvisorEvidence[] {
  const evidence = deduplicateAdvisorEvidence(rawEvidence);
  const allocation = ADVISOR_EVIDENCE_CATEGORY_ALLOCATION[category];
  const dimensionPriority = (
    dimension: AdvisorEvidenceDimension
  ): number => {
    if (category === "defensive") {
      if (dimension === "roleImprovement") return 300;
      if (dimension === "targetCounterplay") return 250;
      if (dimension === "defensiveImprovement") return 200;
      if (dimension === "postSwapThreatRisk") return 150;
    }
    if (category === "offensive") {
      if (dimension === "targetCounterplay") return 250;
      if (dimension === "offensiveImprovement") return 200;
    }
    if (category === "speed" && dimension === "speedImprovement") {
      return 250;
    }
    return 0;
  };
  const ranked = evidence
    .filter(
      (entry) =>
        entry.points > 0 && allocation[entry.primaryDimension] > 0
    )
    .sort(
      (left, right) =>
        dimensionPriority(right.primaryDimension) -
          dimensionPriority(left.primaryDimension) ||
        right.points * allocation[right.primaryDimension] -
          left.points * allocation[left.primaryDimension] ||
        left.id.localeCompare(right.id)
    );
  const selected: AdvisorEvidence[] = [];
  const dimensionCounts = new Map<AdvisorEvidenceDimension, number>();
  for (const entry of ranked) {
    const count = dimensionCounts.get(entry.primaryDimension) ?? 0;
    const perDimensionLimit =
      category === "overall" || category === "typeSpecific" ? limit : 1;
    if (count >= perDimensionLimit) continue;
    selected.push(entry);
    dimensionCounts.set(entry.primaryDimension, count + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function getAdvisorEvidenceReasons(
  rawEvidence: AdvisorEvidence[],
  category: keyof typeof ADVISOR_EVIDENCE_CATEGORY_ALLOCATION,
  limit = 3
): string[] {
  return selectAdvisorEvidence(rawEvidence, category, limit).map(
    (entry) => entry.displayText
  );
}
