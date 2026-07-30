import {
  getAvailablePokemonBySeason,
  getRegulationForSeason
} from "@/lib/regulations";
import type { PokemonEntry } from "@/types/pokemon";

const MAX_REGULATION_CACHE_ENTRIES = 2;
const regulationCandidates = new Map<string, PokemonEntry[]>();

export function getRegulationCandidatesForSeason(
  seasonId: string
): PokemonEntry[] {
  const regulationId = getRegulationForSeason(seasonId)?.id;
  if (!regulationId) return [];
  const cached = regulationCandidates.get(regulationId);
  if (cached) return cached;
  const candidates = getAvailablePokemonBySeason(seasonId);
  if (regulationCandidates.size >= MAX_REGULATION_CACHE_ENTRIES) {
    const oldest = regulationCandidates.keys().next().value;
    if (oldest !== undefined) regulationCandidates.delete(oldest);
  }
  regulationCandidates.set(regulationId, candidates);
  return candidates;
}
