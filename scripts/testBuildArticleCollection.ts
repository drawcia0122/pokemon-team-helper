import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import appMetaData from "@/data/appMeta.json";
import manualArticleData from "@/data/buildArticles.manual.json";
import pokemonData from "@/data/pokemon.json";
import {
  canAnalyzeBuildArticle,
  resolveArticleImport
} from "@/lib/articleImport";
import {
  isPokemonBuildArticleQuery,
  matchesBuildArticleQuery
} from "@/lib/buildArticleSearch";
import {
  isBuildArticleThumbnailSafe,
  resolveBuildArticleThumbnailState,
  validateBuildArticleThumbnail
} from "@/lib/buildArticleThumbnail";
import type {
  BuildArticle,
  GeneratedBuildArticle
} from "@/types/buildArticle";
import type { AppMeta, PokemonEntry } from "@/types/pokemon";
import { classifyBuildArticle } from "./build-article-collectors/classify";
import {
  collectBuildArticles,
  getScheduledRotationIndex,
  mergeCandidateCursor,
  selectCandidatesForRun
} from "./build-article-collectors/collector";
import { createMeaningfulCursorCommitState } from "./build-article-collectors/cursorCommitState";
import {
  applyFetchFailure,
  createOrUpdateGeneratedArticle,
  findGeneratedMatch,
  matchesManualArticle
} from "./build-article-collectors/deduplicate";
import {
  createPokemonResolver,
  extractArticleFromHtml
} from "./build-article-collectors/extract";
import {
  SafeHttpClient,
  assertAllowedUrl,
  isAllowedByRobots,
  isPrivateIpAddress
} from "./build-article-collectors/http";
import {
  normalizeRegulationId,
  normalizeSeasonId,
  normalizeUrl
} from "./build-article-collectors/normalize";
import {
  parseNoteArticle,
  parseNoteCandidateList
} from "./build-article-collectors/note";
import {
  parsePokesolArticle,
  parsePokesolCandidateList
} from "./build-article-collectors/pokesol";
import { extractBuildArticleThumbnail } from "./build-article-collectors/thumbnail";
import { EXTRACTOR_VERSION } from "./build-article-collectors/types";
import { SOURCE_REGISTRY } from "./build-article-collectors/sourceRegistry";
import type {
  FetchResult,
  SourceCollectionCursor,
  SourceConfig
} from "./build-article-collectors/types";
import {
  validateGeneratedBuildArticle,
  validateGeneratedCollection
} from "./build-article-collectors/validate";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrows(callback: () => unknown, message: string): void {
  try {
    callback();
  } catch {
    return;
  }
  throw new Error(message);
}

const appMeta = appMetaData as AppMeta;
const pokemon = pokemonData as PokemonEntry[];
const manualArticles = manualArticleData as BuildArticle[];
const fixtureDir = path.join(
  process.cwd(),
  "scripts/fixtures/build-article-collection"
);

async function fixture(name: string): Promise<string> {
  return readFile(path.join(fixtureDir, name), "utf8");
}

function replaceTeam(
  html: string,
  names: string[]
): string {
  return html.replace(
    /<h2>個体紹介<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
    `<h2>個体紹介</h2>${names
      .map((name) => `<h3>${name}</h3>`)
      .join("")}<h2>まとめ</h2>`
  );
}

