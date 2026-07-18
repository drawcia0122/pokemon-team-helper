import appMetaData from "@/data/appMeta.json";
import generatedArticleData from "@/data/buildArticles.generated.json";
import manualArticleData from "@/data/buildArticles.manual.json";
import pokemonData from "@/data/pokemon.json";
import type {
  BuildArticle,
  GeneratedBuildArticle,
  PokemonLabelMap
} from "@/types/buildArticle";
import type { AppMeta, PokemonEntry } from "@/types/pokemon";

const appMeta = appMetaData as AppMeta;
const manualArticles = manualArticleData as BuildArticle[];
const generatedArticles =
  generatedArticleData as unknown as GeneratedBuildArticle[];
const pokemon = pokemonData as PokemonEntry[];
const seasonMap = new Map(appMeta.seasons.map((season) => [season.id, season]));

function toBuildArticle(article: GeneratedBuildArticle): BuildArticle | null {
  const season = seasonMap.get(article.builderSeasonId);
  if (!season || article.status !== "active") {
    return null;
  }

  return {
    id: article.id,
    title: article.title,
    author: article.authorName,
    sourceName: article.source === "note" ? "note" : "ポケソル",
    url: article.canonicalUrl,
    publishedAt: article.publishedAt.slice(0, 10),
    battleFormat: article.battleFormat,
    regulation: article.regulationId,
    season: season.articleLabel,
    builderSeasonId: article.builderSeasonId,
    result: article.result ?? "成績記載なし",
    pokemonSlugs: article.pokemonSlugs,
    tags: article.tags,
    summary: article.summary,
    thumbnail: article.thumbnail,
    collectionCompleteness: article.collectionCompleteness,
    collection: {
      source: article.source,
      firstCollectedAt: article.firstCollectedAt,
      lastCollectedAt: article.lastCollectedAt
    }
  };
}

function mergeArticles(): BuildArticle[] {
  const ids = new Set(manualArticles.map((article) => article.id));
  const urls = new Set(manualArticles.map((article) => article.url));
  const generated = generatedArticles
    .map(toBuildArticle)
    .filter((article): article is BuildArticle => article !== null)
    .filter((article) => !ids.has(article.id) && !urls.has(article.url));

  return [...manualArticles, ...generated];
}

export function getBuildArticles(): BuildArticle[] {
  return mergeArticles().sort((a, b) => {
    const published = b.publishedAt.localeCompare(a.publishedAt);
    if (published !== 0) {
      return published;
    }

    return (b.collection?.lastCollectedAt ?? "").localeCompare(
      a.collection?.lastCollectedAt ?? ""
    );
  });
}

export function getBuildArticleById(id: string): BuildArticle | null {
  return mergeArticles().find((article) => article.id === id) ?? null;
}

export function getPokemonLabelMap(): PokemonLabelMap {
  return Object.fromEntries(pokemon.map((entry) => [entry.slug, entry.nameJa]));
}
