import type { BuildArticleSource } from "../../types/buildArticle";
import type { SourceConfig } from "./types";

export const INITIAL_HATENA_BLOGS = [
  "mountain0531.hatenablog.com",
  "nanchaaaaan.hatenablog.com",
  "ev-pkmn.hatenablog.com",
  "pocketyell292.hatenablog.com",
  "an-channel.hatenablog.com",
  "guyapoke-9.hatenablog.com",
  "prin-game.hatenablog.com",
  "suzuri-ghost.hatenablog.com"
] as const;

/**
 * 手動検索で公開済みのPokémon Champions構築記事を確認した探索シード。
 * 検索結果ページ自体は収集せず、各ブログの公開feedとrobots.txtを
 * discover:build-blogsで改めて検証してから自動巡回へ昇格する。
 */
export const RESEARCHED_HATENA_BLOG_CANDIDATES = [
  {
    domain: "totsuwaki.hatenablog.com",
    discoveredFrom: "https://totsuwaki.hatenablog.com/"
  },
  {
    domain: "egina33699307.hatenablog.com",
    discoveredFrom: "https://egina33699307.hatenablog.com/"
  },
  {
    domain: "murasaki3sun.hatenablog.com",
    discoveredFrom: "https://murasaki3sun.hatenablog.com/"
  },
  {
    domain: "senyakazuya.hatenablog.com",
    discoveredFrom: "https://senyakazuya.hatenablog.com/"
  },
  {
    domain: "party-librarian.hatenablog.com",
    discoveredFrom: "https://party-librarian.hatenablog.com/"
  },
  {
    domain: "kocho3.hatenablog.com",
    discoveredFrom: "https://kocho3.hatenablog.com/"
  },
  {
    domain: "ebapoke.hatenablog.com",
    discoveredFrom: "https://ebapoke.hatenablog.com/"
  },
  {
    domain: "penpenpendlar.hatenablog.com",
    discoveredFrom: "https://penpenpendlar.hatenablog.com/"
  },
  {
    domain: "mutimoumai.hatenablog.com",
    discoveredFrom: "https://mutimoumai.hatenablog.com/"
  },
  {
    domain: "judaspoke.hatenablog.com",
    discoveredFrom: "https://judaspoke.hatenablog.com/"
  },
  {
    domain: "mutou610pokepoke.hatenablog.com",
    discoveredFrom: "https://mutou610pokepoke.hatenablog.com/"
  },
  {
    domain: "pokest.hatenablog.com",
    discoveredFrom: "https://pokest.hatenablog.com/"
  },
  {
    domain: "foolmoon.hatenablog.com",
    discoveredFrom: "https://foolmoon.hatenablog.com/"
  },
  {
    domain: "pokemonza.hatenablog.jp",
    discoveredFrom: "https://pokemonza.hatenablog.jp/"
  },
  {
    domain: "tenku64.hatenablog.com",
    discoveredFrom: "https://tenku64.hatenablog.com/"
  },
  {
    domain: "chikaramochida.hatenablog.com",
    discoveredFrom: "https://chikaramochida.hatenablog.com/"
  },
  {
    domain: "uc-pokemon.hatenablog.com",
    discoveredFrom:
      "https://uc-pokemon.hatenablog.com/entry/2026/07/13/163502"
  },
  {
    domain: "mabo-nebo.hatenablog.com",
    discoveredFrom:
      "https://mabo-nebo.hatenablog.com/entry/2026/05/14/013452"
  },
  {
    domain: "nanami2000.hatenablog.jp",
    discoveredFrom:
      "https://nanami2000.hatenablog.jp/entry/2026/07/08/150917"
  },
  {
    domain: "daisuke-poke.hatenablog.jp",
    discoveredFrom: "https://daisuke-poke.hatenablog.jp/archive/2026/07"
  },
  {
    domain: "zahnradpoke.hatenablog.com",
    discoveredFrom: "https://zahnradpoke.hatenablog.com/"
  },
  {
    domain: "bllizzard0508.hatenablog.jp",
    discoveredFrom:
      "https://bllizzard0508.hatenablog.jp/entry/2026/07/08/174208"
  },
  {
    domain: "schwarz5555.hatenablog.jp",
    discoveredFrom:
      "https://schwarz5555.hatenablog.jp/entry/2026/06/23/120323"
  },
  {
    domain: "iron-hands29.hatenablog.com",
    discoveredFrom: "https://iron-hands29.hatenablog.com/"
  }
] as const;

