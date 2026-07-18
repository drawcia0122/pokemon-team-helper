import type { PokemonEntry } from "../../types/pokemon";
import { normalizeComparableText } from "./normalize";

export type PokemonAliasDefinition = {
  aliases: readonly string[];
  pokemonSlug: string;
};

export const POKEMON_NAME_ALIASES: readonly PokemonAliasDefinition[] = [
  {
    aliases: ["リザY", "メガリザY", "メガリザードンY"],
    pokemonSlug: "charizard-mega-y"
  },
  {
    aliases: ["リザX", "メガリザX", "メガリザードンX"],
    pokemonSlug: "charizard-mega-x"
  },
  {
    aliases: ["水ウーラ", "連撃ウーラ", "れんげきウーラ"],
    pokemonSlug: "urshifu-rapid-strike"
  },
  {
    aliases: ["悪ウーラ", "一撃ウーラ", "いちげきウーラ"],
    pokemonSlug: "urshifu-single-strike"
  },
  {
    aliases: ["暁ガチグマ", "ガチグマ暁", "アカツキガチグマ"],
    pokemonSlug: "ursaluna-bloodmoon"
  },
  {
    aliases: ["原種サンダー", "通常サンダー"],
    pokemonSlug: "zapdos"
  }
];

export function createPokemonAliasMap(): Map<string, string> {
  return new Map(
    POKEMON_NAME_ALIASES.flatMap((definition) =>
      definition.aliases.map((alias) => [
        normalizeComparableText(alias),
        definition.pokemonSlug
      ])
    )
  );
}

export function validatePokemonAliasDefinitions(
  pokemon: PokemonEntry[]
): string[] {
  const errors: string[] = [];
  const knownSlugs = new Set(pokemon.map((entry) => entry.slug));
  const aliases = new Map<string, string>();

  for (const definition of POKEMON_NAME_ALIASES) {
    if (!knownSlugs.has(definition.pokemonSlug)) {
      errors.push(
        `pokemon-alias:${definition.pokemonSlug}: pokemon.jsonに存在しません`
      );
    }
    for (const alias of definition.aliases) {
      const normalized = normalizeComparableText(alias);
      const existing = aliases.get(normalized);
      if (!normalized || (existing && existing !== definition.pokemonSlug)) {
        errors.push(`pokemon-alias:${alias}: 曖昧または空の定義です`);
      }
      aliases.set(normalized, definition.pokemonSlug);
    }
  }

  return errors;
}
