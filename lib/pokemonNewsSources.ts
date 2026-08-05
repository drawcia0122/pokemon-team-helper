import type {
  PokemonNewsCategory,
  PokemonNewsGameTitle,
  PokemonNewsSourceId
} from "@/types/pokemonContent";

export type PokemonNewsAutomationStatus =
  | "automatic"
  | "manual"
  | "pending"
  | "disabled"
  | "unsupported";
export type PokemonNewsPolicyStatus =
  | "approved"
  | "pending-review"
  | "disabled-by-policy";
export type PokemonNewsSourceType =
  | "rss"
  | "atom"
  | "json-feed"
  | "official-api"
  | "manual";
export type PokemonNewsSourceFreshness =
  | "fresh"
  | "aging"
  | "stale"
  | "failing"
  | "never-fetched"
  | "manual-check-needed";

export type PokemonNewsSourceDefinition = {
  id: PokemonNewsSourceId;
  name: string;
  homepageUrl: string;
  feedUrl: string | null;
  sourceType: PokemonNewsSourceType;
  official: true;
  categories: PokemonNewsCategory[];
  gameTitles: PokemonNewsGameTitle[];
  automationStatus: PokemonNewsAutomationStatus;
  policyStatus: PokemonNewsPolicyStatus;
  enabled: boolean;
  rssAvailable: boolean;
  apiAvailable: boolean;
  policyFinding: string;
  fetchMethod: string;
  lastCheckedAt: string;
  lastSuccessfulFetchAt: string | null;
  lastArticlePublishedAt: string | null;
  lastManualCheckedAt: string | null;
  lastManualArticleAddedAt: string | null;
  recommendedCheckDays: number | null;
  consecutiveFailures: number;
  staleAfterDays: number;
  adminCheckUrl: string;
  notes: string;
};

const checkedAt = "2026-08-05";

