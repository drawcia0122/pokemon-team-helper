import moveMetadataData from "@/data/environment/moveMetadata.json";
import {
  analyzeRecommendationPlan,
  emptyRecommendationContributionRecord,
  getBestRecommendationPlansBySlug,
  RECOMMENDATION_CONTRIBUTION_CATEGORIES,
  type RecommendationCandidateAnalysis,
  type RecommendationContributionCategory
} from "@/lib/recommendationContribution";
import { getAdvisorMovePower } from "@/lib/advisorMoveQuality";
import {
  analyzeSemanticRecommendationGap,
  formatSemanticRecommendationGapReport
} from "@/lib/semanticRecommendationGap";
import type { AdvisorSwapPlan } from "@/lib/advisorSwapSimulator";
import type {
  EnvironmentPokemon,
  EnvironmentSnapshot
} from "@/types/environmentData";
import type {
  EnvironmentMoveMetadataRegistry,
  ThreatEnvironmentDataset
} from "@/types/environmentThreat";
import type { PokemonEntry } from "@/types/pokemon";
import type {
  SemanticCandidateProfile,
  SemanticRecommendationGapAnalysis
} from "@/types/semanticRecommendationGap";
export {
  analyzeRecommendationPlan,
  RECOMMENDATION_CONTRIBUTION_CATEGORIES
} from "@/lib/recommendationContribution";
export type {
  RecommendationCandidateAnalysis,
  RecommendationContributionCategory,
  RecommendationContributionEvidence
} from "@/lib/recommendationContribution";

export const BATTLE_CANDIDATE_SIGNALS = [
  "setupMove",
  "highPowerPriority",
  "offensiveAbility",
  "trapping",
  "highSpeed",
  "highPower",
  "pivot",
  "tradeMove"
] as const;

export type BattleCandidateSignal =
  (typeof BATTLE_CANDIDATE_SIGNALS)[number];

export const REPRESENTATIVE_RECOMMENDATION_SLUGS = [
  "gengar-mega",
  "starmie-mega",
  "lucario-mega",
  "blaziken-mega",
  "lopunny-mega",
  "kingambit",
  "volcarona",
  "dragapult",
  "jolteon",
  "sylveon"
] as const;

export type RecommendationAnalyzerContext = {
  team: string[];
  regulation: string;
  profile: "standard" | "trick-room";
  datasetId: string;
  period: string;
  ratingCutoff: number;
};


export type BattleCandidateAnalysis = {
  slug: string;
  name: string;
  usageRank: number;
  usageRate: number;
  signals: Record<BattleCandidateSignal, string[]>;
  signalCount: number;
  signalStars: string;
  recommendationRank: number | null;
  speciesRank: number | null;
};

export type RecommendationOutlier = {
  slug: string;
  name: string;
  recommendationRank: number | null;
  recommendationScore: number | null;
  signalCount: number;
  signalStars: string;
  reasons: string[];
};

export type RecommendationAnalyzerResult = {
  metadata: SemanticRecommendationGapAnalysis["metadata"];
  input: RecommendationAnalyzerContext;
  context: RecommendationAnalyzerContext;
  candidates: RecommendationCandidateAnalysis[];
  recommendationRanking: RecommendationCandidateAnalysis[];
  recommendationTop20: RecommendationCandidateAnalysis[];
  contributionAverages: Record<RecommendationContributionCategory, number>;
  contributionSummary: Record<RecommendationContributionCategory, number>;
  battleCandidates: BattleCandidateAnalysis[];
  underestimatedCandidates: RecommendationOutlier[];
  overestimatedCandidates: RecommendationOutlier[];
  representativeComparison: Array<{
    slug: string;
    candidate: RecommendationCandidateAnalysis | null;
    battleCandidate: BattleCandidateAnalysis | null;
    semanticProfile: SemanticCandidateProfile | null;
  }>;
  datasetSummary: SemanticRecommendationGapAnalysis["datasetSummary"];
  representationMap: SemanticRecommendationGapAnalysis["representationMap"];
  semanticProfiles: SemanticRecommendationGapAnalysis["semanticProfiles"];
  battleTagSummary: SemanticRecommendationGapAnalysis["battleTagSummary"];
  archetypeSummary: SemanticRecommendationGapAnalysis["archetypeSummary"];
  semanticGapRanking: SemanticRecommendationGapAnalysis["semanticGapRanking"];
  semanticUnderestimationCandidates: SemanticRecommendationGapAnalysis["semanticUnderestimationCandidates"];
  staticSupportCandidates: SemanticRecommendationGapAnalysis["staticSupportCandidates"];
  riskDominatedCandidates: SemanticRecommendationGapAnalysis["riskDominatedCandidates"];
  contributionInvestigation: SemanticRecommendationGapAnalysis["contributionInvestigation"];
  unclassifiedSummary: SemanticRecommendationGapAnalysis["unclassifiedSummary"];
};

