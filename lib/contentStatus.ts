import type { ContentStatus, PokemonContentItem } from "@/types/pokemonContent";

function dayNumber(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00Z`).getTime() / 86_400_000);
}

export function getContentStatuses(
  item: PokemonContentItem,
  today = "2026-07-18"
): ContentStatus[] {
  const statuses: ContentStatus[] = [];
  const now = dayNumber(today);

  if (item.preorderStartDate && item.preorderDeadlineDate) {
    const start = dayNumber(item.preorderStartDate);
    const end = dayNumber(item.preorderDeadlineDate);
    if (now < start) statuses.push("preorder-before");
    else if (now > end) statuses.push("preorder-ended");
    else {
      statuses.push("preorder-open");
      if (end - now <= 7) statuses.push("deadline-soon");
    }
  }

  if (item.releaseDate) {
    statuses.push(now < dayNumber(item.releaseDate) ? "release-upcoming" : "released");
  }

  if (item.eventStartDate && item.eventEndDate) {
    const start = dayNumber(item.eventStartDate);
    const end = dayNumber(item.eventEndDate);
    if (now < start) statuses.push("event-upcoming");
    else if (now > end) statuses.push("event-ended");
    else {
      statuses.push("event-ongoing");
      if (end - now <= 7) statuses.push("deadline-soon");
    }
  }

  return [...new Set(statuses)];
}
