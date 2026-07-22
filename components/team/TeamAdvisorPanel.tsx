import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import type { TeamAdvisorAnalysis } from "@/lib/teamAdvisor";
import { getTypeLabel } from "@/lib/typeChart";
import styles from "./TeamWorkspace.module.css";

export function TeamAdvisorPanel({
  advisor
}: {
  advisor: TeamAdvisorAnalysis;
}) {
  return (
    <section
      className={styles.advisorPanel}
      aria-labelledby="team-advisor-heading"
    >
      <div className={styles.advisorHeader}>
        <div>
          <span>TEAM ADVISOR</span>
          <h2 id="team-advisor-heading">チームアドバイザー</h2>
          <p>現在の課題と、その改善につながる追加・入れ替え候補です。</p>
        </div>
        <div className={styles.advisorOverall}>
          <span>総合評価</span>
          <strong>{advisor.overallLabel}</strong>
          <small>初版の暫定評価</small>
        </div>
      </div>

      <div className={styles.advisorBlocks}>
        <section
          className={styles.advisorBlock}
          aria-labelledby="advisor-issues-heading"
        >
          <h3 id="advisor-issues-heading">
            <span>1</span>
            現在の課題
          </h3>
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
              {advisor.overallLabel === "分析待ち"
                ? "2体以上入力すると課題を分析します。"
                : "大きな課題は見つかりませんでした。"}
            </p>
          )}
        </section>

        <section
          className={styles.advisorBlock}
          aria-labelledby="advisor-candidates-heading"
        >
          <h3 id="advisor-candidates-heading">
            <span>2</span>
            改善候補
          </h3>
          {advisor.candidates.length ? (
            <ol className={styles.advisorCandidateGrid}>
              {advisor.candidates.map((candidate) => (
                <li key={candidate.pokemon.slug}>
                  <article className={styles.advisorCandidateCard}>
                    <div className={styles.advisorCandidateHeading}>
                      <PokemonVisual
                        appearance="plain"
                        name={candidate.pokemon.nameJa}
                        slug={candidate.pokemon.slug}
                        pokemonId={candidate.pokemon.id}
                        size="small"
                      />
                      <div>
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
                          {candidate.pokemon.types
                            .map(getTypeLabel)
                            .join(" / ")}
                        </small>
                      </div>
                    </div>
                    <h4>改善理由</h4>
                    <ul className={styles.advisorReasons}>
                      {candidate.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.advisorEmpty} role="status">
              課題を分析すると改善候補を表示します。
            </p>
          )}
        </section>
      </div>

      <p className={styles.advisorNote}>
        タイプ相性・種族値・同じPokemon Showdown環境統計を使った参考提案です。技の効果、持ち物、テラスタイプは考慮していません。
      </p>
    </section>
  );
}
