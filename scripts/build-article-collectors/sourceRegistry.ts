import type { BuildArticleSource } from "../../types/buildArticle";
import type { SourceConfig } from "./types";

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
  }
};

export function getSourceConfigs(
  source?: BuildArticleSource
): SourceConfig[] {
  return source
    ? [SOURCE_REGISTRY[source]]
    : [SOURCE_REGISTRY.pokesol, SOURCE_REGISTRY.note];
}
