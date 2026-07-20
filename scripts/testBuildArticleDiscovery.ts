import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import appMetaJson from "../data/appMeta.json";
import pokemonJson from "../data/pokemon.json";
import {
  discoverBuildBlogs,
  discoverLinkedHatenaBlogCandidates,
  registerBlogCandidates,
  verifyPendingHatenaBlogs
} from "./build-article-collectors/blogDiscovery";
import {
  inferBattleFormat,
  inferSeason,
  inferTargetGame
} from "./build-article-collectors/articleInference";
import { createPokemonNameNormalizer } from "./build-article-collectors/pokemonNameNormalizer";
import type {
  FetchExpectedContent,
  FetchResult,
  HatenaBlogState
} from "./build-article-collectors/types";
import type { AppMeta, PokemonEntry } from "../types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const pokemon = pokemonJson as PokemonEntry[];
const appMeta = appMetaJson as AppMeta;

function successfulFetch(
  url: string,
  text: string,
  expected: FetchExpectedContent
): FetchResult {
  return {
    ok: true,
    url,
    status: 200,
    contentType:
      expected === "xml"
        ? "application/atom+xml"
        : expected === "html"
          ? "text/html"
          : "text/plain",
    text,
    headers: { etag: null, lastModified: null },
    notModified: false
  };
}

function feedFor(domain: string): string {
  return `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <generator uri="https://blog.hatena.ne.jp/">Hatena::Blog</generator>
      <entry>
        <title>ポケモンチャンピオンズ シングル シーズンM-4 使用構築</title>
        <link rel="alternate" href="https://${domain}/entry/2026/07/18/120000"/>
        <published>2026-07-18T12:00:00+09:00</published>
        <updated>2026-07-18T12:00:00+09:00</updated>
        <category term="ポケモンチャンピオンズ"/>
      </entry>
    </feed>`;
}

function pendingBlog(domain: string): HatenaBlogState {
  return {
    domain,
    discoveredFrom: "https://seed.hatenablog.com/entry/source",
    discoveredAt: "2026-07-20T00:00:00.000Z",
    feedUrl: `https://${domain}/feed?exclude_body=1`,
    automationAllowed: false,
    customDomain: false,
    platformVerified: false,
    verifiedAt: null,
    verificationMethod: null,
    promotionReason: null,
    candidateCount: null,
    failureCount: 0
  };
}

