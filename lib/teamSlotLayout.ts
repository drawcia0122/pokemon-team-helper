import type { TeamSlot } from "@/types/pokemon";

export const TEAM_SLOT_COUNT = 6;

export type TeamSlotWithoutId =
  | Omit<Extract<TeamSlot, { mode: "pokemon" }>, "id">
  | Omit<Extract<TeamSlot, { mode: "type" }>, "id">;

function getFixedSlotIndex(slotId: string): number | null {
  const match = /^slot-([1-6])$/.exec(slotId);
  return match ? Number(match[1]) - 1 : null;
}

export function getTeamSlotsByPosition(
  team: readonly TeamSlot[]
): Array<TeamSlot | null> {
  const positions: Array<TeamSlot | null> = Array.from(
    { length: TEAM_SLOT_COUNT },
    () => null
  );
  const unplaced: TeamSlot[] = [];

  for (const slot of team.slice(0, TEAM_SLOT_COUNT)) {
    const fixedIndex = getFixedSlotIndex(slot.id);
    if (fixedIndex !== null && positions[fixedIndex] === null) {
      positions[fixedIndex] = slot;
    } else {
      unplaced.push(slot);
    }
  }

  for (const slot of unplaced) {
    const emptyIndex = positions.findIndex((entry) => entry === null);
    if (emptyIndex === -1) break;
    positions[emptyIndex] = slot;
  }

  return positions;
}

export function setTeamSlotAtPosition(
  team: readonly TeamSlot[],
  position: number,
  nextSlot: TeamSlotWithoutId | TeamSlot
): TeamSlot[] {
  if (position < 0 || position >= TEAM_SLOT_COUNT) return [...team];

  const currentSlot = getTeamSlotsByPosition(team)[position];
  const id = currentSlot?.id ?? `slot-${position + 1}`;
  const replacement = { ...nextSlot, id } as TeamSlot;

  if (!currentSlot) return [...team, replacement];
  return team.map((slot) => (slot === currentSlot ? replacement : slot));
}

export function clearTeamSlotAtPosition(
  team: readonly TeamSlot[],
  position: number
): TeamSlot[] {
  const currentSlot = getTeamSlotsByPosition(team)[position];
  return currentSlot ? team.filter((slot) => slot !== currentSlot) : [...team];
}

export function addTeamSlotToFirstEmpty(
  team: readonly TeamSlot[],
  nextSlot: TeamSlotWithoutId
): TeamSlot[] {
  const emptyPosition = getTeamSlotsByPosition(team).findIndex(
    (slot) => slot === null
  );
  return emptyPosition === -1
    ? [...team]
    : setTeamSlotAtPosition(team, emptyPosition, nextSlot);
}
