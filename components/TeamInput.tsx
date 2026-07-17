import { useState } from "react";
import { searchPokemon } from "@/lib/pokemonSearch";
import { getTypeLabel } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot, TypeEntry, TypeName } from "@/types/pokemon";

type TeamInputProps = {
  team: TeamSlot[];
  onChange: (team: TeamSlot[]) => void;
  availablePokemon: PokemonEntry[];
  allTypes: TypeEntry[];
  sampleTeam: TeamSlot[];
};

export function TeamInput({
  team,
  onChange,
  availablePokemon,
  allTypes,
  sampleTeam
}: TeamInputProps) {
  function updateSlot(slotId: string, nextSlot: TeamSlot) {
    onChange(team.map((slot) => (slot.id === slotId ? nextSlot : slot)));
  }

  function removeSlot(slotId: string) {
    if (team.length <= 2) {
      return;
    }

    onChange(team.filter((slot) => slot.id !== slotId));
  }

  function addSlot() {
    if (team.length >= 6) {
      return;
    }

    const fallbackPokemon = availablePokemon[0];
    onChange([
      ...team,
      fallbackPokemon
        ? { id: `slot-${Date.now()}`, mode: "pokemon", pokemonSlug: fallbackPokemon.slug }
        : { id: `slot-${Date.now()}`, mode: "type", primaryType: "normal" }
    ]);
  }

  function resetSample() {
    onChange(sampleTeam);
  }

  return (
    <section className="panel">
      <div className="panel-inner">
        <div className="section-title">
          <div>
            <h2>チーム入力</h2>
            <p>2〜6体まで入力できます。ポケモン指定とタイプ直接入力を切り替えられます。</p>
          </div>
          <span>{team.length} / 6</span>
        </div>

        <div className="member-list">
          {team.map((slot, index) => (
            <article key={slot.id} className="member-card">
              <div className="member-head">
                <strong>メンバー {index + 1}</strong>
                <div className="segment">
                  <button
                    type="button"
                    className={slot.mode === "pokemon" ? "active" : ""}
                    onClick={() =>
                      updateSlot(slot.id, {
                        id: slot.id,
                        mode: "pokemon",
                        pokemonSlug: availablePokemon[0]?.slug ?? ""
                      })
                    }
                  >
                    ポケモン
                  </button>
                  <button
                    type="button"
                    className={slot.mode === "type" ? "active" : ""}
                    onClick={() =>
                      updateSlot(slot.id, {
                        id: slot.id,
                        mode: "type",
                        primaryType: "water"
                      })
                    }
                  >
                    タイプ
                  </button>
                </div>
              </div>

              {slot.mode === "pokemon" ? (
                <PokemonSlotEditor
                  slot={slot}
                  availablePokemon={availablePokemon}
                  onChange={(nextSlot) => updateSlot(slot.id, nextSlot)}
                />
              ) : (
                <TypeSlotEditor
                  slot={slot}
                  allTypes={allTypes}
                  onChange={(nextSlot) => updateSlot(slot.id, nextSlot)}
                />
              )}

              <div className="actions">
                <button type="button" className="secondary" onClick={() => removeSlot(slot.id)}>
                  この枠を削除
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="actions">
          <button type="button" className="primary" onClick={addSlot} disabled={team.length >= 6}>
            メンバーを追加
          </button>
          <button type="button" className="secondary" onClick={resetSample}>
            サンプルに戻す
          </button>
        </div>
      </div>
    </section>
  );
}

function PokemonSlotEditor({
  slot,
  availablePokemon,
  onChange
}: {
  slot: Extract<TeamSlot, { mode: "pokemon" }>;
  availablePokemon: PokemonEntry[];
  onChange: (nextSlot: Extract<TeamSlot, { mode: "pokemon" }>) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedPokemon = availablePokemon.find((pokemon) => pokemon.slug === slot.pokemonSlug) ?? null;
  const searchedPokemon = searchPokemon(availablePokemon, query).slice(0, 50);
  const matchedPokemon =
    selectedPokemon && !searchedPokemon.some((pokemon) => pokemon.slug === selectedPokemon.slug)
      ? [selectedPokemon, ...searchedPokemon]
      : searchedPokemon;

  return (
    <div className="control-grid">
      <div className="control">
        <label>検索</label>
        <input
          type="text"
          value={query}
          placeholder="日本語名 / 英語名 / slug"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="control">
        <label>ポケモン</label>
        <select
          value={slot.pokemonSlug}
          onChange={(event) =>
            onChange({
              id: slot.id,
              mode: "pokemon",
              pokemonSlug: event.target.value
            })
          }
        >
          {matchedPokemon.length > 0 ? (
            matchedPokemon.map((pokemon) => (
              <option key={pokemon.slug} value={pokemon.slug}>
                {pokemon.nameJa} ({pokemon.types.map(getTypeLabel).join(" / ")})
              </option>
            ))
          ) : (
            <option value={slot.pokemonSlug}>候補がありません</option>
          )}
        </select>
      </div>
      <div className="helper-text">候補は日本語名・英語名・slug で絞り込みできます。</div>
      <div className="helper-text">
        {query ? `検索一致 ${searchedPokemon.length}件` : `候補 ${availablePokemon.length}件`}
      </div>
    </div>
  );
}

function TypeSlotEditor({
  slot,
  allTypes,
  onChange
}: {
  slot: Extract<TeamSlot, { mode: "type" }>;
  allTypes: TypeEntry[];
  onChange: (nextSlot: Extract<TeamSlot, { mode: "type" }>) => void;
}) {
  return (
    <div className="control-grid dual">
      <div className="control">
        <label>第1タイプ</label>
        <select
          value={slot.primaryType}
          onChange={(event) =>
            onChange({
              ...slot,
              primaryType: event.target.value as TypeName
            })
          }
        >
          {allTypes.map((typeEntry) => (
            <option key={typeEntry.nameEn} value={typeEntry.nameEn}>
              {typeEntry.nameJa}
            </option>
          ))}
        </select>
      </div>
      <div className="control">
        <label>第2タイプ</label>
        <select
          value={slot.secondaryType ?? ""}
          onChange={(event) =>
            onChange({
              ...slot,
              secondaryType: (event.target.value || undefined) as TypeName | undefined
            })
          }
        >
          <option value="">なし</option>
          {allTypes.map((typeEntry) => (
            <option key={typeEntry.nameEn} value={typeEntry.nameEn}>
              {typeEntry.nameJa}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
