import {
  getCoveredOffenseRows,
  getDefensiveAttentionRows,
  getTeamUiSummary
} from "@/lib/teamUi";
import type { TeamDiagnostics } from "@/lib/teamDiagnostics";
import type { TeamSummary } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

export function AnalysisSummary({
  summary,
  slotCount,
  diagnostics
}: {
  summary: TeamSummary;
  slotCount: number;
  diagnostics: TeamDiagnostics;
}) {
  const ui = getTeamUiSummary(summary, slotCount);
  const attentionRows = getDefensiveAttentionRows(summary);
  const topResistances = summary.rows
    .filter((row) => row.multiplierMap.resist + row.multiplierMap.doubleResist + row.multiplierMap.immune > 0)
    .sort((a, b) =>
      b.multiplierMap.immune + b.multiplierMap.doubleResist + b.multiplierMap.resist -
      (a.multiplierMap.immune + a.multiplierMap.doubleResist + a.multiplierMap.resist)
    )
    .slice(0, 4);

  return (
    <section className={styles.analysisSection} aria-labelledby="analysis-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.step}>STEP 2</span>
          <h2 id="analysis-heading">現在の弱点を確認する</h2>
          <p>重大な弱点を先に、耐性はその後にまとめています。</p>
        </div>
      </div>

      {!ui.canAnalyze ? (
        <div className={styles.analysisPrompt} role="status">
          <strong>あと{Math.max(0, 2 - summary.members.length)}体入力すると分析できます</strong>
          <p>空き枠からポケモンまたはタイプを追加してください。</p>
        </div>
      ) : (
        <>
          <div className={styles.summaryStrip}>
            <div>
              <span>入力済み</span>
              <strong>{ui.filledSlots}<small>/6体</small></strong>
            </div>
            <div className={ui.sharedWeaknessCount > 0 ? styles.warningMetric : ""}>
              <span>共通弱点</span>
              <strong>{ui.sharedWeaknessCount}<small>タイプ</small></strong>
            </div>
            <div className={ui.severeMemberCount > 0 ? styles.dangerMetric : ""}>
              <span>4倍弱点あり</span>
              <strong>{ui.severeMemberCount}<small>体</small></strong>
            </div>
            <div>
              <span>攻撃範囲</span>
              <strong>{ui.coveredOffense}<small>/18タイプ</small></strong>
            </div>
          </div>

          <div className={styles.analysisGrid}>
            <div className={styles.weaknessPanel}>
              <div className={styles.panelLabel}>
                <strong>要注意</strong>
                <span>半減・無効で受けられるメンバーなし</span>
              </div>
              <div className={styles.coveragePills}>
                {attentionRows.length ? attentionRows.map((row) => (
                  <span key={row.attackType}>{row.attackTypeJa}</span>
                )) : (
                  <p className={styles.goodMessage}>半減・無効で受けられないタイプはありません。</p>
                )}
              </div>
            </div>

            <div className={styles.resistancePanel}>
              <div className={styles.panelLabel}>
                <strong>受けやすい</strong>
                <span>主な耐性・無効</span>
              </div>
              <div className={styles.coveragePills}>
                {topResistances.map((row) => {
                  const coverCount = row.multiplierMap.resist + row.multiplierMap.doubleResist + row.multiplierMap.immune;
                  return (
                    <span key={row.attackType}>
                      {row.attackTypeJa} <small>{coverCount}枠</small>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <section
        className={styles.diagnosticsPanel}
        aria-labelledby="team-diagnostics-heading"
      >
        <div className={styles.diagnosticsHeading}>
          <strong id="team-diagnostics-heading">パーティ診断</strong>
          <span>種族値とタイプ相性による特徴</span>
        </div>
        <div className={styles.diagnosticsGrid}>
          <div className={styles.strengthDiagnostics}>
            <h3>強み</h3>
            {diagnostics.strengths.length ? (
              <ul>
                {diagnostics.strengths.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>大きな偏りは見つかりませんでした。</p>
            )}
          </div>
          <div className={styles.cautionDiagnostics}>
            <h3>注意点</h3>
            {diagnostics.cautions.length ? (
              <ul>
                {diagnostics.cautions.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{item.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>大きな偏りは見つかりませんでした。</p>
            )}
          </div>
        </div>
        <p className={styles.diagnosticsNote}>
          技・特性・持ち物・努力値・テラスタイプは考慮していません。
        </p>
      </section>
    </section>
  );
}

export function OffensiveCoveragePanel({ summary }: { summary: TeamSummary }) {
  const covered = getCoveredOffenseRows(summary);

  return (
    <section className={styles.offenseSection} aria-labelledby="offense-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.step}>STEP 3</span>
          <h2 id="offense-heading">攻撃範囲を確認する</h2>
          <p>タイプ一致技を使う前提で、抜群を取れる相手を要約します。</p>
        </div>
        <strong className={styles.coverageScore}>{covered.length}<small>/18タイプ</small></strong>
      </div>
      <div className={styles.offenseGrid}>
        <div>
          <h3>抜群を取れるタイプ</h3>
          <div className={styles.typePills}>
            {covered.length ? covered.map((row) => (
              <span key={row.defendType}>
                {row.defendTypeJa} <small>{row.superEffectiveCount}枠</small>
              </span>
            )) : <p>抜群を取れるタイプはまだありません。</p>}
          </div>
        </div>
        <div className={summary.missingOffense.length ? styles.offenseWarning : ""}>
          <h3>未対応（0枠）</h3>
          <div className={styles.typePills}>
            {summary.missingOffense.length ? summary.missingOffense.map((row) => <span key={row.defendType}>{row.defendTypeJa}</span>) : <p>全タイプに抜群打点があります。</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
