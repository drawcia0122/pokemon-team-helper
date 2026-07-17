import { getTypeLabel } from "@/lib/typeChart";
import type { PokemonCandidateScore } from "@/types/pokemon";

type PokemonCandidateListProps = {
  candidates: PokemonCandidateScore[];
  selectedKey: string | null;
  onSelect: (candidate: PokemonCandidateScore) => void;
  onAddToTeam: (candidate: PokemonCandidateScore) => void;
  canAddToTeam: boolean;
};

export function PokemonCandidateList({
  candidates,
  selectedKey,
  onSelect,
  onAddToTeam,
  canAddToTeam
}: PokemonCandidateListProps) {
  return (
    <section className="panel">
      <div className="panel-inner">
        <div className="section-title">
          <div>
            <h2>補完候補ポケモン</h2>
            <p>現在のシーズンで使用可能なポケモンだけを対象にランキングしています。</p>
          </div>
        </div>

        <div className="candidate-list">
          {candidates.slice(0, 5).map((candidate) => (
            <article
              key={candidate.pokemon.slug}
              className={`candidate ${selectedKey === `pokemon:${candidate.pokemon.slug}` ? "selected-card" : ""}`}
            >
              <button type="button" className="selectable" onClick={() => onSelect(candidate)}>
                <span className="candidate-title">
                  {candidate.pokemon.nameJa}
                  <small> score {candidate.score}</small>
                </span>
                <span className="candidate-copy">{candidate.pokemon.types.map(getTypeLabel).join(" / ")}</span>
                <span className="candidate-copy">{candidate.reasons.join(" / ")}</span>
              </button>
              <div className="candidate-actions">
                <button type="button" className="secondary ghost" disabled={!canAddToTeam} onClick={() => onAddToTeam(candidate)}>
                  チームに追加
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
