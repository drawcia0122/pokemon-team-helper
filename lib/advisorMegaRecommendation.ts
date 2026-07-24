import { getPokemonBySlug } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

export const ADVISOR_MEGA_RECOMMENDATION_RULES = {
  earlyTeamSizeMaximum: 3,
  earlyMegaLimit: 1,
  standardMegaLimit: 2
} as const;

export type MegaRecommendationActionKind =
  | "add"
  | "replace"
  | "formChange";

export type MegaRecommendationContext = {
  currentTeamSize: number;
  currentMegaCount: number;
  candidateIsMega: boolean;
  actionKind: MegaRecommendationActionKind;
  removedSlotContainsPokemon?: boolean;
  removedPokemonIsMega?: boolean;
};

export type MegaRecommendationDecision = {
  allowed: boolean;
  projectedTeamSize: number;
  projectedMegaCount: number;
  maxMegaCount: number;
};

export type AdvisorMegaTeamState = {
  currentTeamSize: number;
  currentMegaCount: number;
  megaPokemon: PokemonEntry[];
};

export type AdvisorMegaGuidance = AdvisorMegaTeamState & {
  projectedTeamSize: number;
  maxMegaCount: number;
  message: string;
};

export function getAdvisorMegaLimitForTeamSize(teamSize: number): number {
  return teamSize <=
    ADVISOR_MEGA_RECOMMENDATION_RULES.earlyTeamSizeMaximum
    ? ADVISOR_MEGA_RECOMMENDATION_RULES.earlyMegaLimit
    : ADVISOR_MEGA_RECOMMENDATION_RULES.standardMegaLimit;
}

export function getAdvisorMegaRecommendationDecision(
  context: MegaRecommendationContext
): MegaRecommendationDecision {
  const removesPokemon =
    context.actionKind !== "add" &&
    context.removedSlotContainsPokemon !== false;
  const projectedTeamSize =
    context.actionKind === "add" || !removesPokemon
      ? context.currentTeamSize + 1
      : context.currentTeamSize;
  const removedMegaCount =
    !removesPokemon || !context.removedPokemonIsMega ? 0 : 1;
  const projectedMegaCount =
    context.currentMegaCount -
    removedMegaCount +
    (context.candidateIsMega ? 1 : 0);
  const maxMegaCount = getAdvisorMegaLimitForTeamSize(projectedTeamSize);

  return {
    // Existing imported or saved teams may already exceed the recommendation
    // limit. They stay intact, and regular candidates remain available.
    allowed:
      !context.candidateIsMega || projectedMegaCount <= maxMegaCount,
    projectedTeamSize,
    projectedMegaCount,
    maxMegaCount
  };
}

export function canRecommendMegaCandidate(
  context: MegaRecommendationContext
): boolean {
  return getAdvisorMegaRecommendationDecision(context).allowed;
}

export function getAdvisorMegaTeamState(
  team: readonly TeamSlot[]
): AdvisorMegaTeamState {
  const pokemon = team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const entry = getPokemonBySlug(slot.pokemonSlug);
    return entry ? [entry] : [];
  });
  const megaPokemon = pokemon.filter((entry) => entry.formKind === "mega");
  return {
    currentTeamSize: pokemon.length,
    currentMegaCount: megaPokemon.length,
    megaPokemon
  };
}

export function getAdvisorMegaGuidance(
  team: readonly TeamSlot[]
): AdvisorMegaGuidance {
  const state = getAdvisorMegaTeamState(team);
  const projectedTeamSize =
    state.currentTeamSize < 6 ? state.currentTeamSize + 1 : 6;
  const maxMegaCount = getAdvisorMegaLimitForTeamSize(projectedTeamSize);
  const megaNames = state.megaPokemon.map((pokemon) => pokemon.nameJa);
  let message = "";

  if (state.currentTeamSize === 0) {
    message =
      "1〜3体目はメガシンカを1体までとして構築の核を作ります。";
  } else if (state.currentTeamSize <= 2) {
    if (state.currentMegaCount >= 2) {
      message = `現在の${state.currentTeamSize}体にメガシンカが${state.currentMegaCount}体含まれています。既存メンバーはそのまま保持し、新しいメガ候補は追加しません。`;
    } else if (state.currentMegaCount === 1) {
      message = `現在は${megaNames[0]}をメガシンカ候補として選んでいるため、2・3体目は通常ポケモンから提案します。`;
    } else {
      message =
        "構築の核ではメガシンカを1体までとして候補を選んでいます。";
    }
  } else if (state.currentTeamSize < 6) {
    if (state.currentMegaCount >= 2) {
      message =
        state.currentTeamSize === 3 || state.currentMegaCount > 2
          ? `現在の${state.currentTeamSize}体にメガシンカが${state.currentMegaCount}体含まれています。既存メンバーはそのまま保持し、新しいメガ候補は追加しません。`
          : "メガシンカを2体採用しているため、通常ポケモンから候補を選んでいます。";
    } else if (state.currentMegaCount === 1) {
      message =
        "4体目以降は、2体目のメガシンカも候補に含みます。";
    } else {
      message =
        "4体目以降は、メガシンカを合計2体まで候補に含めます。";
    }
  } else {
    message =
      state.currentMegaCount > 2
        ? `現在の6体にメガシンカが${state.currentMegaCount}体含まれています。既存メンバーはそのまま保持し、入れ替え後のメガシンカ採用数が2体以内となる改善案だけを表示します。`
        : "入れ替え後のメガシンカ採用数が2体以内となる改善案を表示します。";
  }

  return {
    ...state,
    projectedTeamSize,
    maxMegaCount,
    message
  };
}

export function getAdvisorMegaCandidateNote(
  context: MegaRecommendationContext
): string | null {
  if (!context.candidateIsMega) return null;
  const decision = getAdvisorMegaRecommendationDecision(context);
  if (!decision.allowed) return null;
  if (
    context.actionKind === "add" &&
    context.currentMegaCount === 1 &&
    decision.projectedMegaCount === 2
  ) {
    return "2体目のメガ候補";
  }
  if (
    context.actionKind !== "add" &&
    context.removedPokemonIsMega &&
    decision.projectedMegaCount === context.currentMegaCount
  ) {
    return "メガ枠の入れ替え";
  }
  if (
    context.actionKind !== "add" &&
    context.currentMegaCount === 1 &&
    decision.projectedMegaCount === 2
  ) {
    return "入れ替え後のメガ採用数: 2体";
  }
  return null;
}
