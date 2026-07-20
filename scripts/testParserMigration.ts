import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GeneratedBuildArticle } from "../types/buildArticle";
import { collectBuildArticles } from "./build-article-collectors/collector";
import {
  EXTRACTOR_VERSION,
  type CandidateCollectionState,
  type CollectionStatus,
  type FetchResult,
  type HatenaBlogState
} from "./build-article-collectors/types";
import {
  MIGRATABLE_PREVIOUS_VERSION,
  planSavedParserMigration
} from "./build-article-collectors/parserMigration";
import { createBuildExtractionReport } from "./reportBuildExtraction";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const rootDir = process.cwd();

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function cursorCandidate(
  candidate: CandidateCollectionState
): CandidateCollectionState {
  return {
    ...candidate,
    parserVersion: MIGRATABLE_PREVIOUS_VERSION,
    previousParserVersion: null,
    reevaluationMethod: null,
    reevaluationStatus: null,
    reevaluationOutcome: null,
    reevaluationReason: null
  };
}

function statusFixture(input: {
  candidate: CandidateCollectionState;
  blog: HatenaBlogState;
}): Partial<CollectionStatus> {
  return {
    lastRunAt: "2026-07-20T00:00:00.000Z",
    durationMs: 0,
    dryRun: false,
    cursors: {
      pokesol: { nextIndex: 0, candidates: [] },
      note: { nextIndex: 0, candidates: [] },
      "hatena-blog": {
        nextIndex: 0,
        candidates: [input.candidate]
      }
    },
    hatenaFeeds: {},
    hatenaBlogs: [input.blog]
  };
}

