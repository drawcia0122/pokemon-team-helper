import styles from "./SiteAttribution.module.css";

export function SiteAttribution() {
  return (
    <footer className={styles.footer} aria-label="権利表記">
      <p>
        Pokémonおよび関連する名称・画像は各権利者に帰属します。
        本サイトは非公式のファンサイトであり、株式会社ポケモンその他の権利者との提携・承認を受けたものではありません。
        権利者から要請があった場合は、該当画像の削除または差し替えを行います。
      </p>
    </footer>
  );
}
