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

export type PokemonNewsSourceId =
  | "pokemon-japan-news"
  | "pokemon-center-japan"
  | "pokemon-go-official-rss"
  | "pokemon-champions-news"
  | "pokemon-unite-news"
  | "pokemon-sleep-news"
  | "pokemon-masters-ex-news"
  | "pokemon-tcgp-news"
  | "pokemon-card-japan"
  | "pokemon-official-youtube"
  | "pokemon-official-anime"
  | "pokemon-official-events"
  | "pokemon-company-press"
  | "pokemon-legends-news"
  | "4gamer-rss"
  | "inside-rss"
  | "gnews-api";

export type PokemonContentSource =
  | "pokemon-go-official-rss"
  | "4gamer-rss"
  | "inside-rss"
  | "gnews-api";

export type PokemonNewsSourceKind = "official" | "media";
export type PokemonNewsContentType = "news" | "editorial" | "unknown";

export type PokemonNewsEventType =
  | "new-title"
  | "update"
  | "maintenance"
  | "new-event"
  | "new-season"
  | "distribution"
  | "balance-adjustment"
  | "new-pokemon"
  | "dlc"
  | "issue"
  | "new-product"
  | "reservation-start"
  | "release"
  | "restock"
  | "lottery"
  | "made-to-order"
  | "new-expansion"
  | "deck"
  | "tournament"
  | "campaign"
  | "rule-change"
  | "event-announcement"
  | "event-ongoing"
  | "ending-soon"
  | "real-event"
  | "stream"
  | "pokemon-presents"
  | "new-pv"
  | "new-video"
  | "new-anime"
  | "food-collaboration"
  | "apparel-collaboration"
  | "convenience-store-collaboration"
  | "corporate-collaboration";

export type PokemonNewsImageSource =
  | "rss"
  | "api"
  | "existing"
  | "pokemon-db"
  | "fallback"
  | "none";

export type PokemonNewsImageOrigin =
  | "rss-media-content"
  | "rss-media-thumbnail"
  | "rss-enclosure"
  | "api-image"
  | "rss-content-html"
  | "rss-description-html"
  | "rss-image-field"
  | "existing-image"
  | "pokemon-db"
  | "fallback"
  | "none";

export type PokemonNewsRelatedSource = {
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
};

export type PokemonNewsArticleFreshness =
  | "current"
  | "upcoming"
  | "ending-soon"
  | "expired"
  | "archived";

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
  sourceId?: PokemonNewsSourceId;
  sourceKind?: PokemonNewsSourceKind;
  contentType?: PokemonNewsContentType;
  relevanceScore?: number;
  relatedSources?: PokemonNewsRelatedSource[];
  categories?: PokemonNewsCategory[];
  gameTitles?: PokemonNewsGameTitle[];
  official?: boolean;
  importance?: number;
  eventTypes?: PokemonNewsEventType[];
  insight?: string;
  rssImageUrl?: string;
  apiImageUrl?: string;
  imageUrl?: string;
  imageSource?: PokemonNewsImageSource;
  imageOrigin?: PokemonNewsImageOrigin;
  imageExtractionEvidence?: string[];
  imageWidth?: number;
  imageHeight?: number;
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
  sourceKind: PokemonNewsSourceKind;
  contentType: PokemonNewsContentType;
  relevanceScore: number;
  relatedSources: PokemonNewsRelatedSource[];
  importance: number;
  eventTypes: PokemonNewsEventType[];
  insight: string;
  imageUrl?: string;
  imageSource: PokemonNewsImageSource;
  imageOrigin: PokemonNewsImageOrigin;
  imageQualityEvidence: string[];
  classificationEvidence: string[];
  freshness: PokemonNewsArticleFreshness;
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
