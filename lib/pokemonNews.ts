import type {
  PokemonContentItem,
  PokemonNewsArticle,
  PokemonNewsArticleFreshness,
  PokemonNewsCategory,
  PokemonNewsGameTitle
} from "@/types/pokemonContent";

export const POKEMON_NEWS_CATEGORY_LABELS: Record<PokemonNewsCategory, string> = {
  goods: "グッズ",
  game: "ゲーム",
  event: "イベント",
  card: "ポケモンカード",
  "anime-video": "アニメ・映像",
  collaboration: "コラボ",
  competition: "対戦・大会"
};

const OFFICIAL_HOSTS = new Set([
  "www.pokemon.co.jp",
  "pokemon.co.jp",
  "shop.pokemon.co.jp",
  "pokemongo.com",
  "www.pokemongo.com",
  "pokemongolive.com",
  "www.pokemongolive.com",
  "champions.pokemon.com"
]);

const CATEGORY_RULES: Array<{
  category: PokemonNewsCategory;
  pattern: RegExp;
}> = [
  { category: "goods", pattern: /発売|予約|商品|グッズ|ぬいぐるみ|マスコット|フィギュア|缶バッジ|キーホルダー/i },
  { category: "game", pattern: /アップデート|メンテナンス|シーズン|ゲーム|アプリ|Nintendo Switch|Pok[eé]mon (?:GO|UNITE|Sleep|Masters|Champions|HOME)|ポケポケ|スカーレット|バイオレット|LEGENDS/i },
  { category: "event", pattern: /開催|会場|参加受付|イベント|グリーティング|フェス|Fest|体験企画|観覧/i },
  { category: "card", pattern: /ポケモンカード|ポケカ|拡張パック|スターターデッキ|カード大会|トレーナーズウェブ/i },
  { category: "anime-video", pattern: /アニメ|映画|映像|動画|PV|YouTube|配信/i },
  { category: "collaboration", pattern: /コラボ|キャンペーン|プレゼント|タイアップ|記念シール/i },
  { category: "competition", pattern: /大会|選手権|チャンピオンシップ|WCS\d*|レギュレーション|ランキングバトル|予選/i }
];

const GAME_TITLE_RULES: Array<{
  title: PokemonNewsGameTitle;
  pattern: RegExp;
}> = [
  { title: "Pokémon Champions", pattern: /Pok[eé]mon Champions|ポケモンチャンピオンズ/i },
  { title: "Pokémon GO", pattern: /Pok[eé]mon GO|ポケモンGO/i },
  { title: "Pokémon UNITE", pattern: /Pok[eé]mon UNITE|ポケモンユナイト/i },
  { title: "Pokémon Sleep", pattern: /Pok[eé]mon Sleep|ポケモンスリープ/i },
  { title: "Pokémon Masters EX", pattern: /Pok[eé]mon Masters EX|ポケモンマスターズ EX|ポケマスEX/i },
  { title: "ポケポケ", pattern: /Pok[eé]mon Trading Card Game Pocket|ポケポケ/i },
  { title: "Pokémon LEGENDS", pattern: /Pok[eé]mon LEGENDS|Pok[eé]mon Legends|ポケモンレジェンズ/i },
  { title: "ポケモン本編", pattern: /ポケットモンスター (?:スカーレット|バイオレット|ソード|シールド)|Pok[eé]mon (?:Scarlet|Violet|Sword|Shield)/i }
];

function normalizedText(item: PokemonContentItem): string {
  return [
    item.title,
    item.summary,
    item.sourceName,
    item.targetGame ?? "",
    ...item.tags
  ].join(" ").normalize("NFKC");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function resolvePokemonNewsImage(
  item: PokemonContentItem
): string | undefined {
  for (const value of [
    item.thumbnailUrl,
    item.thumbnail,
    item.image,
    item.ogImage,
    item.twitterImage,
    item.imageUrl
  ]) {
    if (typeof value !== "string" || value.trim() === "") continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") continue;
      if (/favicon|(?:^|[\/_-])logo(?:[\/_\.-]|$)/i.test(url.pathname)) continue;
      return url.toString();
    } catch {
      continue;
    }
  }
  return undefined;
}

