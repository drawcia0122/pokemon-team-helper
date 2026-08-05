import type {
  PokemonContentItem,
  PokemonNewsArticleFreshness,
  PokemonNewsCategory,
  PokemonNewsEventType,
  PokemonNewsImageSource
} from "@/types/pokemonContent";

export const POKEMON_NEWS_EVENT_TYPE_LABELS: Record<PokemonNewsEventType, string> = {
  "new-title": "新作発表",
  update: "アップデート",
  maintenance: "メンテナンス",
  "new-event": "新イベント",
  "new-season": "新シーズン",
  distribution: "配布",
  "balance-adjustment": "バランス調整",
  "new-pokemon": "新ポケモン",
  dlc: "DLC",
  issue: "不具合",
  "new-product": "新商品",
  "reservation-start": "予約開始",
  release: "発売",
  restock: "再販",
  lottery: "抽選",
  "made-to-order": "受注",
  "new-expansion": "新弾",
  deck: "デッキ",
  tournament: "大会",
  campaign: "キャンペーン",
  "rule-change": "ルール変更",
  "event-announcement": "開催決定",
  "event-ongoing": "開催中",
  "ending-soon": "終了間近",
  "real-event": "リアルイベント",
  stream: "配信",
  "pokemon-presents": "Pokémon Presents",
  "new-pv": "新PV",
  "new-video": "新映像",
  "new-anime": "新アニメ",
  "food-collaboration": "飲食コラボ",
  "apparel-collaboration": "アパレルコラボ",
  "convenience-store-collaboration": "コンビニコラボ",
  "corporate-collaboration": "企業コラボ"
};

type EventRule = {
  type: PokemonNewsEventType;
  pattern: RegExp;
  categories?: PokemonNewsCategory[];
};

