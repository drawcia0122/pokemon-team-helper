export type ContentKind = "news" | "goods" | "event" | "campaign" | "game-update";

export type PokemonContentItem = {
  id: string;
  kind: ContentKind;
  title: string;
  summary: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  pokemonSlugs: string[];
  tags: string[];
  releaseDate?: string;
  preorderStartDate?: string;
  preorderDeadlineDate?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  priceLabel?: string;
  salesLocation?: string;
  targetGame?: string;
  platforms?: string[];
};

export type ContentStatus =
  | "preorder-before"
  | "preorder-open"
  | "deadline-soon"
  | "preorder-ended"
  | "release-upcoming"
  | "released"
  | "event-upcoming"
  | "event-ongoing"
  | "event-ended";
