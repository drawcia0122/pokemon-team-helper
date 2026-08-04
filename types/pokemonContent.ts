export type ContentKind = "news" | "goods" | "event" | "campaign" | "game-update";

export type PokemonNewsCategory =
  | "goods"
  | "game"
  | "event"
  | "card"
  | "anime-video"
  | "collaboration"
  | "competition";

export type PokemonNewsGameTitle =
  | "ポケモン本編"
  | "Pokémon LEGENDS"
  | "Pokémon Champions"
  | "Pokémon GO"
  | "Pokémon UNITE"
  | "Pokémon Sleep"
  | "Pokémon Masters EX"
  | "ポケポケ"
  | "その他ゲーム";

export type PokemonContentSource = "pokemon-go-official-rss";

export type PokemonContentCollectionStatus = "active";

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
  categories?: PokemonNewsCategory[];
  gameTitles?: PokemonNewsGameTitle[];
  official?: boolean;
  importance?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
  thumbnail?: string;
  image?: string;
  ogImage?: string;
  twitterImage?: string;
  releaseDate?: string;
  preorderStartDate?: string;
  preorderDeadlineDate?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  priceLabel?: string;
  salesLocation?: string;
  targetGame?: string;
  platforms?: string[];
  location?: string;
  isOnline?: boolean;
};

export type PokemonNewsArticle = PokemonContentItem & {
  sourceUrl: string;
  categories: PokemonNewsCategory[];
  gameTitles: PokemonNewsGameTitle[];
  official: boolean;
  importance: number;
  imageUrl?: string;
  classificationEvidence: string[];
};

export type GeneratedPokemonContentItem = PokemonContentItem & {
  source: PokemonContentSource;
  sourceArticleId: string;
  canonicalUrl: string;
  firstCollectedAt: string;
  lastCollectedAt: string;
  contentFingerprint: string;
  collectorVersion: string;
  status: PokemonContentCollectionStatus;
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
