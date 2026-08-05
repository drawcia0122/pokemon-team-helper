export const POKEMON_NEWS_STRONG_TERMS = [
  "ポケモン",
  "ポケットモンスター",
  "Pokémon",
  "Pokemon"
] as const;

export const POKEMON_NEWS_SERVICE_TERMS = [
  "Pokémon GO",
  "ポケモンGO",
  "Pokémon Champions",
  "ポケモンチャンピオンズ",
  "Pokémon UNITE",
  "ポケモンユナイト",
  "Pokémon Sleep",
  "ポケモンスリープ",
  "Pokémon Masters EX",
  "ポケモンマスターズ",
  "ポケポケ",
  "Pokémon TCG Pocket",
  "ポケモンカード",
  "ポケカ",
  "Pokémon LEGENDS",
  "ポケモンセンター"
] as const;

export const POKEMON_NEWS_EVENT_TERMS = [
  "ポケモン Presents",
  "ポケモン大会",
  "ポケモンイベント",
  "ポケモングッズ",
  "ポケモン新商品",
  "ポケモンコラボ"
] as const;

export const GNEWS_SEARCH_QUERIES = [
  '("ポケモン" OR "ポケットモンスター" OR "Pokémon" OR "Pokemon")',
  '("Pokémon GO" OR "ポケモンGO" OR "Pokémon UNITE" OR "ポケモンユナイト" OR "Pokémon Sleep" OR "ポケモンスリープ")',
  '("ポケポケ" OR "Pokémon TCG Pocket" OR "ポケモンカード" OR "Pokémon LEGENDS" OR "Pokémon Champions")'
] as const;

export const POKEMON_NEWS_COLLECTION_WINDOW_DAYS = 14;
export const POKEMON_NEWS_RELEVANCE_THRESHOLD = 45;

export const POKEMON_NEWS_EDITORIAL_PATTERN =
  /インタビュー|レビュー|プレイレポ(?:ート)?|コラム|攻略|考察|特集|ランキング|まとめ|おすすめ|検証/i;

export const POKEMON_NEWS_NEWS_PATTERN =
  /発表|発売|予約|配信|アップデート|更新|新作|新商品|イベント|開催|キャンペーン|大会|コラボ|登場|公開|決定|開始|実施|提供/i;