const SETUP_MOVE_IDS = new Set([
  "swordsdance",
  "nastyplot",
  "dragondance",
  "calmmind",
  "bulkup",
  "shellsmash",
  "quiverdance",
  "coil",
  "agility",
  "rockpolish",
  "shiftgear",
  "growth",
  "bellydrum"
]);

const PRIORITY_MOVE_IDS = new Set([
  "suckerpunch",
  "extremespeed",
  "bulletpunch",
  "aquajet",
  "machpunch",
  "iceshard",
  "shadowsneak",
  "accelerock",
  "jetpunch",
  "quickattack",
  "vacuumwave",
  "firstimpression"
]);

const OFFENSIVE_ABILITY_IDS = new Set([
  "hugepower",
  "purepower",
  "adaptability",
  "toughclaws",
  "sheerforce",
  "technician",
  "supremeoverlord",
  "moxie",
  "beastboost",
  "speedboost",
  "pixilate",
  "aerilate",
  "refrigerate",
  "galvanize",
  "transistor",
  "dragonsmaw",
  "gorillatactics",
  "sharpness",
  "strongjaw",
  "megalauncher"
]);

const POWER_MULTIPLIER_ABILITY_IDS = new Set([
  "hugepower",
  "purepower",
  "adaptability",
  "toughclaws",
  "sheerforce",
  "technician",
  "pixilate",
  "aerilate",
  "refrigerate",
  "galvanize",
  "transistor",
  "dragonsmaw",
  "gorillatactics",
  "sharpness",
  "strongjaw",
  "megalauncher"
]);

const HIGH_IMPACT_POWER_ABILITY_IDS = new Set([
  "hugepower",
  "purepower",
  "adaptability",
  "toughclaws",
  "sheerforce",
  "gorillatactics"
]);

const TRAPPING_ABILITY_IDS = new Set([
  "shadowtag",
  "arenatrap",
  "magnetpull"
]);

const TRAPPING_MOVE_IDS = new Set([
  "meanlook",
  "block",
  "spiderweb",
  "anchorshot",
  "spiritshackle",
  "infestation",
  "whirlpool",
  "firespin",
  "sandtomb"
]);

const PIVOT_MOVE_IDS = new Set([
  "uturn",
  "voltswitch",
  "flipturn",
  "partingshot",
  "chillyreception",
  "teleport"
]);

const TRADE_MOVE_IDS = new Set([
  "destinybond",
  "finalgambit",
  "explosion",
  "selfdestruct",
  "mistyexplosion",
  "endeavor",
  "counter",
  "mirrorcoat",
  "metalburst",
  "memento"
]);

const ADOPTED_SHARE = 0.1;
const HIGH_SPEED = 120;
const HIGH_ATTACKING_STAT = 140;
const moveMetadata = moveMetadataData as EnvironmentMoveMetadataRegistry;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function relevantAttackStat(
  pokemon: PokemonEntry,
  move: EnvironmentPokemon["moves"][number]
): number {
  const stats = pokemon.baseStats;
  if (!stats) return 0;
  const damageClass = moveMetadata.moves[move.id]?.damageClass;
  if (damageClass === "physical") return stats.attack;
  if (damageClass === "special") return stats.specialAttack;
  if (damageClass === "status") return 0;
  return Math.max(stats.attack, stats.specialAttack);
}

