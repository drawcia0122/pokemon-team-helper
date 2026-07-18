import { bucketLabels, getTypeLabel } from "@/lib/typeChart";
import type { TeamSummary } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

export function TeamDetails({ summary }: { summary: TeamSummary }) {
  return (
    <section className={styles.detailsSection} aria-labelledby="details-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.step}>STEP 5</span>
          <h2 id="details-heading">詳細データを見る</h2>
          <p>必要な情報だけ開いて確認できます。</p>
        </div>
      </div>

      <details className={styles.detailPanel}>
        <summary>メンバー別の相性</summary>
        <div className={styles.detailBody}>
          {summary.memberProfiles.length ? summary.memberProfiles.map((profile) => (
            <details className={styles.memberDetail} key={profile.member.slotId}>
              <summary>
                <strong>{profile.member.label}</strong>
                <span>{profile.member.types.map(getTypeLabel).join(" / ")}</span>
              </summary>
              <div className={styles.memberMatchups}>
                {(["quadWeak", "weak", "resist", "doubleResist", "immune"] as const).map((bucket) => (
                  <div key={bucket}>
                    <strong>{bucketLabels[bucket]}</strong>
                    <p>{profile.byMultiplier[bucket].map(getTypeLabel).join("、") || "なし"}</p>
                  </div>
                ))}
              </div>
            </details>
          )) : <p>メンバーを入力すると表示されます。</p>}
        </div>
      </details>

      <details className={styles.detailPanel}>
        <summary>完全なタイプ相性表</summary>
        <div className={`${styles.detailBody} ${styles.tableWrap}`}>
          <table>
            <thead>
              <tr><th>攻撃タイプ</th><th>4倍</th><th>2倍</th><th>半減</th><th>1/4</th><th>無効</th></tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={row.attackType}>
                  <th>{row.attackTypeJa}</th>
                  <td>{row.multiplierMap.quadWeak}</td>
                  <td>{row.multiplierMap.weak}</td>
                  <td>{row.multiplierMap.resist}</td>
                  <td>{row.multiplierMap.doubleResist}</td>
                  <td>{row.multiplierMap.immune}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className={styles.detailPanel}>
        <summary>攻撃範囲の詳細と算出条件</summary>
        <div className={styles.detailBody}>
          <p>各メンバーが持つタイプのタイプ一致技を使う前提で算出しています。技・特性・持ち物は考慮しません。</p>
          <div className={styles.offenseDetailGrid}>
            {summary.offensiveCoverage.map((row) => (
              <div key={row.defendType}>
                <strong>{row.defendTypeJa}</strong>
                <span>抜群 {row.superEffectiveCount} / 等倍以上 {row.neutralOrBetterCount}</span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}
