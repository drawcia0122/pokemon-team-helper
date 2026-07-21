import { BUILD_ARTICLE_THUMBNAIL_HOSTS } from "@/lib/buildArticleThumbnail";
import { POKEMON_SPRITE_IMAGE_ORIGIN } from "@/lib/pokemonImage";

export const ALLOWED_EXTERNAL_IMAGE_ORIGINS = [
  ...new Set(
    [
      ...Object.values(BUILD_ARTICLE_THUMBNAIL_HOSTS)
        .flat()
        .map((hostname) => `https://${hostname}`),
      POKEMON_SPRITE_IMAGE_ORIGIN
    ]
  )
].sort();

export const STATIC_CONTENT_SECURITY_POLICY =
  `img-src 'self' data: ${ALLOWED_EXTERNAL_IMAGE_ORIGINS.join(" ")};`;
