import type { PokemonBaseStats, TeamSlot } from "@/types/pokemon";

export const POKEMON_BASE_STAT_CHART_MAX = 255;

export const POKEMON_BASE_STAT_DEFINITIONS = [
  { key: "hp", label: "HP", chartLabel: "HP" },
  { key: "attack", label: "こうげき", chartLabel: "攻" },
  { key: "defense", label: "ぼうぎょ", chartLabel: "防" },
  { key: "specialAttack", label: "とくこう", chartLabel: "特攻" },
  { key: "specialDefense", label: "とくぼう", chartLabel: "特防" },
  { key: "speed", label: "すばやさ", chartLabel: "素早" }
] as const satisfies ReadonlyArray<{
  key: keyof PokemonBaseStats;
  label: string;
  chartLabel: string;
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

export function getRadarPoint(
  index: number,
  value: number,
  maximum = POKEMON_BASE_STAT_CHART_MAX,
  radius = 78,
  center = 100
): { x: number; y: number } {
  const safeMaximum = maximum > 0 ? maximum : POKEMON_BASE_STAT_CHART_MAX;
  const ratio = Math.min(Math.max(value, 0), safeMaximum) / safeMaximum;
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;

  return {
    x: center + Math.cos(angle) * radius * ratio,
    y: center + Math.sin(angle) * radius * ratio
  };
}

export function getRadarPolygonPoints(
  values: readonly number[],
  maximum = POKEMON_BASE_STAT_CHART_MAX,
  radius = 78,
  center = 100
): string {
  return values
    .map((value, index) => {
      const point = getRadarPoint(index, value, maximum, radius, center);
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(" ");
}

export function resolveSelectedPokemonSlotId(
  team: readonly TeamSlot[],
  preferredSlotId: string | null
): string | null {
  const pokemonSlots = team.filter(
    (slot): slot is Extract<TeamSlot, { mode: "pokemon" }> =>
      slot.mode === "pokemon"
  );

  return (
    pokemonSlots.find((slot) => slot.id === preferredSlotId)?.id ??
    pokemonSlots[0]?.id ??
    null
  );
}
