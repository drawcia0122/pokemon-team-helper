import { getTeamUiSummary } from "@/lib/teamUi";
import { getTypeLabel } from "@/lib/typeChart";
import type { TeamSummary, TypeName } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

function memberNamesForType(summary: TeamSummary, type: TypeName, buckets: Array<"quadWeak" | "weak" | "resist" | "doubleResist" | "immune">) {
  return summary.memberProfiles
    .filter((profile) => buckets.some((bucket) => profile.byMultiplier[bucket].includes(type)))
    .map((profile) => profile.member.label);
}

export function AnalysisSummary({
  summary,
  slotCount
}: {
  summary: TeamSummary;
  slotCount: number;
}) {
  const ui = getTeamUiSummary(summary, slotCount);
  const topWeaknesses = summary.rows
    .filter((row) => row.multiplierMap.quadWeak + row.multiplierMap.weak > 0)
    .slice(0, 4);
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
                <span>弱点が重なるタイプ</span>
              </div>
              <div className={styles.matchupList}>
                {topWeaknesses.length ? topWeaknesses.map((row) => {
                  const weakCount = row.multiplierMap.quadWeak + row.multiplierMap.weak;
                  const names = memberNamesForType(summary, row.attackType, ["quadWeak", "weak"]);
                  return (
                    <article key={row.attackType} className={row.multiplierMap.quadWeak > 0 ? styles.severeMatchup : ""}>
                      <div>
                        <strong>{row.attackTypeJa}</strong>
                        <span>{weakCount}体が弱点{row.multiplierMap.quadWeak ? `・4倍 ${row.multiplierMap.quadWeak}体` : ""}</span>
                      </div>
                      <p>{names.join("、")}</p>
                    </article>
                  );
                }) : <p className={styles.goodMessage}>目立つ弱点はありません。</p>}
              </div>
            </div>

            <div className={styles.resistancePanel}>
              <div className={styles.panelLabel}>
                <strong>受けやすい</strong>
                <span>主な耐性・無効</span>
              </div>
              <div className={styles.matchupList}>
                {topResistances.map((row) => {
                  const coverCount = row.multiplierMap.resist + row.multiplierMap.doubleResist + row.multiplierMap.immune;
                  const names = memberNamesForType(summary, row.attackType, ["resist", "doubleResist", "immune"]);
                  return (
                    <article key={row.attackType}>
                      <div>
                        <strong>{row.attackTypeJa}</strong>
                        <span>{coverCount}体で受けられる{row.multiplierMap.immune ? `・無効 ${row.multiplierMap.immune}体` : ""}</span>
                      </div>
                      <p>{names.join("、")}</p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function OffensiveCoveragePanel({ summary }: { summary: TeamSummary }) {
  const covered = summary.offensiveCoverage.filter((row) => row.superEffectiveCount > 0);
  const strong = summary.offensiveCoverage.filter((row) => row.superEffectiveCount >= 2);

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
          <h3>十分に狙える</h3>
          <div className={styles.typePills}>
            {strong.length ? strong.map((row) => <span key={row.defendType}>{row.defendTypeJa} <small>{row.superEffectiveCount}枠</small></span>) : <p>2枠以上で抜群を取れるタイプはまだありません。</p>}
          </div>
        </div>
        <div className={summary.missingOffense.length ? styles.offenseWarning : ""}>
          <h3>攻撃が不足</h3>
          <div className={styles.typePills}>
            {summary.missingOffense.length ? summary.missingOffense.map((row) => <span key={row.defendType}>{row.defendTypeJa}</span>) : <p>全タイプに抜群打点があります。</p>}
          </div>
        </div>
      </div>
      {summary.thinOffense.length ? (
        <p className={styles.offenseNote}>
          1枠だけで抜群を取れる相手: {summary.thinOffense.slice(0, 8).map((row) => getTypeLabel(row.defendType)).join("、")}
        </p>
      ) : null}
    </section>
  );
}
