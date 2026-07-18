import type { getSeasonMeta } from "@/lib/regulations";
import styles from "./TeamWorkspace.module.css";

type SeasonMeta = ReturnType<typeof getSeasonMeta>;

export function SeasonBar({
  seasonId,
  onSeasonChange,
  options,
  meta
}: {
  seasonId: string;
  onSeasonChange: (seasonId: string) => void;
  options: Array<{ id: string; label: string }>;
  meta: SeasonMeta;
}) {
  return (
    <section className={styles.seasonBar} aria-labelledby="season-heading">
      <div className={styles.seasonHeading}>
        <span>現在のルール</span>
        <strong id="season-heading">{meta.label}</strong>
        <small>{meta.allowedCount}体が使用可能</small>
      </div>
      <label className={styles.seasonControl}>
        <span>シーズンを変更</span>
        <select value={seasonId} onChange={(event) => onSeasonChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <details className={styles.inlineDetails}>
        <summary>ルールの補足</summary>
        <div>
          <p>開始日: {meta.startDate ?? "未設定"}</p>
          {meta.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      </details>
    </section>
  );
}
