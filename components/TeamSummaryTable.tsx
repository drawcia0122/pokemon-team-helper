import { bucketLabels } from "@/lib/typeChart";
import type { TeamSummary } from "@/types/pokemon";

export function TeamSummaryTable({ summary }: { summary: TeamSummary }) {
  return (
    <section className="panel">
      <div className="panel-inner">
        <div className="section-title">
          <div>
            <h2>チーム全体の相性表</h2>
            <p>18タイプそれぞれに対する通りやすさを一覧で確認できます。</p>
          </div>
        </div>

        <div className="pill-row">
          {summary.sharedWeaknesses.length > 0 ? (
            summary.sharedWeaknesses.slice(0, 6).map((row) => (
              <span key={row.attackType} className="pill bad">
                {row.attackTypeJa} が一貫気味
              </span>
            ))
          ) : (
            <span className="pill good">明確な一貫弱点は少なめです</span>
          )}
        </div>

        <div className="pill-row summary-pills">
          {summary.missingOffense.length > 0 ? (
            summary.missingOffense.slice(0, 4).map((row) => (
              <span key={row.defendType} className="pill bad">
                {row.defendTypeJa} に抜群なし
              </span>
            ))
          ) : (
            <span className="pill good">攻撃範囲の大きな穴は少なめです</span>
          )}
        </div>

        <div className="table-wrap">
          <table className="summary-table">
            <thead>
              <tr>
                <th>攻撃タイプ</th>
                <th>{bucketLabels.quadWeak}</th>
                <th>{bucketLabels.weak}</th>
                <th>{bucketLabels.neutral}</th>
                <th>{bucketLabels.resist}</th>
                <th>{bucketLabels.doubleResist}</th>
                <th>{bucketLabels.immune}</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => {
                const weaknessCount = row.multiplierMap.quadWeak + row.multiplierMap.weak;
                const coverCount = row.multiplierMap.resist + row.multiplierMap.doubleResist + row.multiplierMap.immune;
                const rowClass = weaknessCount >= 2 && coverCount === 0 ? "danger-row" : coverCount >= 2 && weaknessCount === 0 ? "good-row" : "";

                return (
                  <tr key={row.attackType} className={rowClass}>
                    <th>{row.attackTypeJa}</th>
                    <td>{row.multiplierMap.quadWeak}</td>
                    <td>{row.multiplierMap.weak}</td>
                    <td>{row.multiplierMap.neutral}</td>
                    <td>{row.multiplierMap.resist}</td>
                    <td>{row.multiplierMap.doubleResist}</td>
                    <td>{row.multiplierMap.immune}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
