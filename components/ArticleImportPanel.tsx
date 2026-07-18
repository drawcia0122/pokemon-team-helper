"use client";

import { useEffect, useState } from "react";
import { getPokemonBySlug } from "@/lib/typeChart";
import {
  compareArticleRegulation,
  type ArticleImportResult
} from "@/lib/articleImport";
import type { PokemonEntry } from "@/types/pokemon";
import styles from "./ArticleImportPanel.module.css";

type ImportSeasonMode = "article" | "current";

const formatLabels = {
  single: "シングル",
  double: "ダブル"
} as const;

export function ArticleImportPanel({
  request,
  currentSeasonId,
  currentSeasonLabel,
  availablePokemon,
  onConfirm,
  onCancel
}: {
  request: Exclude<ArticleImportResult, { status: "idle" }>;
  currentSeasonId: string;
  currentSeasonLabel: string;
  availablePokemon: PokemonEntry[];
  onConfirm: (mode: ImportSeasonMode) => void;
  onCancel: () => void;
}) {
  const [seasonMode, setSeasonMode] = useState<ImportSeasonMode>("article");

  useEffect(() => {
    setSeasonMode("article");
  }, [request]);

  if (request.status === "error") {
    return (
      <section className={`${styles.panel} ${styles.error}`} role="alert">
        <div>
          <strong>構築記事を読み込めません</strong>
          <p>{request.message}</p>
        </div>
        <button type="button" onClick={onCancel}>
          閉じる
        </button>
      </section>
    );
  }

  const article = request.article;
  const comparison = compareArticleRegulation(article, currentSeasonId);
  const seasonDiffers = comparison.differs;
  const currentRegulationLabel =
    comparison.currentRegulation?.label ?? "未定義のルール";
  const articleRegulationLabel =
    comparison.articleRegulation?.label ?? article.regulation;
  const articleSeasonLabel =
    comparison.articleSeason?.label ?? article.season;
  const availableSlugs = new Set(availablePokemon.map((pokemon) => pokemon.slug));
  const unavailablePokemon = request.team
    .filter((slot) => slot.mode === "pokemon" && !availableSlugs.has(slot.pokemonSlug))
    .map((slot) => (slot.mode === "pokemon" ? getPokemonBySlug(slot.pokemonSlug)?.nameJa : null))
    .filter((name): name is string => Boolean(name));

  return (
    <section className={styles.panel} aria-labelledby="article-import-heading">
      <div className={styles.heading}>
        <div>
          <span>構築記事からパーティを読み込む</span>
          <h2 id="article-import-heading">{article.title}</h2>
        </div>
        <dl className={styles.meta}>
          <div>
            <dt>著者</dt>
            <dd>{article.author}</dd>
          </div>
          <div>
            <dt>対戦形式</dt>
            <dd>{formatLabels[article.battleFormat]}</dd>
          </div>
          <div>
            <dt>記事のルール</dt>
            <dd>
              {articleRegulationLabel}
              {!comparison.articleRegulation ? "（未対応）" : ""}
            </dd>
          </div>
          <div>
            <dt>記事のシーズン</dt>
            <dd>{articleSeasonLabel}</dd>
          </div>
          <div>
            <dt>現在のルール</dt>
            <dd>{currentRegulationLabel}</dd>
          </div>
          <div>
            <dt>現在のシーズン</dt>
            <dd>{currentSeasonLabel}</dd>
          </div>
        </dl>
      </div>

      <ol className={styles.pokemonList}>
        {request.team.map((slot) => {
          const pokemon = slot.mode === "pokemon" ? getPokemonBySlug(slot.pokemonSlug) : null;
          return <li key={slot.id}>{pokemon?.nameJa ?? "不明なポケモン"}</li>;
        })}
      </ol>

      <p className={styles.warning}>
        読み込むと、現在編集中のパーティ6枠がこの記事の構築に置き換わります。
        現在のパーティは一時退避され、読み込み後に元へ戻せます。
      </p>

      {!comparison.articleRegulation ? (
        <p className={styles.unavailable} role="status">
          記事のルール「{article.regulation}」は構築補助で未対応です。
          6体のタイプ相性分析はできますが、使用可能判定は保証できません。
        </p>
      ) : null}

      {seasonDiffers || !comparison.canSwitchToArticle ? (
        <fieldset className={styles.seasonChoices}>
          <legend>
            {comparison.canSwitchToArticle
              ? "記事と現在のルール・シーズンが異なります"
              : "記事のルール・シーズンへは切り替えられません"}
          </legend>
          {comparison.canSwitchToArticle ? (
            <label>
              <input
                type="radio"
                name="import-season-mode"
                value="article"
                checked={seasonMode === "article"}
                onChange={() => setSeasonMode("article")}
              />
              記事のシーズン「{articleSeasonLabel}」（ルール{articleRegulationLabel}）へ
              切り替えて読み込む
            </label>
          ) : null}
          <label>
            <input
              type="radio"
              name="import-season-mode"
              value="current"
              checked={seasonMode === "current" || !comparison.canSwitchToArticle}
              onChange={() => setSeasonMode("current")}
            />
            現在のルール「{currentRegulationLabel}」・シーズン「{currentSeasonLabel}」のまま
            読み込む
          </label>
          {(seasonMode === "current" || !comparison.canSwitchToArticle) &&
          unavailablePokemon.length > 0 ? (
            <p className={styles.unavailable}>
              現在のシーズンでは使用不可: {unavailablePokemon.join("、")}
              。タイプ相性分析はそのまま実行できます。
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.confirm}
          onClick={() =>
            onConfirm(comparison.canSwitchToArticle ? seasonMode : "current")
          }
        >
          この6体を読み込む
        </button>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </section>
  );
}
