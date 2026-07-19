import { readFile } from "node:fs/promises";
import path from "node:path";
import appMetaData from "@/data/appMeta.json";
import pokemonData from "@/data/pokemon.json";
import type { AppMeta, PokemonEntry } from "@/types/pokemon";
import { collectBuildArticles } from "./build-article-collectors/collector";
import {
  createOrUpdateGeneratedArticle,
  findGeneratedMatch
} from "./build-article-collectors/deduplicate";
import {
  extractHatenaBlogDomains,
  isHatenaBuildCandidate,
  isHatenaFeed,
  isHatenaPlatformDomain,
  parseHatenaArticle,
  parseHatenaFeed
} from "./build-article-collectors/hatenaBlog";
import { SafeHttpClient } from "./build-article-collectors/http";
import {
  INITIAL_HATENA_BLOGS,
  RESEARCH_ONLY_SOURCES,
  SOURCE_REGISTRY
} from "./build-article-collectors/sourceRegistry";
import type {
  FetchResult,
  SourceConfig
} from "./build-article-collectors/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const appMeta = appMetaData as AppMeta;
const pokemon = pokemonData as PokemonEntry[];
const fixtureDir = path.join(
  process.cwd(),
  "scripts/fixtures/build-article-collection"
);

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixtureDir, name), "utf8");
}

function emptyFeed(): string {
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><generator uri="https://hatenablog.com/">Hatena Blog</generator></feed>`;
}

function makeLargeFeed(domain: string, count: number): string {
  const entries = Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(3, "0");
    return `<entry>
      <title>ポケモンチャンピオンズ シーズンM-4 シングル最終構築 ${suffix}</title>
      <link rel="alternate" href="https://${domain}/entry/2026/07/18/${suffix}" />
      <published>2026-07-18T12:00:00+09:00</published>
      <updated>2026-07-18T12:00:00+09:00</updated>
      <category term="構築記事" />
    </entry>`;
  }).join("");
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><generator uri="https://hatenablog.com/">Hatena Blog</generator>${entries}</feed>`;
}

