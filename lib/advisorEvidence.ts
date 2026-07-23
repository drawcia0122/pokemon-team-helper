export type AdvisorEvidenceCategory =
  | "Defense"
  | "Offense"
  | "Speed"
  | "ThreatAnswers"
  | "Role"
  | "Risk"
  | "Environment";

export type AdvisorEvidence = {
  id: string;
  category: AdvisorEvidenceCategory;
  points: number;
  summary: string;
  source: "team-delta" | "threat-union" | "role-delta" | "environment";
};

export const ADVISOR_EVIDENCE_CAPS: Record<AdvisorEvidenceCategory, number> = {
  Defense: 28,
  Offense: 22,
  Speed: 12,
  ThreatAnswers: 34,
  Role: 18,
  Risk: 60,
  Environment: 4
};

export const ADVISOR_EVIDENCE_CATEGORY_ALLOCATION = {
  overall: {
    Defense: 1,
    Offense: 1,
    Speed: 1,
    ThreatAnswers: 1,
    Role: 1,
    Risk: 1,
    Environment: 1
  },
  defensive: {
    Defense: 1,
    Offense: 0,
    Speed: 0,
    ThreatAnswers: 0.35,
    Role: 0.7,
    Risk: 0.65,
    Environment: 0.2
  },
  offensive: {
    Defense: 0,
    Offense: 1,
    Speed: 0.2,
    ThreatAnswers: 0.45,
    Role: 0.7,
    Risk: 0.65,
    Environment: 0.2
  },
  speed: {
    Defense: 0,
    Offense: 0.25,
    Speed: 1,
    ThreatAnswers: 0.35,
    Role: 0.35,
    Risk: 0.35,
    Environment: 0.15
  },
  typeSpecific: {
    Defense: 0.75,
    Offense: 0.75,
    Speed: 0,
    ThreatAnswers: 0.25,
    Role: 0.2,
    Risk: 0.65,
    Environment: 0.1
  }
} as const;

export type AdvisorEvidenceScore = {
  categoryTotals: Record<AdvisorEvidenceCategory, number>;
  overall: number;
  defensive: number;
  offensive: number;
  speed: number;
  typeSpecific: number;
};

function capCategory(
  category: AdvisorEvidenceCategory,
  value: number
): number {
  const cap = ADVISOR_EVIDENCE_CAPS[category];
  if (category === "Risk") return Math.max(-cap, Math.min(0, value));
  return Math.max(0, Math.min(cap, value));
}

export function scoreAdvisorEvidence(
  evidence: AdvisorEvidence[]
): AdvisorEvidenceScore {
  const categoryTotals = Object.fromEntries(
    (Object.keys(ADVISOR_EVIDENCE_CAPS) as AdvisorEvidenceCategory[]).map(
      (category) => {
        const total = evidence
          .filter((entry) => entry.category === category)
          .reduce((sum, entry) => sum + entry.points, 0);
        return [category, capCategory(category, total)];
      }
    )
  ) as Record<AdvisorEvidenceCategory, number>;

  const scoreFor = (
    allocation: Record<AdvisorEvidenceCategory, number>
  ): number =>
    Math.round(
      Object.entries(allocation).reduce(
        (total, [category, multiplier]) =>
          total +
          categoryTotals[category as AdvisorEvidenceCategory] * multiplier,
        0
      )
    );

  return {
    categoryTotals,
    overall: Math.max(-100, Math.min(100, scoreFor(ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.overall))),
    defensive: scoreFor(ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.defensive),
    offensive: scoreFor(ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.offensive),
    speed: scoreFor(ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.speed),
    typeSpecific: scoreFor(ADVISOR_EVIDENCE_CATEGORY_ALLOCATION.typeSpecific)
  };
}

export function getAdvisorEvidenceReasons(
  evidence: AdvisorEvidence[],
  category: keyof typeof ADVISOR_EVIDENCE_CATEGORY_ALLOCATION,
  limit = 3
): string[] {
  const allocation = ADVISOR_EVIDENCE_CATEGORY_ALLOCATION[category];
  const explanationPriority = (
    evidenceCategory: AdvisorEvidenceCategory
  ): number => {
    if (category === "defensive") {
      if (evidenceCategory === "ThreatAnswers") return 200;
      if (evidenceCategory === "Role") return 100;
    }
    if (category === "offensive" && evidenceCategory === "ThreatAnswers") {
      return 150;
    }
    if (category === "speed" && evidenceCategory === "Speed") return 150;
    return 0;
  };
  return evidence
    .filter(
      (entry) =>
        entry.points > 0 && allocation[entry.category] > 0
    )
    .sort(
      (left, right) =>
        explanationPriority(right.category) -
          explanationPriority(left.category) ||
        right.points * allocation[right.category] -
          left.points * allocation[left.category] ||
        left.id.localeCompare(right.id)
    )
    .slice(0, limit)
    .map((entry) => entry.summary);
}
