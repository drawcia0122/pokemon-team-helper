import generatedData from "@/data/pokemonContent.generated.json";
import manualData from "@/data/pokemonContent.manual.json";
import {
  POKEMON_NEWS_CATEGORY_LABELS,
  buildPokemonNewsFeed
} from "@/lib/pokemonNews";
import { CONTENT_SOURCE_AUDIT } from "./content-collectors/sourceRegistry";
import type {
  GeneratedPokemonContentItem,
  PokemonContentItem
} from "@/types/pokemonContent";

function counts(values: string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [value, values.filter((candidate) => candidate === value).length])
  );
}

const rawItems = [
  ...(manualData as PokemonContentItem[]),
  ...(generatedData as GeneratedPokemonContentItem[])
];
const feed = buildPokemonNewsFeed(rawItems);
const sourceErrors = Object.entries(CONTENT_SOURCE_AUDIT)
  .filter(([, source]) => !source.automationAllowed)
  .map(([id, source]) => ({
    id,
    sourceName: source.sourceName,
    status: source.automationDecision,
    reason: source.decisionReason
  }));
const report = {
  totalFetched: feed.fetchedCount,
  afterDeduplication: feed.articles.length,
  sourceCounts: counts(feed.articles.map((article) => article.sourceName)),
  categoryCounts: counts(
    feed.articles.flatMap((article) =>
      article.categories.map((category) => POKEMON_NEWS_CATEGORY_LABELS[category])
    )
  ),
  gameTitleCounts: counts(feed.articles.flatMap((article) => article.gameTitles)),
  officialCount: feed.articles.filter((article) => article.official).length,
  scheduleCount: feed.articles.filter((article) =>
    Boolean(
      article.releaseDate ||
      article.preorderStartDate ||
      article.preorderDeadlineDate ||
      article.eventStartDate ||
      article.eventEndDate
    )
  ).length,
  duplicateCount: feed.duplicateCount,
  excludedCount: feed.excluded.length,
  excludedArticles: feed.excluded,
  unclassifiedCount: feed.unclassified.length,
  unclassifiedArticles: feed.unclassified,
  sourceErrors,
  articles: feed.articles.map((article) => ({
    id: article.id,
    title: article.title,
    source: article.sourceName,
    categories: article.categories,
    gameTitles: article.gameTitles,
    official: article.official,
    importance: article.importance,
    classificationEvidence: article.classificationEvidence
  }))
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Pokémon News MVP");
  console.log(`総取得数: ${report.totalFetched}`);
  console.log(`重複排除後: ${report.afterDeduplication}`);
  console.log(`公式記事: ${report.officialCount}`);
  console.log(`重複排除: ${report.duplicateCount}`);
  console.log(`日程抽出済み: ${report.scheduleCount}`);
  console.log(`除外: ${report.excludedCount}`);
  console.log(`分類不能: ${report.unclassifiedCount}`);
  console.log("source別:", report.sourceCounts);
  console.log("category別:", report.categoryCounts);
  console.log("gameTitle別:", report.gameTitleCounts);
  console.log("sourceエラー／自動取得保留:");
  for (const source of sourceErrors) {
    console.log(`- ${source.sourceName}: ${source.status} (${source.reason})`);
  }
}
