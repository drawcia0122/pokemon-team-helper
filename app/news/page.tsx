import type { Metadata } from "next";
import { PokemonContentExplorer } from "@/components/news/PokemonContentExplorer";
import { getContentPokemonLabels, getPokemonContent } from "@/lib/pokemonContent";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "ポケモンニュース・グッズ・イベント",
  description: "ポケモン関連のニュース、グッズ、イベント、キャンペーン、ゲームアップデートを検索できます。"
};

function todayInJapan(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export default function NewsPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>POKÉMON INFORMATION INDEX</p>
        <h1>ニュース・グッズ・イベント</h1>
        <p>公式サイトなど出典が明確な情報を、日程と関連ポケモンから探せる形で整理しています。</p>
        <aside>
          このページは非公式です。情報の正確性や在庫を保証しません。
          購入・応募・参加前に、必ず元ページで最新条件をご確認ください。
        </aside>
      </section>
      <PokemonContentExplorer
        items={getPokemonContent()}
        pokemonLabels={getContentPokemonLabels()}
        today={todayInJapan()}
      />
    </main>
  );
}
