import type { Metadata } from "next";
import { EnvironmentExplorer } from "@/components/environment/EnvironmentExplorer";
import { SiteNavigation } from "@/components/navigation/SiteNavigation";
import { getEnvironmentRankingCatalog } from "@/lib/environmentData.server";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "ポケモン環境使用率ランキング",
  description: "Pokemon Showdownの月次統計から、ポケモンの使用率、採用技、持ち物、特性を確認できます。"
};

export default function EnvironmentPage() {
  const catalog = getEnvironmentRankingCatalog();
  return (
    <main className={styles.page}>
      <SiteNavigation active="environment" />
      <section className={styles.hero}>
        <p className={styles.eyebrow}>POKEMON SHOWDOWN MONTHLY STATS</p>
        <h1>環境使用率ランキング</h1>
        <p>
          Pokemon Showdownの月次対戦統計を、形式・レギュレーション・cutoff別に表示します。
          ポケモンを選ぶと、採用技、持ち物、特性、能力配分を確認できます。
        </p>
        <aside>
          このデータは非公式のPokemon Showdown統計です。
          <strong>公式Pokemon HOMEの統計ではありません。</strong>
        </aside>
      </section>
      <EnvironmentExplorer catalog={catalog} />
    </main>
  );
}