function addSignal(
  signals: Record<BattleCandidateSignal, string[]>,
  signal: BattleCandidateSignal,
  details: string[]
): void {
  if (details.length > 0) signals[signal].push(...details);
}

function detectBattleCandidate(
  pokemon: PokemonEntry,
  environment: EnvironmentPokemon,
  recommendation:
    | Pick<RecommendationCandidateAnalysis, "rank" | "speciesRank">
    | undefined
): BattleCandidateAnalysis | null {
  const signals = Object.fromEntries(
    BATTLE_CANDIDATE_SIGNALS.map((signal) => [signal, [] as string[]])
  ) as Record<BattleCandidateSignal, string[]>;
  const adoptedMoves = environment.moves.filter(
    (move) => move.share >= ADOPTED_SHARE
  );
  const adoptedAbilities = environment.abilities.filter(
    (ability) => ability.share >= ADOPTED_SHARE
  );
  const offensiveAbilities = adoptedAbilities.filter((ability) =>
    OFFENSIVE_ABILITY_IDS.has(ability.id)
  );
  const powerMultiplierAbility = offensiveAbilities.some((ability) =>
    POWER_MULTIPLIER_ABILITY_IDS.has(ability.id)
  );
  const highImpactPowerAbility = offensiveAbilities.some((ability) =>
    HIGH_IMPACT_POWER_ABILITY_IDS.has(ability.id)
  );

  addSignal(
    signals,
    "setupMove",
    adoptedMoves
      .filter((move) => SETUP_MOVE_IDS.has(move.id))
      .map((move) => `${move.id} ${round(move.share * 100, 1)}%`)
  );
  addSignal(
    signals,
    "offensiveAbility",
    offensiveAbilities.map(
      (ability) => `${ability.id} ${round(ability.share * 100, 1)}%`
    )
  );
  addSignal(
    signals,
    "trapping",
    [
      ...adoptedAbilities
        .filter((ability) => TRAPPING_ABILITY_IDS.has(ability.id))
        .map((ability) => `${ability.id} ${round(ability.share * 100, 1)}%`),
      ...adoptedMoves
        .filter((move) => TRAPPING_MOVE_IDS.has(move.id))
        .map((move) => `${move.id} ${round(move.share * 100, 1)}%`)
    ]
  );
  if ((pokemon.baseStats?.speed ?? 0) >= HIGH_SPEED) {
    signals.highSpeed.push(`S${pokemon.baseStats?.speed}`);
  }
  const maxAttackingStat = Math.max(
    pokemon.baseStats?.attack ?? 0,
    pokemon.baseStats?.specialAttack ?? 0
  );
  const adoptedStrongMoves = adoptedMoves.filter(
    (move) =>
      (getAdvisorMovePower(move.id) ?? 0) >= 110 &&
      relevantAttackStat(pokemon, move) >= 110
  );
  if (
    maxAttackingStat >= HIGH_ATTACKING_STAT ||
    (highImpactPowerAbility && maxAttackingStat >= 100) ||
    (powerMultiplierAbility && maxAttackingStat >= 120) ||
    adoptedStrongMoves.length > 0
  ) {
    signals.highPower.push(
      `A${pokemon.baseStats?.attack ?? "?"}/C${pokemon.baseStats?.specialAttack ?? "?"}`,
      ...adoptedStrongMoves.map(
        (move) => `${move.id} ${round(move.share * 100, 1)}%`
      )
    );
  }
  addSignal(
    signals,
    "highPowerPriority",
    adoptedMoves
      .filter((move) => {
        if (!PRIORITY_MOVE_IDS.has(move.id)) return false;
        const power = getAdvisorMovePower(move.id) ?? 0;
        const attackStat = relevantAttackStat(pokemon, move);
        return (
          power >= 60 ||
          attackStat >= 125 ||
          (highImpactPowerAbility && attackStat >= 100) ||
          (powerMultiplierAbility && attackStat >= 120)
        );
      })
      .map((move) => `${move.id} ${round(move.share * 100, 1)}%`)
  );
  addSignal(
    signals,
    "pivot",
    adoptedMoves
      .filter((move) => PIVOT_MOVE_IDS.has(move.id))
      .map((move) => `${move.id} ${round(move.share * 100, 1)}%`)
  );
  addSignal(
    signals,
    "tradeMove",
    adoptedMoves
      .filter((move) => TRADE_MOVE_IDS.has(move.id))
      .map((move) => `${move.id} ${round(move.share * 100, 1)}%`)
  );

  const signalCount = BATTLE_CANDIDATE_SIGNALS.filter(
    (signal) => signals[signal].length > 0
  ).length;
  if (signalCount === 0) return null;
  return {
    slug: pokemon.slug,
    name: pokemon.nameJa,
    usageRank: environment.usage.rank,
    usageRate: environment.usage.rate,
    signals,
    signalCount,
    signalStars: "★".repeat(Math.min(5, signalCount)),
    recommendationRank: recommendation?.rank ?? null,
    speciesRank: recommendation?.speciesRank ?? null
  };
}

