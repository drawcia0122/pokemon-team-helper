"use client";

import { useEffect, useMemo, useState } from "react";
import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import { getContentStatuses } from "@/lib/contentStatus";
import { formatJapaneseDate } from "@/lib/dateFormat";
import type { ContentKind, ContentStatus, PokemonContentItem } from "@/types/pokemonContent";
import styles from "./PokemonContentExplorer.module.css";

const kindLabels: Record<ContentKind, string> = {
  news: "ニュース",
  goods: "グッズ",
  event: "イベント",
  campaign: "キャンペーン",
  "game-update": "ゲームアップデート"
};
const statusLabels: Record<ContentStatus, string> = {
  "preorder-before": "予約受付前",
  "preorder-open": "予約受付中",
  "deadline-soon": "締切間近",
  "preorder-ended": "受付終了",
  "release-upcoming": "発売予定",
  released: "発売済み",
  "event-upcoming": "開催予定",
  "event-ongoing": "開催中",
  "event-ended": "開催終了"
};
const priorityStatuses: ContentStatus[] = [
  "deadline-soon",
  "event-ongoing",
  "release-upcoming"
];

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

function isEnded(statuses: ContentStatus[]) {
  return statuses.some((status) => status === "preorder-ended" || status === "event-ended");
}

export function PokemonContentExplorer({
  items,
  pokemonIds,
  pokemonLabels,
  today
}: {
  items: PokemonContentItem[];
  pokemonIds: Record<string, number>;
  pokemonLabels: Record<string, string>;
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | ContentKind>("all");
  const [tag, setTag] = useState("all");
  const [effectiveToday, setEffectiveToday] = useState(today);

  useEffect(() => {
    setEffectiveToday(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date())
    );
  }, []);

  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort(), [items]);
  const filtered = useMemo(() => {
    const q = normalize(query);
    return items.filter((item) => {
      if (kind !== "all" && item.kind !== kind) return false;
      if (tag !== "all" && !item.tags.includes(tag)) return false;
      if (!q) return true;
      return normalize([
        item.title,
        item.summary,
        item.sourceName,
        item.targetGame ?? "",
        ...item.tags,
        ...item.pokemonSlugs.flatMap((slug) => [slug, pokemonLabels[slug] ?? ""])
      ].join(" ")).includes(q);
    });
  }, [items, kind, pokemonLabels, query, tag]);

  const priorityItems = filtered.filter((item) =>
    getContentStatuses(item, effectiveToday).some((status) => priorityStatuses.includes(status))
  ).slice(0, 5);
  const priorityIds = new Set(priorityItems.map((item) => item.id));
  const regularItems = filtered.filter((item) => !priorityIds.has(item.id));

  const reset = () => {
    setQuery("");
    setKind("all");
    setTag("all");
  };

  function renderCard(item: PokemonContentItem, featured = false) {
    const statuses = getContentStatuses(item, effectiveToday);
    const ended = isEnded(statuses);
    const firstPokemon = item.pokemonSlugs[0];

    return (
      <article
        className={`${styles.card} ${featured ? styles.featuredCard : ""} ${ended ? styles.endedCard : ""}`}
        key={item.id}
      >
        <div className={styles.cardVisual} data-kind={item.kind}>
          {firstPokemon ? (
            <PokemonVisual
              name={pokemonLabels[firstPokemon] ?? firstPokemon}
              slug={firstPokemon}
              pokemonId={pokemonIds[firstPokemon]}
              size="large"
            />
          ) : (
            <span aria-hidden="true">{kindLabels[item.kind].slice(0, 2)}</span>
          )}
          <strong>{kindLabels[item.kind]}</strong>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.meta}>
            <span className={styles.kind}>{kindLabels[item.kind]}</span>
            <span>{item.sourceName}</span>
            <time dateTime={item.publishedAt}>公開 {formatJapaneseDate(item.publishedAt)}</time>
          </div>
          <div className={styles.statuses}>
            {statuses.map((status) => (
              <strong
                className={
                  status === "deadline-soon"
                    ? styles.deadline
                    : status.endsWith("ended")
                      ? styles.ended
                      : styles.status
                }
                key={status}
              >
                {statusLabels[status]}
              </strong>
            ))}
          </div>
          <h3>{item.title}</h3>
          <p className={styles.summary}>{item.summary}</p>
          <dl className={styles.schedule}>
            {item.releaseDate ? <div><dt>発売日</dt><dd>{formatJapaneseDate(item.releaseDate)}</dd></div> : null}
            {item.preorderStartDate ? <div><dt>予約開始</dt><dd>{formatJapaneseDate(item.preorderStartDate)}</dd></div> : null}
            {item.preorderDeadlineDate ? <div><dt>予約締切</dt><dd>{formatJapaneseDate(item.preorderDeadlineDate)}</dd></div> : null}
            {item.eventStartDate && item.eventEndDate ? <div><dt>開催期間</dt><dd>{formatJapaneseDate(item.eventStartDate)}〜{formatJapaneseDate(item.eventEndDate)}</dd></div> : null}
            {item.priceLabel ? <div><dt>価格</dt><dd>{item.priceLabel}</dd></div> : null}
            {item.salesLocation ? <div><dt>場所</dt><dd>{item.salesLocation}</dd></div> : null}
            {item.targetGame ? <div><dt>対象</dt><dd>{item.targetGame}{item.platforms?.length ? ` / ${item.platforms.join("・")}` : ""}</dd></div> : null}
          </dl>
          {item.pokemonSlugs.length ? (
            <div className={styles.pokemon}>
              {item.pokemonSlugs.map((slug) => (
                <button type="button" key={slug} onClick={() => setQuery(pokemonLabels[slug] ?? slug)}>
                  <PokemonVisual
                    name={pokemonLabels[slug] ?? slug}
                    slug={slug}
                    pokemonId={pokemonIds[slug]}
                    size="small"
                  />
                  <span>{pokemonLabels[slug] ?? slug}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.tags}>
            {item.tags.map((value) => (
              <button type="button" key={value} onClick={() => setTag(value)}>#{value}</button>
            ))}
          </div>
          <a href={item.url} target="_blank" rel="noreferrer">元ページを確認 <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    );
  }

  return (
    <section className={styles.explorer} aria-labelledby="content-list-heading">
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <h2 id="content-list-heading">情報を探す</h2>
          <p aria-live="polite">{filtered.length}件を表示中</p>
        </div>
        <div className={styles.kindFilters} aria-label="種類で絞り込む">
          <button type="button" aria-pressed={kind === "all"} onClick={() => setKind("all")}>すべて</button>
          {Object.entries(kindLabels).map(([value, label]) => (
            <button
              type="button"
              aria-pressed={kind === value}
              key={value}
              onClick={() => setKind(value as ContentKind)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          <label className={styles.search}>
            <span>キーワード・ポケモン名</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例：ピカチュウ、ぬいぐるみ、Pokémon GO" />
          </label>
          <label>
            <span>タグ</span>
            <select value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="all">すべて</option>
              {tags.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <button className={styles.reset} type="button" onClick={reset}>条件をリセット</button>
        </div>
      </div>

      {filtered.length ? (
        <>
          {priorityItems.length ? (
            <section className={styles.priority} aria-labelledby="priority-heading">
              <div className={styles.sectionHeading}>
                <div>
                  <span>CHECK NOW</span>
                  <h2 id="priority-heading">注目の情報</h2>
                </div>
                <p>締切間近・開催中・発売予定</p>
              </div>
              <div className={styles.priorityGrid}>{priorityItems.map((item) => renderCard(item, true))}</div>
            </section>
          ) : null}
          {regularItems.length ? (
            <section aria-labelledby="all-content-heading">
              <div className={styles.sectionHeading}>
                <h2 id="all-content-heading">新着・その他の情報</h2>
              </div>
              <div className={styles.grid}>{regularItems.map((item) => renderCard(item))}</div>
            </section>
          ) : null}
        </>
      ) : (
        <div className={styles.empty}>
          <strong>条件に合う情報がありません</strong>
          <p>検索語または絞り込み条件を変更してください。</p>
          <button type="button" onClick={reset}>条件をリセット</button>
        </div>
      )}
    </section>
  );
}