export function classifyPokemonNews(item: PokemonContentItem): {
  categories: PokemonNewsCategory[];
  gameTitles: PokemonNewsGameTitle[];
  evidence: string[];
  relevant: boolean;
} {
  const text = normalizedText(item);
  const evidence: string[] = [];
  const explicitCategories = item.categories ?? [];
  const inferredCategories = CATEGORY_RULES
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => {
      evidence.push(`category:${rule.category}`);
      return rule.category;
    });
  const legacyCategories: PokemonNewsCategory[] = [];
  if (item.kind === "goods") legacyCategories.push("goods");
  if (item.kind === "event") legacyCategories.push("event");
  if (item.kind === "campaign") legacyCategories.push("collaboration");
  if (item.kind === "game-update") legacyCategories.push("game");
  const categories = unique([
    ...explicitCategories,
    ...legacyCategories,
    ...inferredCategories
  ]);

  const inferredGameTitles = GAME_TITLE_RULES
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => {
      evidence.push(`game:${rule.title}`);
      return rule.title;
    });
  if (
    categories.includes("game") &&
    inferredGameTitles.length === 0 &&
    /Pok[eé]mon HOME|ポケモンHOME/i.test(text)
  ) {
    inferredGameTitles.push("その他ゲーム");
    evidence.push("game:その他ゲーム");
  }
  const gameTitles = unique([...(item.gameTitles ?? []), ...inferredGameTitles]);

  let hostname = "";
  try {
    hostname = new URL(item.url).hostname.toLocaleLowerCase("en");
  } catch {
    // URL validation reports malformed URLs separately.
  }
  const official = item.official ?? OFFICIAL_HOSTS.has(hostname);
  if (official) evidence.push("relevance:official-source");
  const strongPokemonEvidence =
    /ポケットモンスター|Pok[eé]mon (?:Center|GO|UNITE|Sleep|Masters|Champions|HOME|LEGENDS|Trading Card)|ポケモン(?:センター|カード|ゲーム|大会|イベント|グッズ|コラボ|キャンペーン|新商品)|ポケカ|WCS\d*/i.test(text) ||
    item.pokemonSlugs.length > 0 ||
    gameTitles.length > 0;
  if (strongPokemonEvidence) evidence.push("relevance:explicit-pokemon-evidence");

  return {
    categories,
    gameTitles,
    evidence: unique(evidence),
    relevant: official || strongPokemonEvidence
  };
}

export function inferPokemonNewsImportance(
  item: PokemonContentItem,
  categories: PokemonNewsCategory[]
): number {
  if (typeof item.importance === "number") {
    return Math.max(0, Math.min(100, Math.round(item.importance)));
  }
  const text = normalizedText(item);
  let score = 45;
  if (/新作|初公開|Pok[eé]mon Presents|大型アップデート|重要なお知らせ/i.test(text)) score += 35;
  if (/WCS\d*|世界大会|チャンピオンシップ|新商品シリーズ/i.test(text)) score += 25;
  if (categories.length >= 2) score += 8;
  if (item.eventStartDate || item.releaseDate || item.preorderDeadlineDate) score += 8;
  return Math.max(0, Math.min(100, score));
}

export function normalizePokemonNewsItem(
  item: PokemonContentItem,
  now = new Date()
): PokemonNewsArticle | null {
  const classification = classifyPokemonNews(item);
  if (!classification.relevant || classification.categories.length === 0) return null;
  return {
    ...item,
    sourceUrl: item.url,
    categories: classification.categories,
    gameTitles: classification.gameTitles,
    official: item.official ?? classification.evidence.includes("relevance:official-source"),
    importance: inferPokemonNewsImportance(item, classification.categories),
    imageUrl: resolvePokemonNewsImage(item),
    classificationEvidence: classification.evidence,
    freshness: getPokemonNewsArticleFreshness(item, now)
  };
}

function isoDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function daysFromToday(value: string, today: string): number {
  return (
    new Date(`${value}T00:00:00Z`).getTime() -
    new Date(`${today}T00:00:00Z`).getTime()
  ) / 86_400_000;
}

export function getPokemonNewsArticleFreshness(
  item: PokemonContentItem,
  now = new Date()
): PokemonNewsArticleFreshness {
  const today = isoDay(now);
  if (item.eventEndDate && daysFromToday(item.eventEndDate, today) < 0) {
    return "expired";
  }
  const upcomingDates = [
    item.releaseDate,
    item.preorderStartDate,
    item.eventStartDate
  ].filter((value): value is string => Boolean(value));
  if (upcomingDates.some((value) => daysFromToday(value, today) > 0)) {
    return "upcoming";
  }
  const endingDates = [item.preorderDeadlineDate, item.eventEndDate].filter(
    (value): value is string => Boolean(value)
  );
  if (
    endingDates.some((value) => {
      const days = daysFromToday(value, today);
      return days >= 0 && days <= 7;
    })
  ) {
    return "ending-soon";
  }
  if (
    item.preorderDeadlineDate &&
    daysFromToday(item.preorderDeadlineDate, today) < 0 &&
    !item.releaseDate &&
    !item.eventStartDate
  ) {
    return "expired";
  }
  if (daysFromToday(item.publishedAt, today) < -365) return "archived";
  return "current";
}

export function normalizePokemonNewsTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[『』「」【】\[\]（）()・!！?？:：,，.。\s]/g, "")
    .replace(/(?:のお知らせ|について|開催決定|登場)$/g, "");
}

