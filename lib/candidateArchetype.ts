import type { BattleTag } from "@/types/semanticCombat";
import type {
  BattleTagProfile,
  CandidateArchetype,
  CandidateArchetypeName
} from "@/types/semanticRecommendationGap";

const ARCHETYPE_TAGS = {
  Breaker: ["WallBreak", "Trade", "Tempo"],
  Cleaner: ["Cleanup", "PriorityFinish", "RevengeKill"],
  "Setup Sweeper": ["Setup", "WinCondition", "Snowball"],
  Trapper: ["Trade", "Tempo", "Utility"],
  Pivot: ["Pivot", "Tempo", "Utility"],
  "Defensive Anchor": ["DefensiveAnchor", "Utility", "HazardRemoval"],
  "Hazard Control": ["HazardSetter", "HazardRemoval", "Tempo"]
} as const satisfies Record<
  Exclude<CandidateArchetypeName, "Hybrid" | "Unclassified Archetype">,
  readonly BattleTag[]
>;

type ScoredArchetype = keyof typeof ARCHETYPE_TAGS;

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function classifyCandidateArchetype(
  tags: Record<BattleTag, BattleTagProfile>,
  hasTrapSemantic: boolean
): CandidateArchetype {
  const scores = Object.fromEntries(
    Object.entries(ARCHETYPE_TAGS).map(([name, requiredTags]) => {
      let score =
        requiredTags.reduce(
          (total, tag) => total + tags[tag].semanticPresence,
          0
        ) / requiredTags.length;
      if (name === "Trapper" && hasTrapSemantic) score = Math.max(score, 0.75);
      return [name, round(score)];
    })
  ) as CandidateArchetype["scores"];
  const ranked = (Object.entries(scores) as Array<[ScoredArchetype, number]>)
    .sort(
      ([leftName, leftScore], [rightName, rightScore]) =>
        rightScore - leftScore || leftName.localeCompare(rightName)
    );
  const matched = ranked
    .filter(([, score]) => score >= 0.25)
    .map(([name]) => name);
  const [first, second] = ranked;
  let primary: CandidateArchetypeName = "Unclassified Archetype";
  if (first && first[1] >= 0.25) {
    primary =
      second && second[1] >= 0.35 && first[1] - second[1] <= 0.08
        ? "Hybrid"
        : first[0];
  }
  return {
    primary,
    scores,
    matched,
    hasTrapSemantic
  };
}