export const POKEMON_NEWS_SOURCE_REGISTRY = {
  "pokemon-japan-news": {
    id: "pokemon-japan-news", name: "ポケットモンスターオフィシャルサイト", homepageUrl: "https://www.pokemon.co.jp/info/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["goods", "game", "event", "card", "anime-video", "collaboration", "competition"], gameTitles: ["ポケモン本編", "Pokémon LEGENDS", "Pokémon Champions"],
    automationStatus: "manual", policyStatus: "disabled-by-policy", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "ご利用についてで文章等の複製・電送・公衆ネットワーク利用が制限され、再利用許可を確認できない。", fetchMethod: "管理者による公式ページ確認", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: "2026-07-10", lastManualCheckedAt: checkedAt, lastManualArticleAddedAt: "2026-07-10", recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://www.pokemon.co.jp/info/", notes: "ゲーム・カード・映像・イベントを横断する公式一覧。HTML自動取得は行わない。"
  },
  "pokemon-center-japan": {
    id: "pokemon-center-japan", name: "ポケモンセンター公式サイト", homepageUrl: "https://www.pokemoncenter-online.com/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["goods", "event", "collaboration"], gameTitles: [], automationStatus: "manual", policyStatus: "pending-review", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "公式RSS/APIとメタデータ再利用の明示許可を確認できない。", fetchMethod: "管理者による公式ページ確認", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: "2026-07-07", lastManualCheckedAt: checkedAt, lastManualArticleAddedAt: "2026-07-07", recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://www.pokemoncenter-online.com/", notes: "商品・キャンペーンは手動更新対象。"
  },
  "pokemon-go-official-rss": {
    id: "pokemon-go-official-rss", name: "Pokémon GO公式", homepageUrl: "https://pokemongo.com/news", feedUrl: "https://pokemongo.com/feed",
    sourceType: "rss", official: true, categories: ["game", "event", "collaboration"], gameTitles: ["Pokémon GO"], automationStatus: "disabled", policyStatus: "disabled-by-policy", enabled: false, rssAvailable: true, apiAvailable: false,
    policyFinding: "公開RSSは存在するが、Scopely利用規約のServices/Contentのextract・scrape・index禁止を確認。", fetchMethod: "通信しない（fixtureのみ）", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: "2026-07-18", lastManualCheckedAt: checkedAt, lastManualArticleAddedAt: "2026-07-18", recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://pokemongo.com/news", notes: "許可状態を変更できる根拠が得られるまでcollectorを無効化。"
  },
  "pokemon-champions-news": {
    id: "pokemon-champions-news", name: "Pokémon Champions", homepageUrl: "https://champions.pokemon.com/en-us/news/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["game", "competition"], gameTitles: ["Pokémon Champions"], automationStatus: "pending", policyStatus: "pending-review", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "利用条件本文と自動取得許可を十分に確認できない。", fetchMethod: "確認待ち", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: null, lastManualCheckedAt: null, lastManualArticleAddedAt: null, recommendedCheckDays: 14, consecutiveFailures: 0, staleAfterDays: 21,
    adminCheckUrl: "https://champions.pokemon.com/en-us/news/", notes: "英語公式ニュース。"
  },
  "pokemon-unite-news": {
    id: "pokemon-unite-news", name: "Pokémon UNITE公式", homepageUrl: "https://unite.pokemon.com/en-us/news/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["game", "event", "competition", "anime-video"], gameTitles: ["Pokémon UNITE"], automationStatus: "pending", policyStatus: "pending-review", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "公式ニュース一覧は確認できたが、RSS/APIと再利用許可を確認できない。", fetchMethod: "確認待ち", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: "2026-07-15", lastManualCheckedAt: null, lastManualArticleAddedAt: null, recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://unite.pokemon.com/en-us/news/", notes: "HTML一覧への定期アクセスは実装しない。"
  },
  "pokemon-sleep-news": {
    id: "pokemon-sleep-news", name: "Pokémon Sleep公式", homepageUrl: "https://www.pokemonsleep.net/en/news/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["game", "event", "collaboration"], gameTitles: ["Pokémon Sleep"], automationStatus: "pending", policyStatus: "pending-review", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "公式ニュース一覧は確認できたが、RSS/APIと再利用許可を確認できない。", fetchMethod: "確認待ち", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: null, lastManualCheckedAt: null, lastManualArticleAddedAt: null, recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://www.pokemonsleep.net/en/news/", notes: "ページ内APIを推測利用しない。"
  },
  "pokemon-masters-ex-news": {
    id: "pokemon-masters-ex-news", name: "Pokémon Masters EX公式", homepageUrl: "https://pokemonmasters-game.com/en-US/announcements", feedUrl: null,
    sourceType: "manual", official: true, categories: ["game", "event"], gameTitles: ["Pokémon Masters EX"], automationStatus: "disabled", policyStatus: "disabled-by-policy", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "公式記事内でサービス利用時のautomated means禁止を確認。", fetchMethod: "管理者による公式ページ確認", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: "2026-06-27", lastManualCheckedAt: null, lastManualArticleAddedAt: null, recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://pokemonmasters-game.com/en-US/announcements", notes: "自動アクセスは行わない。"
  },
  "pokemon-tcgp-news": {
    id: "pokemon-tcgp-news", name: "ポケポケ公式", homepageUrl: "https://www.pokemontcgpocket.com/ja/news/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["game", "card", "event"], gameTitles: ["ポケポケ"], automationStatus: "pending", policyStatus: "pending-review", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "公式ニュース一覧は確認できたが、RSS/APIと再利用許可を確認できない。", fetchMethod: "確認待ち", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: null, lastManualCheckedAt: null, lastManualArticleAddedAt: null, recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://www.pokemontcgpocket.com/ja/news/", notes: "サポートJSON等の非公開経路を推測利用しない。"
  },
  "pokemon-card-japan": {
    id: "pokemon-card-japan", name: "ポケモンカードゲーム公式", homepageUrl: "https://www.pokemon-card.com/info/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["card", "goods", "event", "competition"], gameTitles: [], automationStatus: "manual", policyStatus: "pending-review", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "公式一覧は確認できたが、RSS/APIと自動再利用許可を確認できない。", fetchMethod: "管理者による公式ページ確認", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: "2026-08-03", lastManualCheckedAt: checkedAt, lastManualArticleAddedAt: null, recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://www.pokemon-card.com/info/", notes: "カード・大会情報の手動追加候補。"
  },
  "pokemon-official-youtube": {
    id: "pokemon-official-youtube", name: "ポケモン公式YouTubeチャンネル", homepageUrl: "https://www.youtube.com/@PokemonCoJp", feedUrl: null,
    sourceType: "official-api", official: true, categories: ["anime-video", "game", "card", "event"], gameTitles: [], automationStatus: "unsupported", policyStatus: "pending-review", enabled: false, rssAvailable: false, apiAvailable: true,
    policyFinding: "YouTube Data APIの認証・利用条件・quota運用を本Taskでは導入していない。", fetchMethod: "YouTube Data API導入待ち", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: null, lastManualCheckedAt: null, lastManualArticleAddedAt: null, recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://www.youtube.com/@PokemonCoJp/videos", notes: "HTMLや検索結果の収集は行わない。"
  },
  "pokemon-official-anime": {
    id: "pokemon-official-anime", name: "テレビアニメ ポケットモンスター公式", homepageUrl: "https://www.tv-tokyo.co.jp/anime/pocketmonster2023/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["anime-video"], gameTitles: [], automationStatus: "manual", policyStatus: "pending-review", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "RSS/APIとメタデータ再利用の明示許可を確認できない。", fetchMethod: "管理者による公式ページ確認", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: null, lastManualCheckedAt: null, lastManualArticleAddedAt: null, recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://www.tv-tokyo.co.jp/anime/pocketmonster2023/", notes: "映像記事の手動追加候補。"
  },
  "pokemon-official-events": {
    id: "pokemon-official-events", name: "ポケモン公式イベント情報", homepageUrl: "https://www.pokemon.co.jp/event/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["event", "competition", "collaboration"], gameTitles: [], automationStatus: "manual", policyStatus: "disabled-by-policy", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "pokemon.co.jpのコンテンツ再利用制限が適用される。", fetchMethod: "管理者による公式ページ確認", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: null, lastManualCheckedAt: checkedAt, lastManualArticleAddedAt: null, recommendedCheckDays: 7, consecutiveFailures: 0, staleAfterDays: 14,
    adminCheckUrl: "https://www.pokemon.co.jp/event/", notes: "開催回を過剰重複排除しない。"
  },
  "pokemon-company-press": {
    id: "pokemon-company-press", name: "株式会社ポケモン プレスリリース", homepageUrl: "https://corporate.pokemon.co.jp/media/pressreleases", feedUrl: null,
    sourceType: "manual", official: true, categories: ["game", "goods", "event", "anime-video", "collaboration"], gameTitles: [], automationStatus: "manual", policyStatus: "pending-review", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "公式一覧は確認できたが、RSS/APIと一般向け自動再利用許可を確認できない。", fetchMethod: "管理者による公式ページ確認", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: "2026-03-12", lastManualCheckedAt: null, lastManualArticleAddedAt: null, recommendedCheckDays: 14, consecutiveFailures: 0, staleAfterDays: 30,
    adminCheckUrl: "https://corporate.pokemon.co.jp/media/pressreleases", notes: "PR TIMESの会社別RSSは第三者規約のため使用しない。"
  },
  "pokemon-legends-news": {
    id: "pokemon-legends-news", name: "Pokémon LEGENDS公式情報", homepageUrl: "https://www.pokemon.co.jp/ex/legends_z-a/ja/news/", feedUrl: null,
    sourceType: "manual", official: true, categories: ["game"], gameTitles: ["Pokémon LEGENDS"], automationStatus: "manual", policyStatus: "disabled-by-policy", enabled: false, rssAvailable: false, apiAvailable: false,
    policyFinding: "pokemon.co.jpのコンテンツ再利用制限が適用される。", fetchMethod: "管理者による公式ページ確認", lastCheckedAt: checkedAt,
    lastSuccessfulFetchAt: null, lastArticlePublishedAt: "2025-10-16", lastManualCheckedAt: null, lastManualArticleAddedAt: null, recommendedCheckDays: 14, consecutiveFailures: 0, staleAfterDays: 30,
    adminCheckUrl: "https://www.pokemon.co.jp/ex/legends_z-a/ja/news/", notes: "本編公式一覧と重複する場合は公式優先dedupeを利用。"
  }
} satisfies Record<PokemonNewsSourceId, PokemonNewsSourceDefinition>;

