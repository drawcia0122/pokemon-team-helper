"use client";

import { useMemo, useRef, useState } from "react";
import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import { findEnvironmentRankingDataset } from "@/lib/environmentPresentation";
import type {
  EnvironmentDistributionDto,
  EnvironmentPokemonDetailDto,
  EnvironmentRankingCatalogDto,
  EnvironmentRankingEntryDto,
  EnvironmentRelationDto,
  EnvironmentSelection,
  EnvironmentStatSpreadDto
} from "@/types/environmentUi";
import styles from "./EnvironmentExplorer.module.css";

function percent(value: number): string {
  const percentage = value * 100;
  return `${percentage < 0.1 && percentage > 0 ? percentage.toFixed(2) : percentage.toFixed(1)}%`;
}

function updatedDate(value: string): string {
  const date = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(value));
  return `${date}更新`;
}

function periodLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return Number.isInteger(year) && Number.isInteger(month)
    ? `${year}年${month}月`
    : value;
}

function DistributionList({
  values,
  emptyMessage
}: {
  values: EnvironmentDistributionDto[];
  emptyMessage: string;
}) {
  if (values.length === 0) return <p className={styles.emptyList}>{emptyMessage}</p>;
  return (
    <ol className={styles.detailList}>
      {values.map((entry) => (
        <li key={entry.id}>
          <span>{entry.name}</span>
          <strong>{percent(entry.rate)}</strong>
        </li>
      ))}
    </ol>
  );
}

function RelationList({
  values,
  emptyMessage
}: {
  values: EnvironmentRelationDto[];
  emptyMessage: string;
}) {
  if (values.length === 0) return <p className={styles.emptyList}>{emptyMessage}</p>;
  return (
    <ol className={styles.detailList}>
      {values.map((entry, index) => (
        <li key={`${entry.slug ?? entry.name}-${index}`}>
          <span>{entry.name}</span>
          <strong>{percent(entry.rate)}</strong>
        </li>
      ))}
    </ol>
  );
}

function StatSpreadList({ values }: { values: EnvironmentStatSpreadDto[] }) {
  if (values.length === 0) {
    return <p className={styles.emptyList}>能力配分データはありません。</p>;
  }
  return (
    <ol className={`${styles.detailList} ${styles.spreadList}`}>
      {values.map((entry, index) => (
        <li key={`${entry.natureId}-${Object.values(entry.values).join("-")}-${index}`}>
          <span>
            <b>{entry.natureName}</b>
            <small>
              H{entry.values.hp} / A{entry.values.attack} / B{entry.values.defense} / C
              {entry.values.specialAttack} / D{entry.values.specialDefense} / S{entry.values.speed}
            </small>
          </span>
          <strong>{percent(entry.rate)}</strong>
        </li>
      ))}
    </ol>
  );
}

function PokemonDetail({ detail }: { detail: EnvironmentPokemonDetailDto }) {
  return (
    <div className={styles.detailContent}>
      <header className={styles.detailHeader}>
        <PokemonVisual
          name={detail.name}
          slug={detail.slug}
          pokemonId={detail.pokemonId}
          size="large"
          appearance="plain"
        />
        <div>
          <p>使用率 {detail.rank}位</p>
          <h2>{detail.name}</h2>
        </div>
        <strong className={styles.usageValue}>{percent(detail.usageRate)}</strong>
      </header>
      <div className={styles.detailSections}>
        <section>
          <h3>採用技 TOP10</h3>
          <DistributionList values={detail.moves} emptyMessage="技データはありません。" />
        </section>
        <section>
          <h3>持ち物 TOP10</h3>
          <DistributionList values={detail.items} emptyMessage="持ち物データはありません。" />
        </section>
        <section>
          <h3>特性</h3>
          <DistributionList values={detail.abilities} emptyMessage="特性データはありません。" />
        </section>
        <section className={styles.wideSection}>
          <h3>能力配分 TOP10</h3>
          <StatSpreadList values={detail.statSpreads} />
        </section>
        <section>
          <h3>相性の良い味方 TOP10</h3>
          <RelationList values={detail.teammates} emptyMessage="味方データはありません。" />
        </section>
        <section>
          <h3>苦手な相手 TOP10</h3>
          <RelationList
            values={detail.checksAndCounters}
            emptyMessage="このsnapshotには苦手な相手の統計がありません。"
          />
        </section>
      </div>
    </div>
  );
}

