"use client";

import { useEffect, useRef, useState } from "react";
import {
  isBuildArticleThumbnailSafe,
  resolveBuildArticleThumbnailState,
  type BuildArticleThumbnailOrigin
} from "@/lib/buildArticleThumbnail";
import type {
  BattleFormat,
  BuildArticleThumbnail as Thumbnail
} from "@/types/buildArticle";
import styles from "./BuildArticleThumbnail.module.css";

const formatLabels: Record<BattleFormat, string> = {
  single: "SINGLE",
  double: "DOUBLE"
};

export function BuildArticleThumbnail({
  title,
  thumbnail,
  origin,
  regulation,
  season,
  battleFormat
}: {
  title: string;
  thumbnail: Thumbnail | null;
  origin: BuildArticleThumbnailOrigin;
  regulation: string;
  season: string;
  battleFormat: BattleFormat;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const safe = isBuildArticleThumbnailSafe(thumbnail, origin);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setTimedOut(false);
    const image = imageRef.current;
    if (image?.complete) {
      if (image.naturalWidth > 0) {
        setLoaded(true);
      } else {
        setFailed(true);
      }
    }
  }, [thumbnail?.url]);

  useEffect(() => {
    if (!safe || loaded || failed) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const startTimeout = () => {
      if (timeout === null) {
        timeout = setTimeout(() => setTimedOut(true), 10_000);
      }
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                startTimeout();
                observer?.disconnect();
              }
            },
            { rootMargin: "160px" }
          );
    if (observer && containerRef.current) {
      observer.observe(containerRef.current);
    } else {
      startTimeout();
    }
    return () => {
      observer?.disconnect();
      if (timeout !== null) clearTimeout(timeout);
    };
  }, [failed, loaded, safe, thumbnail?.url]);

  const state = resolveBuildArticleThumbnailState({
    thumbnail,
    origin,
    loaded,
    failed,
    timedOut
  });
  const showImage = safe && !failed && !timedOut;

  return (
    <div
      className={styles.frame}
      data-thumbnail-state={state}
      ref={containerRef}
    >
      {showImage ? (
        <img
          ref={imageRef}
          className={`${styles.image} ${loaded ? styles.loaded : ""}`}
          src={thumbnail.url}
          alt={thumbnail.alt ?? `${title}のサムネイル`}
          width={thumbnail.width ?? 1200}
          height={thumbnail.height ?? 675}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={styles.fallback} aria-hidden="true">
          <span className={styles.fallbackEyebrow}>BUILD ARTICLE</span>
          <strong>{regulation}</strong>
          <span>
            {season} · {formatLabels[battleFormat]}
          </span>
        </div>
      )}
      {state === "loading" ? (
        <span className={styles.loading} aria-hidden="true">
          読み込み中
        </span>
      ) : null}
    </div>
  );
}
