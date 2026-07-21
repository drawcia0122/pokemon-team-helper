import type { PokemonBaseStats } from "@/types/pokemon";

export const POKEMON_BASE_STAT_DEFINITIONS = [
  { key: "hp", label: "HP", shortLabel: "HP" },
  { key: "attack", label: "こうげき", shortLabel: "A" },
  { key: "defense", label: "ぼうぎょ", shortLabel: "B" },
  { key: "specialAttack", label: "とくこう", shortLabel: "C" },
  { key: "specialDefense", label: "とくぼう", shortLabel: "D" },
  { key: "speed", label: "すばやさ", shortLabel: "S" }
] as const satisfies ReadonlyArray<{
  key: keyof PokemonBaseStats;
  label: string;
  shortLabel: string;
}>;

export function isPokemonBaseStats(value: unknown): value is PokemonBaseStats {
  if (!value || typeof value !== "object") {
    return false;
  }

  return POKEMON_BASE_STAT_DEFINITIONS.every(({ key }) => {
    const stat = (value as Record<string, unknown>)[key];
    return Number.isSafeInteger(stat) && (stat as number) > 0;
  });
}

export function getPokemonBaseStatTotal(stats: PokemonBaseStats): number {
  return POKEMON_BASE_STAT_DEFINITIONS.reduce(
    (total, { key }) => total + stats[key],
    0
  );
}
