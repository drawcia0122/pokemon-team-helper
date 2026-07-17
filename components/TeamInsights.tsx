import { getTypeLabel } from "@/lib/typeChart";
import type { TeamSummary } from "@/types/pokemon";

export function TeamInsights({ summary }: { summary: TeamSummary }) {
  const topGaps = summary.defensiveGaps.slice(0, 5);
  const missingOffense = summary.missingOffense.slice(0, 5);
  const thinOffense = summary.thinOffense.slice(0, 5);

  return (
    <section className="panel">
      <div className="panel-inner">
        <div className="section-title">
          <div>
            <h2>パーティの不足タイプ</h2>
            <p>防御面の穴と、攻撃面で押しづらい相手タイプを先に読める形でまとめています。</p>
          </div>
        </div>

        <div className="result-grid">
          <div className="metric-card">
            <h4>補えていない防御タイプ</h4>
            <div className="pill-row">
              {topGaps.filter((gap) => gap.priorityScore > 0).length > 0 ? (
                topGaps
                  .filter((gap) => gap.priorityScore > 0)
                  .slice(0, 4)
                  .map((gap) => (
                    <span key={gap.type} className="pill bad">
                      {gap.typeJa} 弱点 {gap.weakMembers} / 受け {gap.coverMembers}
                    </span>
                  ))
              ) : (
                <span className="pill good">大きな防御の穴は少なめ</span>
              )}
            </div>
          </div>

          <div className="metric-card">
            <h4>攻撃範囲が薄いタイプ</h4>
            <div className="pill-row">
              {missingOffense.length > 0 ? (
                missingOffense.map((row) => (
                  <span key={row.defendType} className="pill bad">
                    {row.defendTypeJa} に抜群なし
                  </span>
                ))
              ) : (
                <span className="pill good">全タイプに最低限の攻撃範囲あり</span>
              )}
            </div>
          </div>
        </div>

        <div className="insight-grid">
          <article className="candidate">
            <h4>防御面で不足しがちなタイプ</h4>
            {topGaps.map((gap) => (
              <p key={gap.type}>
                <strong>{gap.typeJa}</strong>
                {" "}
                優先度 {gap.priorityScore} / 弱点 {gap.weakMembers} / 受け {gap.coverMembers} / {gap.note}
              </p>
            ))}
          </article>

          <article className="candidate">
            <h4>攻撃範囲の穴</h4>
            {missingOffense.length > 0 ? (
              missingOffense.map((row) => (
                <p key={row.defendType}>
                  <strong>{row.defendTypeJa}</strong>
                  {" "}
                  に抜群を取れるタイプがいません
                </p>
              ))
            ) : (
              <p>致命的な攻撃範囲の穴はありません。</p>
            )}

            {thinOffense.length > 0 ? (
              <>
                <h4 style={{ marginTop: 16 }}>攻撃範囲が薄め</h4>
                {thinOffense.map((row) => (
                  <p key={row.defendType}>
                    <strong>{row.defendTypeJa}</strong>
                    {" "}
                    へ抜群を取れるのは {row.superEffectiveCount} 枠だけ
                  </p>
                ))}
              </>
            ) : null}
          </article>

          <article className="candidate">
            <h4>攻撃範囲一覧</h4>
            <div className="pill-row">
              {summary.offensiveCoverage.map((row) => (
                <span
                  key={row.defendType}
                  className={`pill ${row.superEffectiveCount === 0 ? "bad" : row.superEffectiveCount >= 2 ? "good" : ""}`}
                >
                  {getTypeLabel(row.defendType)} 抜群 {row.superEffectiveCount}
                </span>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