function dayAge(value: string | null, now: Date): number | null {
  if (!value) return null;
  return Math.max(0, (now.getTime() - new Date(`${value.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000);
}

export function getPokemonNewsSourceFreshness(
  source: PokemonNewsSourceDefinition,
  now = new Date()
): PokemonNewsSourceFreshness {
  if (source.consecutiveFailures > 0) return "failing";
  if (source.automationStatus === "manual") {
    const age = dayAge(source.lastManualCheckedAt, now);
    return age === null || age > source.staleAfterDays ? "manual-check-needed" : age > source.staleAfterDays / 2 ? "aging" : "fresh";
  }
  if (source.automationStatus === "pending" || source.automationStatus === "disabled" || source.automationStatus === "unsupported") {
    const age = dayAge(source.lastCheckedAt, now);
    return age !== null && age > source.staleAfterDays ? "stale" : "never-fetched";
  }
  const age = dayAge(source.lastSuccessfulFetchAt, now);
  if (age === null) return "never-fetched";
  if (age > source.staleAfterDays) return "stale";
  if (age > source.staleAfterDays / 2) return "aging";
  return "fresh";
}

export function listPokemonNewsSources(): PokemonNewsSourceDefinition[] {
  return Object.values(POKEMON_NEWS_SOURCE_REGISTRY);
}
