import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import { getTopRecommendations, type CandidateSelection } from "@/lib/teamUi";
import { getTypeLabel } from "@/lib/typeChart";
import type { PokemonCandidateScore, TypeCandidateScore } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

export function RecommendationPanel({
  typeCandidates,
  pokemonCandidates,
  selection,
  onSelect,
  onAddType,
  onAddPokemon,
  canAdd
}: {
  typeCandidates: TypeCandidateScore[];
  pokemonCandidates: PokemonCandidateScore[];
  selection: CandidateSelection;
  onSelect: (selection: Exclude<CandidateSelection, null>) => void;
  onAddType: (candidate: TypeCandidateScore) => void;
  onAddPokemon: (candidate: PokemonCandidateScore) => void;
  canAdd: boolean;
}) {
  const topPokemon = getTopRecommendations(pokemonCandidates);
  const topTypes = getTopRecommendations(typeCandidates);

  return (
    <section className={styles.recommendationSection} aria-labelledby="recommendation-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.step}>STEP 4</span>
          <h2 id="recommendation-heading">次の補完候補を探す</h2>
          <p>上位候補を選ぶと、追加前後の変化をすぐ確認できます。</p>
        </div>
      </div>

      <div className={styles.typeRecommendations}>
        <strong>補完しやすいタイプ</strong>
        <div>
          {topTypes.map((candidate) => (
            <button
              type="button"
              aria-pressed={selection?.kind === "type" && selection.value.type === candidate.type}
              key={candidate.type}
              onClick={() => onSelect({ kind: "type", value: candidate })}
            >
              {candidate.typeJa}<small>score {candidate.score}</small>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.recommendationLayout}>
        <div className={styles.topCandidates}>
          {topPokemon.map((candidate, index) => {
            const selected =
              selection?.kind === "pokemon" &&
              selection.value.pokemon.slug === candidate.pokemon.slug;
            return (
              <article className={`${styles.recommendationCard} ${selected ? styles.selectedCandidate : ""}`} key={candidate.pokemon.slug}>
                <button type="button" className={styles.candidateSelect} onClick={() => onSelect({ kind: "pokemon", value: candidate })}>
                  <span className={styles.rank}>#{index + 1}</span>
                  <PokemonVisual name={candidate.pokemon.nameJa} slug={candidate.pokemon.slug} size="large" />
                  <span className={styles.candidateIdentity}>
                    <strong>{candidate.pokemon.nameJa}</strong>
                    <small>{candidate.pokemon.types.map(getTypeLabel).join(" / ")}</small>
                  </span>
                  <strong className={styles.score}>{candidate.score}<small>score</small></strong>
                </button>
                <ul>
                  {candidate.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
                <div className={styles.candidateSignals}>
                  <span className={styles.improve}>改善 {candidate.delta.improvedTypes.length}</span>
                  <span className={candidate.delta.worsenedTypes.length ? styles.worsen : styles.neutralSignal}>
                    新たな弱点 {candidate.delta.worsenedTypes.length}
                  </span>
                  <span>攻撃範囲 +{candidate.delta.newSuperEffectiveTargets}</span>
                  <span>使用可能</span>
                </div>
                <button type="button" className={styles.addCandidate} disabled={!canAdd} onClick={() => onAddPokemon(candidate)}>
                  {canAdd ? "このポケモンを追加" : "6体登録済み"}
                </button>
              </article>
            );
          })}
        </div>

        <CandidateDifference selection={selection} onAddType={onAddType} canAdd={canAdd} />
      </div>

      <details className={styles.rankingDetails}>
        <summary>4位以下と詳細スコアを見る</summary>
        <div className={styles.compactRanking}>
          {pokemonCandidates.slice(3, 10).map((candidate, index) => (
            <button type="button" key={candidate.pokemon.slug} onClick={() => onSelect({ kind: "pokemon", value: candidate })}>
              <span>{index + 4}位</span>
              <strong>{candidate.pokemon.nameJa}</strong>
              <small>{candidate.pokemon.types.map(getTypeLabel).join(" / ")}</small>
              <b>{candidate.score}</b>
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

function CandidateDifference({
  selection,
  onAddType,
  canAdd
}: {
  selection: CandidateSelection;
  onAddType: (candidate: TypeCandidateScore) => void;
  canAdd: boolean;
}) {
  if (!selection) {
    return <aside className={styles.comparisonPanel}><strong>候補を選択してください</strong><p>改善と悪化をここで比較します。</p></aside>;
  }

  const delta = selection.value.delta;
  const label = selection.kind === "type" ? `${selection.value.typeJa}タイプ` : selection.value.pokemon.nameJa;

  return (
    <aside className={styles.comparisonPanel} aria-live="polite">
      <span>追加前後の比較</span>
      <h3>{label}</h3>
      <div className={styles.deltaGrid}>
        <div className={styles.improvementBox}>
          <strong>改善</strong>
          <p>改善するタイプ {delta.improvedTypes.length}</p>
          <p>4倍弱点減少 {Math.max(0, delta.severeWeakReduction)}</p>
          <p>耐性増加 {Math.max(0, delta.resistIncrease)}</p>
          <p>攻撃範囲 +{delta.newSuperEffectiveTargets}</p>
          <small>{delta.improvedTypes.slice(0, 4).map(getTypeLabel).join("、") || "目立つ改善なし"}</small>
        </div>
        <div className={styles.worseningBox}>
          <strong>注意</strong>
          <p>新たに重くなる {delta.worsenedTypes.length}タイプ</p>
          <p>増える弱点枠 {Math.max(0, -delta.weakReduction)}</p>
          <p>新しい4倍弱点 {delta.newSevereWeaknessCount}</p>
          <small>{delta.worsenedTypes.slice(0, 4).map(getTypeLabel).join("、") || "大きな悪化なし"}</small>
        </div>
      </div>
      {selection.kind === "type" ? (
        <button type="button" className={styles.addCandidate} disabled={!canAdd} onClick={() => onAddType(selection.value)}>
          {canAdd ? "このタイプを追加" : "6体登録済み"}
        </button>
      ) : null}
    </aside>
  );
}
