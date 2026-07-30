import { getAdvisorCandidateAddability } from "@/lib/advisorCandidateAddition";
import { getAdvisorMegaRecommendationDecision } from "@/lib/advisorMegaRecommendation";
import { addTeamSlotToFirstEmpty, getTeamSlotsByPosition } from "@/lib/teamSlotLayout";
import { isThreatPokemonCandidate } from "@/lib/teamThreats";
import { getPokemonBySlug } from "@/lib/typeChart";
import type { AdvisorSwapAction } from "@/lib/advisorSwapSimulator";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

export type AdvisorCandidateActionabilityCode =
  | "allowed"
  | "stale-suggestion"
  | "team-full"
  | "duplicate-species"
  | "unavailable"
  | "invalid-form"
  | "missing-slot"
  | "mega-limit";

export type AdvisorCandidateActionability = {
  allowed: boolean;
  code: AdvisorCandidateActionabilityCode;
  reason: string | null;
};

export type AdvisorCandidateActionInput = {
  team: readonly TeamSlot[];
  sourceTeam: readonly TeamSlot[];
  candidate: PokemonEntry;
  action: AdvisorSwapAction;
  availablePokemon: readonly PokemonEntry[];
};

function cloneTeam(team: readonly TeamSlot[]): TeamSlot[] {
  return team.map((slot) => ({ ...slot }));
}

export function getAdvisorTeamStateSignature(team: readonly TeamSlot[]): string {
  return JSON.stringify(
    getTeamSlotsByPosition(team).map((slot) => {
      if (!slot) return null;
      return slot.mode === "pokemon"
        ? [slot.id, slot.mode, slot.pokemonSlug]
        : [slot.id, slot.mode, slot.primaryType, slot.secondaryType ?? null];
    })
  );
}

function blocked(
  code: Exclude<AdvisorCandidateActionabilityCode, "allowed">,
  reason: string
): AdvisorCandidateActionability {
  return { allowed: false, code, reason };
}

export function getAdvisorCandidateActionability({
  team,
  sourceTeam,
  candidate,
  action,
  availablePokemon
}: AdvisorCandidateActionInput): AdvisorCandidateActionability {
  if (
    getAdvisorTeamStateSignature(team) !==
    getAdvisorTeamStateSignature(sourceTeam)
  ) {
    return blocked(
      "stale-suggestion",
      "チームが変更されたため、この提案は古くなっています。再計算された候補を確認してください。"
    );
  }

  if (action.kind === "add") {
    const addability = getAdvisorCandidateAddability({
      team,
      candidate,
      availablePokemon
    });
    return addability;
  }

  const removedSlot = team.find(
    (slot) => slot.id === action.removedSlotId
  );
  if (!removedSlot) {
    return blocked(
      "missing-slot",
      "入れ替え対象の枠が見つからないため、再計算された候補を確認してください。"
    );
  }
  if (!availablePokemon.some((pokemon) => pokemon.slug === candidate.slug)) {
    return blocked(
      "unavailable",
      "現在のルールではこのフォームを使用できません。"
    );
  }
  if (!isThreatPokemonCandidate(candidate)) {
    return blocked(
      "invalid-form",
      "チームへ登録できない表示・移動専用フォームです。"
    );
  }

  const remainingPokemon = team.flatMap((slot) => {
    if (slot.id === removedSlot.id || slot.mode !== "pokemon") return [];
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    return pokemon ? [pokemon] : [];
  });
  if (
    remainingPokemon.some(
      (pokemon) => pokemon.speciesId === candidate.speciesId
    )
  ) {
    return blocked(
      "duplicate-species",
      "同じポケモンが別の枠に登録されています。"
    );
  }

  const currentPokemon = team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    return pokemon ? [pokemon] : [];
  });
  const removedPokemon =
    removedSlot.mode === "pokemon"
      ? getPokemonBySlug(removedSlot.pokemonSlug) ?? null
      : null;
  const megaDecision = getAdvisorMegaRecommendationDecision({
    currentTeamSize: currentPokemon.length,
    currentMegaCount: currentPokemon.filter(
      (pokemon) => pokemon.formKind === "mega"
    ).length,
    candidateIsMega: candidate.formKind === "mega",
    actionKind: action.kind === "form-change" ? "formChange" : "replace",
    removedSlotContainsPokemon: removedSlot.mode === "pokemon",
    removedPokemonIsMega: removedPokemon?.formKind === "mega"
  });
  if (!megaDecision.allowed) {
    return blocked(
      "mega-limit",
      megaDecision.maxMegaCount === 1
        ? "構築の核ではメガシンカを1体までとしているため適用できません。"
        : "適用後のメガシンカポケモンは2体までです。"
    );
  }

  return { allowed: true, code: "allowed", reason: null };
}

export function applyAdvisorCandidateAction(
  input: AdvisorCandidateActionInput
): { team: TeamSlot[]; actionability: AdvisorCandidateActionability } {
  const actionability = getAdvisorCandidateActionability(input);
  if (!actionability.allowed) {
    return { team: cloneTeam(input.team), actionability };
  }
  if (input.action.kind === "add") {
    return {
      team: addTeamSlotToFirstEmpty(input.team, {
        mode: "pokemon",
        pokemonSlug: input.candidate.slug
      }),
      actionability
    };
  }
  return {
    team: input.team.map((slot) =>
      slot.id === input.action.removedSlotId
        ? {
            id: slot.id,
            mode: "pokemon" as const,
            pokemonSlug: input.candidate.slug
          }
        : { ...slot }
    ),
    actionability
  };
}
