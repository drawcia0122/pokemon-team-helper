import type { FC } from "react";

type SeasonSelectorProps = {
  seasonId: string;
  onSeasonChange: (seasonId: string) => void;
  options: Array<{ id: string; label: string }>;
  meta: {
    label: string;
    regulationLabel: string;
    startDate: string | null;
    allowedCount: number;
    notes: string[];
  };
};

export const SeasonSelector: FC<SeasonSelectorProps> = ({
  seasonId,
  onSeasonChange,
  options,
  meta
}) => {
  return (
    <section className="panel">
      <div className="panel-inner">
        <div className="section-title">
          <div>
            <h2>シーズン / レギュレーション</h2>
            <p>Pokémon Champions 向けの使用可能範囲をここで切り替えます。</p>
          </div>
        </div>

        <div className="control-grid season-grid">
          <div className="control">
            <label>シーズン</label>
            <select value={seasonId} onChange={(event) => onSeasonChange(event.target.value)}>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="season-meta">
            <div className="mini-card">
              <span>現在のルール</span>
              <strong>{meta.regulationLabel}</strong>
            </div>
            <div className="mini-card">
              <span>現在のシーズン</span>
              <strong>{meta.label}</strong>
            </div>
            <div className="mini-card">
              <span>開始日</span>
              <strong>{meta.startDate ?? "未設定"}</strong>
            </div>
            <div className="mini-card">
              <span>使用可能ポケモン数</span>
              <strong>{meta.allowedCount}体</strong>
            </div>
          </div>
        </div>

        <div className="note-list">
          {meta.notes.map((note) => (
            <span key={note} className="pill">
              {note}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