function contributionSummary(
  candidate: RecommendationCandidateAnalysis
): string[] {
  return candidate.topContributions.slice(0, 3).map(
    (entry) =>
      `${entry.category} ${entry.points >= 0 ? "+" : ""}${entry.points}`
  );
}

export function analyzeRecommendations({
  context,
  plans,
  environmentDataset,
  environmentSnapshot,
  availablePokemon,
  topLimit = 20,
  representativeSlugs = [...REPRESENTATIVE_RECOMMENDATION_SLUGS]
}: {
  context: RecommendationAnalyzerContext;
  plans: AdvisorSwapPlan[];
  environmentDataset: ThreatEnvironmentDataset;
  environmentSnapshot: EnvironmentSnapshot;
  availablePokemon: PokemonEntry[];
  topLimit?: number;
  representativeSlugs?: string[];
}): RecommendationAnalyzerResult {
  const rankedPlans = getBestRecommendationPlansBySlug(plans);
  const candidates = rankedPlans.map((plan, index) =>
    analyzeRecommendationPlan(plan, index + 1, environmentDataset)
  );
  const planBySlug = new Map(
    rankedPlans.map((plan) => [plan.candidate.pokemon.slug, plan])
  );
  const candidateBySlug = new Map(
    candidates.map((candidate) => [candidate.slug, candidate])
  );

  const bestSpeciesCandidates = new Map<number, RecommendationCandidateAnalysis>();
  for (const candidate of candidates) {
    const speciesId = planBySlug.get(candidate.slug)?.candidate.pokemon.speciesId;
    if (speciesId === undefined || bestSpeciesCandidates.has(speciesId)) continue;
    bestSpeciesCandidates.set(speciesId, candidate);
  }
  const speciesRanked = [...bestSpeciesCandidates.values()]
    .sort((left, right) => left.rank - right.rank);
  speciesRanked.forEach((candidate, index) => {
    candidate.speciesRank = index + 1;
  });
  const recommendationTop20 = speciesRanked.slice(0, topLimit);

  const contributionAverages = emptyRecommendationContributionRecord();
  if (recommendationTop20.length > 0) {
    for (const category of RECOMMENDATION_CONTRIBUTION_CATEGORIES) {
      contributionAverages[category] = round(
        recommendationTop20.reduce(
          (total, candidate) => total + candidate.contributions[category],
          0
        ) / recommendationTop20.length
      );
    }
  }

  const availableBySlug = new Map(
    availablePokemon.map((pokemon) => [pokemon.slug, pokemon])
  );
  const battleCandidates = environmentSnapshot.pokemon
    .filter(
      (environment) =>
        environment.usage.rate >= 0.001 &&
        availableBySlug.has(environment.slug)
    )
    .flatMap((environment) => {
      const pokemon = availableBySlug.get(environment.slug);
      if (!pokemon) return [];
      const battleCandidate = detectBattleCandidate(
        pokemon,
        environment,
        candidateBySlug.get(environment.slug)
      );
      return battleCandidate ? [battleCandidate] : [];
    })
    .sort(
      (left, right) =>
        (left.recommendationRank ?? Number.POSITIVE_INFINITY) -
          (right.recommendationRank ?? Number.POSITIVE_INFINITY) ||
        right.signalCount - left.signalCount ||
        left.usageRank - right.usageRank
    );
  const battleBySlug = new Map(
    battleCandidates.map((candidate) => [candidate.slug, candidate])
  );

  const underestimatedCandidates = battleCandidates
    .filter(
      (candidate) =>
        candidate.signalCount >= 4 &&
        (candidate.speciesRank === null || candidate.speciesRank > topLimit)
    )
    .map((candidate) => {
      const recommendation = candidateBySlug.get(candidate.slug);
      const missingSignalLabels = BATTLE_CANDIDATE_SIGNALS
        .filter((signal) => candidate.signals[signal].length > 0)
        .join(", ");
      return {
        slug: candidate.slug,
        name: candidate.name,
        recommendationRank: candidate.speciesRank,
        recommendationScore: recommendation?.recommendationScore ?? null,
        signalCount: candidate.signalCount,
        signalStars: candidate.signalStars,
        reasons: [
          `Battle Candidate: ${missingSignalLabels}`,
          recommendation
            ? `現行Contribution上位: ${contributionSummary(recommendation).join(" / ") || "なし"}`
            : "現行Recommendationの評価対象外です。",
          "Battle CandidateシグナルはRecommendation Scoreへ加点されません。"
        ]
      };
    })
    .sort(
      (left, right) =>
        right.signalCount - left.signalCount ||
        (left.recommendationRank ?? Number.POSITIVE_INFINITY) -
          (right.recommendationRank ?? Number.POSITIVE_INFINITY)
    )
    .slice(0, 20);

  const overestimatedCandidates = recommendationTop20
    .filter(
      (candidate) => (battleBySlug.get(candidate.slug)?.signalCount ?? 0) <= 2
    )
    .map((candidate) => {
      const battleCandidate = battleBySlug.get(candidate.slug);
      return {
        slug: candidate.slug,
        name: candidate.name,
        recommendationRank: candidate.speciesRank,
        recommendationScore: candidate.recommendationScore,
        signalCount: battleCandidate?.signalCount ?? 0,
        signalStars: battleCandidate?.signalStars ?? "－",
        reasons: [
          `現行Contribution上位: ${contributionSummary(candidate).join(" / ") || "なし"}`,
          `検出されたBattle Candidateシグナルは${battleCandidate?.signalCount ?? 0}件です。`,
          "構築補完の高さと勝ち筋生成能力は同義ではありません。"
        ]
      };
    });

  const semanticGap = analyzeSemanticRecommendationGap({
    context,
    candidates,
    recommendationTop: recommendationTop20,
    environmentSnapshot,
    availablePokemon,
    topLimit
  });
  const semanticProfileBySlug = new Map(
    semanticGap.semanticProfiles.map((profile) => [profile.slug, profile])
  );
  return {
    metadata: semanticGap.metadata,
    input: context,
    context,
    candidates,
    recommendationRanking: candidates,
    recommendationTop20,
    contributionAverages,
    contributionSummary: contributionAverages,
    battleCandidates,
    underestimatedCandidates,
    overestimatedCandidates,
    representativeComparison: representativeSlugs.map((slug) => ({
      slug,
      candidate: candidateBySlug.get(slug) ?? null,
      battleCandidate: battleBySlug.get(slug) ?? null,
      semanticProfile: semanticProfileBySlug.get(slug) ?? null
    })),
    datasetSummary: semanticGap.datasetSummary,
    representationMap: semanticGap.representationMap,
    semanticProfiles: semanticGap.semanticProfiles,
    battleTagSummary: semanticGap.battleTagSummary,
    archetypeSummary: semanticGap.archetypeSummary,
    semanticGapRanking: semanticGap.semanticGapRanking,
    semanticUnderestimationCandidates:
      semanticGap.semanticUnderestimationCandidates,
    staticSupportCandidates: semanticGap.staticSupportCandidates,
    riskDominatedCandidates: semanticGap.riskDominatedCandidates,
    contributionInvestigation: semanticGap.contributionInvestigation,
    unclassifiedSummary: semanticGap.unclassifiedSummary
  };
}

