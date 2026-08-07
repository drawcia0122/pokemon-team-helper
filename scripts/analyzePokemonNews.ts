import collectionStateData from "@/data/pokemonContentCollectionStatus.json";
import generatedData from "@/data/pokemonContent.generated.json";
import manualData from "@/data/pokemonContent.manual.json";
import {
  POKEMON_NEWS_CATEGORY_LABELS,
  buildPokemonNewsFeed
} from "@/lib/pokemonNews";
import { POKEMON_NEWS_EVENT_TYPE_LABELS } from "@/lib/pokemonNewsIntelligence";
import {
  getPokemonNewsSourceFreshness,
  listPokemonNewsSources,
  type PokemonNewsSourceDefinition
} from "@/lib/pokemonNewsSources";
import type {
  GeneratedPokemonContentItem,
  PokemonContentSource,
  PokemonContentItem,
  PokemonNewsSourceId
} from "@/types/pokemonContent";
import type { ContentCollectionState } from "./content-collectors/types";
import { RSS_IMAGE_FIELD_KEYS } from "./content-collectors/rssImageExtraction";

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

function percentage(value: number, total: number): number {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(1));
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
const rssImageAudits = registry.flatMap((source) =>
  (collectionState.sources[source.id as PokemonContentSource]?.lastImageAudits ?? []).map(
    (audit) => ({ sourceId: source.id, sourceName: source.name, ...audit })
  )
);
const imageFieldCounts = rssImageAudits.reduce(
  (result, audit) => {
    for (const [field, count] of Object.entries(audit.detected)) {
      result[field] = (result[field] ?? 0) + count;
    }
    return result;
  },
  Object.fromEntries(RSS_IMAGE_FIELD_KEYS.map((key) => [key, 0])) as Record<string, number>
);
const sourceImageCoverage = Object.fromEntries(
  registry
    .filter((source) => source.sourceKind === "media")
    .map((source) => {
      const articles = feed.articles.filter((article) => article.sourceId === source.id);
      const withArticleImage = articles.filter(
        (article) => article.imageSource === "rss" || article.imageSource === "api"
      ).length;
      return [
        source.id,
        {
          articleCount: articles.length,
          articleImageCount: withArticleImage,
          rate: percentage(withArticleImage, articles.length)
        }
      ];
    })
);

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
  officialCount: feed.articles.filter((article) => article.sourceKind === "official").length,
  mediaCount: feed.articles.filter((article) => article.sourceKind === "media").length,
  sourceKindCounts: counts(feed.articles.map((article) => article.sourceKind)),
  contentTypeCounts: counts(feed.articles.map((article) => article.contentType)),
  eventTypeCounts: counts(
    feed.articles.flatMap((article) =>
      article.eventTypes.map((eventType) => POKEMON_NEWS_EVENT_TYPE_LABELS[eventType])
    )
  ),
  importanceDistribution: {
    "90-100": feed.articles.filter((article) => article.importance >= 90).length,
    "70-89": feed.articles.filter((article) => article.importance >= 70 && article.importance < 90).length,
    "40-69": feed.articles.filter((article) => article.importance >= 40 && article.importance < 70).length,
    "20-39": feed.articles.filter((article) => article.importance >= 20 && article.importance < 40).length,
    "0-19": feed.articles.filter((article) => article.importance < 20).length
  },
  insightCount: feed.articles.filter((article) => article.insight.trim().length > 0).length,
  imageSourceCounts: counts(feed.articles.map((article) => article.imageSource)),
  finalImageOriginCounts: counts(feed.articles.map((article) => article.imageOrigin)),
  feedImageAudits: rssImageAudits,
  imageFieldCounts,
  mediaContentImageCount: imageFieldCounts["media:content"] ?? 0,
  mediaThumbnailImageCount: imageFieldCounts["media:thumbnail"] ?? 0,
  enclosureImageCount: imageFieldCounts.enclosure ?? 0,
  contentEncodedImageCount: imageFieldCounts["content:encoded-img"] ?? 0,
  descriptionImageCount: imageFieldCounts["description-img"] ?? 0,
  validRssImageAdoptionCount: rssImageAudits.reduce(
    (sum, audit) => sum + audit.adoptedCount,
    0
  ),
  smallImageExcludedCount: rssImageAudits.reduce(
    (sum, audit) => sum + audit.smallImageExcludedCount,
    0
  ),
  rssImageCount: feed.articles.filter((article) => article.imageSource === "rss").length,
  apiImageCount: feed.articles.filter((article) => article.imageSource === "api").length,
  pokemonImageFallbackCount: feed.articles.filter((article) => article.imageSource === "pokemon-db").length,
  fallbackImageCount: feed.articles.filter((article) => article.imageSource === "fallback").length,
  imageUrlMissingCount: feed.articles.filter((article) => !article.imageUrl).length,
  imageSourceRates: {
    rss: percentage(feed.articles.filter((article) => article.imageSource === "rss").length, articleCount),
    api: percentage(feed.articles.filter((article) => article.imageSource === "api").length, articleCount),
    "pokemon-db": percentage(feed.articles.filter((article) => article.imageSource === "pokemon-db").length, articleCount),
    fallback: percentage(feed.articles.filter((article) => article.imageSource === "fallback").length, articleCount)
  },
  faviconExcludedCount: feed.articles.filter((article) =>
    article.imageQualityEvidence.some((evidence) => evidence.includes("favicon-or-icon"))
  ).length,
  logoExcludedCount: feed.articles.filter((article) =>
    article.imageQualityEvidence.some((evidence) => evidence.includes("site-logo"))
  ).length,
  advertisingOrTrackingExcludedCount: rssImageAudits.reduce(
    (sum, audit) => sum + audit.advertisingOrTrackingExcludedCount,
    0
  ),
  imageUrlResolutionFailureCount: rssImageAudits.reduce(
    (sum, audit) => sum + audit.invalidUrlCount,
    0
  ),
  sourceImageCoverage,
  multipleSpeciesFallbackCount: feed.articles.filter((article) =>
    article.imageQualityEvidence.includes("rejected:pokemon-db:multiple-species")
  ).length,
  relevanceScoreDistribution: {
    "0-44": feed.articles.filter((article) => article.relevanceScore < 45).length,
    "45-59": feed.articles.filter((article) => article.relevanceScore >= 45 && article.relevanceScore < 60).length,
    "60-79": feed.articles.filter((article) => article.relevanceScore >= 60 && article.relevanceScore < 80).length,
    "80-100": feed.articles.filter((article) => article.relevanceScore >= 80).length
  },
  rssFetchedCount: registry
    .filter((source) => source.sourceType === "rss")
    .reduce((sum, source) => sum + (collectionState.sources[source.id as PokemonContentSource]?.lastCandidateCount ?? 0), 0),
  apiFetchedCount: registry
    .filter((source) => source.sourceType === "official-api" && source.sourceKind === "media")
    .reduce((sum, source) => sum + (collectionState.sources[source.id as PokemonContentSource]?.lastCandidateCount ?? 0), 0),
  relevanceExcludedCount: registry.reduce(
    (sum, source) =>
      sum +
      (collectionState.sources[source.id as PokemonContentSource]?.lastExclusionReasons?.[
        "pokemon-relevance-below-threshold"
      ] ?? 0),
    0
  ),
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
  endingSoonCount: feed.articles.filter((article) => article.freshness === "ending-soon").length,
  expiredCount: feed.articles.filter((article) => article.freshness === "expired").length,
  duplicateCount: feed.duplicateCount,
  officialPreferredDuplicateCount: feed.officialPreferredDuplicateCount,
  mediaDuplicateCount: feed.mediaDuplicateCount,
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
  rateLimitSources: registry
    .filter((source) => collectionState.sources[source.id as PokemonContentSource]?.lastStatus === "rate-limited")
    .map((source) => source.id),
  sources: registry.map((source) => ({
    id: source.id,
    name: source.name,
    homepageUrl: source.homepageUrl,
    feedUrl: source.feedUrl,
    sourceType: source.sourceType,
    sourceKind: source.sourceKind,
    sourcePriority: source.sourcePriority,
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
    sourceKind: article.sourceKind,
    contentType: article.contentType,
    relevanceScore: article.relevanceScore,
    importance: article.importance,
    eventTypes: article.eventTypes,
    insight: article.insight,
    imageSource: article.imageSource,
    imageOrigin: article.imageOrigin,
    imageQualityEvidence: article.imageQualityEvidence,
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
  console.log(`ending soon: ${report.endingSoonCount}`);
  console.log(`RSS取得: ${report.rssFetchedCount} / API取得: ${report.apiFetchedCount} / relevance除外: ${report.relevanceExcludedCount}`);
  console.log(`official: ${report.officialCount} / media: ${report.mediaCount}`);
  console.log(`有効collector: ${report.enabledCollectorCount} / 成功source: ${report.successfulSourceCount} / 失敗source: ${report.failedSourceCount}`);
  console.log(`manual source: ${report.manualSourceCount} / stale source: ${report.staleSourceCount}`);
  console.log(`新規記事: 0 / 重複排除: ${report.duplicateCount} / 除外: ${report.excludedCount} / 最終記事: ${report.afterDeduplication}`);
  console.log("source別件数:", report.sourceCounts);
  console.log("source別比率:", report.sourceRatios);
  console.log("category別:", report.categoryCounts);
  console.log("gameTitle別:", report.gameTitleCounts);
  console.log("sourceKind別:", report.sourceKindCounts);
  console.log("contentType別:", report.contentTypeCounts);
  console.log("Event Type別:", report.eventTypeCounts);
  console.log("Importance分布:", report.importanceDistribution);
  console.log(`Insight生成: ${report.insightCount}`);
  console.log(
    `画像: RSS=${report.rssImageCount}, API=${report.apiImageCount}, Pokémon補完=${report.pokemonImageFallbackCount}, fallback=${report.fallbackImageCount}, URLなし=${report.imageUrlMissingCount}`
  );
  console.log("画像取得率(%):", report.imageSourceRates);
  console.log("最終画像取得元:", report.finalImageOriginCounts);
  console.log("Feed画像field:", report.imageFieldCounts);
  console.log(
    `Feed画像採用=${report.validRssImageAdoptionCount}, 小サイズ除外=${report.smallImageExcludedCount}, 広告/tracking除外=${report.advertisingOrTrackingExcludedCount}, URL解決失敗=${report.imageUrlResolutionFailureCount}`
  );
  console.log("source別画像取得率:", report.sourceImageCoverage);
  console.log(
    `画像除外: favicon/icon=${report.faviconExcludedCount}, logo=${report.logoExcludedCount}, 複数匹補完なし=${report.multipleSpeciesFallbackCount}`
  );
  console.log("relevance Score分布:", report.relevanceScoreDistribution);
  console.log(`公式優先統合: ${report.officialPreferredDuplicateCount} / media間重複: ${report.mediaDuplicateCount}`);
  console.log("rate limit:", report.rateLimitSources.length ? report.rateLimitSources : "none");
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
