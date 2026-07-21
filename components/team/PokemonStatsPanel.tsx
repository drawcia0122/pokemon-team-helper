import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import {
  getPokemonBaseStatTotal,
  getRadarPoint,
  getRadarPolygonPoints,
  isPokemonBaseStats,
  POKEMON_BASE_STAT_CHART_MAX,
  POKEMON_BASE_STAT_DEFINITIONS
} from "@/lib/pokemonBaseStats";
import type { PokemonEntry } from "@/types/pokemon";
import styles from "./TeamWorkspace.module.css";

const GRID_LEVELS = [0.25, 0.5, 0.75, 1] as const;

function polygonAtRatio(ratio: number): string {
  return getRadarPolygonPoints(
    Array.from({ length: 6 }, () => POKEMON_BASE_STAT_CHART_MAX * ratio)
  );
}

export function PokemonStatsPanel({
  pokemon,
  options,
  selectedSlotId,
  onSelectSlot
}: {
  pokemon: PokemonEntry | null;
  options: Array<{ slotId: string; position: number; pokemon: PokemonEntry }>;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
}) {
  const stats = pokemon?.baseStats;

  return (
    <section className={styles.statsPanel} aria-labelledby="pokemon-stats-heading">
      <div className={styles.statsHeading}>
        <span>SELECTED POKÉMON</span>
        <h3 id="pokemon-stats-heading">選択中のポケモンの種族値</h3>
      </div>

      {options.length ? (
        <div className={styles.statsTabs} aria-label="種族値を表示するポケモン">
          {options.map((option) => (
            <button
              type="button"
              key={option.slotId}
              aria-pressed={option.slotId === selectedSlotId}
              aria-label={`枠${option.position + 1} ${option.pokemon.nameJa}の種族値を表示`}
              onClick={() => onSelectSlot(option.slotId)}
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
          パーティにポケモンを追加すると、ここに種族値を表示します。
        </p>
      ) : !isPokemonBaseStats(stats) ? (
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
              const point = getRadarPoint(
                index,
                POKEMON_BASE_STAT_CHART_MAX
              );
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

          <dl className={styles.statsList}>
            {POKEMON_BASE_STAT_DEFINITIONS.map(({ key, label }) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{stats[key]}</dd>
              </div>
            ))}
            <div className={styles.statsTotal}>
              <dt>合計</dt>
              <dd>{getPokemonBaseStatTotal(stats)}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