const EVENT_RULES: EventRule[] = [
  { type: "pokemon-presents", pattern: /Pok[eé]mon Presents|ポケモンプレゼンツ/i },
  { type: "new-title", pattern: /新作(?:ゲーム|タイトル)?(?:を|が)?(?:発表|公開)|完全新作|最新作(?:を|が)?発表/i, categories: ["game"] },
  { type: "maintenance", pattern: /メンテナンス|メンテ実施/i, categories: ["game"] },
  { type: "balance-adjustment", pattern: /バランス調整|性能調整|能力調整|上方修正|下方修正/i, categories: ["game"] },
  { type: "new-season", pattern: /新シーズン|シーズン\s*\d+|シーズン更新|ランクマッチ更新/i, categories: ["game"] },
  { type: "dlc", pattern: /追加コンテンツ|DLC|エキスパンションパス/i, categories: ["game"] },
  { type: "issue", pattern: /不具合|障害|修正パッチ|お詫び/i, categories: ["game"] },
  { type: "new-pokemon", pattern: /新ポケモン|新たなポケモン|初登場|が登場/i, categories: ["game"] },
  { type: "distribution", pattern: /配布|プレゼントコード|シリアルコード|ふしぎなおくりもの/i, categories: ["game", "event"] },
  { type: "update", pattern: /アップデート|更新データ|Ver\.?\s*\d/i, categories: ["game"] },
  { type: "new-event", pattern: /新(?:たな)?イベント|イベント(?:を|が)?(?:開催|開始|登場)|期間限定イベント/i, categories: ["game"] },
  { type: "restock", pattern: /再販|再入荷/i, categories: ["goods", "card"] },
  { type: "lottery", pattern: /抽選(?:販売|応募|受付)|抽選を実施/i, categories: ["goods", "card"] },
  { type: "made-to-order", pattern: /受注(?:生産|販売|受付)|予約受注/i, categories: ["goods"] },
  { type: "reservation-start", pattern: /予約(?:受付)?(?:を)?開始|予約受付中|先行予約/i, categories: ["goods", "card"] },
  { type: "new-product", pattern: /新商品|新作(?:グッズ|ぬいぐるみ)|商品シリーズ|ラインナップ/i, categories: ["goods"] },
  { type: "release", pattern: /発売(?:開始|決定|中)?|販売(?:開始|決定)/i, categories: ["goods", "card"] },
  { type: "new-expansion", pattern: /新(?:拡張|強化拡張)パック|拡張パック「|新弾/i, categories: ["card"] },
  { type: "deck", pattern: /スターターデッキ|構築済みデッキ|デッキセット/i, categories: ["card"] },
  { type: "rule-change", pattern: /ルール変更|レギュレーション変更|禁止カード|使用不可カード/i, categories: ["card", "competition"] },
  { type: "tournament", pattern: /大会|選手権|チャンピオンシップ|WCS\d*|予選/i, categories: ["card", "competition"] },
  { type: "campaign", pattern: /キャンペーン|プレゼント企画|記念シール/i, categories: ["card", "collaboration"] },
  { type: "event-announcement", pattern: /開催決定|開催(?:を)?発表|開催します|実施決定/i, categories: ["event"] },
  { type: "real-event", pattern: /会場|現地開催|リアルイベント|ポケモンセンター|店舗で開催|体験会/i, categories: ["event"] },
  { type: "stream", pattern: /ライブ配信|生配信|配信番組|オンライン配信/i, categories: ["event", "anime-video"] },
  { type: "new-pv", pattern: /新(?:作|規)?PV|最新PV|プロモーション映像/i, categories: ["anime-video"] },
  { type: "new-anime", pattern: /新アニメ|アニメ新シリーズ|最新話|新エピソード/i, categories: ["anime-video"] },
  { type: "new-video", pattern: /新映像|最新映像|映像(?:を)?公開|新動画/i, categories: ["anime-video"] },
  { type: "food-collaboration", pattern: /カフェ|レストラン|フード|ドリンク|お菓子|飲食/i, categories: ["collaboration"] },
  { type: "apparel-collaboration", pattern: /アパレル|ファッション|ウェア|Tシャツ|スニーカー|バッグブランド/i, categories: ["collaboration"] },
  { type: "convenience-store-collaboration", pattern: /コンビニ|セブン-?イレブン|ローソン|ファミリーマート/i, categories: ["collaboration"] },
  { type: "corporate-collaboration", pattern: /コラボ|タイアップ/i, categories: ["collaboration"] }
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function inferPokemonNewsEventTypes(
  item: PokemonContentItem,
  categories: PokemonNewsCategory[],
  freshness: PokemonNewsArticleFreshness
): PokemonNewsEventType[] {
  const text = `${item.title} ${item.summary} ${item.tags.join(" ")}`.normalize("NFKC");
  const inferred = EVENT_RULES.filter(
    (rule) =>
      rule.pattern.test(text) &&
      (!rule.categories || rule.categories.some((category) => categories.includes(category)))
  ).map((rule) => rule.type);
  if (freshness === "ending-soon" && categories.includes("event")) inferred.push("ending-soon");
  if (
    freshness === "current" &&
    categories.includes("event") &&
    item.eventStartDate &&
    item.eventEndDate
  ) inferred.push("event-ongoing");
  return unique([...(item.eventTypes ?? []), ...inferred]);
}

const EVENT_IMPORTANCE: Partial<Record<PokemonNewsEventType, number>> = {
  "pokemon-presents": 98,
  "new-title": 96,
  dlc: 84,
  "balance-adjustment": 78,
  "new-season": 76,
  update: 72,
  "new-event": 72,
  tournament: 72,
  "rule-change": 72,
  "event-announcement": 68,
  "new-pokemon": 68,
  "new-expansion": 66,
  maintenance: 58,
  issue: 58,
  distribution: 58,
  "new-product": 55,
  "reservation-start": 52,
  release: 50,
  campaign: 48,
  "new-video": 48,
  "new-pv": 48,
  "new-anime": 48,
  "real-event": 47,
  stream: 46,
  "food-collaboration": 45,
  "apparel-collaboration": 45,
  "convenience-store-collaboration": 45,
  "corporate-collaboration": 44,
  lottery: 38,
  restock: 32,
  "made-to-order": 38,
  deck: 42,
  "ending-soon": 42,
  "event-ongoing": 42
};

export function calculatePokemonNewsImportance(
  item: PokemonContentItem,
  eventTypes: PokemonNewsEventType[]
): number {
  const eventScore = eventTypes.reduce(
    (maximum, eventType) => Math.max(maximum, EVENT_IMPORTANCE[eventType] ?? 35),
    35
  );
  const curatedScore = typeof item.importance === "number" ? item.importance : 0;
  const scheduleBonus = item.releaseDate || item.eventStartDate || item.preorderDeadlineDate ? 3 : 0;
  const officialBonus = item.official || item.sourceKind === "official" ? 2 : 0;
  return Math.max(0, Math.min(100, Math.round(Math.max(eventScore, curatedScore) + scheduleBonus + officialBonus)));
}

const INSIGHT_TEXT: Partial<Record<PokemonNewsEventType, string>> = {
  "pokemon-presents": "Pokémon Presentsの発表情報です。",
  "new-title": "新作タイトルの発表です。",
  update: "ゲームのアップデート情報です。",
  maintenance: "ゲームのメンテナンス情報です。",
  "new-event": "ゲーム内の新イベント情報です。",
  "new-season": "新しいシーズンの情報です。",
  distribution: "ゲーム内で受け取れる配布情報です。",
  "balance-adjustment": "対戦バランスの調整情報です。",
  "new-pokemon": "新たに登場するポケモンの情報です。",
  dlc: "追加コンテンツの情報です。",
  issue: "不具合や修正に関するお知らせです。",
  "new-product": "新商品の情報です。",
  "reservation-start": "商品の予約受付に関する情報です。",
  release: "商品の発売情報です。",
  restock: "商品の再販情報です。",
  lottery: "抽選販売・応募に関する情報です。",
  "made-to-order": "受注販売に関する情報です。",
  "new-expansion": "ポケモンカードの新弾情報です。",
  deck: "ポケモンカードのデッキ商品情報です。",
  tournament: "大会・競技イベントの情報です。",
  campaign: "期間限定キャンペーンの情報です。",
  "rule-change": "大会やカードのルール変更情報です。",
  "event-announcement": "イベントの開催情報です。",
  "event-ongoing": "現在開催中のイベントです。",
  "ending-soon": "終了日が近いイベントです。",
  "real-event": "現地で参加できるイベント情報です。",
  stream: "オンライン配信の情報です。",
  "new-pv": "新しいプロモーション映像です。",
  "new-video": "新しい映像が公開されました。",
  "new-anime": "アニメの新情報です。",
  "food-collaboration": "飲食分野とのコラボ情報です。",
  "apparel-collaboration": "アパレル分野とのコラボ情報です。",
  "convenience-store-collaboration": "コンビニで実施されるコラボ情報です。",
  "corporate-collaboration": "企業とのコラボ情報です。"
};

export function buildPokemonNewsInsight(
  item: PokemonContentItem,
  eventTypes: PokemonNewsEventType[],
  categories: PokemonNewsCategory[]
): string {
  if (item.insight?.trim()) return item.insight.trim();
  for (const eventType of eventTypes) {
    const insight = INSIGHT_TEXT[eventType];
    if (insight) return insight;
  }
  if (categories.includes("game")) return "ポケモンゲームに関するお知らせです。";
  if (categories.includes("goods")) return "ポケモングッズに関するお知らせです。";
  if (categories.includes("event")) return "ポケモンイベントに関するお知らせです。";
  if (categories.includes("card")) return "ポケモンカードに関するお知らせです。";
  return "ポケモンに関する新しいお知らせです。";
}

type ImageCandidate = {
  url?: string;
  source: Extract<PokemonNewsImageSource, "rss" | "api" | "existing">;
  width?: number;
  height?: number;
};

export type PokemonNewsImageSelection = {
  imageUrl?: string;
  source: PokemonNewsImageSource;
  evidence: string[];
};

function imageRejection(candidate: ImageCandidate): string | null {
  if (!candidate.url?.trim()) return "missing";
  try {
    const url = new URL(candidate.url);
    if (url.protocol !== "https:") return "non-https";
    const path = `${url.hostname}${url.pathname}`;
    if (/favicon|apple-touch-icon|(?:^|[\/_\.-])icon(?:[\/_\.-]|$)/i.test(path)) return "favicon-or-icon";
    if (/(?:^|[\/_\.-])(?:site-?|header-?|brand-?)logo(?:[\/_\.-]|$)|logo\.(?:png|jpe?g|gif|webp|svg)$/i.test(path)) return "site-logo";
    if (candidate.width !== undefined && candidate.width < 200) return "too-narrow";
    if (candidate.height !== undefined && candidate.height < 120) return "too-short";
    return null;
  } catch {
    return "invalid-url";
  }
}

export function resolvePokemonNewsImageSelection(item: PokemonContentItem): PokemonNewsImageSelection {
  const candidates: ImageCandidate[] = [
    { url: item.rssImageUrl, source: "rss", width: item.imageWidth, height: item.imageHeight },
    { url: item.apiImageUrl, source: "api", width: item.imageWidth, height: item.imageHeight },
    { url: item.thumbnailUrl, source: "existing" },
    { url: item.thumbnail, source: "existing" },
    { url: item.image, source: "existing" },
    { url: item.ogImage, source: "existing" },
    { url: item.twitterImage, source: "existing" },
    { url: item.imageUrl, source: item.imageSource === "rss" || item.imageSource === "api" ? item.imageSource : "existing", width: item.imageWidth, height: item.imageHeight }
  ];
  const evidence: string[] = [];
  for (const candidate of candidates) {
    if (!candidate.url) continue;
    const rejection = imageRejection(candidate);
    if (rejection) {
      evidence.push(`rejected:${candidate.source}:${rejection}`);
      continue;
    }
    evidence.push(`selected:${candidate.source}`);
    return { imageUrl: new URL(candidate.url).toString(), source: candidate.source, evidence };
  }
  if (item.pokemonSlugs.length === 1) {
    evidence.push(`selected:pokemon-db:${item.pokemonSlugs[0]}`);
    return { source: "pokemon-db", evidence };
  }
  if (item.pokemonSlugs.length > 1) evidence.push("rejected:pokemon-db:multiple-species");
  evidence.push("selected:fallback");
  return { source: "fallback", evidence };
}
