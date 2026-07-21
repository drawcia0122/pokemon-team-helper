"use client";

import { useState } from "react";
import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import { PokemonStatsPanel } from "@/components/team/PokemonStatsPanel";
import { resolveSelectedPokemonSlotId } from "@/lib/pokemonBaseStats";
import { searchPokemon } from "@/lib/pokemonSearch";
import { isTeamSlotAllowed } from "@/lib/teamUi";
import { getPokemonBySlug, getTypeLabel } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot, TypeEntry, TypeName } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

export function TeamInputPanel({
  team,
  onChange,
  availablePokemon,
  pokemonInputOptions,
  allTypes,
  sampleTeam
}: {
  team: TeamSlot[];
  onChange: (team: TeamSlot[]) => void;
  availablePokemon: PokemonEntry[];
  pokemonInputOptions: PokemonEntry[];
  allTypes: TypeEntry[];
  sampleTeam: TeamSlot[];
}) {
  const [preferredStatsSlotId, setPreferredStatsSlotId] = useState<string | null>(null);
  const selectedStatsSlotId = resolveSelectedPokemonSlotId(
    team,
    preferredStatsSlotId
  );
  const selectedStatsSlot = team.find(
    (slot) => slot.id === selectedStatsSlotId && slot.mode === "pokemon"
  );
  const selectedStatsPokemon =
    selectedStatsSlot?.mode === "pokemon"
      ? getPokemonBySlug(selectedStatsSlot.pokemonSlug) ?? null
      : null;

  function updateSlot(slotId: string, nextSlot: TeamSlot) {
    onChange(team.map((slot) => (slot.id === slotId ? nextSlot : slot)));
  }

  function removeSlot(slotId: string) {
    onChange(team.filter((slot) => slot.id !== slotId));
  }

  function addSlot() {
    if (team.length >= 6) return;
    const fallbackPokemon = availablePokemon[0] ?? pokemonInputOptions[0];
    onChange([
      ...team,
      fallbackPokemon
        ? { id: `slot-${Date.now()}`, mode: "pokemon", pokemonSlug: fallbackPokemon.slug }
        : { id: `slot-${Date.now()}`, mode: "type", primaryType: "normal" }
    ]);
  }

  return (
    <section className={styles.inputPanel} aria-labelledby="team-input-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.step}>STEP 1</span>
          <h2 id="team-input-heading">パーティを入力する</h2>
          <p>2体から分析できます。空き枠は後から追加できます。</p>
        </div>
        <strong className={styles.slotCount}>{team.length}<span> / 6体</span></strong>
      </div>

      <div className={styles.teamGrid}>
        {team.map((slot, index) => (
          <article
            key={slot.id}
            className={`${styles.slotCard} ${!isTeamSlotAllowed(slot, availablePokemon) ? styles.unavailableSlot : ""}`}
          >
            <div className={styles.slotHeading}>
              <span>枠 {index + 1}</span>
              <div className={styles.modeTabs} aria-label={`枠${index + 1}の入力方法`}>
                <button
                  type="button"
                  aria-pressed={slot.mode === "pokemon"}
                  onClick={() => {
                    setPreferredStatsSlotId(slot.id);
                    updateSlot(slot.id, {
                      id: slot.id,
                      mode: "pokemon",
                      pokemonSlug: pokemonInputOptions[0]?.slug ?? ""
                    });
                  }}
                >
                  ポケモン
                </button>
                <button
                  type="button"
                  aria-pressed={slot.mode === "type"}
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
                availablePokemon={pokemonInputOptions}
                isAllowed={isTeamSlotAllowed(slot, availablePokemon)}
                isStatsSelected={selectedStatsSlotId === slot.id}
                onSelectStats={() => setPreferredStatsSlotId(slot.id)}
                onChange={(nextSlot) => {
                  setPreferredStatsSlotId(slot.id);
                  updateSlot(slot.id, nextSlot);
                }}
              />
            ) : (
              <TypeSlotEditor
                slot={slot}
                allTypes={allTypes}
                onChange={(nextSlot) => updateSlot(slot.id, nextSlot)}
              />
            )}

            <button
              type="button"
              className={styles.removeButton}
              onClick={() => removeSlot(slot.id)}
              aria-label={`枠${index + 1}を空にする`}
            >
              この枠を空にする
            </button>
          </article>
        ))}

        {Array.from({ length: 6 - team.length }, (_, index) => (
          <button
            type="button"
            className={styles.emptySlot}
            key={`empty-${index}`}
            onClick={addSlot}
          >
            <span aria-hidden="true">＋</span>
            <strong>空き枠 {team.length + index + 1}</strong>
            <small>ポケモンを追加</small>
          </button>
        ))}
      </div>

      <PokemonStatsPanel pokemon={selectedStatsPokemon} />

      <div className={styles.inputActions}>
        <button type="button" className={styles.primaryButton} onClick={addSlot} disabled={team.length >= 6}>
          メンバーを追加
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => onChange(sampleTeam)}>
          サンプルに戻す
        </button>
        <button type="button" className={styles.textButton} onClick={() => onChange([])} disabled={team.length === 0}>
          すべて空にする
        </button>
      </div>
    </section>
  );
}

