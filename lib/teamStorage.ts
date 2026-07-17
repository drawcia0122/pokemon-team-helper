import type { TeamSlot } from "@/types/pokemon";

export function parseStoredTeam(value: string): TeamSlot[] {
  return JSON.parse(value) as TeamSlot[];
}

export function serializeTeam(team: TeamSlot[]): string {
  return JSON.stringify(team);
}
