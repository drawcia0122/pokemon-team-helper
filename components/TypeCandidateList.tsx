import type { TypeCandidateScore } from "@/types/pokemon";

type TypeCandidateListProps = {
  candidates: TypeCandidateScore[];
  selectedKey: string | null;
  onSelect: (candidate: TypeCandidateScore) => void;
  onAddToTeam: (candidate: TypeCandidateScore) => void;
  canAddToTeam: boolean;
};

export function TypeCandidateList({
  candidates,
  selectedKey,
  onSelect,
  onAddToTeam,
  canAddToTeam
}: TypeCandidateListProps) {
  return (
    <section className="panel">
      <div className="panel-inner">
        <div className="section-title">
          <div>
            <h2>補完候補タイプ</h2>
            <p>タイプ相性だけで見たときに、次に足すと補完しやすい候補です。</p>
          </div>
        </div>

        <div className="candidate-list">
          {candidates.slice(0, 5).map((candidate) => (
            <article
              key={candidate.type}
              className={`candidate ${selectedKey === `type:${candidate.type}` ? "selected-card" : ""}`}
            >
              <button type="button" className="selectable" onClick={() => onSelect(candidate)}>
                <span className="candidate-title">
                  {candidate.typeJa}
                  <small> score {candidate.score}</small>
                </span>
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
