import type { GeneratedPokemonContentItem } from "@/types/pokemonContent";
import type { ContentCollectionState } from "@/scripts/content-collectors/types";

export function validatePokemonContentCollectionState(
  value: unknown,
  generated: GeneratedPokemonContentItem[]
): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return ["pokemonContentCollectionStatus: オブジェクトではありません"];
  }
  const state = value as Partial<ContentCollectionState>;
  if (state.version !== 1) errors.push("pokemonContentCollectionStatus: version が不正です");
  if (typeof state.collectorVersion !== "string" || state.collectorVersion.trim() === "") {
    errors.push("pokemonContentCollectionStatus: collectorVersion が空です");
  }
  if (!state.sources || typeof state.sources !== "object") {
    errors.push("pokemonContentCollectionStatus: sources が不正です");
    return errors;
  }

  const source = state.sources["pokemon-go-official-rss"];
  if (!source) {
    if (generated.some((item) => item.source === "pokemon-go-official-rss")) {
      errors.push("pokemonContentCollectionStatus: 自動記事に対応するsource状態がありません");
    }
    return errors;
  }
  if (!/^[a-f0-9]{64}$/.test(source.feedFingerprint)) {
    errors.push("pokemonContentCollectionStatus: feedFingerprint が不正です");
  }
  if (
    !Array.isArray(source.articleIds) ||
    source.articleIds.some((id) => typeof id !== "string" || id.trim() === "") ||
    new Set(source.articleIds).size !== source.articleIds.length
  ) {
    errors.push("pokemonContentCollectionStatus: articleIds が不正です");
  }
  if (!source.itemFingerprints || typeof source.itemFingerprints !== "object") {
    errors.push("pokemonContentCollectionStatus: itemFingerprints が不正です");
    return errors;
  }

  const generatedById = new Map(
    generated
      .filter((item) => item.source === "pokemon-go-official-rss")
      .map((item) => [item.sourceArticleId, item])
  );
  for (const articleId of source.articleIds) {
    const item = generatedById.get(articleId);
    if (!item) {
      errors.push(`pokemonContentCollectionStatus: 未公開articleIdです: ${articleId}`);
      continue;
    }
    if (source.itemFingerprints[articleId] !== item.contentFingerprint) {
      errors.push(`pokemonContentCollectionStatus: fingerprint不一致です: ${articleId}`);
    }
  }
  if (generatedById.size !== source.articleIds.length) {
    errors.push("pokemonContentCollectionStatus: generated件数とarticleIds件数が一致しません");
  }
  return errors;
}