function PokemonSlotEditor({
  slot,
  availablePokemon,
  isAllowed,
  isStatsSelected,
  onSelectStats,
  onChange
}: {
  slot: Extract<TeamSlot, { mode: "pokemon" }>;
  availablePokemon: PokemonEntry[];
  isAllowed: boolean;
  isStatsSelected: boolean;
  onSelectStats: () => void;
  onChange: (nextSlot: Extract<TeamSlot, { mode: "pokemon" }>) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedPokemon =
    availablePokemon.find((pokemon) => pokemon.slug === slot.pokemonSlug) ??
    getPokemonBySlug(slot.pokemonSlug) ??
    null;
  const searchedPokemon = searchPokemon(availablePokemon, query).slice(0, 50);
  const matchedPokemon =
    selectedPokemon && !searchedPokemon.some((pokemon) => pokemon.slug === selectedPokemon.slug)
      ? [selectedPokemon, ...searchedPokemon]
      : searchedPokemon;
  const name = selectedPokemon?.nameJa ?? slot.pokemonSlug;

  return (
    <>
      <div className={styles.slotIdentity}>
        <PokemonVisual
          appearance="plain"
          name={name}
          slug={slot.pokemonSlug}
          pokemonId={selectedPokemon?.id}
          size="large"
        />
        <div>
          <strong>{name}</strong>
          <div className={styles.typeRow}>
            {selectedPokemon?.types.map((type) => <span key={type}>{getTypeLabel(type)}</span>)}
          </div>
        </div>
      </div>
      <button
        type="button"
        className={styles.statsSelectButton}
        aria-pressed={isStatsSelected}
        onClick={onSelectStats}
      >
        {isStatsSelected ? "種族値を表示中" : "種族値を見る"}
      </button>
      {!isAllowed ? <p className={styles.slotWarning} role="status">現在のシーズンでは使用不可</p> : null}
      <label className={styles.control}>
        <span>検索</span>
        <input
          type="search"
          value={query}
          placeholder="日本語名 / 英語名 / slug"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label className={styles.control}>
        <span>ポケモンを選択</span>
        <select
          value={slot.pokemonSlug}
          onChange={(event) => onChange({ ...slot, pokemonSlug: event.target.value })}
        >
          {matchedPokemon.length ? matchedPokemon.map((pokemon) => (
            <option key={pokemon.slug} value={pokemon.slug}>
              {pokemon.nameJa} ({pokemon.types.map(getTypeLabel).join(" / ")})
            </option>
          )) : <option value={slot.pokemonSlug}>候補がありません</option>}
        </select>
      </label>
      <small className={styles.matchCount}>{query ? `検索一致 ${searchedPokemon.length}件` : `候補 ${availablePokemon.length}件`}</small>
    </>
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
  const label = [slot.primaryType, slot.secondaryType]
    .filter((type): type is TypeName => Boolean(type))
    .map(getTypeLabel)
    .join(" / ");

  return (
    <>
      <div className={styles.slotIdentity}>
        <span className={styles.typeVisual} aria-hidden="true">タイプ</span>
        <div>
          <strong>{label}</strong>
          <div className={styles.typeRow}>
            <span>{getTypeLabel(slot.primaryType)}</span>
            {slot.secondaryType ? <span>{getTypeLabel(slot.secondaryType)}</span> : null}
          </div>
        </div>
      </div>
      <div className={styles.dualControls}>
        <label className={styles.control}>
          <span>第1タイプ</span>
          <select
            value={slot.primaryType}
            onChange={(event) => onChange({ ...slot, primaryType: event.target.value as TypeName })}
          >
            {allTypes.map((entry) => <option key={entry.nameEn} value={entry.nameEn}>{entry.nameJa}</option>)}
          </select>
        </label>
        <label className={styles.control}>
          <span>第2タイプ</span>
          <select
            value={slot.secondaryType ?? ""}
            onChange={(event) => onChange({ ...slot, secondaryType: (event.target.value || undefined) as TypeName | undefined })}
          >
            <option value="">なし</option>
            {allTypes.map((entry) => <option key={entry.nameEn} value={entry.nameEn}>{entry.nameJa}</option>)}
          </select>
        </label>
      </div>
    </>
  );
}
