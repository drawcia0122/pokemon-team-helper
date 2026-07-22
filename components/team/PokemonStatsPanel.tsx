"use client";

import { useState } from "react";
import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import {
  getPokemonBaseStatTotal,
  getRadarPoint,
  getRadarPolygonPoints,
  isPokemonBaseStats,
  POKEMON_BASE_STAT_CHART_MAX,
  POKEMON_BASE_STAT_DEFINITIONS,
  resolveSelectedPokemonSlotId
} from "@/lib/pokemonBaseStats";
import { getTeamSlotsByPosition } from "@/lib/teamSlotLayout";
import { getPokemonBySlug } from "@/lib/typeChart";
import type { TeamSlot } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

const GRID_LEVELS = [0.25, 0.5, 0.75, 1] as const;

function polygonAtRatio(ratio: number): string {
  return getRadarPolygonPoints(
    Array.from({ length: 6 }, () => POKEMON_BASE_STAT_CHART_MAX * ratio)
  );
}

export function PokemonStatsPanel({ team }: { team: TeamSlot[] }) {
  const [preferredSlotId, setPreferredSlotId] = useState<string | null>(null);
  const positionedTeam = getTeamSlotsByPosition(team);
  const options = positionedTeam.flatMap((slot, position) => {
    if (slot?.mode !== "pokemon") return [];
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    return pokemon ? [{ slotId: slot.id, position, pokemon }] : [];
  });
  const selectedSlotId = resolveSelectedPokemonSlotId(team, preferredSlotId);
  const pokemon =
    options.find((option) => option.slotId === selectedSlotId)?.pokemon ?? null;
  const stats = pokemon?.baseStats;

  return (
    <section className={styles.statsPanel} aria-labelledby="pokemon-stats-heading">
      <div className={styles.statsHeading}>
        <div>
          <span>BASE STATS</span>
          <h2 id="pokemon-stats-heading">選択中のポケモンの種族値</h2>
        </div>
        <p>カードの数値を、最大255の共通スケールで可視化します。</p>
      </div>

      {options.length ? (
        <div className={styles.statsTabs} aria-label="種族値を表示するポケモン">
          {options.map((option) => (
            <button
              type="button"
              key={option.slotId}
              aria-pressed={option.slotId === selectedSlotId}
              aria-label={`枠${option.position + 1} ${option.pokemon.nameJa}の種族値を表示`}
              onClick={() => setPreferredSlotId(option.slotId)}
            >
              <PokemonVisual
                appearance="plain"
                name={option.pokemon.nameJa}
                slug={option.pokemon.slug}
                pokemonId={option.pokemon.id}
                size="small"
              />
              <span>{option.pokemon.nameJa}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!pokemon ? (
        <p className={styles.statsFallback} role="status">
          ポケモンを追加すると、ここに能力傾向を表示します。
        </p>
      ) : !isPokemonBaseStats(stats) ? (
        <div className={styles.statsIdentity}>
          <PokemonVisual
            appearance="plain"
            name={pokemon.nameJa}
            slug={pokemon.slug}
            pokemonId={pokemon.id}
            size="medium"
          />
          <div>
            <strong>{pokemon.nameJa}</strong>
            <p className={styles.statsFallback} role="status">
              このポケモンの種族値データはまだありません。
            </p>
          </div>
        </div>
      ) : (
        <div className={styles.statsLayout}>
          <div className={styles.statsIdentity}>
            <PokemonVisual
              appearance="plain"
              name={pokemon.nameJa}
              slug={pokemon.slug}
              pokemonId={pokemon.id}
              size="large"
            />
            <div>
              <strong>{pokemon.nameJa}</strong>
              <small>{pokemon.nameEn}</small>
              <span>合計種族値 {getPokemonBaseStatTotal(stats)}</span>
            </div>
          </div>

          <svg
            className={styles.radarChart}
            viewBox="0 0 200 200"
            role="img"
            aria-label={`${pokemon.nameJa}の種族値レーダーチャート。最大値${POKEMON_BASE_STAT_CHART_MAX}`}
          >
            {GRID_LEVELS.map((level) => (
              <polygon
                key={level}
                points={polygonAtRatio(level)}
                className={styles.radarGrid}
              />
            ))}
            {POKEMON_BASE_STAT_DEFINITIONS.map((definition, index) => {
              const point = getRadarPoint(index, POKEMON_BASE_STAT_CHART_MAX);
              return (
                <line
                  key={definition.key}
                  x1="100"
                  y1="100"
                  x2={point.x}
                  y2={point.y}
                  className={styles.radarAxis}
                />
              );
            })}
            <polygon
              points={getRadarPolygonPoints(
                POKEMON_BASE_STAT_DEFINITIONS.map(({ key }) => stats[key])
              )}
              className={styles.radarValue}
            />
            {POKEMON_BASE_STAT_DEFINITIONS.map((definition, index) => {
              const point = getRadarPoint(
                index,
                POKEMON_BASE_STAT_CHART_MAX,
                91
              );
              return (
                <text
                  key={definition.key}
                  x={point.x}
                  y={point.y}
                  className={styles.radarLabel}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {definition.chartLabel}
                </text>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
