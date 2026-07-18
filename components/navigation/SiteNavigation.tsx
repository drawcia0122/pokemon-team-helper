import Link from "next/link";
import { getSiteNavigationState } from "@/lib/siteNavigation";
import styles from "./SiteNavigation.module.css";

const provisionalSiteName = "Pokémon Team Notes";

export function SiteNavigation({ active }: { active: string }) {
  const items = getSiteNavigationState(active);

  return (
    <div className={styles.shell}>
      <div className={styles.identity}>
        <span>{provisionalSiteName}</span>
        <small>非公式ポケモン情報・構築ツール</small>
      </div>
      <nav className={styles.navigation} aria-label="サイト内の主要機能">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={item.isCurrent ? styles.current : undefined}
            aria-current={item.isCurrent ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
