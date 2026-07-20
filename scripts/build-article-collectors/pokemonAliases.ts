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
  },
  {
    aliases: ["霊獣ランド", "ランド霊獣", "ランドロス霊獣"],
    pokemonSlug: "landorus-therian"
  },
  {
    aliases: ["化身ランド", "ランド化身", "ランドロス化身"],
    pokemonSlug: "landorus-incarnate"
  },
  {
    aliases: ["水ロトム", "ウォッシュロトム", "ミトム"],
    pokemonSlug: "rotom-wash"
  },
  {
    aliases: ["火ロトム", "ヒートロトム", "ヒトム"],
    pokemonSlug: "rotom-heat"
  },
  {
    aliases: ["氷ロトム", "フロストロトム"],
    pokemonSlug: "rotom-frost"
  },
  {
    aliases: ["飛行ロトム", "スピンロトム"],
    pokemonSlug: "rotom-fan"
  },
  {
    aliases: ["草ロトム", "カットロトム"],
    pokemonSlug: "rotom-mow"
  },
  {
    aliases: ["水オーガポン", "井戸オーガポン", "いどのめんオーガポン"],
    pokemonSlug: "ogerpon-wellspring-mask"
  },
  {
    aliases: ["炎オーガポン", "竈オーガポン", "かまどのめんオーガポン"],
    pokemonSlug: "ogerpon-hearthflame-mask"
  },
  {
    aliases: ["岩オーガポン", "礎オーガポン", "いしずえのめんオーガポン"],
    pokemonSlug: "ogerpon-cornerstone-mask"
  },
  {
    aliases: ["白バド", "白バドレックス", "はくばバドレックス"],
    pokemonSlug: "calyrex-ice"
  },
  {
    aliases: ["黒バド", "黒バドレックス", "こくばバドレックス"],
    pokemonSlug: "calyrex-shadow"
  },
  {
    aliases: ["剣の王ザシアン", "ザシアン剣の王", "王ザシアン"],
    pokemonSlug: "zacian-crowned"
  },
  {
    aliases: ["盾の王ザマゼンタ", "ザマゼンタ盾の王", "王ザマゼンタ"],
    pokemonSlug: "zamazenta-crowned"
  },
  {
    aliases: ["ブラックキュレム", "黒キュレム"],
    pokemonSlug: "kyurem-black"
  },
  {
    aliases: ["ホワイトキュレム", "白キュレム"],
    pokemonSlug: "kyurem-white"
  },
  {
    aliases: ["日食ネクロズマ", "たそがれネクロズマ"],
    pokemonSlug: "necrozma-dusk"
  },
  {
    aliases: ["月食ネクロズマ", "あかつきネクロズマ"],
    pokemonSlug: "necrozma-dawn"
  },
  {
    aliases: ["ウルトラネクロズマ"],
    pokemonSlug: "necrozma-ultra"
  },
  {
    aliases: ["アタックデオキシス"],
    pokemonSlug: "deoxys-attack"
  },
  {
    aliases: ["ディフェンスデオキシス"],
    pokemonSlug: "deoxys-defense"
  },
  {
    aliases: ["スピードデオキシス"],
    pokemonSlug: "deoxys-speed"
  },
  {
    aliases: ["アナザーギラティナ"],
    pokemonSlug: "giratina-altered"
  },
  {
    aliases: ["オリジンギラティナ"],
    pokemonSlug: "giratina-origin"
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
