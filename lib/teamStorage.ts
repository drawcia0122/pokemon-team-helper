import { getAllTypes, getPokemonBySlug, resolvePokemonSlugAlias } from "@/lib/typeChart";
import type { TeamSlot, TypeName } from "@/types/pokemon";

export const TEAM_STORAGE_KEY = "pokemon-helper:team";
export const SEASON_STORAGE_KEY = "pokemon-helper:seasonId";
export const ARTICLE_IMPORT_BACKUP_KEY = "pokemon-helper:teamBeforeArticleImport";
export const ADVISOR_ADD_BACKUP_KEY = "pokemon-helper:teamBeforeAdvisorAdd";

export function parseStoredTeam(value: string): TeamSlot[] {
  const parsed = JSON.parse(value) as TeamSlot[];
  return parsed.map((slot) =>
    slot.mode === "pokemon"
      ? { ...slot, pokemonSlug: resolvePokemonSlugAlias(slot.pokemonSlug) }
      : slot
  );
}

export function serializeTeam(team: TeamSlot[]): string {
  return JSON.stringify(team);
}

function isValidTeamSlot(value: unknown, typeNames: Set<string>): value is TeamSlot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const slot = value as Record<string, unknown>;
  if (typeof slot.id !== "string" || slot.id.length === 0) {
    return false;
  }

  if (slot.mode === "pokemon") {
    return typeof slot.pokemonSlug === "string" && Boolean(getPokemonBySlug(slot.pokemonSlug));
  }

  if (slot.mode !== "type" || typeof slot.primaryType !== "string" || !typeNames.has(slot.primaryType)) {
    return false;
  }

  return (
    slot.secondaryType === undefined ||
    (typeof slot.secondaryType === "string" &&
      typeNames.has(slot.secondaryType) &&
      slot.secondaryType !== slot.primaryType)
  );
}

export function parseTeamBackup(value: string | null): TeamSlot[] | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    const typeNames = new Set<TypeName>(getAllTypes().map((entry) => entry.nameEn));

    if (
      !Array.isArray(parsed) ||
      parsed.length > 6 ||
      !parsed.every((slot) => isValidTeamSlot(slot, typeNames))
    ) {
      return null;
    }

    return parsed.map((slot) =>
      slot.mode === "pokemon"
        ? { ...slot, pokemonSlug: resolvePokemonSlugAlias(slot.pokemonSlug) }
        : slot
    );
  } catch {
    return null;
  }
}
