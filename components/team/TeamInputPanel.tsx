"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import {
  getPokemonBaseStatTotal,
  isPokemonBaseStats,
  POKEMON_BASE_STAT_DEFINITIONS
} from "@/lib/pokemonBaseStats";
import {
  getFormOptionLabel,
  getSelectableForms,
  searchPokemonSpeciesRepresentatives,
  selectInitialFormForSpecies,
  switchTeamSlotForm
} from "@/lib/pokemonForms";
import {
  clearTeamSlotAtPosition,
  getTeamSlotsByPosition,
  setTeamSlotAtPosition,
  type TeamSlotWithoutId
} from "@/lib/teamSlotLayout";
import { isTeamSlotAllowed } from "@/lib/teamUi";
import {
  TEAM_PROFILE_CONFIG,
  type TeamProfile
} from "@/lib/teamProfile";
import { getAllPokemon, getPokemonBySlug, getTypeLabel } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot, TypeEntry, TypeName } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

const SUGGESTION_LIMIT = 12;

export function TeamInputPanel({
  team,
  onChange,
  profile,
  onProfileChange,
  availablePokemon,
  pokemonInputOptions,
  allTypes
}: {
  team: TeamSlot[];
  onChange: (team: TeamSlot[]) => void;
  profile: TeamProfile;
  onProfileChange: (profile: TeamProfile) => void;
  availablePokemon: PokemonEntry[];
  pokemonInputOptions: PokemonEntry[];
  allTypes: TypeEntry[];
}) {
  const positionedTeam = getTeamSlotsByPosition(team);

  function updateSlot(position: number, nextSlot: TeamSlotWithoutId | TeamSlot) {
    onChange(setTeamSlotAtPosition(team, position, nextSlot));
  }

  function removeSlot(position: number) {
    onChange(clearTeamSlotAtPosition(team, position));
  }

  return (
    <section className={styles.inputPanel} aria-labelledby="team-input-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.step}>STEP 1</span>
          <h2 id="team-input-heading">パーティを入力する</h2>
          <p>6枠から直接ポケモンを検索できます。2体以上で分析を表示します。</p>
        </div>
        <div className={styles.inputHeadingActions}>
          <label className={styles.teamProfileControl}>
            <span>構築プロファイル</span>
            <select
              value={profile}
              onChange={(event) =>
                onProfileChange(event.target.value as TeamProfile)
              }
            >
              {(Object.keys(TEAM_PROFILE_CONFIG) as TeamProfile[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {TEAM_PROFILE_CONFIG[value].label}
                  </option>
                )
              )}
            </select>
            <small>選んだ方針に合わせて、素早さの見方を調整します。</small>
          </label>
          <strong className={styles.slotCount}>{team.length}<span> / 6体</span></strong>
        </div>
      </div>

      <div className={styles.teamGrid}>
        {positionedTeam.map((slot, position) => (
          <article
            key={`team-position-${position + 1}`}
            className={`${styles.slotCard} ${slot === null ? styles.emptySlotCard : ""} ${slot && !isTeamSlotAllowed(slot, availablePokemon) ? styles.unavailableSlot : ""}`}
            onClick={(event) => {
              if (
                slot === null &&
                !(event.target as HTMLElement).closest("button, input, select")
              ) {
                event.currentTarget.querySelector<HTMLInputElement>("[role='combobox']")?.focus();
              }
            }}
          >
            <div className={styles.slotHeading}>
              <span>枠 {position + 1}</span>
              <div className={styles.modeTabs} aria-label={`枠${position + 1}の入力方法`}>
                <button
                  type="button"
                  aria-pressed={slot === null || slot.mode === "pokemon"}
                  onClick={() => {
                    if (slot?.mode === "type") {
                      removeSlot(position);
                    }
                  }}
                >
                  ポケモン
                </button>
                <button
                  type="button"
                  aria-pressed={slot?.mode === "type"}
                  onClick={() =>
                    updateSlot(position, {
                      mode: "type",
                      primaryType: "water"
                    })
                  }
                >
                  タイプ
                </button>
              </div>
            </div>

            {slot?.mode === "type" ? (
              <TypeSlotEditor
                slot={slot}
                allTypes={allTypes}
                onChange={(nextSlot) => updateSlot(position, nextSlot)}
              />
            ) : (
              <PokemonSlotEditor
                position={position}
                slot={slot?.mode === "pokemon" ? slot : null}
                availablePokemon={availablePokemon}
                pokemonInputOptions={pokemonInputOptions}
                onChange={(nextSlot) => updateSlot(position, nextSlot)}
              />
            )}

            {slot ? (
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeSlot(position)}
                aria-label={`枠${position + 1}を空にする`}
              >
                この枠を空にする
              </button>
            ) : null}
          </article>
        ))}
      </div>

      <div className={styles.inputActions}>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => onChange([])}
          disabled={team.length === 0}
        >
          すべて空にする
        </button>
      </div>
    </section>
  );
}

