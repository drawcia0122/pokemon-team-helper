import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import type { ReactNode } from "react";
import type {
  TeamAdvisorAnalysis,
  TeamAdvisorCandidate
} from "@/lib/teamAdvisor";
import { getTopRecommendations, type CandidateSelection } from "@/lib/teamUi";
import { getTypeLabel } from "@/lib/typeChart";
import type { PokemonCandidateScore, TypeCandidateScore } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

type TeamAdvisorSectionProps = {
  advisor: TeamAdvisorAnalysis;
  typeCandidates: TypeCandidateScore[];
  pokemonCandidates: PokemonCandidateScore[];
  selection: CandidateSelection;
  onSelect: (selection: Exclude<CandidateSelection, null>) => void;
  onAddType: (candidate: TypeCandidateScore) => void;
  onAddPokemon: (candidate: PokemonCandidateScore) => void;
  canAdd: boolean;
  canAnalyze: boolean;
};

export function TeamAdvisorSection({
  advisor,
  typeCandidates,
  pokemonCandidates,
  selection,
  onSelect,
  onAddType,
  onAddPokemon,
  canAdd,
  canAnalyze
}: TeamAdvisorSectionProps) {
  return (
    <section
      className={styles.advisorSection}
      aria-labelledby="team-advisor-heading"
    >
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.step}>STEP 4</span>
          <h2 id="team-advisor-heading">チームアドバイザー</h2>
          <p>
            現在の課題、改善候補、追加前後の詳しい変化を一か所で確認できます。
          </p>
        </div>
      </div>

      <div className={styles.advisorSectionStack}>
        <AdvisorIssues advisor={advisor} canAnalyze={canAnalyze} />
        <AdvisorRecommendations
          advisor={advisor}
          pokemonCandidates={pokemonCandidates}
          onSelect={onSelect}
          onAddPokemon={onAddPokemon}
          canAdd={canAdd}
          canAnalyze={canAnalyze}
        />
        <AdvisorDetails
          advisor={advisor}
          typeCandidates={typeCandidates}
          pokemonCandidates={pokemonCandidates}
          selection={selection}
          onSelect={onSelect}
          onAddType={onAddType}
          onAddPokemon={onAddPokemon}
          canAdd={canAdd}
          canAnalyze={canAnalyze}
        />
      </div>

      <p className={styles.advisorNote}>
        タイプ相性・種族値・Pokemon Showdown環境統計を使った参考提案です。技の効果、持ち物、テラスタイプは考慮していません。
      </p>
    </section>
  );
}

function AdvisorBlockHeading({
  number,
  id,
  children
}: {
  number: number;
  id: string;
  children: ReactNode;
}) {
  return (
    <h3 className={styles.advisorBlockHeading} id={id}>
      <span>{number}</span>
      {children}
    </h3>
  );
}