function dayDistance(left: string, right: string): number {
  const leftTime = new Date(`${left}T00:00:00Z`).getTime();
  const rightTime = new Date(`${right}T00:00:00Z`).getTime();
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

export type PokemonNewsFeedReport = {
  articles: PokemonNewsArticle[];
  fetchedCount: number;
  duplicateCount: number;
  excluded: Array<{ id: string; reason: string }>;
  unclassified: string[];
};

export function buildPokemonNewsFeed(
  items: PokemonContentItem[],
  now = new Date()
): PokemonNewsFeedReport {
  const accepted: PokemonNewsArticle[] = [];
  const excluded: PokemonNewsFeedReport["excluded"] = [];
  const unclassified: string[] = [];
  const canonicalUrls = new Set<string>();
  const titleCandidates = new Map<string, number>();
  let duplicateCount = 0;

  const candidates = items
    .map((item) => ({ raw: item, normalized: normalizePokemonNewsItem(item, now) }))
    .sort((left, right) => {
      const officialDifference = Number(right.normalized?.official ?? false) - Number(left.normalized?.official ?? false);
      return officialDifference || right.raw.publishedAt.localeCompare(left.raw.publishedAt);
    });

  for (const { raw, normalized } of candidates) {
    if (!normalized) {
      const classification = classifyPokemonNews(raw);
      if (classification.categories.length === 0) unclassified.push(raw.id);
      excluded.push({ id: raw.id, reason: classification.relevant ? "unclassified" : "not-pokemon-related" });
      continue;
    }
    let canonicalUrl: string;
    try {
      const url = new URL(normalized.sourceUrl);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (key.toLocaleLowerCase("en").startsWith("utm_")) url.searchParams.delete(key);
      }
      canonicalUrl = url.toString().replace(/\/$/, "");
    } catch {
      excluded.push({ id: raw.id, reason: "invalid-url" });
      continue;
    }
    const titleKey = normalizePokemonNewsTitle(normalized.title);
    const titleMatchIndex = titleCandidates.get(titleKey);
    const titleMatch = titleMatchIndex === undefined ? undefined : accepted[titleMatchIndex];
    if (
      canonicalUrls.has(canonicalUrl) ||
      (titleMatch !== undefined &&
        dayDistance(titleMatch.publishedAt, normalized.publishedAt) <= 3 &&
        (!titleMatch.releaseDate || !normalized.releaseDate || titleMatch.releaseDate === normalized.releaseDate) &&
        (!titleMatch.eventStartDate || !normalized.eventStartDate || titleMatch.eventStartDate === normalized.eventStartDate))
    ) {
      duplicateCount += 1;
      continue;
    }
    canonicalUrls.add(canonicalUrl);
    titleCandidates.set(titleKey, accepted.length);
    accepted.push(normalized);
  }

  accepted.sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id)
  );
  return { articles: accepted, fetchedCount: items.length, duplicateCount, excluded, unclassified };
}

function explicitDate(value: string): string | undefined {
  const iso = value.match(/\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\b/);
  if (!iso) return undefined;
  const result = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const date = new Date(`${result}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || !date.toISOString().startsWith(result)
    ? undefined
    : result;
}

export function extractReliablePokemonNewsDates(
  title: string,
  summary: string
): Partial<Pick<PokemonContentItem, "releaseDate" | "preorderStartDate" | "preorderDeadlineDate" | "eventStartDate" | "eventEndDate">> {
  const text = `${title} ${summary}`.normalize("NFKC");
  const release = text.match(/((?:20\d{2})[-/.年]\d{1,2}[-/.月]\d{1,2}日?)[^。]{0,12}(?:発売|リリース)/);
  const reservationStart = text.match(/((?:20\d{2})[-/.年]\d{1,2}[-/.月]\d{1,2}日?)[^。]{0,12}(?:予約開始|受付開始)/);
  const reservationEnd = text.match(/((?:20\d{2})[-/.年]\d{1,2}[-/.月]\d{1,2}日?)[^。]{0,12}(?:予約終了|予約締切|応募締切|抽選締切|受付終了)/);
  const eventRange = text.match(/((?:20\d{2})[-/.年]\d{1,2}[-/.月]\d{1,2}日?)[^。]{0,8}(?:から|〜|～|-)[^。]{0,8}((?:20\d{2})[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/);
  return {
    ...(release ? { releaseDate: explicitDate(release[1]) } : {}),
    ...(reservationStart ? { preorderStartDate: explicitDate(reservationStart[1]) } : {}),
    ...(reservationEnd ? { preorderDeadlineDate: explicitDate(reservationEnd[1]) } : {}),
    ...(eventRange
      ? {
          eventStartDate: explicitDate(eventRange[1]),
          eventEndDate: explicitDate(eventRange[2])
        }
      : {})
  };
}
