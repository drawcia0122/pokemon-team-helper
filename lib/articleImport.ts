import pokemonData from "@/data/pokemon.json";
import { getBuildArticles } from "@/lib/buildArticles";
import {
  getRegulationDefinition,
  getRegulationForSeason,
  getSeasonDefinition,
  resolveArticleSeasonId
} from "@/lib/regulations";
import type { BuildArticle } from "@/types/buildArticle";
import type {
  PokemonEntry,
  RegulationDefinition,
  SeasonDefinition,
  TeamSlot
} from "@/types/pokemon";

export type ArticleImportResult =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; article: BuildArticle; team: TeamSlot[] };

const articles = getBuildArticles();
const pokemon = pokemonData as PokemonEntry[];

export type ArticleRegulationComparison = {
  articleRegulation: RegulationDefinition | null;
  currentRegulation: RegulationDefinition | null;
  articleSeason: SeasonDefinition | null;
  currentSeason: SeasonDefinition | null;
  articleSeasonId: string | null;
  differs: boolean;
  canSwitchToArticle: boolean;
};

export function buildArticleImportHref(articleId: string): string {
  const params = new URLSearchParams({ importArticle: articleId });
  return `/?${params.toString()}`;
}

export function canAnalyzeBuildArticle(article: BuildArticle): boolean {
  return (
    article.collectionCompleteness !== "metadata-only" &&
    Array.isArray(article.pokemonSlugs) &&
    article.pokemonSlugs.length === 6
  );
}

export function resolveArticleImport(
  articleId: string | null,
  articleList: BuildArticle[] = articles,
  pokemonList: PokemonEntry[] = pokemon
): ArticleImportResult {
  if (articleId === null) {
    return { status: "idle" };
  }

  const article = articleList.find((entry) => entry.id === articleId);
  if (!article) {
    return {
      status: "error",
      message: "指定された構築記事が見つかりません。記事一覧からもう一度選択してください。"
    };
  }

  if (article.collectionCompleteness === "metadata-only") {
    return {
      status: "error",
      message:
        "この記事は記事情報のみ自動取得されており、採用ポケモン6体を安全に確認できないため取り込めません。"
    };
  }

  if (!Array.isArray(article.pokemonSlugs) || article.pokemonSlugs.length !== 6) {
    return {
      status: "error",
      message: "この記事には採用ポケモン6体の正しいデータがありません。現在のパーティは変更されていません。"
    };
  }

  const knownSlugs = new Set(pokemonList.map((entry) => entry.slug));
  const uniqueSlugs = new Set(article.pokemonSlugs);
  if (
    uniqueSlugs.size !== 6 ||
    article.pokemonSlugs.some((slug) => typeof slug !== "string" || !knownSlugs.has(slug))
  ) {
    return {
      status: "error",
      message: "この記事の採用ポケモンデータに不正な項目があります。安全のため取り込みを中止しました。"
    };
  }

  return {
    status: "ready",
    article,
    team: article.pokemonSlugs.map((pokemonSlug, index) => ({
      id: `article-import-${index + 1}`,
      mode: "pokemon",
      pokemonSlug
    }))
  };
}

export function selectTeamForImportAction(
  currentTeam: TeamSlot[],
  importedTeam: TeamSlot[],
  action: "confirm" | "cancel"
): TeamSlot[] {
  return action === "confirm" ? importedTeam : currentTeam;
}

export function selectTeamForRestoreAction(
  currentTeam: TeamSlot[],
  backupTeam: TeamSlot[],
  action: "restore" | "cancel"
): TeamSlot[] {
  return action === "restore" ? backupTeam : currentTeam;
}

export function compareArticleRegulation(
  article: BuildArticle,
  currentSeasonId: string
): ArticleRegulationComparison {
  const articleRegulation = getRegulationDefinition(article.regulation);
  const currentRegulation = getRegulationForSeason(currentSeasonId);
  const currentSeason = getSeasonDefinition(currentSeasonId);
  const articleSeasonId = resolveArticleSeasonId(
    article.regulation,
    article.season,
    article.builderSeasonId
  );
  const articleSeason = articleSeasonId
    ? getSeasonDefinition(articleSeasonId)
    : null;

  return {
    articleRegulation,
    currentRegulation,
    articleSeason,
    currentSeason,
    articleSeasonId,
    differs:
      articleRegulation?.id !== currentRegulation?.id ||
      articleSeasonId !== currentSeasonId,
    canSwitchToArticle: articleRegulation !== null && articleSeasonId !== null
  };
}

export function selectSeasonForArticleImport(
  article: BuildArticle,
  currentSeasonId: string,
  mode: "article" | "current"
): string {
  if (mode === "current") {
    return currentSeasonId;
  }

  const comparison = compareArticleRegulation(article, currentSeasonId);
  return comparison.canSwitchToArticle && comparison.articleSeasonId
    ? comparison.articleSeasonId
    : currentSeasonId;
}

export function mergeImportedPokemonOptions(
  availablePokemon: PokemonEntry[],
  team: TeamSlot[]
): PokemonEntry[] {
  const options = new Map(availablePokemon.map((entry) => [entry.slug, entry]));
  const allPokemon = new Map(pokemon.map((entry) => [entry.slug, entry]));

  for (const slot of team) {
    if (slot.mode === "pokemon" && !options.has(slot.pokemonSlug)) {
      const selectedPokemon = allPokemon.get(slot.pokemonSlug);
      if (selectedPokemon) {
        options.set(selectedPokemon.slug, selectedPokemon);
      }
    }
  }

  return [...options.values()];
}
