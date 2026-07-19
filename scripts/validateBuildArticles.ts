import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRegulationDefinitions } from "@/lib/regulationValidation";
import { validateBuildArticleThumbnail } from "@/lib/buildArticleThumbnail";
import {
  validateCollectionStatus,
  validateGeneratedCollection
} from "./build-article-collectors/validate";
import { getSourceConfigs } from "./build-article-collectors/sourceRegistry";
import type { CollectionStatus } from "./build-article-collectors/types";
import type {
  BuildArticle,
  GeneratedBuildArticle
} from "@/types/buildArticle";
import type {
  AppMeta,
  PokemonEntry,
  RegulationDefinition
} from "@/types/pokemon";

type JsonRecord = Record<string, unknown>;

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..");

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8")) as T;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function requireText(article: JsonRecord, key: string, context: string, errors: string[]) {
  if (typeof article[key] !== "string" || String(article[key]).trim() === "") {
    errors.push(`${context}: ${key} が空です`);
  }
}

async function main() {
  const [
    manualArticles,
    generatedArticles,
    collectionStatus,
    pokemon,
    appMeta,
    regulationA,
    regulationB
  ] = await Promise.all([
    readJson<JsonRecord[]>("data/buildArticles.manual.json"),
    readJson<GeneratedBuildArticle[]>("data/buildArticles.generated.json"),
    readJson<CollectionStatus>("data/buildArticleCollectionStatus.json"),
    readJson<PokemonEntry[]>("data/pokemon.json"),
    readJson<AppMeta>("data/appMeta.json"),
    readJson<RegulationDefinition>("data/regulations/regulation-m-a.json"),
    readJson<RegulationDefinition>("data/regulations/regulation-m-b.json")
  ]);

  const errors: string[] = [];
  const ids = new Set<string>();
  const pokemonSlugs = new Set(pokemon.map((entry) => entry.slug));
  const seasonIds = new Set(appMeta.seasonIds);
  const regulations = [regulationA, regulationB];
  const regulationReferences = [
    ...manualArticles,
    ...generatedArticles.map((article) => {
      const season = appMeta.seasons.find(
        (entry) => entry.id === article.builderSeasonId
      );
      return {
        id: article.id,
        regulation: article.regulationId,
        season: season?.articleLabel,
        builderSeasonId: article.builderSeasonId
      };
    })
  ];
  errors.push(
    ...validateRegulationDefinitions(
      appMeta,
      regulations,
      regulationReferences
    )
  );
  errors.push(
    ...validateCollectionStatus(collectionStatus, getSourceConfigs())
  );
  for (const regulation of regulations) {
    for (const slug of regulation.allowedPokemonSlugs) {
      if (!pokemonSlugs.has(slug)) {
        errors.push(`regulation:${regulation.id}: pokemon.json に存在しないslugです: ${slug}`);
      }
    }
  }

  for (const article of manualArticles) {
    const context = `buildArticles.manual:${String(article.id ?? "unknown")}`;
    [
      "id",
      "title",
      "author",
      "sourceName",
      "url",
      "publishedAt",
      "battleFormat",
      "regulation",
      "season",
      "builderSeasonId",
      "result",
      "summary"
    ].forEach((key) => requireText(article, key, context, errors));

    const id = String(article.id ?? "");
    if (ids.has(id)) {
      errors.push(`${context}: IDが重複しています`);
    }
    ids.add(id);

    if (!isHttpsUrl(article.url)) {
      errors.push(`${context}: url はHTTPS URLにしてください`);
    }
    if (!Object.prototype.hasOwnProperty.call(article, "thumbnail")) {
      errors.push(`${context}: thumbnailが未定義です`);
    } else {
      errors.push(
        ...validateBuildArticleThumbnail(article.thumbnail, "manual").map(
          (error) => `${context}: ${error}`
        )
      );
    }
    if (!isValidDate(article.publishedAt)) {
      errors.push(`${context}: publishedAt は実在するYYYY-MM-DD形式にしてください`);
    }
    if (article.battleFormat !== "single" && article.battleFormat !== "double") {
      errors.push(`${context}: battleFormat は single または double にしてください`);
    }
    if (!seasonIds.has(String(article.builderSeasonId ?? ""))) {
      errors.push(`${context}: builderSeasonId が appMeta.json に存在しません`);
    }

    if (!Array.isArray(article.pokemonSlugs) || article.pokemonSlugs.length !== 6) {
      errors.push(`${context}: pokemonSlugs は6体分必要です`);
    } else {
      const slugs = article.pokemonSlugs.map(String);
      if (new Set(slugs).size !== 6) {
        errors.push(`${context}: pokemonSlugs に同じポケモンが重複しています`);
      }
      for (const slug of slugs) {
        if (!pokemonSlugs.has(slug)) {
          errors.push(`${context}: pokemon.json に存在しないslugです: ${slug}`);
        }
      }
    }

    if (!Array.isArray(article.tags) || article.tags.some((tag) => typeof tag !== "string")) {
      errors.push(`${context}: tags は文字列の配列にしてください`);
    }
  }

  errors.push(
    ...validateGeneratedCollection(
      generatedArticles,
      manualArticles as BuildArticle[],
      {
        appMeta,
        pokemon,
        allowedHatenaDomains: collectionStatus.hatenaBlogs
          ?.filter((blog) => blog.platformVerified)
          .map((blog) => blog.domain)
      }
    )
  );

  if (errors.length > 0) {
    errors.forEach((error) => console.error(`[error] ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    `[ok] 構築記事 手動${manualArticles.length}件 + 自動${generatedArticles.length}件 / ポケモン ${pokemon.length}件を検証しました`
  );
}

main().catch((error) => {
  console.error("[fatal] 構築記事データの検証に失敗しました");
  console.error(error);
  process.exitCode = 1;
});
