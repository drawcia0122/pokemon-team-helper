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
