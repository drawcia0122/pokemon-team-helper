import { readFileSync } from "node:fs";
import path from "node:path";
import manualData from "@/data/pokemonContent.manual.json";
import {
  buildPokemonNewsFeed,
  classifyPokemonNews,
  extractReliablePokemonNewsDates,
  getPokemonNewsArticleFreshness,
  resolvePokemonNewsImage
} from "@/lib/pokemonNews";
import {
  getPokemonNewsSourceFreshness,
  listPokemonNewsSources,
  type PokemonNewsAutomationStatus,
  type PokemonNewsPolicyStatus
} from "@/lib/pokemonNewsSources";
import type { PokemonContentItem } from "@/types/pokemonContent";
import { preservePreviousItemsForCollectionStatus } from "./content-collectors/collector";

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
assert(sources.length >= 14, "優先調査対象のsource registryが不足しています");
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
assert(
  sources.every((source) => !source.enabled),
  "利用許可を確認できていないsourceが有効化されています"
);
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
  buildPokemonNewsFeed([fixture({ id: "no-image" })]).articles[0]?.imageUrl === undefined,
  "画像なし記事へ推測画像を設定しています"
);

const uiSource = readFileSync(
  path.join(process.cwd(), "components/news/PokemonContentExplorer.tsx"),
  "utf8"
);
for (const label of [
  "注目ニュース",
  "まもなく開始・終了",
  "新着ニュース",
  "カテゴリで絞り込む"
]) {
  assert(uiSource.includes(label), `ニュースUIに必要な表示がありません: ${label}`);
}
assert(uiSource.includes("item.categories.slice(0, 4)"), "カードの表示タグ数を制限していません");
assert(
  uiSource.includes('item.freshness !== "expired"') &&
    uiSource.includes('item.freshness !== "archived"'),
  "終了済み・アーカイブ記事を新着上位から除外していません"
);
assert(uiSource.includes("過去のお知らせ"), "終了済み記事を保持する表示がありません");

console.log(
  `[ok] TASK059 Pokémon News sources/freshness: sources=${sources.length}, articles=${productionFeed.articles.length}, official=${productionFeed.articles.filter((article) => article.official).length}`
);