async function main(): Promise<void> {
  const normalizePokemon = createPokemonNameNormalizer(pokemon);
  for (const value of [
    "①カイリュー",
    "1. カイリュー",
    "カイリュー＠こだわりハチマキ",
    "カイリュー（ノーマルテラス）",
    "カイリュー♂",
    "【エース】カイリュー",
    "カイリュー / Dragonite",
    "<strong>カイリュー</strong>",
    "**カイリュー**"
  ]) {
    const resolution = normalizePokemon(value);
    assert(
      resolution.resolvedSlug === "dragonite" &&
        resolution.confidence !== "ambiguous" &&
        resolution.confidence !== "unresolved",
      `装飾付きポケモン名を解決できません: ${value}`
    );
  }
  assert(
    normalizePokemon("霊獣ランド").resolvedSlug === "landorus-therian" &&
      normalizePokemon("水ウーラ").resolvedSlug ===
        "urshifu-rapid-strike" &&
      normalizePokemon("ガチグマ暁").resolvedSlug ===
        "ursaluna-bloodmoon",
    "安全な略称・フォルム名を解決できません"
  );
  assert(
    normalizePokemon("ランドロス").confidence === "ambiguous" &&
      normalizePokemon("未知ポケモン").confidence === "unresolved",
    "曖昧名または未解決名を推測せず保持できません"
  );

  const single = inferBattleFormat({
    title: "ポケチャン シングル最終構築",
    tags: [],
    introduction: "",
    teamContext: "",
    text: ""
  });
  const double = inferBattleFormat({
    title: "Pokémon Champions VGC ダブル構築",
    tags: [],
    introduction: "",
    teamContext: "",
    text: ""
  });
  const ambiguous = inferBattleFormat({
    title: "シングルとダブルの構築比較",
    tags: [],
    introduction: "",
    teamContext: "",
    text: ""
  });
  assert(
    single.value === "single" &&
      double.value === "double" &&
      ambiguous.value === null &&
      ambiguous.ambiguous,
    "形式スコア判定が不正です"
  );
  for (const [label, season] of [
    ["M1", "season-m1"],
    ["M-1", "season-m1"],
    ["M１", "season-m1"],
    ["第1シーズン", "season-m1"],
    ["シーズン01", "season-m1"],
    ["マスターI", "season-m1"]
  ]) {
    assert(
      inferSeason({
        title: label,
        tags: [],
        introduction: "",
        teamContext: "",
        appMeta
      }).value === season,
      `シーズン表記を解決できません: ${label}`
    );
  }
  assert(
    inferTargetGame({
      title: "ポケモンチャンピオンズ M-4 使用構築",
      tags: [],
      introduction: "",
      teamContext: "",
      text: ""
    }).value === "pokemon-champions" &&
      inferTargetGame({
        title: "ポケモンSV 使用構築",
        tags: [],
        introduction: "",
        teamContext: "",
        text: ""
      }).value === "other-pokemon-game",
    "対象ゲーム判定が不正です"
  );

  const registered = registerBlogCandidates({
    blogs: [],
    candidates: [
      {
        domain: "new-blog.hatenablog.com",
        discoveredFrom: "https://seed.hatenablog.com/entry/source"
      }
    ],
    nowIso: "2026-07-20T00:00:00.000Z"
  });
  assert(
    registered.newCount === 1 &&
      registered.blogs[0].automationAllowed === false,
    "自動発見直後のブログを保留にできません"
  );
  const verified = await verifyPendingHatenaBlogs({
    blogs: registered.blogs,
    nowIso: "2026-07-20T00:01:00.000Z",
    fetcher: async (url, expected) =>
      successfulFetch(
        url,
        url.endsWith("/robots.txt")
          ? "User-agent: *\nAllow: /"
          : feedFor(new URL(url).hostname),
        expected
      )
  });
  assert(
    verified.promotedCount === 1 &&
      verified.blogs[0].automationAllowed &&
      verified.blogs[0].platformVerified &&
      verified.blogs[0].candidateCount === 1,
    "公開feed・robots検証後にブログを昇格できません"
  );
  const failed = await verifyPendingHatenaBlogs({
    blogs: [{ ...pendingBlog("failed.hatenablog.com"), failureCount: 2 }],
    nowIso: "2026-07-20T00:01:00.000Z",
    fetcher: async (url) => ({
      ok: false,
      url,
      status: 503,
      reason: "http-503",
      permanent: false
    })
  });
  assert(
    !failed.blogs[0].automationAllowed &&
      failed.blogs[0].failureCount === 3,
    "連続失敗ブログを自動巡回へ昇格してしまいました"
  );

  const html = (links: string[]) =>
    `<article><div class="entry-content">${links
      .map(
        (url) =>
          `<a href="${url}">ポケモンチャンピオンズ 使用構築</a>`
      )
      .join("")}</div><div class="entry-footer"></div></article>`;
  const fetched: string[] = [];
  const linked = await discoverLinkedHatenaBlogCandidates({
    seeds: [
      {
        url: "https://a.hatenablog.com/entry/start",
        domain: "a.hatenablog.com",
        depth: 0
      }
    ],
    existingDomains: ["a.hatenablog.com"],
    maxDepth: 2,
    fetchHtml: async (url) => {
      fetched.push(url);
      if (url.includes("a.hatenablog.com")) {
        return html([
          "https://b.hatenablog.com/entry/team",
          "https://example.com/not-allowed"
        ]);
      }
      return html([
        "https://a.hatenablog.com/entry/start",
        "https://c.hatenablog.com/entry/team"
      ]);
    }
  });
  assert(
    linked.map((entry) => entry.domain).join(",") ===
      "b.hatenablog.com,c.hatenablog.com" &&
      fetched.length === 2,
    "深度上限・循環防止・許可外ドメイン拒否が不正です"
  );

  const tempRoot = await mkdtemp(
    path.join(tmpdir(), "build-blog-discovery-")
  );
  try {
    await mkdir(path.join(tempRoot, "data"));
    const [statusText, generatedText] = await Promise.all([
      readFile(
        path.join(process.cwd(), "data/buildArticleCollectionStatus.json"),
        "utf8"
      ),
      readFile(
        path.join(process.cwd(), "data/buildArticles.generated.json"),
        "utf8"
      )
    ]);
    await Promise.all([
      writeFile(
        path.join(tempRoot, "data/buildArticleCollectionStatus.json"),
        statusText
      ),
      writeFile(
        path.join(tempRoot, "data/buildArticles.generated.json"),
        generatedText
      )
    ]);
    const statusPath = path.join(
      tempRoot,
      "data/buildArticleCollectionStatus.json"
    );
    await discoverBuildBlogs({
      rootDir: tempRoot,
      dryRun: true,
      includeLinkedDiscovery: false,
      now: new Date("2026-07-20T00:00:00.000Z"),
      fetcher: async (url, expected) =>
        successfulFetch(
          url,
          url.endsWith("/robots.txt")
            ? "User-agent: *\nAllow: /"
            : feedFor(new URL(url).hostname),
          expected
        )
    });
    assert(
      (await readFile(statusPath, "utf8")) === statusText,
      "ブログ探索dry-runが状態JSONを変更しました"
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log(
    "構築記事探索・名称正規化・形式/シーズン/対象ゲーム判定テスト: OK"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