function signed(points: number): string {
  return `${points >= 0 ? "+" : ""}${points}`;
}

function categorySummary(
  contributions: Record<RecommendationContributionCategory, number>
): string {
  return RECOMMENDATION_CONTRIBUTION_CATEGORIES
    .map((category) => `${category}:${signed(contributions[category])}`)
    .join(" ");
}

function formatEvidence(candidate: RecommendationCandidateAnalysis): string[] {
  const lines: string[] = [];
  for (const category of RECOMMENDATION_CONTRIBUTION_CATEGORIES) {
    const evidence = candidate.evidenceByCategory[category];
    if (evidence.length === 0) continue;
    lines.push(`  ${category} ${signed(candidate.contributions[category])}`);
    for (const entry of evidence) {
      lines.push(`    - ${entry.text} [${signed(entry.points)} / ${entry.id}]`);
    }
  }
  return lines;
}

function formatOutliers(
  title: string,
  candidates: RecommendationOutlier[]
): string[] {
  const lines = [title];
  if (candidates.length === 0) return [...lines, "該当なし", ""];
  for (const candidate of candidates) {
    lines.push(
      `${candidate.recommendationRank ?? "圏外"}. ${candidate.name} (${candidate.slug}) score=${candidate.recommendationScore ?? "－"} Battle Candidate=${candidate.signalStars}(${candidate.signalCount})`
    );
    candidate.reasons.forEach((reason) => lines.push(`  - ${reason}`));
  }
  lines.push("");
  return lines;
}

