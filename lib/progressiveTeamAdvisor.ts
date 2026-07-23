import {
  getAdvisorAnchor,
  getAdvisorBuildPhase,
  getAdvisorPhasePresentation,
  getAdvisorPokemonCount,
  type AdvisorBuildPhase,
  type AdvisorPhasePresentation
} from "@/lib/advisorBuildPhase";
import {
  evaluateAdvisorPartnerSynergy
} from "@/lib/advisorPartnerSynergy";
import {
  compareProgressiveCandidates,
  scoreAdvisorPhasePlan,
  type ProgressiveAdvisorCandidate,
  type ProgressiveAdvisorMode
} from "@/lib/advisorPhaseScoring";
import {
  ADVISOR_PROGRESSIVE_MINIMUM_USAGE,
  type AdvisorSwapPlan,
  type AdvisorSwapSimulation
} from "@/lib/advisorSwapSimulator";
import {
  getAdvisorMegaGuidance,
  type AdvisorMegaGuidance
} from "@/lib/advisorMegaRecommendation";
import { getAllTypes } from "@/lib/typeChart";
import type { TeamAdvisorAnalysis } from "@/lib/teamAdvisor";
import type { TeamProfile } from "@/lib/teamProfile";
import type { ThreatEnvironmentDataset } from "@/types/environmentThreat";
import type { PokemonEntry, TeamSlot, TypeName } from "@/types/pokemon";

export const PROGRESSIVE_ADVISOR_RULES = {
  minimumUsageRate: ADVISOR_PROGRESSIVE_MINIMUM_USAGE,
  maximumDisplayedCandidates: 6,
  lastSlotMinimumScore: 15,
  lastSlotScoreWindow: 25
} as const;

export type ProgressiveTeamAdvisorAnalysis = {
  phase: AdvisorBuildPhase;
  presentation: AdvisorPhasePresentation;
  memberCount: number;
  anchor: PokemonEntry | null;
  megaGuidance: AdvisorMegaGuidance;
  priorities: string[];
  candidatesByMode: Record<
    Exclude<ProgressiveAdvisorMode, "typeSpecific">,
    ProgressiveAdvisorCandidate[]
  >;
  typePlans: Partial<Record<TypeName, ProgressiveAdvisorCandidate[]>>;
  typeOptions: Array<{ type: TypeName; label: string }>;
  candidatePoolCount: number;
  evaluatedCandidateCount: number;
  computationTimeMs: number;
  completeSimulation: AdvisorSwapSimulation | null;
};

export type ProgressiveTeamAdvisorInput = {
  team: TeamSlot[];
  advisor: TeamAdvisorAnalysis;
  simulation: AdvisorSwapSimulation;
  availablePokemon: PokemonEntry[];
  environmentDataset: ThreatEnvironmentDataset | null;
  profile?: TeamProfile;
};

function emptyModePlans(): ProgressiveTeamAdvisorAnalysis["candidatesByMode"] {
  return {
    overall: [],
    defensive: [],
    offensive: [],
    role: []
  };
}

function uniqueBestBySpecies(
  candidates: ProgressiveAdvisorCandidate[],
  mode: ProgressiveAdvisorMode
): ProgressiveAdvisorCandidate[] {
  const sorted = [...candidates].sort((left, right) =>
    compareProgressiveCandidates(mode, left, right)
  );
  const selected: ProgressiveAdvisorCandidate[] = [];
  const seenSpecies = new Set<number>();
  for (const candidate of sorted) {
    const speciesId = candidate.plan.candidate.pokemon.speciesId;
    if (seenSpecies.has(speciesId)) continue;
    seenSpecies.add(speciesId);
    selected.push(candidate);
  }
  return selected;
}

function takeDisplayCandidates(
  candidates: ProgressiveAdvisorCandidate[],
  mode: ProgressiveAdvisorMode,
  memberCount: number
): ProgressiveAdvisorCandidate[] {
  const ranked = uniqueBestBySpecies(candidates, mode);
  const topScore = ranked[0]?.modeScores[mode] ?? 0;
  return ranked
    .filter((candidate) => {
      const hasReason = candidate.reasonsByMode[mode].length > 0;
      if (!hasReason || candidate.modeScores[mode] <= 0) return false;
      if (memberCount !== 5) return true;
      return (
        candidate.fitScore >=
          PROGRESSIVE_ADVISOR_RULES.lastSlotMinimumScore &&
        candidate.modeScores[mode] >=
          topScore - PROGRESSIVE_ADVISOR_RULES.lastSlotScoreWindow
      );
    })
    .slice(0, PROGRESSIVE_ADVISOR_RULES.maximumDisplayedCandidates);
}

function getPriorities(
  phase: AdvisorBuildPhase,
  memberCount: number,
  anchor: PokemonEntry | null,
  advisor: TeamAdvisorAnalysis,
  plans: AdvisorSwapPlan[]
): string[] {
  if (phase === "empty") {
    return ["STEP 1の空きスロットから、構築の中心にしたい1匹を選びます。"];
  }
  if (phase === "partner") {
    return anchor
      ? [
          `${anchor.nameJa}を構築の軸として、弱点を一方向だけでなく相互に補える相棒を探します。`,
          "実採用技の攻撃範囲と、現在不足している役割も確認します。"
        ]
      : ["実際のポケモンを1匹選ぶと相棒候補を評価できます。"];
  }
  const issueText = advisor.issues.map(
    (issue) => `${issue.title} — ${issue.reason}`
  );
  if (phase === "completeOptimization") {
    return [
      ...issueText,
      "6体完成後は、抜くメンバーの役割損失も含めて入れ替え改善案を比較します。"
    ].slice(0, 3);
  }
  const sample = plans[0];
  const threatNames = sample
    ? sample.threatCoverage.threatAnswers
        .filter((answer) => !answer.currentTeamHasAnswer)
        .slice(0, 2)
        .map((answer) => {
          const threat = sample.beforeThreats.find(
            (entry) => entry.pokemon.slug === answer.threatId
          );
          return `${threat?.pokemon.nameJa ?? answer.threatId}への明確な回答が不足しています。`;
        })
    : [];
  const fallback =
    phase === "coreCompletion"
      ? ["現在の2匹全体で不足している防御・攻撃・役割を補います。"]
      : memberCount === 5
        ? ["最後まで残った最重要の未解決課題を、明確に改善できる候補を優先します。"]
        : ["現在の構築では対応しにくい具体的な状況へ回答を追加します。"];
  return [...new Set([...issueText, ...threatNames, ...fallback])].slice(0, 3);
}