function PokemonSlotEditor({
  position,
  slot,
  availablePokemon,
  pokemonInputOptions,
  onChange
}: {
  position: number;
  slot: Extract<TeamSlot, { mode: "pokemon" }> | null;
  availablePokemon: PokemonEntry[];
  pokemonInputOptions: PokemonEntry[];
  onChange: (nextSlot: Omit<Extract<TeamSlot, { mode: "pokemon" }>, "id"> | Extract<TeamSlot, { mode: "pokemon" }>) => void;
}) {
  const allPokemon = getAllPokemon();
  const selectedPokemon = slot ? getPokemonBySlug(slot.pokemonSlug) ?? null : null;
  const selectableForms = selectedPokemon
    ? getSelectableForms(allPokemon, selectedPokemon.speciesId)
    : [];
  const selectedFormIsSelectable = Boolean(
    selectedPokemon && selectableForms.some((form) => form.slug === selectedPokemon.slug)
  );
  const availableSlugs = new Set(availablePokemon.map((pokemon) => pokemon.slug));

  function selectSpecies(representative: PokemonEntry) {
    const nextPokemon = selectInitialFormForSpecies(
      allPokemon,
      pokemonInputOptions,
      representative.speciesId
    );
    if (!nextPokemon) return;

    onChange(
      slot
        ? switchTeamSlotForm(slot, nextPokemon.slug)
        : { mode: "pokemon", pokemonSlug: nextPokemon.slug }
    );
  }

  return (
    <>
      <PokemonSearchCombobox
        position={position}
        allPokemon={allPokemon}
        pokemonInputOptions={pokemonInputOptions}
        selectedPokemon={selectedPokemon}
        onSelect={selectSpecies}
      />

      {selectedPokemon ? (
        <div className={styles.slotPokemonDetails}>
          <div className={`${styles.slotIdentity} ${styles.pokemonIdentity}`}>
            <PokemonVisual
              appearance="plain"
              name={selectedPokemon.nameJa}
              slug={selectedPokemon.slug}
              pokemonId={selectedPokemon.id}
              size="medium"
            />
            <div className={styles.typeRow} aria-label="タイプ">
              {selectedPokemon.types.map((type) => (
                <span key={type}>{getTypeLabel(type)}</span>
              ))}
            </div>
          </div>
          <PokemonCardBaseStats pokemon={selectedPokemon} />
        </div>
      ) : (
        <div className={styles.emptyIdentity} aria-hidden="true">
          <span>＋</span>
          <small>ポケモンを選択</small>
        </div>
      )}

      {slot && !isTeamSlotAllowed(slot, availablePokemon) ? (
        <p className={styles.slotWarning} role="status">現在のシーズンでは使用不可</p>
      ) : null}

      {slot && selectableForms.length > 1 ? (
        <label className={`${styles.control} ${styles.formControl}`}>
          <span>フォーム</span>
          <select
            value={selectedFormIsSelectable ? slot.pokemonSlug : ""}
            onChange={(event) => onChange(switchTeamSlotForm(slot, event.target.value))}
          >
            {!selectedFormIsSelectable ? (
              <option value="" disabled>保存済みフォームは切り替え対象外です</option>
            ) : null}
            {selectableForms.map((form) => (
              <option key={form.slug} value={form.slug}>
                {getFormOptionLabel(form)}
                {availableSlugs.has(form.slug) ? "" : "（現在のシーズンでは使用不可）"}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}

function PokemonCardBaseStats({ pokemon }: { pokemon: PokemonEntry }) {
  const stats = pokemon.baseStats;
  if (!isPokemonBaseStats(stats)) {
    return (
      <p className={styles.slotStatsFallback} role="status">
        種族値データなし
      </p>
    );
  }

  return (
    <dl
      className={styles.slotStats}
      aria-label={`${pokemon.nameJa}の種族値`}
    >
      {POKEMON_BASE_STAT_DEFINITIONS.map(({ key, label, shortLabel }) => (
        <div key={key}>
          <dt aria-label={label}>{shortLabel}</dt>
          <dd>{stats[key]}</dd>
        </div>
      ))}
      <div className={styles.slotStatsTotal}>
        <dt>BST</dt>
        <dd>{getPokemonBaseStatTotal(stats)}</dd>
      </div>
    </dl>
  );
}

function PokemonSearchCombobox({
  position,
  allPokemon,
  pokemonInputOptions,
  selectedPokemon,
  onSelect
}: {
  position: number;
  allPokemon: PokemonEntry[];
  pokemonInputOptions: PokemonEntry[];
  selectedPokemon: PokemonEntry | null;
  onSelect: (pokemon: PokemonEntry) => void;
}) {
  const listboxId = useId();
  const [draft, setDraft] = useState(selectedPokemon?.nameJa ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(
    () => searchPokemonSpeciesRepresentatives(
      allPokemon,
      pokemonInputOptions,
      isEditing ? draft : ""
    ).slice(0, SUGGESTION_LIMIT),
    [allPokemon, draft, isEditing, pokemonInputOptions]
  );

  useEffect(() => {
    if (!isEditing) setDraft(selectedPokemon?.nameJa ?? "");
  }, [isEditing, selectedPokemon?.nameJa, selectedPokemon?.slug]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, suggestions.length - 1)));
  }, [suggestions.length]);

  function closeAndRestore() {
    setIsEditing(false);
    setDraft(selectedPokemon?.nameJa ?? "");
    setActiveIndex(0);
  }

  function commit(pokemon: PokemonEntry) {
    onSelect(pokemon);
    setIsEditing(false);
    setDraft(pokemon.nameJa);
    setActiveIndex(0);
  }

  return (
    <div
      className={styles.pokemonCombobox}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeAndRestore();
        }
      }}
    >
      <label className={styles.visuallyHidden} htmlFor={`${listboxId}-input`}>
        枠{position + 1}のポケモン
      </label>
      <input
        id={`${listboxId}-input`}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isEditing}
        aria-controls={listboxId}
        aria-activedescendant={isEditing && suggestions[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-label={`枠${position + 1}のポケモン`}
        autoComplete="off"
        placeholder="ポケモン名を入力"
        value={draft}
        onFocus={() => {
          if (!isEditing) setDraft("");
          setIsEditing(true);
          setActiveIndex(0);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setIsEditing(true);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsEditing(true);
            setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(0, current - 1));
          } else if (event.key === "Enter" && isEditing && suggestions[activeIndex]) {
            event.preventDefault();
            commit(suggestions[activeIndex]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            closeAndRestore();
            event.currentTarget.blur();
          }
        }}
      />

      {isEditing ? (
        <div className={styles.comboboxList} id={listboxId} role="listbox">
          {suggestions.length ? suggestions.map((pokemon, index) => (
            <button
              type="button"
              role="option"
              id={`${listboxId}-option-${index}`}
              aria-selected={index === activeIndex}
              key={pokemon.slug}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(pokemon)}
            >
              <PokemonVisual
                appearance="plain"
                name={pokemon.nameJa}
                slug={pokemon.slug}
                pokemonId={pokemon.id}
                size="small"
              />
              <span>
                <strong>{pokemon.nameJa}</strong>
                <small>{pokemon.nameEn}</small>
              </span>
            </button>
          )) : (
            <p>候補がありません</p>
          )}
        </div>
      ) : null}
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
  const label = [slot.primaryType, slot.secondaryType]
    .filter((type): type is TypeName => Boolean(type))
    .map(getTypeLabel)
    .join(" / ");

  return (
    <>
      <div className={styles.slotIdentity}>
        <span className={styles.typeVisual} aria-hidden="true">タイプ</span>
        <div className={styles.typeRow}>
          <span>{label}</span>
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
