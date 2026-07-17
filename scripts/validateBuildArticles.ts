import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const [articles, pokemon, appMeta] = await Promise.all([
    readJson<JsonRecord[]>("data/buildArticles.json"),
    readJson<Array<{ slug: string }>>("data/pokemon.json"),
    readJson<{ seasonIds: string[] }>("data/appMeta.json")
  ]);

  const errors: string[] = [];
  const ids = new Set<string>();
  const pokemonSlugs = new Set(pokemon.map((entry) => entry.slug));
  const seasonIds = new Set(appMeta.seasonIds);

  for (const article of articles) {
    const context = `buildArticles:${String(article.id ?? "unknown")}`;
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

  if (errors.length > 0) {
    errors.forEach((error) => console.error(`[error] ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`[ok] 構築記事 ${articles.length}件 / ポケモン ${pokemon.length}件を検証しました`);
}

main().catch((error) => {
  console.error("[fatal] 構築記事データの検証に失敗しました");
  console.error(error);
  process.exitCode = 1;
});