function buildTypePlans(
  candidates: ProgressiveAdvisorCandidate[],
  memberCount: number
): {
  typePlans: Partial<Record<TypeName, ProgressiveAdvisorCandidate[]>>;
  typeOptions: Array<{ type: TypeName; label: string }>;
} {
  const groups = getAllTypes().flatMap((entry) => {
    const filtered = candidates.filter((candidate) =>
      candidate.plan.candidate.pokemon.types.includes(entry.nameEn)
    );
    const plans = takeDisplayCandidates(
      filtered,
      "typeSpecific",
      memberCount
    );
    return plans.length
      ? [{ type: entry.nameEn, label: entry.nameJa, plans }]
      : [];
  });
  groups.sort(
    (left, right) =>
      (right.plans[0]?.fitScore ?? 0) -
        (left.plans[0]?.fitScore ?? 0) ||
      left.type.localeCompare(right.type)
  );
  return {
    typePlans: Object.fromEntries(
      groups.map((group) => [group.type, group.plans])
    ),
    typeOptions: groups.map(({ type, label }) => ({ type, label }))
  };
}

export function getProgressiveTeamAdvisor(
  input: ProgressiveTeamAdvisorInput
): ProgressiveTeamAdvisorAnalysis {
  const startedAt = Date.now();
  const phase = getAdvisorBuildPhase(input.team);
  const memberCount = getAdvisorPokemonCount(input.team);
  const anchor = getAdvisorAnchor(input.team);
  const megaGuidance = getAdvisorMegaGuidance(input.team);
  const presentation = getAdvisorPhasePresentation(phase, memberCount);
  if (phase === "empty") {
    return {
      phase,
      presentation,
      memberCount,
      anchor,
      megaGuidance,
      priorities: getPriorities(
        phase,
        memberCount,
        anchor,
        input.advisor,
        []
      ),
      candidatesByMode: emptyModePlans(),
      typePlans: {},
      typeOptions: [],
      candidatePoolCount: 0,
      evaluatedCandidateCount: 0,
      computationTimeMs: Date.now() - startedAt,
      completeSimulation: null
    };
  }
  if (phase === "completeOptimization") {
    return {
      phase,
      presentation,
      memberCount,
      anchor,
      megaGuidance,
      priorities: getPriorities(
        phase,
        memberCount,
        anchor,
        input.advisor,
        input.simulation.plans
      ),
      candidatesByMode: emptyModePlans(),
      typePlans: {},
      typeOptions: [],
      candidatePoolCount: input.simulation.candidatePoolCount,
      evaluatedCandidateCount: input.simulation.evaluatedPatternCount,
      computationTimeMs: Date.now() - startedAt,
      completeSimulation: input.simulation
    };
  }

  // The simulator creates the canonical TASK037 Evidence once. Every
  // progressive phase, including the partner phase, reuses those add plans.
  const plans = input.simulation.additionPlans;
  const profile = input.profile ?? "standard";
  const scored = plans
    .filter(
      (plan) =>
        plan.action.kind === "add" &&
        plan.metrics.megaLimitPassed &&
        plan.metrics.megaRecommendationPassed &&
        (plan.threatCoverage.candidateUsage ?? 0) >=
          PROGRESSIVE_ADVISOR_RULES.minimumUsageRate
    )
    .map((plan) =>
      scoreAdvisorPhasePlan({
        phase,
        plan,
        memberCount,
        partnerSynergy:
          phase === "partner" && anchor
            ? evaluateAdvisorPartnerSynergy({
                anchor,
                candidate: plan.candidate.pokemon,
                environmentDataset: input.environmentDataset,
                profile
              })
            : null
      })
    );
  const candidatesByMode = {
    overall: takeDisplayCandidates(scored, "overall", memberCount),
    defensive: takeDisplayCandidates(scored, "defensive", memberCount),
    offensive: takeDisplayCandidates(scored, "offensive", memberCount),
    role: takeDisplayCandidates(scored, "role", memberCount)
  };
  const typeGroups = buildTypePlans(scored, memberCount);
  return {
    phase,
    presentation,
    memberCount,
    anchor,
    megaGuidance,
    priorities: getPriorities(
      phase,
      memberCount,
      anchor,
      input.advisor,
      plans
    ),
    candidatesByMode,
    typePlans: typeGroups.typePlans,
    typeOptions: typeGroups.typeOptions,
    candidatePoolCount: plans.length,
    evaluatedCandidateCount: plans.length,
    computationTimeMs: Date.now() - startedAt,
    completeSimulation: null
  };
}

export function getProgressiveAdvisorModePlans(
  analysis: ProgressiveTeamAdvisorAnalysis,
  mode: ProgressiveAdvisorMode,
  selectedType: TypeName | ""
): ProgressiveAdvisorCandidate[] {
  if (mode === "typeSpecific") {
    return selectedType ? analysis.typePlans[selectedType] ?? [] : [];
  }
  return analysis.candidatesByMode[mode];
}
