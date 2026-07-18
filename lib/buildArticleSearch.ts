import type { BuildArticle, PokemonLabelMap } from "@/types/buildArticle";

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

export function isPokemonBuildArticleQuery(
  query: string,
  pokemonLabels: PokemonLabelMap
): boolean {
  const normalizedQuery = normalize(query);
  return (
    normalizedQuery.length > 0 &&
    Object.entries(pokemonLabels).some(
      ([slug, label]) =>
        normalize(slug).includes(normalizedQuery) ||
        normalize(label).includes(normalizedQuery)
    )
  );
}

export function matchesBuildArticleQuery(
  article: BuildArticle,
  query: string,
  pokemonLabels: PokemonLabelMap,
  regulationLabels: Record<string, string>,
  seasonLabels: Record<string, string>
): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;

  if (
    article.collectionCompleteness === "metadata-only" &&
    isPokemonBuildArticleQuery(query, pokemonLabels)
  ) {
    return false;
  }

  const searchableText = [
    article.title,
    article.author,
    article.sourceName,
    article.result,
    regulationLabels[article.regulation] ?? article.regulation,
    article.season,
    seasonLabels[article.builderSeasonId] ?? article.season,
    article.summary,
    ...article.tags,
    ...article.pokemonSlugs.flatMap((slug) => [
      slug,
      pokemonLabels[slug] ?? ""
    ])
  ]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("ja");

  return searchableText.includes(normalizedQuery);
}
