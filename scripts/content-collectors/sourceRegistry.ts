import type { PokemonContentSource } from "../../types/pokemonContent";
import type { ContentSourceConfig } from "./types";

export type ContentSourceAuditRecord = {
  sourceName: string;
  domain: string;
  officialPageUrl: string;
  feedOrListUrl: string;
  robotsUrl: string;
  termsUrl: string;
  checkedAt: string;
  robotsResult: string;
  termsResult: string;
  automationAllowed: false;
  automationDecision: "disabled-by-policy" | "pending-review";
  decisionReason: string;
  implemented: "fixture-only" | "no";
};

export const CONTENT_SOURCE_AUDIT = {
  "pokemon-go-official-rss": {
    sourceName: "Pokémon GO公式",
    domain: "pokemongo.com",
    officialPageUrl: "https://pokemongo.com/",
    feedOrListUrl: "https://pokemongo.com/feed",
    robotsUrl: "https://pokemongo.com/robots.txt",
    termsUrl: "https://explore.scopely.com/terms",
    checkedAt: "2026-07-20",
    robotsResult: "Disallow: /_api/ を確認。/feed は禁止対象に含まれない",
    termsResult:
      "Services / Contentのextract・scrape・indexを禁止する条項を確認",
    automationAllowed: false,
    automationDecision: "disabled-by-policy",
    decisionReason:
      "RSSの公開だけでメタデータの自動index・再公開許可までは確認できない",
    implemented: "fixture-only"
  },
  "pokemon-champions-news": {
    sourceName: "Pokémon Champions Latest News",
    domain: "champions.pokemon.com",
    officialPageUrl: "https://champions.pokemon.com/en-us/",
    feedOrListUrl: "https://champions.pokemon.com/en-us/news/",
    robotsUrl: "https://champions.pokemon.com/robots.txt",
    termsUrl: "https://www.pokemon.com/us/legal/terms-of-use/",
    checkedAt: "2026-07-20",
    robotsResult: "robots.txtは404で明示ルールを確認できない",
    termsResult: "pokemon.comの規約本文はWAFにより確認不能",
    automationAllowed: false,
    automationDecision: "pending-review",
    decisionReason: "robotsと利用条件を十分に確認できない",
    implemented: "no"
  },
  "pokemon-japan-news": {
    sourceName: "ポケットモンスターオフィシャルサイト NEWS",
    domain: "www.pokemon.co.jp",
    officialPageUrl: "https://www.pokemon.co.jp/",
    feedOrListUrl: "https://www.pokemon.co.jp/info/",
    robotsUrl: "https://www.pokemon.co.jp/robots.txt",
    termsUrl: "https://www.pokemon.co.jp/rules/",
    checkedAt: "2026-07-20",
    robotsResult: "/info/ はDisallow対象に含まれない",
    termsResult:
      "文章等のコピー・複製・電送・公衆ネットワーク利用を制限する記載を確認",
    automationAllowed: false,
    automationDecision: "disabled-by-policy",
    decisionReason: "本サイトでの自動収集・再公開に適用できる許可を確認できない",
    implemented: "no"
  },
  "pokemon-champions-support": {
    sourceName: "Pokémon Championsサポート",
    domain: "app-pcs.pokemon-support.com",
    officialPageUrl: "https://app-pcs.pokemon-support.com/hc/ja",
    feedOrListUrl:
      "https://app-pcs.pokemon-support.com/api/v2/help_center/ja/articles.json",
    robotsUrl: "https://app-pcs.pokemon-support.com/robots.txt",
    termsUrl: "https://app-pcs.pokemon-support.com/hc/ja/articles/58579212269721",
    checkedAt: "2026-07-20",
    robotsResult: "規約確認後に取得を中止したため未確認",
    termsResult: "サイト外でのコンテンツ利用とデータ複製の制限を確認",
    automationAllowed: false,
    automationDecision: "disabled-by-policy",
    decisionReason: "公開JSON APIがあっても、規約上の再利用許可を確認できない",
    implemented: "no"
  },
  "pokemon-center-japan": {
    sourceName: "ポケモンセンター公式サイト",
    domain: "shop.pokemon.co.jp",
    officialPageUrl: "https://shop.pokemon.co.jp/ja/shop/",
    feedOrListUrl: "https://shop.pokemon.co.jp/ja/shop/common/events/",
    robotsUrl: "https://shop.pokemon.co.jp/robots.txt",
    termsUrl: "https://shop.pokemon.co.jp/ja/shop/guide/",
    checkedAt: "2026-07-20",
    robotsResult: "自動取得可否を判断できる明示ルールを確認できない",
    termsResult: "自動取得・メタデータ再公開を許可する条件を確認できない",
    automationAllowed: false,
    automationDecision: "pending-review",
    decisionReason: "許可条件を特定できるまで通信・実装しない",
    implemented: "no"
  },
  "pokemon-company-prtimes": {
    sourceName: "株式会社ポケモン PR TIMESフィード",
    domain: "prtimes.jp",
    officialPageUrl: "https://prtimes.jp/main/html/searchrlp/company_id/26665",
    feedOrListUrl: "https://prtimes.jp/companyrdf.php?company_id=26665",
    robotsUrl: "https://prtimes.jp/robots.txt",
    termsUrl: "https://prtimes.jp/main/html/kiyaku",
    checkedAt: "2026-07-20",
    robotsResult: "Allow: / を確認",
    termsResult:
      "ソフトウェアまたはデータの複製・改変・二次利用を制限する記載を確認",
    automationAllowed: false,
    automationDecision: "pending-review",
    decisionReason: "会社別RSSの購読と本サイトでの自動再公開は別であり、明示許可を確認できない",
    implemented: "no"
  }
} satisfies Record<string, ContentSourceAuditRecord>;

export const CONTENT_SOURCE_REGISTRY: Record<
  PokemonContentSource,
  ContentSourceConfig
> = {
  "pokemon-go-official-rss": {
    id: "pokemon-go-official-rss",
    label: "Pokémon GO公式",
    feedUrl: "https://pokemongo.com/feed",
    robotsUrl: "https://pokemongo.com/robots.txt",
    termsUrl: "https://explore.scopely.com/terms",
    allowedDomains: [],
    automationAllowed: false,
    policyNote:
      "公開RSSは確認できるが、Scopely利用規約がServices / Contentのextract・scrape・indexを禁止しているため保留。収集処理は通信しない",
    requestDelayMs: 1_000,
    timeoutMs: 15_000,
    retries: 2,
    maxResponseBytes: 512_000,
    normalItemLimit: 20,
    backfillItemLimit: 50
  }
};

export function getContentSourceConfigs(
  source?: PokemonContentSource
): ContentSourceConfig[] {
  if (!source) return Object.values(CONTENT_SOURCE_REGISTRY);
  const config = CONTENT_SOURCE_REGISTRY[source];
  if (!config) throw new Error(`unknown-content-source: ${String(source)}`);
  return [config];
}