async function main(): Promise<void> {
  const [atom, rss, articleHtml] = await Promise.all([
    fixture("hatena-feed.atom.xml"),
    fixture("hatena-feed.rss.xml"),
    fixture("hatena-article.html")
  ]);
  const atomCandidates = parseHatenaFeed(
    atom,
    "https://mountain0531.hatenablog.com/feed?exclude_body=1"
  );
  const rssCandidates = parseHatenaFeed(
    rss,
    "https://nanchaaaaan.hatenablog.com/rss?exclude_body=1"
  );
  assert(
    atomCandidates.length === 1 &&
      atomCandidates[0].url ===
        "https://mountain0531.hatenablog.com/entry/2026/07/18/120000" &&
      atomCandidates[0].thumbnailUrl?.includes("cdn-ak.f.st-hatena.com"),
    "本文除外Atomから候補・URL・サムネイルメタデータを取得できません"
  );
  assert(
    rssCandidates.length === 1 &&
      rssCandidates[0].authorName === "rss_author" &&
      rssCandidates[0].updatedAt === "2026-06-20T21:00:00+09:00",
    "本文除外RSSの候補・著者・更新日時を取得できません"
  );
  assert(
    parseHatenaFeed(
      makeLargeFeed("ev-pkmn.hatenablog.com", 120),
      "https://ev-pkmn.hatenablog.com/feed?size=100&exclude_body=1",
      100
    ).length === 100,
    "backfill用100件フィードの上限を処理できません"
  );
  assert(
    !isHatenaBuildCandidate({
      title: "ポケモンSV シングル構築記事",
      tags: ["ポケモンSV"]
    }) &&
      !isHatenaBuildCandidate({
        title: "ポケモンカードの構築記事",
        tags: []
      }) &&
      isHatenaBuildCandidate({
        title: "ポケモンチャンピオンズ M-4 最終構築",
        tags: []
      }),
    "候補の正例・別ゲーム・カードの除外条件が不正です"
  );

  const extracted = parseHatenaArticle({
    html: articleHtml,
    url: atomCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    extracted.status === "accepted" &&
      extracted.article.collectionCompleteness === "complete" &&
      extracted.article.pokemonSlugs.length === 6 &&
      extracted.article.pokemonSlugs[0] === "bulbasaur" &&
      extracted.article.builderSeasonId === "season-m4" &&
      extracted.article.regulationId === "M-B" &&
      extracted.article.battleFormat === "single" &&
      extracted.article.teamExtractionMethod === "section-headings",
    "はてな記事の最終構築6体・シーズン・ルール・形式を抽出できません"
  );
  const tocNames = [
    "フシギダネ",
    "リザードン",
    "カメックス",
    "ピカチュウ",
    "ゲンガー",
    "カイリュー"
  ];
  const tocArticle = parseHatenaArticle({
    html: articleHtml.replace(
      /<h2>序盤構築<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
      `<nav class="table-of-contents"><a href="#members">個体紹介</a>${tocNames
        .map((name) => `<a href="#${name}">${name}</a>`)
        .join("")}<a href="#checks">対策ポケモン</a><a href="#mew">ミュウ</a></nav><h2>まとめ</h2>`
    ),
    url: atomCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    tocArticle.status === "accepted" &&
      tocArticle.article.collectionCompleteness === "complete" &&
      tocArticle.article.teamExtractionMethod === "table-of-contents" &&
      tocArticle.article.pokemonSlugs.length === 6,
    "目次内の個体紹介6項目を対策ポケモンと分離できません"
  );
  for (const [season, regulation] of [
    ["M-1", "M-A"],
    ["M-2", "M-A"],
    ["M-3", "M-B"],
    ["M-4", "M-B"]
  ]) {
    const normalized = parseHatenaArticle({
      html: articleHtml
        .replaceAll("M-4", season)
        .replaceAll("M-B", regulation),
      url: atomCandidates[0].url,
      appMeta,
      pokemon
    });
    assert(
      normalized.status === "accepted" &&
        normalized.article.builderSeasonId ===
          `season-m${season.at(-1)}` &&
        normalized.article.regulationId === regulation,
      `はてな記事から${season}／${regulation}を抽出できません`
    );
  }
  const doubleArticle = parseHatenaArticle({
    html: articleHtml.replaceAll("シングル", "ダブル"),
    url: atomCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    doubleArticle.status === "accepted" &&
      doubleArticle.article.battleFormat === "double",
    "はてな記事からダブル形式を抽出できません"
  );
  assert(
    extracted.article.thumbnail?.source === "structured-data" &&
      extracted.article.thumbnail.url.includes("cdn-ak.f.st-hatena.com"),
    "はてな公式画像ホストの構造化データ画像を優先できません"
  );
  const metadataOnly = parseHatenaArticle({
    html: articleHtml.replace(
      /<h2>最終構築<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
      '<h2>最終構築</h2><figure><img src="/team.png" alt="最終構築のパーティ画像"><figcaption>パーティ画像</figcaption></figure><h2>まとめ</h2>'
    ),
    url: atomCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    metadataOnly.status === "accepted" &&
      metadataOnly.article.collectionCompleteness === "metadata-only" &&
      metadataOnly.article.pokemonSlugs.length === 0,
    "6体を確定できない記事をmetadata-onlyとして保持できません"
  );
  assert(
    extractHatenaBlogDomains(
      articleHtml,
      "mountain0531.hatenablog.com"
    ).includes("another-hatena.hatenablog.jp"),
    "記事リンクから対応はてなブログを自動発見できません"
  );
  const foreignCanonical = parseHatenaArticle({
    html: articleHtml.replaceAll(
      "https://mountain0531.hatenablog.com/entry/2026/07/18/120000",
      "https://note.com/fixture/n/nmirror001"
    ),
    url: atomCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    foreignCanonical.status === "excluded" &&
      foreignCanonical.reason === "invalid-canonical-url",
    "noteをcanonicalにしたはてなミラー候補を拒否できません"
  );
  const generatedHatena =
    extracted.status === "accepted"
      ? createOrUpdateGeneratedArticle({
          source: "hatena-blog",
          sourceUrl: atomCandidates[0].url,
          article: extracted.article,
          existing: null,
          nowIso: "2026-07-19T00:00:00.000Z"
        }).article
      : null;
  assert(generatedHatena, "重複テスト用記事を作成できません");
  assert(
    findGeneratedMatch(
      {
        ...extracted.article,
        canonicalUrl: "https://note.com/fixture/n/nsame001",
        sourceArticleId: "nsame001"
      },
      [generatedHatena]
    )?.id === generatedHatena.id,
    "noteとはてなの同一メタデータ重複を検出できません"
  );
  assert(
    findGeneratedMatch(
      {
        ...extracted.article,
        canonicalUrl: "https://note.com/other/n/ndifferent001",
        sourceArticleId: "ndifferent001",
        authorName: "different_author"
      },
      [generatedHatena]
    ) === null,
    "同じ6体でも別著者の別記事を誤って重複扱いしました"
  );

  for (const domain of [
    "example.hatenablog.com",
    "example.hatenablog.jp",
    "example.hatena.blog",
    "example.hatenadiary.com"
  ]) {
    assert(isHatenaPlatformDomain(domain), `対応ドメインを拒否しました: ${domain}`);
  }
  assert(
    !isHatenaPlatformDomain("hatenablog.com") &&
      !isHatenaPlatformDomain("example.com") &&
      isHatenaFeed(atom) &&
      isHatenaFeed(
        "<feed><generator>Hatena Blog</generator><title>custom</title></feed>"
      ),
    "サブドメイン制限またはカスタムドメインのはてな識別が不正です"
  );

  let conditionalHeaders: HeadersInit | undefined;
  const conditionalConfig: SourceConfig = {
    ...SOURCE_REGISTRY["hatena-blog"],
    allowedDomains: ["mountain0531.hatenablog.com"],
    requestDelayMs: 0,
    retries: 0
  };
  const conditionalClient = new SafeHttpClient(conditionalConfig, {
    ensurePublicHost: async () => {},
    fetchImpl: async (_url, init) => {
      conditionalHeaders = init?.headers;
      return new Response(null, {
        status: 304,
        headers: { etag: "\"fixture-v2\"" }
      });
    }
  });
  const notModified = await conditionalClient.fetchText(
    "https://mountain0531.hatenablog.com/feed?exclude_body=1",
    "xml",
    {
      headers: {
        "if-none-match": "\"fixture-v1\"",
        "if-modified-since": "Sat, 18 Jul 2026 03:00:00 GMT"
      },
      allowNotModified: true
    }
  );
  const requestHeaders = new Headers(conditionalHeaders);
  assert(
    notModified.ok &&
      notModified.notModified === true &&
      notModified.status === 304 &&
      notModified.headers?.etag === "\"fixture-v2\"" &&
      requestHeaders.get("if-none-match") === "\"fixture-v1\"" &&
      requestHeaders.get("if-modified-since") !== null,
    "ETag・Last-Modified条件付き取得または304スキップが不正です"
  );

  const calls: string[] = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const mockClient = {
    async fetchText(
      value: string,
      expected: string
    ): Promise<FetchResult> {
      calls.push(value);
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;
      if (value.endsWith("/robots.txt")) {
        return {
          ok: true,
          url: value,
          status: 200,
          contentType: "text/plain",
          text: "User-agent: *\nAllow: /\n"
        };
      }
      if (value.includes("/feed?")) {
        const domain = new URL(value).hostname;
        return {
          ok: true,
          url: value,
          status: 200,
          contentType: "application/atom+xml",
          text:
            domain === "mountain0531.hatenablog.com"
              ? atom
              : emptyFeed(),
          headers: { etag: "\"fixture\"", lastModified: null }
        };
      }
      if (expected === "html" && value === atomCandidates[0].url) {
        return {
          ok: true,
          url: value,
          status: 200,
          contentType: "text/html",
          text: articleHtml
        };
      }
      return {
        ok: false,
        url: value,
        status: 404,
        reason: "http-404",
        permanent: true
      };
    }
  };
  const dryRun = await collectBuildArticles({
    source: "hatena-blog",
    dryRun: true,
    writeFiles: false,
    clients: { "hatena-blog": mockClient },
    now: new Date("2026-07-19T03:00:00.000Z")
  });
  assert(
    dryRun.generatedArticles.some(
      (article) =>
        article.source === "hatena-blog" &&
        article.canonicalUrl === atomCandidates[0].url
    ) &&
      dryRun.status.sources["hatena-blog"].publishedCount === 1 &&
      dryRun.status.sources["hatena-blog"].fetchedCount === 1 &&
      dryRun.status.hatenaFeeds[
        "mountain0531.hatenablog.com"
      ].entries[atomCandidates[0].url]?.contentFingerprint ===
        atomCandidates[0].contentFingerprint &&
      dryRun.status.hatenaBlogs.some(
        (blog) =>
          blog.domain === "another-hatena.hatenablog.jp" &&
          blog.automationAllowed === false &&
          blog.feedUrl.endsWith("/feed?exclude_body=1")
      ) &&
      maxActiveRequests <= 2 &&
      !dryRun.wroteFiles,
    "はてなdry-runの候補限定本文取得・状態記録・同時実行上限が不正です"
  );
  assert(
    calls.filter((value) => value.includes("/entry/")).length === 1,
    "候補判定前の記事本文を取得しました"
  );

  const generatedCountBeforeFailure = dryRun.generatedArticles.length;
  const failedFeedClient = {
    async fetchText(value: string): Promise<FetchResult> {
      if (value.endsWith("/robots.txt")) {
        return {
          ok: true,
          url: value,
          status: 200,
          contentType: "text/plain",
          text: "User-agent: *\nAllow: /\n"
        };
      }
      return {
        ok: false,
        url: value,
        status: 503,
        reason: "http-503",
        permanent: false
      };
    }
  };
  const failedFeeds = await collectBuildArticles({
    source: "hatena-blog",
    dryRun: true,
    writeFiles: false,
    clients: { "hatena-blog": failedFeedClient },
    now: new Date("2026-07-19T03:30:00.000Z")
  });
  assert(
    failedFeeds.generatedArticles.length ===
      generatedCountBeforeFailure - 1 &&
      failedFeeds.status.sources["hatena-blog"].status === "failed",
    "フィード失敗時に既存生成記事を維持できません"
  );

  const backfillCalls: string[] = [];
  const backfillClient = {
    async fetchText(value: string): Promise<FetchResult> {
      backfillCalls.push(value);
      if (value.endsWith("/robots.txt")) {
        return {
          ok: true,
          url: value,
          status: 200,
          contentType: "text/plain",
          text: "User-agent: *\nAllow: /\n"
        };
      }
      if (value.includes("/feed?")) {
        return {
          ok: true,
          url: value,
          status: 200,
          contentType: "application/atom+xml",
          text: makeLargeFeed(new URL(value).hostname, 35)
        };
      }
      return {
        ok: true,
        url: value,
        status: 200,
        contentType: "text/html",
        text: "<html><head><title>対象外</title></head><body></body></html>"
      };
    }
  };
  const backfill = await collectBuildArticles({
    source: "hatena-blog",
    dryRun: true,
    backfill: true,
    writeFiles: false,
    clients: { "hatena-blog": backfillClient },
    now: new Date("2026-07-19T04:00:00.000Z")
  });
  const bodyCallsByDomain = new Map<string, number>();
  for (const value of backfillCalls.filter((url) => url.includes("/entry/"))) {
    const domain = new URL(value).hostname;
    bodyCallsByDomain.set(domain, (bodyCallsByDomain.get(domain) ?? 0) + 1);
  }
  assert(
    backfillCalls.some((value) =>
      value.includes("/feed?size=100&exclude_body=1")
    ) &&
      backfill.status.sources["hatena-blog"].fetchedCount === 150 &&
      [...bodyCallsByDomain.values()].every((count) => count <= 30),
    "backfillの100件フィード・1ブログ30件・全体150件上限が不正です"
  );

  assert(
    INITIAL_HATENA_BLOGS.length === 8 &&
      SOURCE_REGISTRY["hatena-blog"].requestDelayMs >= 1000 &&
      SOURCE_REGISTRY["hatena-blog"].timeoutMs === 15000 &&
      SOURCE_REGISTRY["hatena-blog"].retries === 2,
    "初期ブログ台帳または通信上限が不正です"
  );
  assert(
    SOURCE_REGISTRY.pokesol.automationAllowed === false &&
      RESEARCH_ONLY_SOURCES.game8.automationAllowed === false &&
      RESEARCH_ONLY_SOURCES.gamewith.automationAllowed === false,
    "許可未確認メディアのライブ収集が有効です"
  );

  console.log(
    "[ok] はてなAtom/RSS・候補判定・抽出・条件付き取得・dry-run/backfill上限を検証しました"
  );
}

main().catch((error) => {
  console.error("[fatal] はてなブログ構築記事収集テストに失敗しました");
  console.error(error);
  process.exitCode = 1;
});