export const RESEARCH_ONLY_SOURCES = {
  game8: {
    label: "Game8",
    url: "https://game8.jp/pokemon-champions",
    termsUrl: "https://game8.jp/terms",
    automationAllowed: false,
    policyStatus: "permission-required",
    policyNote:
      "通常閲覧を超える複製・再配布・解析や商用利用に制限があり、自動収集を許可する公開記載を確認できないため、許可取得までライブ通信しない"
  },
  gamewith: {
    label: "GameWith",
    url: "https://gamewith.jp/pokemon-champions",
    termsUrl: "https://gamewith.jp/terms",
    automationAllowed: false,
    policyStatus: "permission-required",
    policyNote:
      "サーバー負荷行為、複製・解析・再公開、商用利用に制限があり、自動収集を許可する公開記載を確認できないため、許可取得までライブ通信しない"
  }
} as const;

const NOTE_TAGS = [
  "ポケモンチャンピオンズ",
  "ポケモン構築記事",
  "構築記事",
  "ポケチャン",
  "シングルバトル",
  "ダブルバトル"
];

export const SOURCE_REGISTRY: Record<BuildArticleSource, SourceConfig> = {
  pokesol: {
    id: "pokesol",
    label: "ポケソル",
    allowedDomains: ["pokesol.app"],
    discoveryUrls: ["https://pokesol.app/"],
    robotsUrl: "https://pokesol.app/robots.txt",
    termsUrl: "https://pokesol.app/terms",
    automationAllowed: false,
    policyNote:
      "利用規約第4条6・7が、運営の許可のない自動収集・クローリング・スクレイピングを禁止しているため停止",
    maxCandidates: 50,
    maxArticleFetches: 30,
    requestDelayMs: 1500,
    timeoutMs: 15000,
    maxResponseBytes: 2_000_000,
    retries: 2
  },
  note: {
    id: "note",
    label: "note",
    allowedDomains: ["note.com"],
    discoveryUrls: NOTE_TAGS.map(
      (tag) =>
        `https://note.com/hashtag/${encodeURIComponent(tag)}?f=new&paid_only=false`
    ),
    robotsUrl: "https://note.com/robots.txt",
    termsUrl:
      "https://terms.help-note.com/hc/ja/articles/44943817565465-note-%E3%81%94%E5%88%A9%E7%94%A8%E8%A6%8F%E7%B4%84",
    automationAllowed: true,
    policyNote:
      "robots.txtで許可された公開タグ・無料公開記事のみを低頻度で取得し、検索・API・ログイン領域は使用しない",
    maxCandidates: 50,
    maxArticleFetches: 30,
    requestDelayMs: 1500,
    timeoutMs: 15000,
    maxResponseBytes: 2_000_000,
    retries: 2
  },
  "hatena-blog": {
    id: "hatena-blog",
    label: "はてなブログ",
    allowedDomains: [...INITIAL_HATENA_BLOGS],
    discoveryUrls: INITIAL_HATENA_BLOGS.map(
      (domain) => `https://${domain}/feed?exclude_body=1`
    ),
    robotsUrl: "https://hatenablog.com/robots.txt",
    termsUrl: "https://help.hatenablog.com/entry/guideline",
    automationAllowed: true,
    policyNote:
      "公開Atom/RSSフィードを本文除外で確認し、候補記事だけを各ブログのrobots.txtに従って低頻度で取得する",
    maxCandidates: 800,
    maxArticleFetches: 30,
    requestDelayMs: 1000,
    timeoutMs: 15000,
    maxResponseBytes: 2_000_000,
    retries: 2
  }
};

export function getSourceConfigs(
  source?: BuildArticleSource
): SourceConfig[] {
  return source
    ? [SOURCE_REGISTRY[source]]
    : [
        SOURCE_REGISTRY.pokesol,
        SOURCE_REGISTRY.note,
        SOURCE_REGISTRY["hatena-blog"]
      ];
}
