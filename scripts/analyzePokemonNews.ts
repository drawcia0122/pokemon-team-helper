import collectionStateData from "@/data/pokemonContentCollectionStatus.json";
import generatedData from "@/data/pokemonContent.generated.json";
import manualData from "@/data/pokemonContent.manual.json";
import {
  POKEMON_NEWS_CATEGORY_LABELS,
  buildPokemonNewsFeed
} from "@/lib/pokemonNews";
import {
  getPokemonNewsSourceFreshness,
  listPokemonNewsSources,
  type PokemonNewsSourceDefinition
} from "@/lib/pokemonNewsSources";
import type {
  GeneratedPokemonContentItem,
  PokemonContentItem,
  PokemonNewsSourceId
} from "@/types/pokemonContent";
import type { ContentCollectionState } from "./content-collectors/types";

function counts(values: string[]): Record<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return Object.fromEntries([...result.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function ratios(values: string[], total: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts(values)).map(([key, value]) => [
      key,
      total === 0 ? 0 : Number(((value / total) * 100).toFixed(1))
    ])
  );
}

function ageInDays(value: string, now: Date): number {
  return Math.floor(
    (now.getTime() - new Date(`${value}T00:00:00Z`).getTime()) / 86_400_000
  );
}

const now = new Date();
const rawItems = [
  ...(manualData as PokemonContentItem[]),
  ...(generatedData as GeneratedPokemonContentItem[])
];
const feed = buildPokemonNewsFeed(rawItems, now);
const collectionState = collectionStateData as ContentCollectionState;
const registry = listPokemonNewsSources().map((source) => {
  const runtime = collectionState.sources[source.id as keyof typeof collectionState.sources];
  const merged: PokemonNewsSourceDefinition = {
    ...source,
    lastSuccessfulFetchAt:
      runtime?.lastSuccessfulFetchAt ?? source.lastSuccessfulFetchAt,
    lastArticlePublishedAt:
      runtime?.lastArticlePublishedAt ?? source.lastArticlePublishedAt,
    consecutiveFailures:
      runtime?.consecutiveFailures ?? source.consecutiveFailures
  };
  return {
    ...merged,
    freshness: getPokemonNewsSourceFreshness(merged, now),
    lastError: runtime?.lastError ?? null
  };
});
const articleCount = feed.articles.length;
const sourceIds = feed.articles.map(
  (article) => article.sourceId ?? "unregistered-manual"
);
const sourceModeById = new Map(
  registry.map((source) => [source.id, source.automationStatus])
);
const articleModes = sourceIds.map(
  (id) => sourceModeById.get(id as PokemonNewsSourceId) ?? "manual"
);
const recent7 = feed.articles.filter(
  (article) => ageInDays(article.publishedAt, now) >= 0 && ageInDays(article.publishedAt, now) <= 7
).length;
const recent30 = feed.articles.filter(
  (article) => ageInDays(article.publishedAt, now) >= 0 && ageInDays(article.publishedAt, now) <= 30
).length;

