"use client";

import { useState } from "react";
import {
  resolvePokemonImageState,
  resolvePokemonSpriteUrl
} from "@/lib/pokemonImage";
import styles from "./PokemonVisual.module.css";

type PokemonVisualProps = {
  name: string;
  slug: string;
  pokemonId?: number;
  size?: "small" | "medium" | "large";
  appearance?: "framed" | "plain";
};

function initials(name: string): string {
  return [...name].slice(0, 2).join("");
}

export function PokemonVisual({
  name,
  slug,
  pokemonId,
  size = "medium",
  appearance = "framed"
}: PokemonVisualProps) {
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const spriteUrl = resolvePokemonSpriteUrl({ id: pokemonId });
  const imageState = resolvePokemonImageState({
    spriteUrl,
    loadedImageUrl,
    failedImageUrl
  });

  return (
    <span
      className={`${styles.visual} ${styles[size]} ${styles[appearance]}`}
      data-pokemon-slug={slug}
      data-image-state={imageState}
      aria-hidden="true"
    >
      <span className={styles.fallback} aria-hidden="true">
        {initials(name)}
      </span>
      {spriteUrl && imageState !== "fallback" ? (
        <img
          src={spriteUrl}
          alt=""
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadedImageUrl(spriteUrl)}
          onError={() => setFailedImageUrl(spriteUrl)}
        />
      ) : null}
    </span>
  );
}
