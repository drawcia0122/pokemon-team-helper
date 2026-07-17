import { getTypeLabel } from "@/lib/typeChart";
import type { PokemonCandidateScore, TeamSummary, TypeCandidateScore } from "@/types/pokemon";

type CandidateSelection =
  | { kind: "type"; value: TypeCandidateScore }
  | { kind: "pokemon"; value: PokemonCandidateScore }
  | null;

function summarizeHeadline(summary: TeamSummary) {
  return {
    sharedWeaknessCount: summary.sharedWeaknesses.length,
    sturdyResistanceCount: summary.sturdyResistances.length
  };
}

export function CandidateComparison({ selection }: { selection: CandidateSelection }) {
  if (!selection) {
    return (
      <section className="panel">
        <div className="panel-inner">
          <div className="section-title">
            <div>
              <h2>候補追加前後の比較</h2>
              <p>タイプ候補かポケモン候補を選ぶと、追加前後の変化を並べて表示します。</p>
            </div>
          </div>
          <div className="empty">候補を1つ選ぶと、改善される一貫や新しく重くなる弱点をここで確認できます。</div>
        </div>
      </section>
    );
  }

  const value = selection.value;
  const candidateLabel =
    selection.kind === "type" ? `${selection.value.typeJa} を仮追加した場合` : `${selection.value.pokemon.nameJa} を仮追加した場合`;
  const beforeHeadline = summarizeHeadline(value.beforeSummary);
  const afterHeadline = summarizeHeadline(value.afterSummary);

  return (
    <section className="panel">
      <div className="panel-inner">
        <div className="section-title">
          <div>
            <h2>候補追加前後の比較</h2>
            <p>{candidateLabel}</p>
          </div>
        </div>

        <div className="result-grid">
          <div className="metric-card">
            <h4>追加前</h4>
            <p>一貫弱点 {beforeHeadline.sharedWeaknessCount}</p>
            <p>厚い耐性 {beforeHeadline.sturdyResistanceCount}</p>
          </div>
          <div className="metric-card">
            <h4>追加後</h4>
            <p>一貫弱点 {afterHeadline.sharedWeaknessCount}</p>
            <p>厚い耐性 {afterHeadline.sturdyResistanceCount}</p>
          </div>
          <div className="metric-card">
            <h4>変化量</h4>
            <p>弱点減少 {value.delta.weakReduction}</p>
            <p>4倍弱点減少 {value.delta.severeWeakReduction}</p>
            <p>無効増加 {value.delta.immunityIncrease}</p>
            <p>半減以下増加 {value.delta.resistIncrease}</p>
            <p>攻撃範囲増加 {value.delta.newSuperEffectiveTargets}</p>
          </div>
        </div>

        <div className="comparison-columns">
          <div>
            <h3>改善されるタイプ</h3>
            <div className="pill-row">
              {value.delta.improvedTypes.length > 0 ? (
                value.delta.improvedTypes.slice(0, 8).map((typeName) => (
                  <span key={typeName} className="pill good">
                    {getTypeLabel(typeName)}
                  </span>
                ))
              ) : (
                <span className="helper-text">目立つ改善はありません</span>
              )}
            </div>
          </div>
          <div>
            <h3>新しく重くなるタイプ</h3>
            <div className="pill-row">
              {value.delta.worsenedTypes.length > 0 ? (
                value.delta.worsenedTypes.slice(0, 8).map((typeName) => (
                  <span key={typeName} className="pill bad">
                    {getTypeLabel(typeName)}
                  </span>
                ))
              ) : (
                <span className="helper-text">大きな悪化は少なめです</span>
              )}
            </div>
          </div>
          <div>
            <h3>攻撃範囲で改善するタイプ</h3>
            <div className="pill-row">
              {value.delta.offenseImprovedTypes.length > 0 ? (
                value.delta.offenseImprovedTypes.slice(0, 8).map((typeName) => (
                  <span key={typeName} className="pill good">
                    {getTypeLabel(typeName)}
                  </span>
                ))
              ) : (
                <span className="helper-text">攻撃範囲の変化は小さめです</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
