export type BattleFormat = "single" | "double";

export type BuildArticle = {
  id: string;
  title: string;
  author: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  battleFormat: BattleFormat;
  regulation: string;
  season: string;
  builderSeasonId: string;
  result: string;
  pokemonSlugs: string[];
  tags: string[];
  summary: string;
};

export type PokemonLabelMap = Record<string, string>;
