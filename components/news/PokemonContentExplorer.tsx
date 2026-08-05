"use client";

import { useEffect, useMemo, useState } from "react";
import { PokemonVisual } from "@/components/pokemon/PokemonVisual";
import { getContentStatuses } from "@/lib/contentStatus";
import { formatJapaneseDate } from "@/lib/dateFormat";
import { POKEMON_NEWS_CATEGORY_LABELS } from "@/lib/pokemonNews";
import { POKEMON_NEWS_EVENT_TYPE_LABELS } from "@/lib/pokemonNewsIntelligence";
import type {
  ContentStatus,
  PokemonNewsArticle,
  PokemonNewsCategory
} from "@/types/pokemonContent";
import styles from "./PokemonContentExplorer.module.css";

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
  "event-upcoming",
  "release-upcoming"
];

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

function isEnded(statuses: ContentStatus[]) {
  return statuses.some((status) => status === "preorder-ended" || status === "event-ended");
}

function SmartNewsVisual({
  item,
  pokemonIds,
  pokemonLabels
}: {
  item: PokemonNewsArticle;
  pokemonIds: Record<string, number>;
  pokemonLabels: Record<string, string>;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const pokemonSlug = item.pokemonSlugs.length === 1 ? item.pokemonSlugs[0] : undefined;
  if (item.imageUrl && !imageFailed) {
    return (
      // RSS/API metadata images are used without requesting the article page.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={styles.articleImage}
        src={item.imageUrl}
        alt=""
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }
  if (pokemonSlug) {
    return (
      <PokemonVisual
        name={pokemonLabels[pokemonSlug] ?? pokemonSlug}
        slug={pokemonSlug}
        pokemonId={pokemonIds[pokemonSlug]}
        size="large"
      />
    );
  }
  return <span aria-hidden="true">{POKEMON_NEWS_CATEGORY_LABELS[item.categories[0]].slice(0, 2)}</span>;
}

export function PokemonContentExplorer({
  items,
  pokemonIds,
  pokemonLabels,
  today
}: {
  items: PokemonNewsArticle[];
  pokemonIds: Record<string, number>;
  pokemonLabels: Record<string, string>;
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | PokemonNewsCategory>("all");
  const [sourceKind, setSourceKind] = useState<"all" | "official" | "media">("all");
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

  const tags = useMemo(
    () => [...new Set(items.flatMap((item) => [...item.gameTitles, ...item.tags]))].sort(),
    [items]
  );
  const filtered = useMemo(() => {
    const q = normalize(query);
    return items.filter((item) => {
      if (category !== "all" && !item.categories.includes(category)) return false;
      if (sourceKind !== "all" && item.sourceKind !== sourceKind) return false;
      if (
        tag !== "all" &&
        !item.tags.includes(tag) &&
        !item.gameTitles.some((value) => value === tag)
      ) return false;
      if (!q) return true;
      return normalize([
        item.title,
        item.summary,
        item.sourceName,
        item.targetGame ?? "",
        ...item.categories.map((value) => POKEMON_NEWS_CATEGORY_LABELS[value]),
        ...item.eventTypes.map((value) => POKEMON_NEWS_EVENT_TYPE_LABELS[value]),
        ...item.gameTitles,
        ...item.tags,
        ...item.pokemonSlugs.flatMap((slug) => [slug, pokemonLabels[slug] ?? ""])
      ].join(" ")).includes(q);
    });
  }, [category, items, pokemonLabels, query, sourceKind, tag]);

  const featuredItems = filtered
    .filter(
      (item) =>
        item.importance >= 75 &&
        item.contentType !== "editorial" &&
        item.freshness !== "expired" &&
        item.freshness !== "archived"
    )
    .slice(0, 4);
  const featuredIds = new Set(featuredItems.map((item) => item.id));
  const scheduleItems = filtered.filter((item) =>
    !featuredIds.has(item.id) &&
    getContentStatuses(item, effectiveToday).some((status) => priorityStatuses.includes(status))
  ).slice(0, 5);
  const promotedIds = new Set([...featuredIds, ...scheduleItems.map((item) => item.id)]);
  const regularItems = filtered.filter(
    (item) =>
      !promotedIds.has(item.id) &&
      item.freshness !== "expired" &&
      item.freshness !== "archived"
  ).sort((left, right) =>
    Number(left.contentType === "editorial") - Number(right.contentType === "editorial") ||
    right.publishedAt.localeCompare(left.publishedAt)
  );
  const pastItems = filtered.filter(
    (item) =>
      item.freshness === "expired" || item.freshness === "archived"
  );

  const reset = () => {
    setQuery("");
    setCategory("all");
    setSourceKind("all");
    setTag("all");
  };

  function renderCard(item: PokemonNewsArticle, featured = false) {
    const statuses = getContentStatuses(item, effectiveToday);
    const ended = isEnded(statuses);
    const primaryCategory = item.categories[0];
    const visibleCategoryTags = item.categories.slice(0, 2);
    const visibleEventTypes = item.eventTypes.slice(0, Math.max(0, 4 - visibleCategoryTags.length));
    const remainingTagSlots = Math.max(0, 4 - visibleCategoryTags.length - visibleEventTypes.length);
    const visibleDetailTags = [...new Set([...item.gameTitles, ...item.tags])].slice(
      0,
      remainingTagSlots
    );

    return (
      <article
        className={`${styles.card} ${featured ? styles.featuredCard : ""} ${ended ? styles.endedCard : ""}`}
        key={item.id}
      >
        <div className={styles.cardVisual} data-kind={item.kind} data-image-source={item.imageSource}>
          <SmartNewsVisual item={item} pokemonIds={pokemonIds} pokemonLabels={pokemonLabels} />
          <strong>{POKEMON_NEWS_CATEGORY_LABELS[primaryCategory]}</strong>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.meta}>
            <span className={item.sourceKind === "official" ? styles.official : styles.media}>
              {item.sourceKind === "official" ? "公式" : "メディア"}
            </span>
            {item.contentType === "editorial" ? <span className={styles.editorial}>読みもの</span> : null}
            {item.importance >= 70 ? <span className={styles.important}>注目</span> : null}
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
          <p className={styles.insight}>{item.insight}</p>
          <p className={styles.summary}>{item.summary}</p>
          <dl className={styles.schedule}>
            {item.releaseDate ? <div><dt>発売日</dt><dd>{formatJapaneseDate(item.releaseDate)}</dd></div> : null}
            {item.preorderStartDate ? <div><dt>予約開始</dt><dd>{formatJapaneseDate(item.preorderStartDate)}</dd></div> : null}
            {item.preorderDeadlineDate ? <div><dt>予約締切</dt><dd>{formatJapaneseDate(item.preorderDeadlineDate)}</dd></div> : null}
            {item.eventStartDate && item.eventEndDate ? <div><dt>開催期間</dt><dd>{formatJapaneseDate(item.eventStartDate)}〜{formatJapaneseDate(item.eventEndDate)}</dd></div> : null}
            {item.priceLabel ? <div><dt>価格</dt><dd>{item.priceLabel}</dd></div> : null}
            {item.salesLocation || item.location ? <div><dt>場所</dt><dd>{item.salesLocation ?? item.location}</dd></div> : null}
            {item.isOnline ? <div><dt>開催形式</dt><dd>オンライン</dd></div> : null}
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
          <div className={styles.newsTags} aria-label="記事の分類">
            {visibleCategoryTags.map((value) => (
              <button type="button" key={value} onClick={() => setCategory(value)}>
                {POKEMON_NEWS_CATEGORY_LABELS[value]}
              </button>
            ))}
            {visibleEventTypes.map((value) => (
              <span className={styles.eventType} key={value}>
                {POKEMON_NEWS_EVENT_TYPE_LABELS[value]}
              </span>
            ))}
            {visibleDetailTags.map((value) => (
              <button type="button" key={value} onClick={() => setTag(value)}>#{value}</button>
            ))}
          </div>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">元ページを確認 <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    );
  }

  return (
    <section className={styles.explorer} aria-labelledby="content-list-heading">
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <h2 id="content-list-heading">ポケモンニュースを探す</h2>
          <p aria-live="polite">{filtered.length}件を表示中</p>
        </div>
        <div className={styles.kindFilters} aria-label="カテゴリで絞り込む">
          <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>すべて</button>
          {Object.entries(POKEMON_NEWS_CATEGORY_LABELS).map(([value, label]) => (
            <button
              type="button"
              aria-pressed={category === value}
              key={value}
              onClick={() => setCategory(value as PokemonNewsCategory)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.sourceFilters} aria-label="情報元で絞り込む">
          <span>情報元</span>
          {(["all", "official", "media"] as const).map((value) => (
            <button
              type="button"
              aria-pressed={sourceKind === value}
              key={value}
              onClick={() => setSourceKind(value)}
            >
              {value === "all" ? "すべて" : value === "official" ? "公式" : "メディア"}
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
          {featuredItems.length ? (
            <section className={styles.priority} aria-labelledby="priority-heading">
              <div className={styles.sectionHeading}>
                <div>
                  <span>CHECK NOW</span>
                  <h2 id="priority-heading">注目ニュース</h2>
                </div>
                <p>新作・大型イベント・重要なお知らせ</p>
              </div>
              <div className={styles.priorityGrid}>{featuredItems.map((item) => renderCard(item, true))}</div>
            </section>
          ) : null}
          {scheduleItems.length ? (
            <section className={styles.scheduleSection} aria-labelledby="schedule-heading">
              <div className={styles.sectionHeading}>
                <div>
                  <span>COMING SOON</span>
                  <h2 id="schedule-heading">まもなく開始・終了</h2>
                </div>
                <p>発売・予約・イベントの日程</p>
              </div>
              <div className={styles.grid}>{scheduleItems.map((item) => renderCard(item))}</div>
            </section>
          ) : null}
          {regularItems.length ? (
            <section aria-labelledby="all-content-heading">
              <div className={styles.sectionHeading}>
                <h2 id="all-content-heading">新着ニュース</h2>
              </div>
              <div className={styles.grid}>{regularItems.map((item) => renderCard(item))}</div>
            </section>
          ) : null}
          {pastItems.length ? (
            <section aria-labelledby="past-content-heading">
              <div className={styles.sectionHeading}>
                <h2 id="past-content-heading">過去のお知らせ</h2>
              </div>
              <div className={styles.grid}>{pastItems.map((item) => renderCard(item))}</div>
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