async function runMigrationFixture(input: {
  candidate: CandidateCollectionState;
  article: GeneratedBuildArticle | null;
  blog: HatenaBlogState;
  fetchText: (
    url: string,
    expected: string
  ) => Promise<FetchResult>;
  dryRun?: boolean;
}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "parser-migration-"));
  const generatedPath = path.join(tempDir, "generated.json");
  const statusPath = path.join(tempDir, "status.json");
  try {
    await Promise.all([
      writeFile(
        generatedPath,
        `${JSON.stringify(input.article ? [input.article] : [], null, 2)}\n`
      ),
      writeFile(
        statusPath,
        `${JSON.stringify(
          statusFixture({
            candidate: input.candidate,
            blog: input.blog
          }),
          null,
          2
        )}\n`
      )
    ]);
    const beforeGenerated = await readFile(generatedPath, "utf8");
    const beforeStatus = await readFile(statusPath, "utf8");
    const result = await collectBuildArticles({
      source: "hatena-blog",
      reevaluate: true,
      dryRun: input.dryRun ?? true,
      writeFiles: !(input.dryRun ?? true),
      paths: {
        appMeta: path.join(rootDir, "data/appMeta.json"),
        pokemon: path.join(rootDir, "data/pokemon.json"),
        manualArticles: path.join(
          rootDir,
          "data/buildArticles.manual.json"
        ),
        generatedArticles: generatedPath,
        status: statusPath
      },
      clients: {
        "hatena-blog": {
          fetchText: input.fetchText
        }
      },
      now: new Date("2026-07-20T01:00:00.000Z")
    });
    return {
      result,
      beforeGenerated,
      beforeStatus,
      afterGenerated: await readFile(generatedPath, "utf8"),
      afterStatus: await readFile(statusPath, "utf8")
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const [generatedArticles, collectionStatus, articleHtml] =
    await Promise.all([
      readJson<GeneratedBuildArticle[]>(
        path.join(rootDir, "data/buildArticles.generated.json")
      ),
      readJson<CollectionStatus>(
        path.join(rootDir, "data/buildArticleCollectionStatus.json")
      ),
      readFile(
        path.join(
          rootDir,
          "scripts/fixtures/build-article-collection/hatena-article.html"
        ),
        "utf8"
      )
    ]);
  const metadataArticle = generatedArticles.find(
    (article) =>
      article.source === "hatena-blog" &&
      article.collectionCompleteness === "metadata-only"
  );
  const completeArticle = generatedArticles.find(
    (article) =>
      article.source === "hatena-blog" &&
      article.collectionCompleteness === "complete"
  );
  assert(metadataArticle && completeArticle, "移行テスト用記事がありません");
  const metadataCandidate = collectionStatus.cursors[
    "hatena-blog"
  ].candidates.find(
    (candidate) => candidate.url === metadataArticle.sourceUrl
  );
  const completeCandidate = collectionStatus.cursors[
    "hatena-blog"
  ].candidates.find(
    (candidate) => candidate.url === completeArticle.sourceUrl
  );
  const blog = collectionStatus.hatenaBlogs.find(
    (entry) =>
      entry.domain === new URL(metadataArticle.sourceUrl).hostname
  );
  assert(metadataCandidate && completeCandidate && blog, "移行状態が不正です");

  const savedPlan = planSavedParserMigration({
    candidate: cursorCandidate(metadataCandidate),
    source: "hatena-blog",
    generatedArticles: [metadataArticle]
  });
  assert(
    savedPlan.method === "saved-state" &&
      savedPlan.outcome === "metadata-only-maintained",
    "保存済みmetadata-only記事を通信なしで維持できません"
  );
  const completePlan = planSavedParserMigration({
    candidate: cursorCandidate(completeCandidate),
    source: "hatena-blog",
    generatedArticles: [completeArticle]
  });
  assert(
    completePlan.method === "saved-state" &&
      completePlan.outcome === "complete-maintained",
    "正しいcomplete記事を保存情報から維持できません"
  );
  const missingBodyPlan = planSavedParserMigration({
    candidate: cursorCandidate({
      ...metadataCandidate,
      contentFingerprint: null
    }),
    source: "hatena-blog",
    generatedArticles: [metadataArticle]
  });
  assert(
    missingBodyPlan.method === "network",
    "本文情報不足時にネットワーク再取得を計画できません"
  );
  const metaPlan = planSavedParserMigration({
    candidate: cursorCandidate(metadataCandidate),
    source: "hatena-blog",
    generatedArticles: [
      { ...metadataArticle, title: "海外大会のメタ分析" }
    ]
  });
  assert(
    metaPlan.method === "saved-state" &&
      metaPlan.outcome === "public-demoted",
    "メタ分析記事を公開対象外へ降格できません"
  );

  const noNetworkCalls: string[] = [];
  const savedRun = await runMigrationFixture({
    candidate: cursorCandidate(metadataCandidate),
    article: {
      ...metadataArticle,
      extractorVersion: MIGRATABLE_PREVIOUS_VERSION
    },
    blog,
    fetchText: async (url) => {
      noNetworkCalls.push(url);
      throw new Error(`保存情報移行で通信しました: ${url}`);
    }
  });
  const savedCandidate =
    savedRun.result.status.cursors["hatena-blog"].candidates[0];
  assert(
    noNetworkCalls.length === 0 &&
      savedCandidate.parserVersion === EXTRACTOR_VERSION &&
      savedCandidate.reevaluationMethod === "saved-state" &&
      savedCandidate.reevaluationStatus === "completed" &&
      savedRun.result.generatedArticles[0].extractorVersion ===
        EXTRACTOR_VERSION,
    "保存情報だけのparserVersion移行が不正です"
  );
  const onlyVersionChanged = {
    ...savedRun.result.generatedArticles[0],
    extractorVersion: MIGRATABLE_PREVIOUS_VERSION
  };
  assert(
    JSON.stringify(onlyVersionChanged) ===
      JSON.stringify({
        ...metadataArticle,
        extractorVersion: MIGRATABLE_PREVIOUS_VERSION
      }),
    "parserVersion移行だけで記事内容を変更しました"
  );
  assert(
    savedRun.beforeGenerated === savedRun.afterGenerated &&
      savedRun.beforeStatus === savedRun.afterStatus,
    "dry-runが記事JSONまたは状態JSONを変更しました"
  );

  const metaRun = await runMigrationFixture({
    candidate: cursorCandidate(metadataCandidate),
    article: {
      ...metadataArticle,
      title: "海外大会のメタ分析",
      extractorVersion: MIGRATABLE_PREVIOUS_VERSION
    },
    blog,
    fetchText: async (url) => {
      throw new Error(`メタ分析の保存情報判定で通信しました: ${url}`);
    }
  });
  assert(
    metaRun.result.generatedArticles.length === 0 &&
      metaRun.result.status.cursors["hatena-blog"].candidates[0]
        .reevaluationOutcome === "public-demoted",
    "メタ分析記事を安全に降格できません"
  );

  const fixtureUrl =
    "https://mountain0531.hatenablog.com/entry/2026/07/18/120000";
  const fixtureBlog = collectionStatus.hatenaBlogs.find(
    (entry) => entry.domain === "mountain0531.hatenablog.com"
  );
  assert(fixtureBlog, "fixtureブログがありません");
  const networkCalls: string[] = [];
  const networkRun = await runMigrationFixture({
    candidate: cursorCandidate({
      ...metadataCandidate,
      url: fixtureUrl,
      sourceArticleId: "fixture-network",
      contentFingerprint: null,
      targetGameResult: null,
      formatResult: null,
      seasonResult: null,
      teamResult: null,
      exclusionReason: null
    }),
    article: null,
    blog: fixtureBlog,
    fetchText: async (url, expected) => {
      networkCalls.push(url);
      if (url.endsWith("/robots.txt")) {
        return {
          ok: true,
          url,
          status: 200,
          contentType: "text/plain",
          text: "User-agent: *\nAllow: /\n"
        };
      }
      return {
        ok: true,
        url,
        status: 200,
        contentType: "text/html",
        text: articleHtml
      };
    }
  });
  assert(
    networkCalls.filter((url) => url === fixtureUrl).length === 1 &&
      networkRun.result.status.cursors["hatena-blog"].candidates[0]
        .reevaluationMethod === "network" &&
      networkRun.result.status.sources["hatena-blog"]
        .networkReevaluationCount === 1,
    "本文不足時だけのネットワーク再取得が不正です"
  );

  const unversionedCalls: string[] = [];
  const unversionedRun = await runMigrationFixture({
    candidate: {
      ...cursorCandidate({
        ...metadataCandidate,
        url: fixtureUrl,
        sourceArticleId: "fixture-unversioned",
        contentFingerprint: null,
        targetGameResult: null,
        formatResult: null,
        seasonResult: null,
        teamResult: null,
        exclusionReason: null
      }),
      parserVersion: undefined
    },
    article: null,
    blog: fixtureBlog,
    fetchText: async (url) => {
      unversionedCalls.push(url);
      if (url.endsWith("/robots.txt")) {
        return {
          ok: true,
          url,
          status: 200,
          contentType: "text/plain",
          text: "User-agent: *\nAllow: /\n"
        };
      }
      return {
        ok: true,
        url,
        status: 200,
        contentType: "text/html",
        text: articleHtml
      };
    }
  });
  const unversionedResult =
    unversionedRun.result.status.cursors["hatena-blog"].candidates[0];
  assert(
    unversionedCalls.filter((url) => url === fixtureUrl).length === 1 &&
      unversionedResult.previousParserVersion === null &&
      unversionedResult.parserVersion === EXTRACTOR_VERSION &&
      unversionedResult.reevaluationMethod === "network" &&
      unversionedResult.reevaluationStatus === "completed",
    "parserVersion未記録候補をネットワーク確認して移行できません"
  );

  const failureCalls: string[] = [];
  const failedRun = await runMigrationFixture({
    candidate: cursorCandidate({
      ...metadataCandidate,
      contentFingerprint: null
    }),
    article: {
      ...metadataArticle,
      extractorVersion: MIGRATABLE_PREVIOUS_VERSION
    },
    blog,
    fetchText: async (url) => {
      failureCalls.push(url);
      if (url.endsWith("/robots.txt")) {
        return {
          ok: true,
          url,
          status: 200,
          contentType: "text/plain",
          text: "User-agent: *\nAllow: /\n"
        };
      }
      return {
        ok: false,
        url,
        status: 503,
        reason: "http-503",
        permanent: false
      };
    }
  });
  assert(
    failureCalls.length === 2 &&
      failedRun.result.generatedArticles.some(
        (article) => article.id === metadataArticle.id
      ) &&
      failedRun.result.status.cursors["hatena-blog"].candidates[0]
        .reevaluationStatus === "pending" &&
      failedRun.result.status.cursors["hatena-blog"].candidates[0]
        .parserVersion === EXTRACTOR_VERSION,
    "一時的取得失敗で既存公開記事を削除しました"
  );

  const beforeReport = createBuildExtractionReport({
    manualArticles: [],
    generatedArticles: [metadataArticle],
    status: statusFixture({
      candidate: cursorCandidate(metadataCandidate),
      blog
    }) as CollectionStatus
  });
  const afterReport = createBuildExtractionReport({
    manualArticles: [],
    generatedArticles: savedRun.result.generatedArticles,
    status: savedRun.result.status
  });
  assert(
    beforeReport.legacyParserVersionCount === 1 &&
      beforeReport.plannedSavedStateReevaluationCount === 1 &&
      afterReport.legacyParserVersionCount === 0 &&
      afterReport.savedStateReevaluationCount === 1,
    "旧parserVersion残件または移行完了をレポートできません"
  );
  assert(
    [
      ...noNetworkCalls,
      ...networkCalls,
      ...unversionedCalls,
      ...failureCalls
    ].every(
      (url) =>
        !/pokesol|game8|gamewith/i.test(url)
    ),
    "許可されていない収集元へ通信しました"
  );

  console.log(
    "[ok] parserVersion保存情報移行・必要時通信・降格・判定保留を検証しました"
  );
}

main().catch((error) => {
  console.error("[fatal] parserVersion移行テストに失敗しました");
  console.error(error);
  process.exitCode = 1;
});
