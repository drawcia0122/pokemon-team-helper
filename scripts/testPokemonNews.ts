import { readFileSync } from "node:fs";
import path from "node:path";
import manualData from "@/data/pokemonContent.manual.json";
import {
  buildPokemonNewsFeed,
  classifyPokemonNews,
  extractReliablePokemonNewsDates,
  getPokemonNewsArticleFreshness,
  inferPokemonNewsContentType,
  resolvePokemonNewsImage,
  scorePokemonNewsRelevance
} from "@/lib/pokemonNews";
import {
  buildPokemonNewsInsight,
  calculatePokemonNewsImportance,
  inferPokemonNewsEventTypes,
  resolvePokemonNewsImageSelection
} from "@/lib/pokemonNewsIntelligence";
import {
  getPokemonNewsSourceFreshness,
  listPokemonNewsSources,
  type PokemonNewsAutomationStatus,
  type PokemonNewsPolicyStatus
} from "@/lib/pokemonNewsSources";
import type { PokemonContentItem } from "@/types/pokemonContent";
import { preservePreviousItemsForCollectionStatus } from "./content-collectors/collector";
import {
  buildGNewsSearchUrls,
  isGNewsProductionPlanAllowed,
  parseGNewsResponse,
  parseMediaRss
} from "./content-collectors/media";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(overrides: Partial<PokemonContentItem>): PokemonContentItem {
  return {
    id: "fixture",
    kind: "news",
    title: "ポケモン公式ニュース",
    summary: "ポケモンに関する公式情報です。",
    sourceName: "ポケモン公式",
    url: "https://www.pokemon.co.jp/info/fixture.html",
    publishedAt: "2026-08-01",
    pokemonSlugs: [],
    tags: [],
    ...overrides
  };
}

const manual = manualData as PokemonContentItem[];
const testNow = new Date("2026-08-05T00:00:00.000Z");
const productionFeed = buildPokemonNewsFeed(manual, testNow);
assert(productionFeed.articles.length === 7, "既存公式記事7件をニュースフィードへ統合できません");
assert(productionFeed.articles.some((article) => article.categories.includes("goods")), "グッズ記事がありません");
assert(productionFeed.articles.some((article) => article.categories.includes("game")), "ゲーム記事がありません");
assert(productionFeed.articles.some((article) => article.categories.includes("event")), "イベント記事がありません");
assert(productionFeed.articles.some((article) => article.categories.length > 1), "複数カテゴリ記事がありません");
assert(productionFeed.articles.every((article) => article.official), "公式記事を公式として判定できません");
assert(
  productionFeed.articles.every((article) => article.sourceKind === "official"),
  "既存7記事のsourceKindをofficialに維持できません"
);
assert(
  productionFeed.articles.some((article) => article.gameTitles.includes("Pokémon GO")),
  "Pokémon GO作品タグを付けられません"
);
assert(
  manual.map((item) => item.kind).join(",") ===
    "goods,goods,event,campaign,campaign,game-update,news",
  "既存ニュースのkind分類を変更しています"
);
assert(
  manual.every((item) => item.sourceId === "pokemon-japan-news" || item.sourceId === "pokemon-center-japan"),
  "既存7記事をsource registryへ紐付けられません"
);