export function formatRecommendationAnalyzerReport(
  result: RecommendationAnalyzerResult
): string {
  const lines: string[] = [];
  const topLabel = `TOP${result.recommendationTop20.length}`;
  lines.push("Recommendation Analyzer");
  lines.push(
    `Team=${result.context.team.join(",")} Regulation=${result.context.regulation} Profile=${result.context.profile}`
  );
  lines.push(
    `Dataset=${result.context.datasetId} Period=${result.context.period} Cutoff=${result.context.ratingCutoff}`
  );
  lines.push(
    "順位は既存Scoreによるraw順位です。AnalyzerとBattle CandidateはRecommendationへ影響しません。"
  );
  lines.push("");
  lines.push(`Recommendation ${topLabel}`);
  for (const candidate of result.recommendationTop20) {
    lines.push(
      `${candidate.speciesRank}. ${candidate.name} (${candidate.slug}) Recommendation=${candidate.baselineRecommendationScore} BattleValueContribution=${candidate.battleValueContribution} Contestability=${candidate.contestability} ContestabilityContribution=${candidate.contestabilityContribution} Final=${candidate.finalRecommendation} BattleValueRatio=${round(candidate.battleValueRatio * 100, 1)}% ContestabilityRatio=${round(candidate.contestabilityRatio * 100, 1)}% raw=${candidate.rank} categories=[overall:${candidate.categoryScores.overall} defensive:${candidate.categoryScores.defensive} offensive:${candidate.categoryScores.offensive} speed:${candidate.categoryScores.speed} type:${candidate.categoryScores.typeSpecific}]`
    );
    candidate.topContributions.forEach((entry, index) =>
      lines.push(
        `  Contribution ${index + 1}: ${entry.category} ${signed(entry.points)}`
      )
    );
  }
  lines.push("");
  lines.push(`Contribution平均 ${topLabel}`);
  for (const category of RECOMMENDATION_CONTRIBUTION_CATEGORIES) {
    lines.push(`${category}: ${signed(result.contributionAverages[category])}`);
  }
  lines.push("");
  lines.push(`Recommendation ${topLabel} Evidence`);
  for (const candidate of result.recommendationTop20) {
    lines.push(
      `${candidate.speciesRank}. ${candidate.name} score=${candidate.recommendationScore}`
    );
    lines.push(...formatEvidence(candidate));
  }
  lines.push("");
  lines.push("代表ポケモン比較");
  for (const representative of result.representativeComparison) {
    const candidate = representative.candidate;
    const battle = representative.battleCandidate;
    if (!candidate) {
      lines.push(
        `${representative.slug}: Recommendation評価対象外 / Battle Candidate=${battle?.signalStars ?? "－"}`
      );
      continue;
    }
    lines.push(
      `${candidate.name} (${candidate.slug}) raw=${candidate.rank} species=${candidate.speciesRank ?? "圏外"} score=${candidate.recommendationScore} eligible=${candidate.recommendationEligible ? "yes" : "no"} Battle Candidate=${battle?.signalStars ?? "－"}(${battle?.signalCount ?? 0})`
    );
    lines.push(`  ${categorySummary(candidate.contributions)}`);
  }
  lines.push("");
  lines.push(
    ...formatOutliers("過小評価候補", result.underestimatedCandidates)
  );
  lines.push(
    ...formatOutliers("過大評価候補", result.overestimatedCandidates)
  );
  lines.push("Recommendation全候補");
  for (const candidate of result.candidates) {
    lines.push(
      `${candidate.rank}. ${candidate.name} (${candidate.slug}) species=${candidate.speciesRank ?? "圏外"} score=${candidate.recommendationScore} eligible=${candidate.recommendationEligible ? "yes" : "no"} ${categorySummary(candidate.contributions)}`
    );
  }
  lines.push("");
  lines.push("Battle Candidate一覧");
  for (const candidate of result.battleCandidates) {
    const signalText = BATTLE_CANDIDATE_SIGNALS
      .filter((signal) => candidate.signals[signal].length > 0)
      .map(
        (signal) => `${signal}=[${candidate.signals[signal].join(" / ")}]`
      )
      .join(" ");
    lines.push(
      `${candidate.name} (${candidate.slug}) Recommendation=${candidate.speciesRank ?? "圏外"} raw=${candidate.recommendationRank ?? "未評価"} Usage=${round(candidate.usageRate * 100, 2)}% Battle Candidate=${candidate.signalStars}(${candidate.signalCount}) ${signalText}`
    );
  }
  lines.push("");
  lines.push(
    formatSemanticRecommendationGapReport(
      {
        metadata: result.metadata,
        datasetSummary: result.datasetSummary,
        representationMap: result.representationMap,
        semanticProfiles: result.semanticProfiles,
        battleTagSummary: result.battleTagSummary,
        archetypeSummary: result.archetypeSummary,
        semanticGapRanking: result.semanticGapRanking,
        semanticUnderestimationCandidates:
          result.semanticUnderestimationCandidates,
        staticSupportCandidates: result.staticSupportCandidates,
        riskDominatedCandidates: result.riskDominatedCandidates,
        representativeComparison: result.representativeComparison.flatMap(
          (entry) => (entry.semanticProfile ? [entry.semanticProfile] : [])
        ),
        contributionInvestigation: result.contributionInvestigation,
        unclassifiedSummary: result.unclassifiedSummary
      },
      result.recommendationTop20.length
    ).trimEnd()
  );
  return `${lines.join("\n")}\n`;
}
