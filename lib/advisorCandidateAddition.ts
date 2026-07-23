import {
  getAdvisorMegaRecommendationDecision
} from "@/lib/advisorMegaRecommendation";
import {
  addTeamSlotToFirstEmpty,
  getTeamSlotsByPosition
} from "@/lib/teamSlotLayout";
import { isThreatPokemonCandidate } from "@/lib/teamThreats";
import { getPokemonBySlug } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

export type AdvisorCandidateAddabilityCode =
  | "allowed"
  | "team-full"
  | "duplicate-species"
  | "unavailable"
  | "invalid-form"
  | "mega-limit";

export type AdvisorCandidateAddability = {
  allowed: boolean;
  code: AdvisorCandidateAddabilityCode;
  reason: string | null;
};

export function getAdvisorCandidateAddability({
  team,
  candidate,
  availablePokemon
}: {
  team: readonly TeamSlot[];
  candidate: PokemonEntry;
  availablePokemon: readonly PokemonEntry[];
}): AdvisorCandidateAddability {
  if (getTeamSlotsByPosition(team).every(Boolean)) {
    return {
      allowed: false,
      code: "team-full",
      reason: "6つの枠がすべて埋まっています。"
    };
  }
  const teamPokemon = team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    return pokemon ? [pokemon] : [];
  });
  if (
    teamPokemon.some(
      (pokemon) => pokemon.speciesId === candidate.speciesId
    )
  ) {
    return {
      allowed: false,
      code: "duplicate-species",
      reason: "同じspeciesのポケモンがすでに登録されています。"
    };
  }
  if (
    !availablePokemon.some((pokemon) => pokemon.slug === candidate.slug)
  ) {
    return {
      allowed: false,
      code: "unavailable",
      reason: "現在のM-Bルールではこのフォームを使用できません。"
    };
  }
  if (!isThreatPokemonCandidate(candidate)) {
    return {
      allowed: false,
      code: "invalid-form",
      reason: "チームへ登録できない表示・移動専用フォームです。"
    };
  }
  const currentMegaCount = teamPokemon.filter(
    (pokemon) => pokemon.formKind === "mega"
  ).length;
  const megaDecision = getAdvisorMegaRecommendationDecision({
    currentTeamSize: teamPokemon.length,
    currentMegaCount,
    candidateIsMega: candidate.formKind === "mega",
    actionKind: "add"
  });
  if (!megaDecision.allowed) {
    return {
      allowed: false,
      code: "mega-limit",
      reason:
        megaDecision.maxMegaCount === 1
          ? "構築の核ではメガシンカを1体までとしているため追加できません。"
          : "メガシンカポケモンは2体までです。"
    };
  }
  return { allowed: true, code: "allowed", reason: null };
}

export function addAdvisorCandidateToTeam({
  team,
  candidate,
  availablePokemon
}: {
  team: readonly TeamSlot[];
  candidate: PokemonEntry;
  availablePokemon: readonly PokemonEntry[];
}): TeamSlot[] {
  const addability = getAdvisorCandidateAddability({
    team,
    candidate,
    availablePokemon
  });
  if (!addability.allowed) return team.map((slot) => ({ ...slot }));
  return addTeamSlotToFirstEmpty(team, {
    mode: "pokemon",
    pokemonSlug: candidate.slug
  });
}
