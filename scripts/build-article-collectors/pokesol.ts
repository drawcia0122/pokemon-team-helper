import type { AppMeta, PokemonEntry } from "../../types/pokemon";
import { extractArticleFromHtml } from "./extract";
import {
  decodeHtml,
  normalizeUrl,
  sourceArticleIdFromUrl
} from "./normalize";
import type { ArticleCandidate, ExtractionOutcome } from "./types";

export function parsePokesolCandidateList(
  html: string,
  maxCandidates = 50
): ArticleCandidate[] {
  const candidates = new Map<string, ArticleCandidate>();
  const links = html.matchAll(
    /href=["']([^"']*\/u\/[^/"']+\/articles\/[a-z0-9]+(?:\?[^"']*)?)["']/gi
  );

  for (const match of links) {
    try {
      const url = normalizeUrl(
        new URL(decodeHtml(match[1]), "https://pokesol.app").toString()
      );
      if (new URL(url).hostname !== "pokesol.app") continue;
      const sourceArticleId = sourceArticleIdFromUrl("pokesol", url);
      if (!sourceArticleId) continue;
      candidates.set(url, { source: "pokesol", url, sourceArticleId });
      if (candidates.size >= maxCandidates) break;
    } catch {
      // 不正な候補URLは無視する。
    }
  }

  return [...candidates.values()];
}

export function parsePokesolArticle(input: {
  html: string;
  url: string;
  appMeta: AppMeta;
  pokemon: PokemonEntry[];
}): ExtractionOutcome {
  return extractArticleFromHtml({
    source: "pokesol",
    ...input
  });
}