const report = {
  generatedAt: now.toISOString(),
  totalFetched: feed.fetchedCount,
  afterDeduplication: articleCount,
  sourceCounts: counts(feed.articles.map((article) => article.sourceName)),
  sourceRatios: ratios(feed.articles.map((article) => article.sourceName), articleCount),
  categoryCounts: counts(
    feed.articles.flatMap((article) =>
      article.categories.map((category) => POKEMON_NEWS_CATEGORY_LABELS[category])
    )
  ),
  categoryRatios: ratios(
    feed.articles.flatMap((article) =>
      article.categories.map((category) => POKEMON_NEWS_CATEGORY_LABELS[category])
    ),
    feed.articles.flatMap((article) => article.categories).length
  ),
  gameTitleCounts: counts(feed.articles.flatMap((article) => article.gameTitles)),
  gameTitleRatios: ratios(
    feed.articles.flatMap((article) => article.gameTitles),
    feed.articles.flatMap((article) => article.gameTitles).length
  ),
  collectionModeCounts: counts(articleModes),
  collectionModeRatios: ratios(articleModes, articleCount),
  officialCount: feed.articles.filter((article) => article.official).length,
  manualCount: articleModes.filter((mode) => mode === "manual").length,
  automaticCount: articleModes.filter((mode) => mode === "automatic").length,
  scheduleCount: feed.articles.filter((article) =>
    Boolean(
      article.releaseDate ||
        article.preorderStartDate ||
        article.preorderDeadlineDate ||
        article.eventStartDate ||
        article.eventEndDate
    )
  ).length,
  articlesWithin7Days: recent7,
  articlesWithin30Days: recent30,
  articleFreshnessCounts: counts(feed.articles.map((article) => article.freshness)),
  upcomingCount: feed.articles.filter((article) => article.freshness === "upcoming").length,
  expiredCount: feed.articles.filter((article) => article.freshness === "expired").length,
  duplicateCount: feed.duplicateCount,
  excludedCount: feed.excluded.length,
  excludedArticles: feed.excluded,
  unclassifiedCount: feed.unclassified.length,
  unclassifiedArticles: feed.unclassified,
  enabledCollectorCount: registry.filter(
    (source) => source.enabled && source.automationStatus === "automatic"
  ).length,
  successfulSourceCount: registry.filter(
    (source) => source.automationStatus === "automatic" && source.freshness !== "failing" && source.lastSuccessfulFetchAt
  ).length,
  failedSourceCount: registry.filter((source) => source.freshness === "failing").length,
  manualSourceCount: registry.filter((source) => source.automationStatus === "manual").length,
  staleSourceCount: registry.filter(
    (source) => source.freshness === "stale" || source.freshness === "manual-check-needed"
  ).length,
  manualCheckNeeded: registry
    .filter((source) => source.freshness === "manual-check-needed")
    .map((source) => ({ id: source.id, name: source.name, adminCheckUrl: source.adminCheckUrl })),
  collectorErrors: registry
    .filter((source) => source.lastError)
    .map((source) => ({ id: source.id, error: source.lastError })),
  sources: registry.map((source) => ({
    id: source.id,
    name: source.name,
    homepageUrl: source.homepageUrl,
    feedUrl: source.feedUrl,
    sourceType: source.sourceType,
    categories: source.categories,
    gameTitles: source.gameTitles,
    rssAvailable: source.rssAvailable,
    apiAvailable: source.apiAvailable,
    automationStatus: source.automationStatus,
    policyStatus: source.policyStatus,
    enabled: source.enabled,
    fetchMethod: source.fetchMethod,
    lastCheckedAt: source.lastCheckedAt,
    lastSuccessfulFetchAt: source.lastSuccessfulFetchAt,
    lastArticlePublishedAt: source.lastArticlePublishedAt,
    lastManualCheckedAt: source.lastManualCheckedAt,
    consecutiveFailures: source.consecutiveFailures,
    staleAfterDays: source.staleAfterDays,
    freshness: source.freshness,
    policyFinding: source.policyFinding,
    notes: source.notes,
    lastError: source.lastError
  })),
  articles: feed.articles.map((article) => ({
    id: article.id,
    title: article.title,
    sourceId: article.sourceId,
    source: article.sourceName,
    categories: article.categories,
    gameTitles: article.gameTitles,
    official: article.official,
    importance: article.importance,
    freshness: article.freshness,
    classificationEvidence: article.classificationEvidence
  }))
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Pokémon News Source & Freshness Report");
  console.log(`総取得数: ${report.totalFetched}`);
  console.log(`重複排除後: ${report.afterDeduplication}`);
  console.log(`7日以内: ${report.articlesWithin7Days} / 30日以内: ${report.articlesWithin30Days}`);
  console.log(`upcoming: ${report.upcomingCount} / expired: ${report.expiredCount}`);
  console.log(`有効collector: ${report.enabledCollectorCount} / 成功source: ${report.successfulSourceCount} / 失敗source: ${report.failedSourceCount}`);
  console.log(`manual source: ${report.manualSourceCount} / stale source: ${report.staleSourceCount}`);
  console.log(`新規記事: 0 / 重複排除: ${report.duplicateCount} / 除外: ${report.excludedCount} / 最終記事: ${report.afterDeduplication}`);
  console.log("source別件数:", report.sourceCounts);
  console.log("source別比率:", report.sourceRatios);
  console.log("category別:", report.categoryCounts);
  console.log("gameTitle別:", report.gameTitleCounts);
  console.log("source registry:");
  for (const source of report.sources) {
    console.log(
      `- ${source.name}: automation=${source.automationStatus}, policy=${source.policyStatus}, freshness=${source.freshness}, lastSuccess=${source.lastSuccessfulFetchAt ?? "-"}, lastArticle=${source.lastArticlePublishedAt ?? "-"}, failures=${source.consecutiveFailures}`
    );
    if (!source.enabled) console.log(`  取得不能理由: ${source.policyFinding}`);
  }
  for (const source of report.manualCheckNeeded) {
    console.log(`[stale] ${source.name}: 手動確認が必要です (${source.adminCheckUrl})`);
  }
}
