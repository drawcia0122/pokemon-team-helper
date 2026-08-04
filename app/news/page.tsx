import type { Metadata } from "next";
import { PokemonContentExplorer } from "@/components/news/PokemonContentExplorer";
import { SiteNavigation } from "@/components/navigation/SiteNavigation";
import {
  getContentPokemonIds,
  getContentPokemonLabels,
  getPokemonContent
} from "@/lib/pokemonContent";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "ポケモンニュース",
  description: "公式情報を中心に、ポケモンのグッズ、ゲーム、イベント、カード、映像、コラボ、大会情報をまとめています。"
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
  const items = getPokemonContent();

  return (
    <main className={styles.page}>
      <SiteNavigation active="news" />
      <section className={styles.hero}>
        <div className={styles.heroHeading}>
          <div>
            <p className={styles.eyebrow}>POKÉMON NEWS</p>
            <h1>ポケモンニュース</h1>
          </div>
          <strong>{items.length}件の情報</strong>
        </div>
        <p>グッズ、ゲーム、イベント、カード、映像、コラボ、大会の公式情報を、複数タグと日程で探せます。</p>
        <aside>
          このページは非公式です。情報の正確性や在庫を保証しません。
          購入・応募・参加前に、必ず元ページで最新条件をご確認ください。
        </aside>
      </section>
      <PokemonContentExplorer
        items={items}
        pokemonIds={getContentPokemonIds(
          items.flatMap((item) => item.pokemonSlugs)
        )}
        pokemonLabels={getContentPokemonLabels()}
        today={todayInJapan()}
      />
    </main>
  );
}
