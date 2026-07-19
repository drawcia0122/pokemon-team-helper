"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import { BuildArticleThumbnail } from "./BuildArticleThumbnail";
import {
  buildArticleImportHref,
  canAnalyzeBuildArticle
} from "@/lib/articleImport";
import { matchesBuildArticleQuery } from "@/lib/buildArticleSearch";
import type {
  BattleFormat,
  BuildArticle,
  BuildArticleSource,
  PokemonLabelMap
} from "@/types/buildArticle";
import styles from "./BuildArticleExplorer.module.css";

const formatLabels: Record<BattleFormat, string> = {
  single: "シングル",
  double: "ダブル"
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T00:00:00+09:00`));
}

export function BuildArticleExplorer({
  articles,
  pokemonLabels,
  regulationLabels,
  seasonLabels,
  seasonOptions
}: {
  articles: BuildArticle[];
  pokemonLabels: PokemonLabelMap;
  regulationLabels: Record<string, string>;
  seasonLabels: Record<string, string>;
  seasonOptions: Array<{ id: string; label: string }>;
}) {
  const [query, setQuery] = useState("");
  const [battleFormat, setBattleFormat] = useState<"all" | BattleFormat>("all");
  const [regulation, setRegulation] = useState("all");
  const [season, setSeason] = useState("all");
  const [completeness, setCompleteness] = useState<
    "all" | "complete" | "metadata-only"
  >("all");
  const [source, setSource] = useState<
    "all" | "manual" | BuildArticleSource
  >("all");

  const regulationOptions = useMemo(
    () => [...new Set(articles.map((article) => article.regulation))].sort(),
    [articles]
  );
  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      if (battleFormat !== "all" && article.battleFormat !== battleFormat) {
        return false;
      }
      if (regulation !== "all" && article.regulation !== regulation) {
        return false;
      }
      if (season !== "all" && article.builderSeasonId !== season) {
        return false;
      }
      const articleCompleteness =
        article.collectionCompleteness ?? "complete";
      if (
        completeness !== "all" &&
        articleCompleteness !== completeness
      ) {
        return false;
      }
      const articleSource = article.collection?.source ?? "manual";
      if (source !== "all" && articleSource !== source) {
        return false;
      }
      return matchesBuildArticleQuery(
        article,
        query,
        pokemonLabels,
        regulationLabels,
        seasonLabels
      );
    });
  }, [
    articles,
    battleFormat,
    completeness,
    pokemonLabels,
    query,
    regulation,
    regulationLabels,
    season,
    seasonLabels,
    source
  ]);

  function resetFilters() {
    setQuery("");
    setBattleFormat("all");
    setRegulation("all");
    setSeason("all");
    setCompleteness("all");
    setSource("all");
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
                  {regulationLabels[value] ?? value}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>シーズン</span>
            <select value={season} onChange={(event) => setSeason(event.target.value)}>
              <option value="all">すべて</option>
              {seasonOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>記事データ</span>
            <select
              value={completeness}
              onChange={(event) =>
                setCompleteness(
                  event.target.value as
                    | "all"
                    | "complete"
                    | "metadata-only"
                )
              }
            >
              <option value="all">すべて</option>
              <option value="complete">6体を分析できる記事</option>
              <option value="metadata-only">記事リンクのみ</option>
            </select>
          </label>

          <label>
            <span>収集元</span>
            <select
              value={source}
              onChange={(event) =>
                setSource(
                  event.target.value as
                    | "all"
                    | "manual"
                    | BuildArticleSource
                )
              }
            >
              <option value="all">すべて</option>
              <option value="note">note</option>
              <option value="hatena-blog">はてなブログ</option>
              <option value="manual">手動掲載</option>
            </select>
          </label>
        </div>
      </div>

      {filteredArticles.length > 0 ? (
        <div className={styles.grid}>
          {filteredArticles.map((article) => (
            <article className={styles.card} key={article.id}>
              <BuildArticleThumbnail
                title={article.title}
                thumbnail={article.thumbnail}
                origin={article.collection?.source ?? "manual"}
                regulation={
                  regulationLabels[article.regulation] ?? article.regulation
                }
                season={
                  seasonLabels[article.builderSeasonId] ?? article.season
                }
                battleFormat={article.battleFormat}
              />
              <div className={styles.cardBody}>
                <h3>{article.title}</h3>
                <p
                  className={`${styles.statusLabel} ${
                    article.collectionCompleteness === "metadata-only"
                      ? styles.metadataStatus
                      : styles.completeStatus
                  }`}
                >
                  {article.collectionCompleteness === "metadata-only"
                    ? "記事情報のみ自動取得"
                    : "6体を分析できる記事"}
                  <span>
                    {article.collection ? "自動収集" : "手動掲載"}・出典：
                    {article.sourceName}
                  </span>
                </p>

                <div className={styles.details}>
                  <div className={styles.meta}>
                    <span className={article.battleFormat === "single" ? styles.single : styles.double}>
                      {formatLabels[article.battleFormat]}
                    </span>
                    <span>{regulationLabels[article.regulation] ?? article.regulation}</span>
                    <span>{seasonLabels[article.builderSeasonId] ?? article.season}</span>
                  </div>
                  <strong className={styles.result}>{article.result}</strong>
                </div>

                {article.collectionCompleteness === "metadata-only" ? (
                  <div className={styles.metadataOnlyTeam}>
                    <strong>採用ポケモンは元記事で確認</strong>
                    <span>6体を正確に特定できなかったため、推測では掲載していません。</span>
                  </div>
                ) : (
                  <div className={styles.team} aria-label="採用ポケモン">
                    {article.pokemonSlugs.map((slug) => {
                      const label = pokemonLabels[slug] ?? slug;
                      return (
                        <button
                          type="button"
                          key={`${article.id}-${slug}`}
                          onClick={() => setQuery(label)}
                          title={`${label}で検索`}
                        >
                          <PokemonVisual name={label} slug={slug} />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <p className={styles.summary}>{article.summary}</p>

                <div className={styles.tags}>
                  {article.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>

                <div className={styles.footer}>
                  <p className={styles.byline}>
                    {article.sourceName} / {article.author}
                    <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
                  </p>
                  <div className={styles.actions}>
                    {canAnalyzeBuildArticle(article) ? (
                      <Link className={styles.importLink} href={buildArticleImportHref(article.id)}>
                        この構築を分析する
                      </Link>
                    ) : null}
                    <a
                      className={`${styles.sourceLink} ${
                        article.collectionCompleteness === "metadata-only"
                          ? styles.metadataSourceLink
                          : ""
                      }`}
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      元記事を読む <span aria-hidden="true">↗</span>
                    </a>
                  </div>
                </div>
              </div>
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
