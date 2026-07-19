import type {
  BuildArticleSource,
  BuildArticleThumbnail,
  BuildArticleThumbnailSource
} from "@/types/buildArticle";

export type BuildArticleThumbnailOrigin = BuildArticleSource | "manual";

export const BUILD_ARTICLE_THUMBNAIL_HOSTS: Record<
  BuildArticleThumbnailOrigin,
  readonly string[]
> = {
  note: ["assets.st-note.com"],
  "hatena-blog": [
    "cdn-ak.f.st-hatena.com",
    "cdn-ak2.f.st-hatena.com"
  ],
  pokesol: [],
  manual: ["nonbirimaru.net", "liberty-note.com"]
};

export const BUILD_ARTICLE_THUMBNAIL_SOURCES =
  new Set<BuildArticleThumbnailSource>([
    "structured-data",
    "og-image",
    "twitter-image",
    "cover-image",
    "manual"
  ]);

const BLOCKED_IMAGE_ROLE_PATTERN =
  /(?:favicon|apple-touch-icon|android-chrome|profile|avatar|user[_-]?icon|emoji|tracking|pixel|spacer|transparent|blank|advert|banner-ad|share-button|social-button|common-logo|site-logo|logo_202212|libertynote_top_logo)/i;
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)$/i;

function hasAllowedPath(url: URL, origin: BuildArticleThumbnailOrigin): boolean {
  if (origin === "note") {
    return /^\/production\/uploads\/images\/\d+\//.test(url.pathname);
  }
  if (origin === "hatena-blog") {
    return /^\/images\/fotolife\/[^/]+\/[^/]+\/\d{8}\//.test(url.pathname);
  }
  if (origin === "manual") {
    return /^\/wp-content\/uploads\/\d{4}\/\d{2}\//.test(url.pathname);
  }
  return false;
}

export function validateBuildArticleThumbnail(
  value: unknown,
  origin: BuildArticleThumbnailOrigin
): string[] {
  if (value === null) return [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["thumbnailはオブジェクトまたはnullにしてください"];
  }

  const thumbnail = value as Partial<BuildArticleThumbnail>;
  const errors: string[] = [];
  if (
    typeof thumbnail.source !== "string" ||
    !BUILD_ARTICLE_THUMBNAIL_SOURCES.has(
      thumbnail.source as BuildArticleThumbnailSource
    )
  ) {
    errors.push("thumbnail.sourceが未定義です");
  } else if (
    (origin === "manual" && thumbnail.source !== "manual") ||
    (origin !== "manual" && thumbnail.source === "manual")
  ) {
    errors.push("thumbnail.sourceが記事の管理方法と一致しません");
  }
  if (
    thumbnail.alt !== null &&
    (typeof thumbnail.alt !== "string" ||
      thumbnail.alt.trim() === "" ||
      thumbnail.alt.length > 180)
  ) {
    errors.push("thumbnail.altは180文字以内の文字列またはnullにしてください");
  }
  for (const key of ["width", "height"] as const) {
    const dimension = thumbnail[key];
    if (
      dimension !== null &&
      (!Number.isInteger(dimension) || Number(dimension) <= 0)
    ) {
      errors.push(`thumbnail.${key}は正の整数またはnullにしてください`);
    }
  }
  if (typeof thumbnail.url !== "string") {
    errors.push("thumbnail.urlが文字列ではありません");
    return errors;
  }

  try {
    const url = new URL(thumbnail.url);
    const hostname = url.hostname.toLocaleLowerCase("en");
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      /^\d+(?:\.\d+){3}$/.test(hostname) ||
      !BUILD_ARTICLE_THUMBNAIL_HOSTS[origin].includes(hostname)
    ) {
      errors.push("thumbnail.urlがHTTPSまたは許可ドメインではありません");
    }
    if (
      !IMAGE_EXTENSION_PATTERN.test(url.pathname) ||
      !hasAllowedPath(url, origin)
    ) {
      errors.push("thumbnail.urlが許可された画像パスではありません");
    }
    if (
      BLOCKED_IMAGE_ROLE_PATTERN.test(url.pathname) ||
      BLOCKED_IMAGE_ROLE_PATTERN.test(url.search)
    ) {
      errors.push("favicon・共通ロゴ・アイコン等はthumbnailに使用できません");
    }
  } catch {
    errors.push("thumbnail.urlが不正です");
  }

  if (
    (thumbnail.width === 1 && thumbnail.height === 1) ||
    thumbnail.width === 1 ||
    thumbnail.height === 1
  ) {
    errors.push("1×1または追跡用画像はthumbnailに使用できません");
  }
  return errors;
}

export function isBuildArticleThumbnailSafe(
  value: unknown,
  origin: BuildArticleThumbnailOrigin
): value is BuildArticleThumbnail {
  return value !== null && validateBuildArticleThumbnail(value, origin).length === 0;
}

export type BuildArticleThumbnailRenderState =
  | "loading"
  | "image"
  | "fallback-missing"
  | "fallback-invalid"
  | "fallback-error"
  | "fallback-timeout";

export function resolveBuildArticleThumbnailState(input: {
  thumbnail: BuildArticleThumbnail | null;
  origin: BuildArticleThumbnailOrigin;
  loaded?: boolean;
  failed?: boolean;
  timedOut?: boolean;
}): BuildArticleThumbnailRenderState {
  if (input.thumbnail === null) return "fallback-missing";
  if (!isBuildArticleThumbnailSafe(input.thumbnail, input.origin)) {
    return "fallback-invalid";
  }
  if (input.failed) return "fallback-error";
  if (input.timedOut) return "fallback-timeout";
  return input.loaded ? "image" : "loading";
}
