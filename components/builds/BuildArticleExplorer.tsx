"use client";

import { useMemo, useState } from "react";
import type {
  BattleFormat,
  BuildArticle,
  PokemonLabelMap
} from "@/types/buildArticle";
import styles from "./BuildArticleExplorer.module.css";

const formatLabels: Record<BattleFormat, string> = {
  single: "シングル",
  double: "ダブル"
};

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T00:00:00+09:00`));
}

export function BuildArticleExplorer({
  articles,
  pokemonLabels
}: {
  articles: BuildArticle[];
  pokemonLabels: PokemonLabelMap;
}) {
  const [query, setQuery] = useState("");
  const [battleFormat, setBattleFormat] = useState<"all" | BattleFormat>("all");
  const [regulation, setRegulation] = useState("all");
  const [season, setSeason] = useState("all");

  const regulationOptions = useMemo(
    () => [...new Set(articles.map((article) => article.regulation))].sort(),
    [articles]
  );
  const seasonOptions = useMemo(
    () => [...new Set(articles.map((article) => article.season))].sort(),
    [articles]
  );

  const filteredArticles = useMemo(() => {
    const normalizedQuery = normalize(query);

    return articles.filter((article) => {
      if (battleFormat !== "all" && article.battleFormat !== battleFormat) {
        return false;
      }
      if (regulation !== "all" && article.regulation !== regulation) {
        return false;
      }
      if (season !== "all" && article.season !== season) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [
        article.title,
        article.author,
        article.sourceName,
        article.result,
        article.regulation,
        article.season,
        article.summary,
        ...article.tags,
        ...article.pokemonSlugs.flatMap((slug) => [slug, pokemonLabels[slug] ?? ""])
      ]
        .join(" ")
        .normalize("NFKC")
        .toLocaleLowerCase("ja");

      return searchableText.includes(normalizedQuery);
    });
  }, [articles, battleFormat, pokemonLabels, query, regulation, season]);

  function resetFilters() {
    setQuery("");
    setBattleFormat("all");
    setRegulation("all");
    setSeason("all");
  }

  return (
    <section className={styles.explorer} aria-labelledby="build-results-heading">
      <div className={styles.toolbar}>
        <div className={styles.resultHeading}>
          <h2 id="build-results-heading">記事一覧</h2>
          <p aria-live="polite">{filteredArticles.length}件を表示中</p>
        </div>

        <div className={styles.filters}>
          <label className={styles.search}>
            <span>キーワード・ポケモン名</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例：ニンフィア、雨、最終104位"
            />
          </label>

          <label>
            <span>対戦形式</span>
            <select
              value={battleFormat}
              onChange={(event) =>
                setBattleFormat(event.target.value as "all" | BattleFormat)
              }
            >
              <option value="all">すべて</option>
              <option value="single">シングル</option>
              <option value="double">ダブル</option>
            </select>
          </label>

          <label>
            <span>レギュレーション</span>
            <select value={regulation} onChange={(event) => setRegulation(event.target.value)}>
              <option value="all">すべて</option>
              {regulationOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>シーズン</span>
            <select value={season} onChange={(event) => setSeason(event.target.value)}>
              <option value="all">すべて</option>
              {seasonOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {filteredArticles.length > 0 ? (
        <div className={styles.grid}>
          {filteredArticles.map((article) => (
            <article className={styles.card} key={article.id}>
              <div className={styles.meta}>
                <span className={article.battleFormat === "single" ? styles.single : styles.double}>
                  {formatLabels[article.battleFormat]}
                </span>
                <span>{article.regulation}</span>
                <span>{article.season}</span>
                <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
              </div>

              <h3>{article.title}</h3>
              <p className={styles.byline}>
                {article.sourceName} / {article.author}
              </p>
              <strong className={styles.result}>{article.result}</strong>
              <p className={styles.summary}>{article.summary}</p>

              <div className={styles.team} aria-label="採用ポケモン">
                {article.pokemonSlugs.map((slug, index) => {
                  const label = pokemonLabels[slug] ?? slug;
                  return (
                    <button
                      type="button"
                      key={`${article.id}-${slug}`}
                      onClick={() => setQuery(label)}
                      title={`${label}で検索`}
                    >
                      <span>{index + 1}</span>
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className={styles.tags}>
                {article.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>

              <a
                className={styles.sourceLink}
                href={article.url}
                target="_blank"
                rel="noreferrer"
              >
                元記事を読む <span aria-hidden="true">↗</span>
              </a>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>条件に合う記事がありません</strong>
          <p>キーワードを変えるか、絞り込み条件を「すべて」に戻してください。</p>
          <button type="button" onClick={resetFilters}>
            条件をリセット
          </button>
        </div>
      )}
    </section>
  );
}
