import type { Metadata } from "next";
import { BuildArticleExplorer } from "@/components/builds/BuildArticleExplorer";
import { getBuildArticles, getPokemonLabelMap } from "@/lib/buildArticles";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "構築記事を探す | ポケモン タイプ相性補完ツール",
  description: "対戦形式、レギュレーション、シーズン、採用ポケモンから構築記事を検索できます。"
};

export default function BuildsPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>BUILD ARTICLE LIBRARY</p>
        <h1>構築記事を探す</h1>
        <p>
          対戦形式やレギュレーション、採用ポケモンから構築記事を検索できます。
          記事本文や画像は掲載せず、検索に必要な情報と独自の短い紹介、元記事へのリンクのみを扱います。
        </p>
        <aside className={styles.unofficial}>
          このページは非公式です。株式会社ポケモンなどの公式各社、掲載媒体、記事執筆者とは関係ありません。
          記事の詳細と最新情報はリンク先をご確認ください。
        </aside>
      </section>

      <BuildArticleExplorer
        articles={getBuildArticles()}
        pokemonLabels={getPokemonLabelMap()}
      />
    </main>
  );
}