function AdvisorIssues({
  advisor,
  canAnalyze
}: {
  advisor: TeamAdvisorAnalysis;
  canAnalyze: boolean;
}) {
  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-issues-heading"
    >
      <AdvisorBlockHeading number={1} id="advisor-issues-heading">
        現在の課題
      </AdvisorBlockHeading>
      {advisor.issues.length ? (
        <ul className={styles.advisorIssueList}>
          {advisor.issues.map((issue) => (
            <li key={issue.id}>
              <strong>{issue.title}</strong>
              <span>{issue.reason}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.advisorEmpty} role="status">
          {canAnalyze
            ? "大きな課題は見つかりませんでした。"
            : "2体以上入力すると課題を分析します。"}
        </p>
      )}
    </section>
  );
}

function AdvisorRecommendations({
  advisor,
  pokemonCandidates,
  onSelect,
  onAddPokemon,
  canAdd,
  canAnalyze
}: {
  advisor: TeamAdvisorAnalysis;
  pokemonCandidates: PokemonCandidateScore[];
  onSelect: TeamAdvisorSectionProps["onSelect"];
  onAddPokemon: TeamAdvisorSectionProps["onAddPokemon"];
  canAdd: boolean;
  canAnalyze: boolean;
}) {
  const scoreBySlug = new Map(
    pokemonCandidates.map((candidate) => [candidate.pokemon.slug, candidate])
  );

  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-candidates-heading"
    >
      <AdvisorBlockHeading number={2} id="advisor-candidates-heading">
        改善候補
      </AdvisorBlockHeading>
      {advisor.candidates.length ? (
        <ol className={styles.advisorCandidateGrid}>
          {advisor.candidates.map((candidate) => (
            <li key={candidate.pokemon.slug}>
              <AdvisorRecommendationCard
                candidate={candidate}
                scoreCandidate={scoreBySlug.get(candidate.pokemon.slug)}
                onSelect={onSelect}
                onAddPokemon={onAddPokemon}
                canAdd={canAdd}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.advisorEmpty} role="status">
          {canAnalyze
            ? "現在の条件では、優先して提案する改善候補はありません。"
            : "課題を分析すると改善候補を表示します。"}
        </p>
      )}
    </section>
  );
}

function AdvisorRecommendationCard({
  candidate,
  scoreCandidate,
  onSelect,
  onAddPokemon,
  canAdd
}: {
  candidate: TeamAdvisorCandidate;
  scoreCandidate: PokemonCandidateScore | undefined;
  onSelect: TeamAdvisorSectionProps["onSelect"];
  onAddPokemon: TeamAdvisorSectionProps["onAddPokemon"];
  canAdd: boolean;
}) {
  return (
    <article className={styles.advisorCandidateCard}>
      <div className={styles.advisorCandidateHeading}>
        <PokemonVisual
          appearance="plain"
          name={candidate.pokemon.nameJa}
          slug={candidate.pokemon.slug}
          pokemonId={candidate.pokemon.id}
          size="large"
        />
        <div className={styles.advisorCandidateIdentity}>
          <span className={styles.advisorRatingLabel}>評価</span>
          <span
            className={styles.advisorStars}
            aria-label={`おすすめ度 5段階中${candidate.rating}`}
          >
            <span aria-hidden="true">
              {"★".repeat(candidate.rating)}
              {"☆".repeat(5 - candidate.rating)}
            </span>
          </span>
          <strong>{candidate.pokemon.nameJa}</strong>
          <small>
            {candidate.pokemon.types.map(getTypeLabel).join(" / ")}
          </small>
        </div>
      </div>
      <h4>改善理由</h4>
      <ul className={styles.advisorReasons}>
        {candidate.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {scoreCandidate ? (
        <div className={styles.advisorCandidateActions}>
          <button
            type="button"
            className={styles.advisorCompareAction}
            onClick={() =>
              onSelect({ kind: "pokemon", value: scoreCandidate })
            }
          >
            追加前後を比較
          </button>
          <button
            type="button"
            className={styles.addCandidate}
            disabled={!canAdd}
            onClick={() => onAddPokemon(scoreCandidate)}
          >
            {canAdd ? "このポケモンを追加" : "6体登録済み"}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function AdvisorDetails({
  advisor,
  typeCandidates,
  pokemonCandidates,
  selection,
  onSelect,
  onAddType,
  onAddPokemon,
  canAdd,
  canAnalyze
}: TeamAdvisorSectionProps) {
  const advisorSpeciesIds = new Set(
    advisor.candidates.map((candidate) => candidate.pokemon.speciesId)
  );
  const detailPokemonCandidates = pokemonCandidates.filter(
    (candidate) => !advisorSpeciesIds.has(candidate.pokemon.speciesId)
  );
  const topPokemon = getTopRecommendations(detailPokemonCandidates);
  const topTypes = getTopRecommendations(typeCandidates);
  const remainingPokemon = detailPokemonCandidates.slice(3, 10);

  return (
    <section
      className={styles.advisorContentBlock}
      aria-labelledby="advisor-details-heading"
    >
      <AdvisorBlockHeading number={3} id="advisor-details-heading">
        詳細診断
      </AdvisorBlockHeading>
      <p className={styles.advisorDetailsIntro}>
        従来の補完スコアと、候補を追加した場合の改善点・注意点を確認できます。
      </p>

      {!canAnalyze ? (
        <p className={styles.advisorEmpty} role="status">
          2体以上入力すると補完スコアと追加前後の比較を表示します。
        </p>
      ) : (
        <>
          <div className={styles.typeRecommendations}>
            <strong>補完しやすいタイプ</strong>
            <div>
              {topTypes.map((candidate) => (
                <button
                  type="button"
                  aria-pressed={
                    selection?.kind === "type" &&
                    selection.value.type === candidate.type
                  }
                  key={candidate.type}
                  onClick={() =>
                    onSelect({ kind: "type", value: candidate })
                  }
                >
                  {candidate.typeJa}
                  <small>score {candidate.score}</small>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.recommendationLayout}>
            <div>
              <strong className={styles.detailCandidateLabel}>
                補完スコア候補
              </strong>
              <p className={styles.detailCandidateNote}>
                上の改善候補と同じspeciesは重複表示していません。
              </p>
              {topPokemon.length ? (
                <div className={styles.topCandidates}>
                  {topPokemon.map((candidate, index) => {
                    const selected =
                      selection?.kind === "pokemon" &&
                      selection.value.pokemon.slug === candidate.pokemon.slug;
                    return (
                      <article
                        className={`${styles.recommendationCard} ${selected ? styles.selectedCandidate : ""}`}
                        key={candidate.pokemon.slug}
                      >
                        <button
                          type="button"
                          className={styles.candidateSelect}
                          onClick={() =>
                            onSelect({ kind: "pokemon", value: candidate })
                          }
                        >
                          <span className={styles.rank}>#{index + 1}</span>
                          <PokemonVisual
                            appearance="plain"
                            name={candidate.pokemon.nameJa}
                            slug={candidate.pokemon.slug}
                            pokemonId={candidate.pokemon.id}
                            size="large"
                          />
                          <span className={styles.candidateIdentity}>
                            <strong>{candidate.pokemon.nameJa}</strong>
                            <small>
                              {candidate.pokemon.types
                                .map(getTypeLabel)
                                .join(" / ")}
                            </small>
                          </span>
                          <strong className={styles.score}>
                            {candidate.score}
                            <small>score</small>
                          </strong>
                        </button>
                        <ul>
                          {candidate.reasons.slice(0, 3).map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                        <div className={styles.candidateSignals}>
                          <span className={styles.improve}>
                            改善 {candidate.delta.improvedTypes.length}
                          </span>
                          <span
                            className={
                              candidate.delta.worsenedTypes.length
                                ? styles.worsen
                                : styles.neutralSignal
                            }
                          >
                            新たな弱点 {candidate.delta.worsenedTypes.length}
                          </span>
                          <span>
                            攻撃範囲 +{candidate.delta.newSuperEffectiveTargets}
                          </span>
                          <span>使用可能</span>
                        </div>
                        <button
                          type="button"
                          className={styles.addCandidate}
                          disabled={!canAdd}
                          onClick={() => onAddPokemon(candidate)}
                        >
                          {canAdd ? "このポケモンを追加" : "6体登録済み"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.advisorEmpty}>
                  重複しない補完スコア候補はありません。
                </p>
              )}
            </div>

            <CandidateDifference
              selection={selection}
              onAddType={onAddType}
              canAdd={canAdd}
            />
          </div>

          {remainingPokemon.length ? (
            <details className={styles.rankingDetails}>
              <summary>4位以下と詳細スコアを見る</summary>
              <div className={styles.compactRanking}>
                {remainingPokemon.map((candidate, index) => (
                  <button
                    type="button"
                    key={candidate.pokemon.slug}
                    onClick={() =>
                      onSelect({ kind: "pokemon", value: candidate })
                    }
                  >
                    <span>{index + 4}位</span>
                    <strong>{candidate.pokemon.nameJa}</strong>
                    <small>
                      {candidate.pokemon.types.map(getTypeLabel).join(" / ")}
                    </small>
                    <b>{candidate.score}</b>
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
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
    return (
      <aside className={styles.comparisonPanel}>
        <strong>候補を選択してください</strong>
        <p>改善と悪化をここで比較します。</p>
      </aside>
    );
  }

  const delta = selection.value.delta;
  const label =
    selection.kind === "type"
      ? `${selection.value.typeJa}タイプ`
      : selection.value.pokemon.nameJa;

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
          <small>
            {delta.improvedTypes.slice(0, 4).map(getTypeLabel).join("、") ||
              "目立つ改善なし"}
          </small>
        </div>
        <div className={styles.worseningBox}>
          <strong>注意</strong>
          <p>新たに重くなる {delta.worsenedTypes.length}タイプ</p>
          <p>増える弱点枠 {Math.max(0, -delta.weakReduction)}</p>
          <p>新しい4倍弱点 {delta.newSevereWeaknessCount}</p>
          <small>
            {delta.worsenedTypes.slice(0, 4).map(getTypeLabel).join("、") ||
              "大きな悪化なし"}
          </small>
        </div>
      </div>
      {selection.kind === "type" ? (
        <button
          type="button"
          className={styles.addCandidate}
          disabled={!canAdd}
          onClick={() => onAddType(selection.value)}
        >
          {canAdd ? "このタイプを追加" : "6体登録済み"}
        </button>
      ) : null}
    </aside>
  );
}