export function EnvironmentExplorer({ catalog }: { catalog: EnvironmentRankingCatalogDto }) {
  const [selection, setSelection] = useState<EnvironmentSelection>(catalog.initialSelection);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<EnvironmentPokemonDetailDto | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const detailCache = useRef(new Map<string, EnvironmentPokemonDetailDto>());
  const requestSequence = useRef(0);
  const dataset = useMemo(
    () => findEnvironmentRankingDataset(catalog.datasets, selection),
    [catalog.datasets, selection]
  );

  function updateSelection(next: Partial<EnvironmentSelection>) {
    setSelection((current) => ({ ...current, ...next }));
    requestSequence.current += 1;
    setSelectedSlug(null);
    setDetail(null);
    setDetailState("idle");
  }

  async function selectPokemon(entry: EnvironmentRankingEntryDto) {
    setSelectedSlug(entry.slug);
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    const cached = detailCache.current.get(entry.detailUrl);
    if (cached) {
      setDetail(cached);
      setDetailState("ready");
      return;
    }
    setDetail(null);
    setDetailState("loading");
    try {
      const response = await fetch(entry.detailUrl, { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const loaded = (await response.json()) as EnvironmentPokemonDetailDto;
      if (
        loaded.schemaVersion !== 1 ||
        loaded.slug !== entry.slug ||
        loaded.snapshotId !== dataset?.snapshotId
      ) {
        throw new Error("detail mismatch");
      }
      detailCache.current.set(entry.detailUrl, loaded);
      if (requestSequence.current === sequence) {
        setDetail(loaded);
        setDetailState("ready");
      }
    } catch {
      if (requestSequence.current === sequence) {
        setDetail(null);
        setDetailState("error");
      }
    }
  }

  return (
    <section className={styles.explorer}>
      <div className={styles.controls} aria-label="環境データの表示条件">
        <label>
          対戦形式
          <select
            value={selection.battleFormat}
            onChange={(event) =>
              updateSelection({ battleFormat: event.target.value as "single" | "double" })
            }
          >
            <option value="single">シングル</option>
            <option value="double">ダブル</option>
          </select>
        </label>
        <label>
          レギュレーション
          <select
            value={selection.regulationId}
            onChange={(event) =>
              updateSelection({ regulationId: event.target.value as "M-A" | "M-B" })
            }
          >
            <option value="M-A">M-A</option>
            <option value="M-B">M-B</option>
          </select>
        </label>
        <label>
          cutoff
          <select
            value={selection.ratingCutoff}
            onChange={(event) =>
              updateSelection({ ratingCutoff: Number(event.target.value) as 0 | 1760 })
            }
          >
            <option value={0}>0</option>
            <option value={1760}>1760</option>
          </select>
        </label>
      </div>

      <div className={styles.sourceSummary}>
        <strong>環境データ</strong>
        {dataset ? (
          <span>{updatedDate(dataset.metadata.fetchedAt)}</span>
        ) : null}
        <span>
          集計期間 {dataset ? periodLabel(dataset.metadata.season) : "データなし"}
        </span>
        <span>レギュレーション {selection.regulationId}</span>
        <span>
          {selection.battleFormat === "single" ? "シングル" : "ダブル"}
        </span>
        <span>cutoff {selection.ratingCutoff}</span>
        {dataset ? <span>{dataset.battleCount.toLocaleString("ja-JP")}対戦</span> : null}
        <span>取得元 {catalog.source} / Smogon</span>
      </div>

      {!dataset ? (
        <div className={styles.noData} role="status">
          <strong>データなし</strong>
          <p>選択した形式・ルール・cutoffのsnapshotはまだありません。</p>
        </div>
      ) : (
        <div className={styles.columns}>
          <section className={styles.rankingPanel} aria-labelledby="environment-ranking-heading">
            <div className={styles.panelHeading}>
              <div>
                <p>USAGE RANKING</p>
                <h2 id="environment-ranking-heading">環境使用率ランキング</h2>
              </div>
              <span>TOP {dataset.ranking.length}</span>
            </div>
            <ol className={styles.rankingList}>
              {dataset.ranking.map((entry) => (
                <li key={entry.slug}>
                  <button
                    type="button"
                    onClick={() => void selectPokemon(entry)}
                    aria-pressed={selectedSlug === entry.slug}
                    data-environment-slug={entry.slug}
                  >
                    <span className={styles.rank}>{entry.rank}</span>
                    <PokemonVisual
                      name={entry.name}
                      slug={entry.slug}
                      pokemonId={entry.pokemonId}
                      size="small"
                      appearance="plain"
                    />
                    <span className={styles.pokemonName}>{entry.name}</span>
                    <strong>{percent(entry.usageRate)}</strong>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <aside className={styles.detailPanel} aria-live="polite" aria-busy={detailState === "loading"}>
            {detailState === "idle" ? (
              <div className={styles.detailPlaceholder}>
                <strong>ポケモン詳細</strong>
                <p>ランキングからポケモンを選ぶと、採用技や持ち物を表示します。</p>
              </div>
            ) : null}
            {detailState === "loading" ? <p className={styles.loading}>詳細を読み込んでいます…</p> : null}
            {detailState === "error" ? (
              <div className={styles.detailPlaceholder} role="alert">
                <strong>詳細を読み込めませんでした</strong>
                <p>時間をおいてもう一度選択してください。</p>
              </div>
            ) : null}
            {detailState === "ready" && detail ? <PokemonDetail detail={detail} /> : null}
          </aside>
        </div>
      )}
    </section>
  );
}
