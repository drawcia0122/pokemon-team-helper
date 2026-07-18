"use client";

import { useState } from "react";
import styles from "./PokemonVisual.module.css";

type PokemonVisualProps = {
  name: string;
  slug: string;
  imageUrl?: string;
  size?: "small" | "medium" | "large";
};

function initials(name: string): string {
  return [...name].slice(0, 2).join("");
}

export function PokemonVisual({
  name,
  slug,
  imageUrl,
  size = "medium"
}: PokemonVisualProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <span
      className={`${styles.visual} ${styles[size]}`}
      data-pokemon-slug={slug}
      data-image-state={showImage ? "image" : "fallback"}
      aria-hidden="true"
    >
      {showImage ? (
        <img src={imageUrl} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span className={styles.fallback} aria-hidden="true">
          {initials(name)}
        </span>
      )}
    </span>
  );
}
