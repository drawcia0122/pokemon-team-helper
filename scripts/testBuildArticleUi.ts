import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveBuildArticleThumbnailState } from "@/lib/buildArticleThumbnail";
import {
  ALLOWED_EXTERNAL_IMAGE_ORIGINS,
  STATIC_CONTENT_SECURITY_POLICY
} from "@/lib/contentSecurityPolicy";
import type { BuildArticleThumbnail } from "@/types/buildArticle";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const thumbnail: BuildArticleThumbnail = {
  url: "https://assets.st-note.com/production/uploads/images/123456789/ui-fixture.webp",
  source: "structured-data",
  alt: "UI fixtureのサムネイル",
  width: 1200,
  height: 630
};
const root = process.cwd();
const componentSource = readFileSync(
  path.join(root, "components/builds/BuildArticleThumbnail.tsx"),
  "utf8"
);
const componentCss = readFileSync(
  path.join(root, "components/builds/BuildArticleThumbnail.module.css"),
  "utf8"
);
const explorerSource = readFileSync(
  path.join(root, "components/builds/BuildArticleExplorer.tsx"),
  "utf8"
);
assert(
  componentSource.includes("<img") &&
    componentSource.includes('loading="lazy"') &&
    componentSource.includes('decoding="async"') &&
    componentSource.includes('referrerPolicy="no-referrer"') &&
    componentSource.includes("thumbnail.alt ?? `${title}のサムネイル`") &&
    componentSource.includes("image?.complete") &&
    componentSource.includes("image.naturalWidth > 0"),
  "thumbnailありカードの画像属性またはaltが不正です"
);
assert(
  componentSource.includes('aria-hidden="true"') &&
    componentSource.includes("BUILD ARTICLE") &&
    componentSource.includes("data-thumbnail-state={state}"),
  "thumbnailなしカードの装飾フォールバックが不正です"
);
assert(
  componentCss.includes("aspect-ratio: 16 / 9") &&
    componentCss.includes("object-fit: cover") &&
    componentCss.includes("overflow: hidden"),
  "サムネイル比率・トリミング・壊れた画像の非表示設定が不正です"
);
assert(
  explorerSource.includes("article.collectionCompleteness === \"metadata-only\"") &&
    explorerSource.includes("採用ポケモンは元記事で確認") &&
    explorerSource.includes("canAnalyzeBuildArticle(article)") &&
    explorerSource.includes('<option value="hatena-blog">はてなブログ</option>'),
  "metadata-onlyとcompleteの操作・案内を区別できません"
);
assert(
  ALLOWED_EXTERNAL_IMAGE_ORIGINS.length === 6 &&
    ALLOWED_EXTERNAL_IMAGE_ORIGINS.includes("https://assets.st-note.com") &&
    ALLOWED_EXTERNAL_IMAGE_ORIGINS.includes("https://cdn-ak.f.st-hatena.com") &&
    ALLOWED_EXTERNAL_IMAGE_ORIGINS.includes("https://cdn-ak2.f.st-hatena.com") &&
    ALLOWED_EXTERNAL_IMAGE_ORIGINS.includes("https://nonbirimaru.net") &&
    ALLOWED_EXTERNAL_IMAGE_ORIGINS.includes("https://liberty-note.com") &&
    ALLOWED_EXTERNAL_IMAGE_ORIGINS.includes("https://raw.githubusercontent.com") &&
    STATIC_CONTENT_SECURITY_POLICY.startsWith("img-src 'self' data: ") &&
    !STATIC_CONTENT_SECURITY_POLICY.includes("https://*"),
  "画像CSPが許可済みホストへ限定されていません"
);
assert(
  resolveBuildArticleThumbnailState({
    thumbnail: null,
    origin: "note"
  }) === "fallback-missing" &&
    resolveBuildArticleThumbnailState({
      thumbnail,
      origin: "note",
      failed: true
    }) === "fallback-error" &&
    resolveBuildArticleThumbnailState({
      thumbnail,
      origin: "note",
      timedOut: true
    }) === "fallback-timeout",
  "未設定・読み込み失敗・タイムアウト時のフォールバック判定が不正です"
);

console.log(
  "[ok] 構築記事サムネイルの表示・alt・安全なフォールバックを検証しました"
);