const sources = listPokemonNewsSources();
const automationStatuses = new Set<PokemonNewsAutomationStatus>([
  "automatic", "manual", "pending", "disabled", "unsupported"
]);
const policyStatuses = new Set<PokemonNewsPolicyStatus>([
  "approved", "pending-review", "disabled-by-policy"
]);
assert(sources.length >= 17, "優先調査対象のsource registryが不足しています");
assert(
  new Set(sources.map((source) => source.id)).size === sources.length,
  "source registryのIDが重複しています"
);
for (const source of sources) {
  assert(automationStatuses.has(source.automationStatus), `${source.id}: automationStatusが不正です`);
  assert(policyStatuses.has(source.policyStatus), `${source.id}: policyStatusが不正です`);
  assert(/^https:\/\//.test(source.homepageUrl), `${source.id}: 公式URLがHTTPSではありません`);
  assert(source.staleAfterDays > 0, `${source.id}: staleAfterDaysが不正です`);
  if (source.enabled || source.automationStatus === "automatic") {
    assert(source.policyStatus === "approved", `${source.id}: 未承認sourceが自動化されています`);
  }
}
for (const sourceId of ["4gamer-rss", "inside-rss", "gnews-api"] as const) {
  const source = sources.find((entry) => entry.id === sourceId);
  assert(
    source?.enabled &&
      source.automationStatus === "automatic" &&
      source.policyStatus === "approved" &&
      source.sourceKind === "media",
    `${sourceId}: メディアsource registryが不正です`
  );
}
assert(
  getPokemonNewsSourceFreshness(
    { ...sources[0], automationStatus: "automatic", policyStatus: "approved", enabled: true, lastSuccessfulFetchAt: "2026-08-04", consecutiveFailures: 0 },
    testNow
  ) === "fresh",
  "自動sourceのfresh判定が不正です"
);
assert(
  getPokemonNewsSourceFreshness(
    { ...sources[0], automationStatus: "automatic", policyStatus: "approved", enabled: true, lastSuccessfulFetchAt: "2026-01-01", consecutiveFailures: 0 },
    testNow
  ) === "stale",
  "自動sourceのstale判定が不正です"
);
assert(
  getPokemonNewsSourceFreshness(
    { ...sources[0], automationStatus: "manual", lastManualCheckedAt: null, consecutiveFailures: 0 },
    testNow
  ) === "manual-check-needed",
  "manual-check-needed判定が不正です"
);
assert(
  getPokemonNewsSourceFreshness(
    { ...sources[0], consecutiveFailures: 2 },
    testNow
  ) === "failing",
  "連続失敗sourceをfailingにできません"
);
const preservedFixture = [fixture({ id: "preserved" })];
assert(
  preservePreviousItemsForCollectionStatus(preservedFixture, [], "failed") === preservedFixture,
  "collector失敗時に前回正常データを維持できません"
);
assert(
  preservePreviousItemsForCollectionStatus(preservedFixture, [], "empty-preserved") === preservedFixture,
  "0件取得時に前回正常データを維持できません"
);
assert(
  preservePreviousItemsForCollectionStatus(preservedFixture, [], "success").length === 0,
  "0件取得とcollectorエラーを区別できません"
);

const cardEvent = classifyPokemonNews(
  fixture({
    title: "ポケモンカードゲーム大会を8月に開催",
    summary: "拡張パックを使った公式大会です。"
  })
);
assert(
  cardEvent.categories.includes("card") &&
    cardEvent.categories.includes("competition") &&
    cardEvent.categories.includes("event"),
  "カード大会へ複数カテゴリを付けられません"
);
const video = classifyPokemonNews(
  fixture({ title: "アニメ『ポケットモンスター』最新映像をYouTubeで公開" })
);
assert(video.categories.includes("anime-video"), "アニメ・映像を分類できません");
const gameTitles = classifyPokemonNews(
  fixture({ title: "Pokémon UNITEとPokémon Sleepのアップデート" })
).gameTitles;
assert(
  gameTitles.includes("Pokémon UNITE") && gameTitles.includes("Pokémon Sleep"),
  "複数のゲーム作品タグを判定できません"
);

const duplicateTitle = "ポケモン新商品シリーズを8月8日に発売";
const official = fixture({ id: "official", title: duplicateTitle });
const media = fixture({
  id: "media",
  title: duplicateTitle,
  sourceName: "一般メディア",
  url: "https://example.com/pokemon-product",
  publishedAt: "2026-08-02",
  official: false
});
const deduplicated = buildPokemonNewsFeed([media, official]);
assert(
  deduplicated.articles.length === 1 &&
    deduplicated.articles[0]?.id === "official" &&
    deduplicated.duplicateCount === 1,
  "同一発表の重複で公式記事を代表にできません"
);
const distinctSchedule = buildPokemonNewsFeed([
  { ...official, id: "release-a", releaseDate: "2026-08-08" },
  {
    ...media,
    id: "release-b",
    url: "https://example.com/pokemon-product-b",
    releaseDate: "2026-09-01"
  }
]);
assert(distinctSchedule.articles.length === 2, "発売日が異なる別発表を過剰統合しています");

assert(
  getPokemonNewsArticleFreshness(
    fixture({ eventStartDate: "2026-08-10", eventEndDate: "2026-08-12" }),
    testNow
  ) === "upcoming",
  "upcoming記事を判定できません"
);
assert(
  getPokemonNewsArticleFreshness(
    fixture({ eventStartDate: "2026-07-01", eventEndDate: "2026-07-31" }),
    testNow
  ) === "expired",
  "終了済み記事をexpiredにできません"
);
assert(
  getPokemonNewsArticleFreshness(
    fixture({ publishedAt: "2026-01-01", eventStartDate: "2026-01-10" }),
    testNow
  ) === "current",
  "終了日不明の記事をexpired扱いしています"
);
assert(
  getPokemonNewsArticleFreshness(
    fixture({ eventEndDate: "2026-08-09" }),
    testNow
  ) === "ending-soon",
  "終了間近記事を判定できません"
);

const unrelated = fixture({
  id: "unrelated",
  title: "モンスター級セールのお知らせ",
  summary: "一般商品のセールです。",
  sourceName: "一般店舗",
  url: "https://example.com/sale",
  official: false,
  pokemonSlugs: []
});
const excluded = buildPokemonNewsFeed([unrelated]);
assert(
  excluded.articles.length === 0 && excluded.excluded[0]?.reason === "not-pokemon-related",
  "Pokémonと無関係な記事を除外できません"
);
const accidentalMention = buildPokemonNewsFeed([
  fixture({
    id: "accidental",
    title: "人気商品の発売動向を解説",
    summary: "ポケモンという単語が例として一度だけ登場する一般記事です。",
    sourceName: "一般メディア",
    url: "https://example.com/general-product",
    official: false,
    pokemonSlugs: []
  })
]);
assert(
  accidentalMention.articles.length === 0,
  "ポケモンの偶発的な単語一致だけで記事を採用しています"
);

const titleRelevance = scorePokemonNewsRelevance(
  fixture({ title: "ポケモンの新作ゲームを発表", official: false, sourceKind: "media" })
);
assert(titleRelevance.relevant, "titleの強いPokémon語を通過できません");
const serviceRelevance = scorePokemonNewsRelevance(
  fixture({ title: "Pokémon Sleepに新機能が登場", official: false, sourceKind: "media" })
);
assert(serviceRelevance.relevant, "作品名titleを通過できません");
const weakDescription = scorePokemonNewsRelevance(
  fixture({
    title: "今週のゲーム業界ニュース",
    summary: "例としてポケモンにも一度触れます。",
    official: false,
    sourceKind: "media"
  })
);
assert(!weakDescription.relevant, "descriptionだけの弱い一致を通過しています");
const incidentalDeveloperArticle = scorePokemonNewsRelevance(
  fixture({
    title: "『ポケモン』開発元が手がける別タイトルのレビュー",
    summary: "Pokémon作品自体の記事ではありません。",
    official: false,
    sourceKind: "media"
  })
);
assert(
  !incidentalDeveloperArticle.relevant,
  "開発元への偶発的なPokémon言及だけの別作品記事を通過しています"
);
assert(
  inferPokemonNewsContentType("ポケモン新作を発表", "配信情報") === "news" &&
    inferPokemonNewsContentType("ポケモン新作レビュー", "プレイレポート") === "editorial",
  "news/editorialの内容区分が不正です"
);

const fixtureRoot = path.join(process.cwd(), "scripts/fixtures/content-collection");
const gamerRss = readFileSync(path.join(fixtureRoot, "4gamer-pokemon-feed.rdf"), "utf8");
const insideRss = readFileSync(path.join(fixtureRoot, "inside-pokemon-feed.rdf"), "utf8");
const gnewsJson = readFileSync(path.join(fixtureRoot, "gnews-pokemon-response.json"), "utf8");
const gamerParsed = parseMediaRss(gamerRss, {
  sourceId: "4gamer-rss",
  sourceName: "4Gamer.net",
  allowedHosts: ["www.4gamer.net"],
  now: testNow,
  limit: 20
});
assert(
  gamerParsed.candidates.length === 2 &&
    gamerParsed.candidates.some((article) => article.contentType === "editorial") &&
    gamerParsed.excludedReasons.includes("pokemon-relevance-below-threshold"),
  "4Gamer RSSの解析・関連判定が不正です"
);
const insideParsed = parseMediaRss(insideRss, {
  sourceId: "inside-rss",
  sourceName: "インサイド",
  allowedHosts: ["www.inside-games.jp"],
  now: testNow,
  limit: 20
});
assert(
  insideParsed.candidates.length === 1 &&
    insideParsed.candidates[0]?.title.includes("ポケカ"),
  "インサイドRSSの解析が不正です"
);
const gnewsParsed = parseGNewsResponse(gnewsJson, "ポケモン", testNow);
assert(
  gnewsParsed.candidates.length === 2 &&
    gnewsParsed.excludedReasons.includes("pokemon-relevance-below-threshold") &&
    gnewsParsed.candidates.some(
      (article) => article.imageSource === "api" && article.imageUrl?.includes("pokemon.jpg")
    ),
  "GNews responseの解析・弱い一致除外が不正です"
);
assert(buildGNewsSearchUrls(undefined, testNow).length === 0, "API keyなしでGNews通信先を生成しています");
assert(
  !isGNewsProductionPlanAllowed(undefined) &&
    !isGNewsProductionPlanAllowed("free") &&
    isGNewsProductionPlanAllowed("essential") &&
    isGNewsProductionPlanAllowed("business") &&
    isGNewsProductionPlanAllowed("enterprise"),
  "GNewsの公開運用可能プラン判定が不正です"
);
const gnewsUrls = buildGNewsSearchUrls("fixture-secret", testNow);
assert(
  gnewsUrls.length > 1 &&
    gnewsUrls.every((value) => value.includes("lang=ja") && value.includes("country=jp") && value.includes("sortby=publishedAt")),
  "GNews検索パラメータが不正です"
);

const mediaDuplicate = fixture({
  id: "media-duplicate",
  title: duplicateTitle,
  sourceName: "4Gamer.net",
  sourceId: "4gamer-rss",
  sourceKind: "media",
  contentType: "news",
  relevanceScore: 90,
  url: "https://www.4gamer.net/games/fixture/news.shtml",
  official: false
});
const officialPreferred = buildPokemonNewsFeed([mediaDuplicate, official]);
assert(
  officialPreferred.articles[0]?.id === "official" &&
    officialPreferred.articles[0]?.relatedSources?.[0]?.sourceName === "4Gamer.net" &&
    officialPreferred.officialPreferredDuplicateCount === 1,
  "official優先またはrelatedSources保持が不正です"
);
const mediaDuplicateResult = buildPokemonNewsFeed([
  mediaDuplicate,
  { ...mediaDuplicate, id: "inside-duplicate", sourceId: "inside-rss", sourceName: "インサイド", url: "https://www.inside-games.jp/article/fixture.html" }
]);
assert(
  mediaDuplicateResult.articles.length === 1 && mediaDuplicateResult.mediaDuplicateCount === 1,
  "media間の重複を抑制できません"
);
const separateEditorial = buildPokemonNewsFeed([
  mediaDuplicate,
  { ...mediaDuplicate, id: "review", title: `${duplicateTitle}を実機レビュー`, contentType: "editorial", url: "https://www.inside-games.jp/article/review.html" }
]);
assert(separateEditorial.articles.length === 2, "別内容のレビューを過剰統合しています");

const extracted = extractReliablePokemonNewsDates(
  "ポケモングッズを2026年8月8日発売",
  "2026年7月20日予約開始、2026年8月7日予約締切"
);
assert(
  extracted.releaseDate === "2026-08-08" &&
    extracted.preorderStartDate === "2026-07-20" &&
    extracted.preorderDeadlineDate === "2026-08-07",
  "明示された年付き日程を抽出できません"
);
assert(
  Object.keys(extractReliablePokemonNewsDates("8月8日発売", "近日予約開始")).length === 0,
  "年不明または曖昧な日程を推測しています"
);
assert(
  resolvePokemonNewsImage(
    fixture({
      thumbnailUrl: "https://example.com/favicon.png",
      ogImage: "https://example.com/pokemon-news.jpg",
      imageUrl: "https://example.com/fallback.jpg"
    })
  ) === "https://example.com/pokemon-news.jpg",
  "画像優先順位またはfavicon除外が不正です"
);
assert(
  buildPokemonNewsFeed([
    fixture({ id: "no-image", kind: "game-update", categories: ["game"] })
  ]).articles[0]?.imageSource === "fallback",
  "画像なし記事へ既存fallbackを設定できません"
);

const intelligentGame = fixture({
  id: "intelligent-game",
  kind: "game-update",
  title: "ポケモン新作ゲームを発表、新シーズンも開始",
  summary: "大型アップデートで新たなイベントが始まります。",
  categories: ["game"]
});
const intelligentEventTypes = inferPokemonNewsEventTypes(
  intelligentGame,
  ["game"],
  "current"
);
assert(
  intelligentEventTypes.includes("new-title") &&
    intelligentEventTypes.includes("new-season") &&
    intelligentEventTypes.includes("update") &&
    intelligentEventTypes.includes("new-event"),
  "ゲーム記事へ複数Event Typeを付与できません"
);
assert(
  calculatePokemonNewsImportance(intelligentGame, intelligentEventTypes) >= 90,
  "新作発表のImportanceを高く評価できません"
);
assert(
  buildPokemonNewsInsight(intelligentGame, intelligentEventTypes, ["game"]) ===
    "新作タイトルの発表です。",
  "Event Typeから自然なInsightを生成できません"
);
const goodsEvents = inferPokemonNewsEventTypes(
  fixture({
    kind: "goods",
    title: "ポケモン新商品の予約受付を開始",
    summary: "受注販売商品です。",
    categories: ["goods"]
  }),
  ["goods"],
  "current"
);
assert(
  goodsEvents.includes("new-product") &&
    goodsEvents.includes("reservation-start") &&
    goodsEvents.includes("made-to-order"),
  "グッズ記事のEvent Typeが不正です"
);
const cardEvents = inferPokemonNewsEventTypes(
  fixture({ title: "ポケカ新拡張パックの大会を開催", categories: ["card", "competition"] }),
  ["card", "competition"],
  "current"
);
assert(
  cardEvents.includes("new-expansion") && cardEvents.includes("tournament"),
  "カード記事のEvent Typeが不正です"
);
assert(
  inferPokemonNewsEventTypes(
    fixture({ title: "ポケモンイベント開催", eventEndDate: "2026-08-09" }),
    ["event"],
    "ending-soon"
  ).includes("ending-soon"),
  "Ending SoonをEvent Typeへ反映できません"
);

const rssPriority = resolvePokemonNewsImageSelection(
  fixture({
    rssImageUrl: "https://example.com/rss-news.jpg",
    apiImageUrl: "https://example.com/api-news.jpg",
    imageUrl: "https://example.com/existing-news.jpg"
  })
);
assert(
  rssPriority.source === "rss" && rssPriority.imageUrl?.includes("rss-news.jpg"),
  "RSS画像を最優先できません"
);
const apiPriority = resolvePokemonNewsImageSelection(
  fixture({
    rssImageUrl: "https://example.com/favicon.png",
    apiImageUrl: "https://example.com/api-news.jpg",
    imageUrl: "https://example.com/existing-news.jpg"
  })
);
assert(
  apiPriority.source === "api" &&
    apiPriority.evidence.includes("rejected:rss:favicon-or-icon"),
  "faviconを除外してAPI画像へフォールバックできません"
);
const logoExcluded = resolvePokemonNewsImageSelection(
  fixture({ rssImageUrl: "https://example.com/assets/site-logo.png" })
);
assert(
  logoExcluded.source === "fallback" &&
    logoExcluded.evidence.includes("rejected:rss:site-logo"),
  "サイトロゴ画像を除外できません"
);
const smallImageExcluded = resolvePokemonNewsImageSelection(
  fixture({
    rssImageUrl: "https://example.com/small-news.jpg",
    imageWidth: 199,
    imageHeight: 119
  })
);
assert(
  smallImageExcluded.source === "fallback" &&
    smallImageExcluded.evidence.includes("rejected:rss:too-narrow"),
  "小さすぎる画像を除外できません"
);
assert(
  resolvePokemonNewsImageSelection(
    fixture({ pokemonSlugs: ["pikachu"] })
  ).source === "pokemon-db",
  "1匹だけ特定できた記事をポケモン画像で補完できません"
);
const multipleSpecies = resolvePokemonNewsImageSelection(
  fixture({ pokemonSlugs: ["pikachu", "eevee"] })
);
assert(
  multipleSpecies.source === "fallback" &&
    multipleSpecies.evidence.includes("rejected:pokemon-db:multiple-species"),
  "複数匹の記事をポケモン画像で補完しています"
);

const uiSource = readFileSync(
  path.join(process.cwd(), "components/news/PokemonContentExplorer.tsx"),
  "utf8"
);
for (const label of [
  "注目ニュース",
  "まもなく開始・終了",
  "新着ニュース",
  "カテゴリで絞り込む",
  "情報元で絞り込む",
  "メディア",
  "item.insight",
  "POKEMON_NEWS_EVENT_TYPE_LABELS"
]) {
  assert(uiSource.includes(label), `ニュースUIに必要な表示がありません: ${label}`);
}
assert(
  uiSource.includes("Math.max(0, 4 - visibleCategoryTags.length") &&
    uiSource.includes("remainingTagSlots"),
  "カードの表示タグ数を制限していません"
);
assert(
  uiSource.includes('item.freshness !== "expired"') &&
    uiSource.includes('item.freshness !== "archived"'),
  "終了済み・アーカイブ記事を新着上位から除外していません"
);
assert(uiSource.includes("過去のお知らせ"), "終了済み記事を保持する表示がありません");

console.log(
  `[ok] TASK061 Pokémon News Intelligence: sources=${sources.length}, existingOfficial=${productionFeed.articles.length}, event/image fixtures=passed`
);