async function main(): Promise<void> {
  const [noteTag, noteArticle, pokesolList, pokesolArticle] =
    await Promise.all([
      fixture("note-tag.html"),
      fixture("note-article.html"),
      fixture("pokesol-list.html"),
      fixture("pokesol-article.html")
    ]);

  const noteCandidates = parseNoteCandidateList(noteTag);
  const pokesolCandidates = parsePokesolCandidateList(pokesolList);
  assert(
    noteCandidates.length === 1 &&
      noteCandidates[0].url ===
        "https://note.com/fixture_author/n/nfixture001",
    "noteの候補URLを正規化・重複排除できません"
  );
  assert(
    pokesolCandidates.length === 1 &&
      pokesolCandidates[0].url ===
        "https://pokesol.app/u/fixture_author/articles/fixture002",
    "Pokesolの候補URLを正規化・重複排除できません"
  );

  const noteOutcome = parseNoteArticle({
    html: noteArticle,
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  const pokesolOutcome = parsePokesolArticle({
    html: pokesolArticle,
    url: pokesolCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(noteOutcome.status === "accepted", "noteの正常記事を抽出できません");
  assert(
    pokesolOutcome.status === "accepted",
    "Pokesol fixtureの正常記事を抽出できません"
  );
  assert(
    noteOutcome.article.collectionCompleteness === "complete" &&
      noteOutcome.article.pokemonSlugs.length === 6 &&
      noteOutcome.article.builderSeasonId === "season-m4" &&
      noteOutcome.article.regulationId === "M-B" &&
      noteOutcome.article.battleFormat === "single",
    "note記事の6体・シーズン・ルール・形式が不正です"
  );
  assert(
    noteOutcome.article.thumbnail?.source === "structured-data" &&
      noteOutcome.article.thumbnail.width === 1200 &&
      noteOutcome.article.thumbnail.height === 630,
    "記事専用の構造化データ画像を抽出できません"
  );
  assert(
    pokesolOutcome.article.builderSeasonId === "season-m3" &&
      pokesolOutcome.article.regulationId === "M-B" &&
      pokesolOutcome.article.battleFormat === "double",
    "Pokesol記事の正規化結果が不正です"
  );
  const numberedTeam = parseNoteArticle({
    html: noteArticle
      .replace("個体紹介", "パーティ紹介")
      .replace("<h3>フシギダネ</h3>", "<h3>1. フシギダネ</h3>")
      .replace("<h3>リザードン</h3>", "<h3>2. リザードン</h3>")
      .replace("<h3>カメックス</h3>", "<h3>3. カメックス</h3>")
      .replace("<h3>ピカチュウ</h3>", "<h3>4. ピカチュウ</h3>")
      .replace("<h3>ゲンガー</h3>", "<h3>5. ゲンガー</h3>")
      .replace("<h3>カイリュー</h3>", "<h3>6. カイリュー</h3>"),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    numberedTeam.status === "accepted" &&
      numberedTeam.article.collectionCompleteness === "complete" &&
      numberedTeam.article.teamExtractionMethod === "numbered-items",
    "番号付きの明示的なパーティ紹介から6体を抽出できません"
  );

  for (const names of [
    ["フシギダネ", "リザードン", "カメックス", "ピカチュウ", "ゲンガー"],
    [
      "フシギダネ",
      "リザードン",
      "カメックス",
      "ピカチュウ",
      "ゲンガー",
      "カイリュー",
      "ミュウ"
    ],
    [
      "フシギダネ",
      "リザードン",
      "カメックス",
      "ピカチュウ",
      "ゲンガー",
      "ゲンガー"
    ],
    [
      "フシギダネ",
      "リザードン",
      "カメックス",
      "ピカチュウ",
      "ゲンガー",
      "存在しないポケモン"
    ]
  ]) {
    const outcome = parseNoteArticle({
      html: replaceTeam(noteArticle, names),
      url: noteCandidates[0].url,
      appMeta,
      pokemon
    });
    assert(
      outcome.status === "accepted" &&
        outcome.article.collectionCompleteness === "metadata-only" &&
        outcome.article.pokemonSlugs.length === 0 &&
        outcome.article.missingFields.length === 1 &&
        outcome.article.missingFields[0] === "pokemonSlugs",
      `${names.length}体または不正なチームを記事情報のみで保持できません`
    );
  }

  const tableTeam = parseNoteArticle({
    html: noteArticle.replace(
      /<h2>個体紹介<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
      `<h2>構築メンバー</h2>
       <table><tr><th>ポケモン</th><th>役割</th></tr>
       ${["フシギダネ", "リザードン", "カメックス", "ピカチュウ", "ゲンガー", "カイリュー"]
         .map((name) => `<tr><td>${name}</td><td>fixture</td></tr>`)
         .join("")}</table><h2>まとめ</h2>`
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    tableTeam.status === "accepted" &&
      tableTeam.article.collectionCompleteness === "complete" &&
      tableTeam.article.teamExtractionMethod === "table",
    "ポケモン列のある表から6体を抽出できません"
  );

  const paragraphTeam = parseNoteArticle({
    html: noteArticle.replace(
      /<h2>個体紹介<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
      `<h2>個体紹介</h2>${[
        "フシギダネ",
        "リザードン",
        "カメックス",
        "ピカチュウ",
        "ゲンガー",
        "カイリュー"
      ]
        .map((name) => `<p>${name}</p>`)
        .join("")}<h2>まとめ</h2>`
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    paragraphTeam.status === "accepted" &&
      paragraphTeam.article.collectionCompleteness === "complete" &&
      paragraphTeam.article.teamExtractionMethod === "section-paragraphs",
    "個体紹介直後の短い6段落から6体を抽出できません"
  );

  const figcaptionTeam = parseNoteArticle({
    html: noteArticle.replace(
      /<h2>個体紹介<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
      `<h2>最終構築</h2>${[
        "フシギダネ",
        "リザードン",
        "カメックス",
        "ピカチュウ",
        "ゲンガー",
        "カイリュー"
      ]
        .map(
          (name, index) =>
            `<figure><img src="/fixture-${index}.png" alt=""><figcaption>${name}</figcaption></figure>`
        )
        .join("")}<h2>まとめ</h2>`
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    figcaptionTeam.status === "accepted" &&
      figcaptionTeam.article.collectionCompleteness === "complete" &&
      figcaptionTeam.article.teamExtractionMethod === "image-metadata",
    "公開figcaptionから6体を抽出できません"
  );

  const embeddedAltTeam = parseNoteArticle({
    html: noteArticle.replace(
      /<h2>個体紹介<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
      `<h2>最終構築</h2><script type="application/json">${JSON.stringify({
        images: [
          { altText: "フシギダネ" },
          { altText: "リザードン" },
          { altText: "カメックス" },
          { altText: "ピカチュウ" },
          { altText: "ゲンガー" },
          { altText: "カイリュー" }
        ]
      })}</script><h2>まとめ</h2>`
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    embeddedAltTeam.status === "accepted" &&
      embeddedAltTeam.article.collectionCompleteness === "complete" &&
      embeddedAltTeam.article.teamExtractionMethod ===
        "embedded-image-metadata",
    "note埋め込みJSONの公開代替テキストから6体を抽出できません"
  );

  const earlyNames = [
    "ミュウ",
    "ルカリオ",
    "バンギラス",
    "ハッサム",
    "ガブリアス",
    "ニンフィア"
  ];
  const finalNames = [
    "フシギダネ",
    "リザードン",
    "カメックス",
    "ピカチュウ",
    "ゲンガー",
    "カイリュー"
  ];
  const sectionHeadings = (label: string, names: string[]) =>
    `<h2>${label}</h2>${names.map((name) => `<h3>${name}</h3>`).join("")}`;
  const multipleTeamHtml = noteArticle.replace(
    /<h2>個体紹介<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
    `${sectionHeadings("序盤構築", earlyNames)}
     ${sectionHeadings("最終構築", finalNames)}
     <h2>まとめ</h2>`
  );
  const finalPriority = parseNoteArticle({
    html: multipleTeamHtml,
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    finalPriority.status === "accepted" &&
      finalPriority.article.collectionCompleteness === "complete" &&
      finalPriority.article.pokemonSlugs[0] === "bulbasaur",
    "序盤構築より最終構築を優先できません"
  );
  const unresolvedFinal = parseNoteArticle({
    html: noteArticle.replace(
      /<h2>個体紹介<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
      `${sectionHeadings("序盤構築", earlyNames)}
       ${sectionHeadings("最終構築", [
         "ウーラオス",
         "リザードン",
         "カメックス",
         "ピカチュウ",
         "ゲンガー",
         "カイリュー"
       ])}
       <h2>まとめ</h2>`
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    unresolvedFinal.status === "accepted" &&
      unresolvedFinal.article.collectionCompleteness === "metadata-only" &&
      unresolvedFinal.article.teamExtractionIssue ===
        "team-unresolved-pokemon",
    "最終構築が曖昧な記事を序盤構築でcompleteへ誤昇格しました"
  );

  const equallyRanked = parseNoteArticle({
    html: noteArticle.replace(
      /<h2>個体紹介<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
      `${sectionHeadings("最終構築", earlyNames)}
       ${sectionHeadings("最終構築", finalNames)}
       <h2>まとめ</h2>`
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    equallyRanked.status === "accepted" &&
      equallyRanked.article.collectionCompleteness === "metadata-only" &&
      equallyRanked.article.teamExtractionIssue ===
        "multiple-equally-ranked-teams",
    "同順位の異なる6体を推測せずmetadata-onlyにできません"
  );

  const imageOnly = parseNoteArticle({
    html: noteArticle.replace(
      /<h2>個体紹介<\/h2>[\s\S]*?<h2>まとめ<\/h2>/,
      `<h2>最終構築</h2>
       <figure><img src="/team.png" alt="最終構築のレンタルチーム画像"><figcaption>パーティ画像</figcaption></figure>
       <h2>まとめ</h2>`
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    imageOnly.status === "accepted" &&
      imageOnly.article.collectionCompleteness === "metadata-only" &&
      imageOnly.article.teamExtractionIssue === "team-unresolved-pokemon",
    "画像だけのチームを推測せずmetadata-onlyにできません"
  );

  const unresolvedForm = parseNoteArticle({
    html: replaceTeam(noteArticle, [
      "ウーラオス",
      "リザードン",
      "カメックス",
      "ピカチュウ",
      "ゲンガー",
      "カイリュー"
    ]),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    unresolvedForm.status === "accepted" &&
      unresolvedForm.article.collectionCompleteness === "metadata-only" &&
      unresolvedForm.article.teamExtractionIssue === "team-unresolved-pokemon",
    "フォルム不明の名前を推測せずmetadata-onlyにできません"
  );

  const resolvePokemon = createPokemonResolver(pokemon);
  assert(
    resolvePokemon("リザY") === "charizard-mega-y" &&
      resolvePokemon("水ウーラ") === "urshifu-rapid-strike" &&
      resolvePokemon("暁ガチグマ") === "ursaluna-bloodmoon" &&
      resolvePokemon("アローラキュウコン") === "ninetales-alola",
    "明示的で一意な別名を正確なslugへ解決できません"
  );
  assert(
    resolvePokemon("ウーラオス") === null,
    "フォルムを特定できない曖昧名を解決してしまいました"
  );

  const conflict = parseNoteArticle({
    html: noteArticle.replace(
      "レギュレーションM-B",
      "レギュレーションM-A"
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    conflict.status === "excluded" &&
      conflict.reason === "season-regulation-conflict",
    "シーズンとレギュレーションの矛盾を拒否できません"
  );
  const paidArticle = parseNoteArticle({
    html: noteArticle.replace(
      "<article data-name=\"body\">",
      "<article data-name=\"body\"><p>ここから先は有料</p>"
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    paidArticle.status === "excluded" &&
      paidArticle.reason === "paid-or-restricted-content",
    "有料記事内の6体を自動公開対象から除外できません"
  );
  const foreignCanonical = parseNoteArticle({
    html: noteArticle.replaceAll(
      "https://note.com/fixture_author/n/nfixture001",
      "https://example.com/foreign"
    ),
    url: noteCandidates[0].url,
    appMeta,
    pokemon
  });
  assert(
    foreignCanonical.status === "excluded" &&
      foreignCanonical.reason === "invalid-canonical-url",
    "許可外ドメインのcanonical URLを拒否できません"
  );

  for (const [label, reason] of [
    ["ポケモンGO 構築", "pokemon-go"],
    ["ポケモンカード デッキレシピ", "pokemon-card"],
    ["ポケモンSV 構築", "other-game-sv"],
    ["海外大会のメタ分析", "not-concrete-build-article"]
  ] as const) {
    const classification = classifyBuildArticle({
      title: label,
      text:
        reason === "not-concrete-build-article"
          ? "ポケモンチャンピオンズ M-4 シングル 構築使用率の分析"
          : label,
      tags: [],
      battleFormat: "single",
      builderSeasonId: "season-m4",
      regulationId: "M-B",
      hasExplicitTeamSection: false,
      hasExactTeam: false
    });
    assert(
      !classification.accepted && classification.reason === reason,
      `${label}を対象外にできません`
    );
  }

  assert(
    ["M1", "M-2", "シーズンM-3", "Season M-4"].every(
      (label, index) =>
        normalizeSeasonId(label, appMeta) === `season-m${index + 1}`
    ) &&
      normalizeRegulationId("Reg.M-A") === "M-A" &&
      normalizeRegulationId("レギュレーション M－B") === "M-B",
    "M-1〜M-4またはM-A／M-Bの表記揺れを正規化できません"
  );
  for (const [seasonLabel, regulationLabel] of [
    ["M-1", "M-A"],
    ["M-2", "M-A"],
    ["M-3", "M-B"],
    ["M-4", "M-B"]
  ]) {
    const normalizedArticle = parseNoteArticle({
      html: noteArticle
        .replace(/M-4/g, seasonLabel)
        .replace(/M-B/g, regulationLabel),
      url: noteCandidates[0].url,
      appMeta,
      pokemon
    });
    assert(
      normalizedArticle.status === "accepted" &&
        normalizedArticle.article.builderSeasonId ===
          `season-m${seasonLabel.at(-1)}` &&
        normalizedArticle.article.regulationId === regulationLabel,
      `${seasonLabel}と${regulationLabel}を記事から抽出できません`
    );
  }
  assert(
    normalizeUrl(
      "https://note.com/fixture_author/n/nfixture001/?utm_source=x#team"
    ) === "https://note.com/fixture_author/n/nfixture001",
    "URLの追跡情報・末尾スラッシュを除去できません"
  );

  const validThumbnail = {
    url: "https://assets.st-note.com/production/uploads/images/123456789/cover.webp",
    source: "og-image" as const,
    alt: "fixture記事のサムネイル",
    width: 1200,
    height: 630
  };
  assert(
    isBuildArticleThumbnailSafe(validThumbnail, "note") &&
      validateBuildArticleThumbnail(null, "note").length === 0,
    "正常なサムネイルまたはthumbnailなしを検証できません"
  );
  for (const invalid of [
    { ...validThumbnail, url: "http://assets.st-note.com/production/uploads/images/1/a.png" },
    { ...validThumbnail, url: "data:image/png;base64,AAAA" },
    { ...validThumbnail, url: "https://example.com/production/uploads/images/1/a.png" },
    { ...validThumbnail, url: "https://assets.st-note.com/favicon.png" },
    { ...validThumbnail, url: "https://assets.st-note.com/production/uploads/images/1/common-logo.png" },
    { ...validThumbnail, url: "https://assets.st-note.com/production/uploads/images/1/avatar.png" },
    { ...validThumbnail, width: 1, height: 1 }
  ]) {
    assert(
      validateBuildArticleThumbnail(invalid, "note").length > 0,
      `不正なサムネイルを拒否できません: ${invalid.url}`
    );
  }
  const ogOnly = extractBuildArticleThumbnail({
    html: `<meta property="og:image" content="${validThumbnail.url}">`,
    origin: "note",
    title: "OGP fixture"
  });
  assert(
    ogOnly.thumbnail?.source === "og-image",
    "og:imageを抽出できません"
  );
  const twitterOnly = extractBuildArticleThumbnail({
    html: `<meta name="twitter:image" content="${validThumbnail.url}">`,
    origin: "note",
    title: "Twitter fixture"
  });
  assert(
    twitterOnly.thumbnail?.source === "twitter-image",
    "twitter:imageへフォールバックできません"
  );
  const priorityThumbnail = extractBuildArticleThumbnail({
    html: `<script type="application/ld+json">${JSON.stringify({
      "@type": "BlogPosting",
      image: {
        url: "https://assets.st-note.com/production/uploads/images/123456789/structured.png"
      }
    })}</script><meta property="og:image" content="${validThumbnail.url}">`,
    origin: "note",
    title: "priority fixture"
  });
  assert(
    priorityThumbnail.thumbnail?.source === "structured-data" &&
      priorityThumbnail.thumbnail.url.endsWith("/structured.png"),
    "構造化データをOGPより優先できません"
  );
  const rejectedThumbnail = extractBuildArticleThumbnail({
    html: `<meta property="og:image" content="https://assets.st-note.com/favicon.png">`,
    origin: "note",
    title: "reject fixture"
  });
  assert(
    rejectedThumbnail.thumbnail === null &&
      rejectedThumbnail.rejectedCount === 1 &&
      resolveBuildArticleThumbnailState({
        thumbnail: null,
        origin: "note"
      }) === "fallback-missing",
    "不正画像の拒否またはフォールバック判定が不正です"
  );

  const previousCursor: SourceCollectionCursor = {
    nextIndex: 1,
    candidates: [
      {
        url: "https://note.com/a/n/nold001",
        sourceArticleId: "nold001",
        firstSeenAt: "2026-07-17T00:00:00.000Z",
        lastSeenAt: "2026-07-17T00:00:00.000Z",
        lastCheckedAt: "2026-07-17T00:00:00.000Z"
      },
      {
        url: "https://note.com/b/n/nold002",
        sourceArticleId: "nold002",
        firstSeenAt: "2026-07-17T00:00:00.000Z",
        lastSeenAt: "2026-07-17T00:00:00.000Z",
        lastCheckedAt: "2026-07-17T00:00:00.000Z"
      }
    ]
  };
  const mergedCursor = mergeCandidateCursor({
    previous: previousCursor,
    discovered: [
      {
        source: "note",
        url: "https://note.com/a/n/nold001",
        sourceArticleId: "nold001"
      },
      {
        source: "note",
        url: "https://note.com/c/n/nnew003",
        sourceArticleId: "nnew003"
      },
      {
        source: "note",
        url: "https://note.com/c/n/nnew003",
        sourceArticleId: "nnew003"
      }
    ],
    generatedArticles: [],
    source: "note",
    nowIso: "2026-07-18T03:00:00.000Z"
  });
  assert(
    mergedCursor.cursor.candidates.length === 3 &&
      mergedCursor.newUrls.size === 1,
    "候補URLを永続カーソル上で重複排除できません"
  );
  const selectedWithNewPriority = selectCandidatesForRun({
    cursor: mergedCursor.cursor,
    newUrls: mergedCursor.newUrls,
    maxFetches: 2,
    source: "note"
  });
  assert(
    selectedWithNewPriority.candidates[0]?.url ===
      "https://note.com/c/n/nnew003",
    "新規候補を既知候補より優先できません"
  );
  const rotatedSelection = selectCandidatesForRun({
    cursor: {
      nextIndex: 0,
      candidates: mergedCursor.cursor.candidates.map((candidate) => ({
        ...candidate,
        lastCheckedAt: "2026-07-18T03:00:00.000Z"
      }))
    },
    newUrls: new Set(),
    maxFetches: 1,
    source: "note"
  });
  assert(
    rotatedSelection.candidates.length === 1 &&
      rotatedSelection.nextIndex === 1,
    "次回実行へ巡回位置を進められません"
  );
  const scheduledIndex = getScheduledRotationIndex({
    now: new Date("2026-07-18T03:17:00.000Z"),
    candidateCount: 49,
    maxFetches: 30
  });
  const nextScheduledIndex = getScheduledRotationIndex({
    now: new Date("2026-07-18T03:47:00.000Z"),
    candidateCount: 49,
    maxFetches: 30
  });
  assert(
    scheduledIndex !== nextScheduledIndex,
    "確認済み候補の定期巡回位置を30分ごとに分散できません"
  );
  const routineBefore = {
    cursors: {
      note: previousCursor,
      pokesol: { nextIndex: 0, candidates: [] }
    }
  };
  const routineAfter = {
    cursors: {
      note: {
        nextIndex: 0,
        candidates: previousCursor.candidates.map((candidate) => ({
          ...candidate,
          lastSeenAt: "2026-07-18T03:47:00.000Z",
          lastCheckedAt: "2026-07-18T03:47:00.000Z"
        }))
      },
      pokesol: { nextIndex: 0, candidates: [] }
    }
  };
  assert(
    JSON.stringify(createMeaningfulCursorCommitState(routineBefore)) ===
      JSON.stringify(createMeaningfulCursorCommitState(routineAfter)),
    "単なる確認時刻や定期巡回位置の更新をコミット対象にしました"
  );
  const meaningfulAfter = {
    cursors: {
      ...routineAfter.cursors,
      note: {
        ...routineAfter.cursors.note,
        candidates: [
          ...routineAfter.cursors.note.candidates,
          {
            url: "https://note.com/new/n/nnew004",
            sourceArticleId: "nnew004",
            firstSeenAt: "2026-07-18T03:47:00.000Z",
            lastSeenAt: "2026-07-18T03:47:00.000Z",
            lastCheckedAt: null
          }
        ]
      }
    }
  };
  assert(
    JSON.stringify(createMeaningfulCursorCommitState(routineBefore)) !==
      JSON.stringify(createMeaningfulCursorCommitState(meaningfulAfter)),
    "新規候補の発見を意味のあるカーソル差分として検出できません"
  );

  const created = createOrUpdateGeneratedArticle({
    source: "note",
    sourceUrl: noteCandidates[0].url,
    article: noteOutcome.article,
    existing: null,
    nowIso: "2026-07-18T03:00:00.000Z"
  }).article;
  assert(
    findGeneratedMatch(
      { ...noteOutcome.article, title: "更新タイトル" },
      [created]
    )?.id === created.id,
    "同じcanonical URLの記事更新を既存IDへ結び付けられません"
  );
  assert(
    findGeneratedMatch(
      {
        ...noteOutcome.article,
        canonicalUrl:
          "https://note.com/fixture_author/n/nfixture001?utm_source=x"
      },
      [created]
    )?.id === created.id,
    "正規化URLの重複を検出できません"
  );
  assert(
    findGeneratedMatch(
      {
        ...noteOutcome.article,
        canonicalUrl: "https://note.com/another_author/n/nother001",
        sourceArticleId: created.sourceArticleId
      },
      [created]
    )?.id === created.id,
    "収集元の記事ID重複を検出できません"
  );
  const updated = createOrUpdateGeneratedArticle({
    source: "note",
    sourceUrl: noteCandidates[0].url,
    article: { ...noteOutcome.article, title: "更新タイトル" },
    existing: created,
    nowIso: "2026-07-18T04:00:00.000Z"
  });
  assert(
    updated.change === "updated" &&
      updated.article.id === created.id &&
      updated.article.title === "更新タイトル",
    "同じURLの記事タイトル更新を安定IDのまま反映できません"
  );
  const retainedThumbnail = createOrUpdateGeneratedArticle({
    source: "note",
    sourceUrl: noteCandidates[0].url,
    article: { ...noteOutcome.article, thumbnail: null },
    existing: created,
    nowIso: "2026-07-18T04:10:00.000Z"
  });
  assert(
    retainedThumbnail.article.thumbnail?.url === created.thumbnail?.url,
    "一時的な画像抽出失敗で既存thumbnailを削除しました"
  );
  const changedThumbnail = createOrUpdateGeneratedArticle({
    source: "note",
    sourceUrl: noteCandidates[0].url,
    article: {
      ...noteOutcome.article,
      thumbnail: {
        ...noteOutcome.article.thumbnail!,
        url: "https://assets.st-note.com/production/uploads/images/123456789/changed.png"
      }
    },
    existing: created,
    nowIso: "2026-07-18T04:20:00.000Z"
  });
  assert(
    changedThumbnail.change === "updated" &&
      changedThumbnail.article.id === created.id &&
      changedThumbnail.article.contentFingerprint !==
        created.contentFingerprint,
    "画像だけの変更を同じIDの内容差分として検出できません"
  );
  const unchanged = createOrUpdateGeneratedArticle({
    source: "note",
    sourceUrl: noteCandidates[0].url,
    article: noteOutcome.article,
    existing: created,
    nowIso: "2026-07-18T04:30:00.000Z"
  });
  assert(
    unchanged.change === "unchanged" &&
      JSON.stringify(unchanged.article) === JSON.stringify(created),
    "内容差分のない記事で生成JSON用データを変更しました"
  );
  const extractorMigrated = createOrUpdateGeneratedArticle({
    source: "note",
    sourceUrl: noteCandidates[0].url,
    article: noteOutcome.article,
    existing: { ...created, extractorVersion: "1.0.0" },
    nowIso: "2026-07-18T04:45:00.000Z"
  });
  assert(
    extractorMigrated.change === "updated" &&
      extractorMigrated.article.extractorVersion === EXTRACTOR_VERSION,
    "抽出器の更新を内容変更なしの記事へ記録できません"
  );

  assert(
    matchesManualArticle(
      {
        ...noteOutcome.article,
        canonicalUrl: manualArticles[0].url
      },
      manualArticles
    ),
    "手動記事のcanonical URLを優先できません"
  );
  assert(
    applyFetchFailure(
      applyFetchFailure(
        applyFetchFailure(created, { permanent: false }),
        { permanent: false }
      ),
      { permanent: false }
    ).status === "temporarily-unavailable" &&
      applyFetchFailure(created, { permanent: true }).status === "removed",
    "連続取得失敗または恒久エラーの状態を更新できません"
  );

  assert(
    validateGeneratedBuildArticle(created, { appMeta, pokemon }).length === 0,
    "正常な生成記事が検証を通りません"
  );
  const metadataGenerated = createOrUpdateGeneratedArticle({
    source: "note",
    sourceUrl: noteCandidates[0].url,
    article: unresolvedForm.article,
    existing: null,
    nowIso: "2026-07-18T05:00:00.000Z"
  }).article;
  assert(
    metadataGenerated.thumbnail !== null &&
      validateGeneratedBuildArticle(metadataGenerated, {
        appMeta,
        pokemon
      }).length === 0,
    "metadata-only記事の安全なthumbnailを許可できません"
  );
  assert(
    validateGeneratedCollection([created], manualArticles, {
      appMeta,
      pokemon
    }).length === 0,
    "正常な生成記事一覧が検証を通りません"
  );
  assert(
    created.summary.length <= 120 &&
      !Object.prototype.hasOwnProperty.call(created, "html") &&
      !Object.prototype.hasOwnProperty.call(created, "body"),
    "紹介文上限または外部本文非保存の条件を満たしません"
  );

  const metadataPublicArticle: BuildArticle = {
    ...manualArticles[0],
    id: "metadata-only-fixture",
    title: "ピカチュウ入りと明記しない構築記事",
    pokemonSlugs: [],
    collectionCompleteness: "metadata-only"
  };
  const pokemonLabels = Object.fromEntries(
    pokemon.map((entry) => [entry.slug, entry.nameJa])
  );
  assert(
    isPokemonBuildArticleQuery("ピカチュウ", pokemonLabels) &&
      !matchesBuildArticleQuery(
        metadataPublicArticle,
        "ピカチュウ",
        pokemonLabels,
        {},
        {}
      ),
    "metadata-only記事をポケモン名検索へ含めてしまいました"
  );
  assert(
    matchesBuildArticleQuery(
      metadataPublicArticle,
      "構築記事",
      pokemonLabels,
      {},
      {}
    ),
    "metadata-only記事を通常キーワードで検索できません"
  );
  assert(
    !canAnalyzeBuildArticle(metadataPublicArticle) &&
    resolveArticleImport(
      metadataPublicArticle.id,
      [metadataPublicArticle],
      pokemon
    ).status === "error",
    "metadata-only記事に分析リンクまたは取り込みを許可してしまいました"
  );
  assert(
    canAnalyzeBuildArticle(manualArticles[0]),
    "complete相当の手動記事を分析対象にできません"
  );

  assert(
    SOURCE_REGISTRY.pokesol.automationAllowed === false,
    "利用規約で禁止されたPokesolライブ収集が有効です"
  );
  assert(isPrivateIpAddress("127.0.0.1"), "loopback IPを拒否できません");
  assert(isPrivateIpAddress("192.168.1.1"), "private IPを拒否できません");
  assert(!isPrivateIpAddress("8.8.8.8"), "公開IPを誤って拒否しました");
  expectThrows(
    () => assertAllowedUrl("http://note.com/x", ["note.com"]),
    "HTTP URLを拒否できません"
  );
  expectThrows(
    () => assertAllowedUrl("https://127.0.0.1/x", ["note.com"]),
    "IP直指定を拒否できません"
  );
  assert(
    !isAllowedByRobots(
      "User-agent: *\nDisallow: /search\nAllow: /",
      "https://note.com/search"
    ) &&
      isAllowedByRobots(
        "User-agent: *\nDisallow: /search\nAllow: /",
        "https://note.com/hashtag/test"
      ),
    "robots.txtの最長一致を判定できません"
  );

  const httpConfig: SourceConfig = {
    ...SOURCE_REGISTRY.note,
    discoveryUrls: ["https://note.com/fixture"],
    requestDelayMs: 0,
    retries: 0,
    maxResponseBytes: 100
  };
  const redirectedClient = new SafeHttpClient(httpConfig, {
    ensurePublicHost: async () => {},
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/private" }
      })
  });
  const redirectResult = await redirectedClient.fetchText(
    "https://note.com/fixture",
    "html"
  );
  assert(
    !redirectResult.ok && redirectResult.reason === "blocked-redirect",
    "許可外ドメインへのリダイレクトを拒否できません"
  );
  const typeClient = new SafeHttpClient(httpConfig, {
    ensurePublicHost: async () => {},
    fetchImpl: async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" }
      })
  });
  const typeResult = await typeClient.fetchText(
    "https://note.com/fixture",
    "html"
  );
  assert(
    !typeResult.ok && typeResult.reason === "unsupported-content-type",
    "HTML以外のContent-Typeを拒否できません"
  );

  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "pokemon-build-collection-")
  );
  try {
    const dataDir = path.join(temporaryRoot, "data");
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(dataDir, { recursive: true })
    );
    await Promise.all([
      writeFile(
        path.join(dataDir, "appMeta.json"),
        JSON.stringify(appMeta),
        "utf8"
      ),
      writeFile(
        path.join(dataDir, "pokemon.json"),
        JSON.stringify(pokemon),
        "utf8"
      ),
      writeFile(
        path.join(dataDir, "buildArticles.manual.json"),
        JSON.stringify(manualArticles),
        "utf8"
      ),
      writeFile(
        path.join(dataDir, "buildArticles.generated.json"),
        "[]\n",
        "utf8"
      ),
      writeFile(
        path.join(dataDir, "buildArticleCollectionStatus.json"),
        "{}\n",
        "utf8"
      )
    ]);

    const originalGenerated = await readFile(
      path.join(dataDir, "buildArticles.generated.json"),
      "utf8"
    );
    const originalStatus = await readFile(
      path.join(dataDir, "buildArticleCollectionStatus.json"),
      "utf8"
    );
    const mockResponses = new Map<string, FetchResult>([
      [
        "https://note.com/robots.txt",
        {
          ok: true,
          url: "https://note.com/robots.txt",
          status: 200,
          contentType: "text/plain",
          text: "User-agent: *\nAllow: /\n"
        }
      ],
      [
        "https://note.com/fixture-tag",
        {
          ok: true,
          url: "https://note.com/fixture-tag",
          status: 200,
          contentType: "text/html",
          text: noteTag
        }
      ],
      [
        noteCandidates[0].url,
        {
          ok: true,
          url: noteCandidates[0].url,
          status: 200,
          contentType: "text/html",
          text: noteArticle
        }
      ]
    ]);
    const mockClient = {
      async fetchText(value: string): Promise<FetchResult> {
        return (
          mockResponses.get(value) ?? {
            ok: false,
            url: value,
            status: 404,
            reason: "http-404",
            permanent: true
          }
        );
      }
    };
    const testConfig: SourceConfig = {
      ...SOURCE_REGISTRY.note,
      discoveryUrls: ["https://note.com/fixture-tag"],
      maxCandidates: 10,
      maxArticleFetches: 10,
      requestDelayMs: 0,
      retries: 0
    };
    const dryRun = await collectBuildArticles({
      dryRun: true,
      rootDir: temporaryRoot,
      sourceConfigs: [testConfig],
      clients: { note: mockClient },
      now: new Date("2026-07-18T03:00:00.000Z")
    });
    assert(
      dryRun.generatedArticles.length === 1 &&
        dryRun.status.sources.note.publishedCount === 1 &&
        dryRun.status.sources.note.thumbnailFoundCount === 1 &&
        dryRun.status.cursors.note.candidates.length === 1 &&
        !dryRun.wroteFiles,
      "fixture dry-runで正常記事を収集できません"
    );
    assert(
      (await readFile(
        path.join(dataDir, "buildArticles.generated.json"),
        "utf8"
      )) === originalGenerated,
      "dry-runで生成JSONが変更されました"
    );
    assert(
      (await readFile(
        path.join(dataDir, "buildArticleCollectionStatus.json"),
        "utf8"
      )) === originalStatus,
      "dry-runで永続カーソルが変更されました"
    );

    const actualRun = await collectBuildArticles({
      dryRun: false,
      rootDir: temporaryRoot,
      sourceConfigs: [testConfig],
      clients: { note: mockClient },
      now: new Date("2026-07-18T03:30:00.000Z")
    });
    const persistedStatus = JSON.parse(
      await readFile(
        path.join(dataDir, "buildArticleCollectionStatus.json"),
        "utf8"
      )
    ) as { cursors?: { note?: SourceCollectionCursor } };
    assert(
      actualRun.wroteFiles &&
        actualRun.status.sources.note.remainingCount === 0 &&
        persistedStatus.cursors?.note?.candidates.length === 1 &&
        persistedStatus.cursors.note.candidates[0].lastCheckedAt ===
          "2026-07-18T03:30:00.000Z",
      "通常収集で永続カーソルを保存できません"
    );

    const failureCursor: SourceCollectionCursor = {
      nextIndex: 0,
      candidates: [
        {
          url: "https://note.com/fixture_author/n/nfailure001",
          sourceArticleId: "nfailure001",
          firstSeenAt: "2026-07-17T00:00:00.000Z",
          lastSeenAt: "2026-07-17T00:00:00.000Z",
          lastCheckedAt: "2026-07-17T00:00:00.000Z"
        },
        {
          url: "https://note.com/fixture_author/n/nsuccess002",
          sourceArticleId: "nsuccess002",
          firstSeenAt: "2026-07-17T00:00:00.000Z",
          lastSeenAt: "2026-07-17T00:00:00.000Z",
          lastCheckedAt: "2026-07-17T00:00:00.000Z"
        }
      ]
    };
    await writeFile(
      path.join(dataDir, "buildArticleCollectionStatus.json"),
      `${JSON.stringify(
        {
          cursors: {
            note: failureCursor,
            pokesol: { nextIndex: 0, candidates: [] }
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    const failureTag = `<!doctype html><a href="/fixture_author/n/nfailure001">失敗候補</a>
      <a href="/fixture_author/n/nsuccess002">次候補</a>`;
    const articleFailureClient = {
      async fetchText(value: string): Promise<FetchResult> {
        if (value.endsWith("robots.txt")) {
          return {
            ok: true,
            url: value,
            status: 200,
            contentType: "text/plain",
            text: "User-agent: *\nAllow: /\n"
          };
        }
        if (value === "https://note.com/fixture-tag") {
          return {
            ok: true,
            url: value,
            status: 200,
            contentType: "text/html",
            text: failureTag
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
    const failedArticleRun = await collectBuildArticles({
      dryRun: false,
      rootDir: temporaryRoot,
      sourceConfigs: [{ ...testConfig, maxArticleFetches: 1 }],
      clients: { note: articleFailureClient },
      now: new Date("2026-07-18T04:00:00.000Z")
    });
    assert(
      failedArticleRun.status.sources.note.fetchFailureCount === 1 &&
        failedArticleRun.status.cursors.note.nextIndex === 0,
      "記事取得失敗時に巡回カーソルを進めてしまいました"
    );

    await writeFile(
      path.join(dataDir, "buildArticles.generated.json"),
      `${JSON.stringify([created], null, 2)}\n`,
      "utf8"
    );
    const zeroCandidateClient = {
      async fetchText(value: string): Promise<FetchResult> {
        if (value.endsWith("robots.txt")) {
          return {
            ok: true,
            url: value,
            status: 200,
            contentType: "text/plain",
            text: "User-agent: *\nAllow: /\n"
          };
        }
        return {
          ok: true,
          url: value,
          status: 200,
          contentType: "text/html",
          text: "<html></html>"
        };
      }
    };
    const zeroCandidate = await collectBuildArticles({
      dryRun: true,
      rootDir: temporaryRoot,
      sourceConfigs: [testConfig],
      clients: { note: zeroCandidateClient },
      now: new Date("2026-07-18T05:00:00.000Z")
    });
    assert(
      zeroCandidate.generatedArticles.length === 1 &&
        zeroCandidate.generatedArticles[0].id === created.id &&
        zeroCandidate.status.cursors.note.candidates.length > 0,
      "今回の発見候補が0件のとき既存生成記事と既知候補を維持できません"
    );

    const failedDiscoveryClient = {
      async fetchText(value: string): Promise<FetchResult> {
        if (value.endsWith("robots.txt")) {
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
    const failedDiscovery = await collectBuildArticles({
      dryRun: true,
      rootDir: temporaryRoot,
      sourceConfigs: [testConfig],
      clients: { note: failedDiscoveryClient },
      now: new Date("2026-07-18T06:00:00.000Z")
    });
    assert(
      failedDiscovery.generatedArticles.length === 1 &&
        failedDiscovery.generatedArticles[0].id === created.id &&
        failedDiscovery.status.sources.note.status === "failed",
      "取得失敗時に既存generatedデータを維持できません"
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const pokesolPolicyRun = await collectBuildArticles({
    dryRun: true,
    source: "pokesol",
    writeFiles: false,
    now: new Date("2026-07-18T03:00:00.000Z")
  });
  assert(
    pokesolPolicyRun.status.sources.pokesol.status ===
      "disabled-by-policy",
    "Pokesolをポリシー理由で無通信停止できません"
  );

  console.log(
    "[ok] 候補発見・抽出・除外・重複排除・安全制御・dry-runを検証しました"
  );
}

main().catch((error) => {
  console.error("[fatal] 構築記事自動収集テストに失敗しました");
  console.error(error);
  process.exitCode = 1;
});
