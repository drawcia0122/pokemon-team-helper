import type { AppMeta, PokemonEntry } from "../../types/pokemon";
import { extractArticleFromHtml } from "./extract";
import {
  decodeHtml,
  normalizeUrl,
  sourceArticleIdFromUrl
} from "./normalize";
import type { ArticleCandidate, ExtractionOutcome } from "./types";

export function parseNoteCandidateList(
  html: string,
  maxCandidates = 50
): ArticleCandidate[] {
  const candidates = new Map<string, ArticleCandidate>();
  const links = html.matchAll(
    /href=["']([^"']*\/n\/n[a-z0-9]+(?:\?[^"']*)?)["']/gi
  );

  for (const match of links) {
    try {
      const url = normalizeUrl(
        new URL(decodeHtml(match[1]), "https://note.com").toString()
      );
      if (new URL(url).hostname !== "note.com") continue;
      const sourceArticleId = sourceArticleIdFromUrl("note", url);
      if (!sourceArticleId) continue;
      candidates.set(url, { source: "note", url, sourceArticleId });
      if (candidates.size >= maxCandidates) break;
    } catch {
      // 不正な候補URLは無視する。
    }
  }

  return [...candidates.values()];
}

export function parseNoteArticle(input: {
  html: string;
  url: string;
  appMeta: AppMeta;
  pokemon: PokemonEntry[];
}): ExtractionOutcome {
  return extractArticleFromHtml({
    source: "note",
    ...input
  });
}
