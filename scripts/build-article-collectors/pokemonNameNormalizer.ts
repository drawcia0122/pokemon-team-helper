import type { PokemonEntry } from "../../types/pokemon";
import { normalizeComparableText, stripHtml } from "./normalize";
import { POKEMON_NAME_ALIASES } from "./pokemonAliases";

export type PokemonNameConfidence =
  | "exact"
  | "alias"
  | "decorated"
  | "ambiguous"
  | "unresolved";

export type PokemonNameResolution = {
  rawName: string;
  normalizedName: string;
  resolvedSlug: string | null;
  confidence: PokemonNameConfidence;
  reason: string;
};

type AliasEntry = {
  slug: string;
  source: "pokemon-data" | "explicit-alias";
};

const CIRCLED_NUMBERS =
  "①②③④⑤⑥⑦⑧⑨⑩❶❷❸❹❺❻❼❽❾❿";
const ROLE_PREFIX_PATTERN =
  /^(?:【(?:エース|先発|初手|展開|受け|崩し|補完|切り札|枠\d+)】|\[(?:エース|先発|初手|展開|受け|崩し|補完|切り札|枠\d+)\])\s*/i;
const DECORATIVE_PREFIX_PATTERN =
  new RegExp(`^[${CIRCLED_NUMBERS}]\\s*|^\\d{1,2}\\s*(?:[.．、:：)\\]）-]\\s*)?|^[#・●○◆◇■□▶▷✓✔★☆\\-\\s]+`, "u");
const TRAILING_DECORATION_PATTERNS = [
  /\s*(?:@|＠)\s*.+$/u,
  /\s*[（(](?:[^()（）]{0,30}(?:テラス|テラスタイプ|持ち物|道具|性格|特性|努力値|調整|NN|ニックネーム)[^()（）]{0,30})[）)]\s*$/iu,
  /\s*(?:♂|♀)\s*$/u,
  /\s*(?:テラスタイプ|テラス)\s*[:：]?\s*\S+\s*$/iu,
  /\s*(?:持ち物|道具|性格|特性|努力値|調整|技構成)\s*[:：].*$/iu
] as const;

function aliasKey(value: string): string {
  return normalizeComparableText(value)
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/[・･/／_\-‐‑‒–—―\s]/g, "");
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#]+/g, " ");
}

function baseClean(value: string): string {
  return cleanMarkdown(stripHtml(value))
    .normalize("NFKC")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decoratedVariants(value: string): string[] {
  const variants = new Set<string>();
  let current = value;
  variants.add(current);

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const previous = current;
    current = current
      .replace(DECORATIVE_PREFIX_PATTERN, "")
      .replace(ROLE_PREFIX_PATTERN, "")
      .trim();
    for (const pattern of TRAILING_DECORATION_PATTERNS) {
      current = current.replace(pattern, "").trim();
    }
    variants.add(current);
    if (current === previous) break;
  }

  const slashParts = current
    .split(/\s+(?:\/|／)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of slashParts) variants.add(part);

  const bracketRole = current.match(
    /^(?:【[^】]{1,20}】|\[[^\]]{1,20}\])\s*(\S.+)$/u
  )?.[1];
  if (bracketRole) variants.add(bracketRole.trim());

  return [...variants].filter(Boolean);
}

function register(
  target: Map<string, AliasEntry[]>,
  alias: string,
  entry: AliasEntry
): void {
  const key = aliasKey(alias);
  if (!key) return;
  const values = target.get(key) ?? [];
  if (!values.some((value) => value.slug === entry.slug)) {
    values.push(entry);
  }
  target.set(key, values);
}

function formAliases(entry: PokemonEntry): string[] {
  const aliases: string[] = [];
  const regional = entry.nameJa.match(
    /^(.+)\((アローラ|ガラル|ヒスイ|パルデア)\)$/i
  );
  if (regional) {
    aliases.push(
      `${regional[2]}${regional[1]}`,
      `${regional[1]}${regional[2]}`,
      `${regional[2]}のすがた${regional[1]}`,
      `${regional[1]}${regional[2]}のすがた`
    );
  }
  const form = entry.nameJa.match(/^(.+)\(([^)]+)\)$/);
  if (form) {
    aliases.push(`${form[2]}${form[1]}`, `${form[1]}${form[2]}`);
  }
  const mega = entry.nameJa.match(/^(.+)\(メガ(?:・([xy]))?\)$/i);
  if (mega) {
    aliases.push(
      `メガ${mega[1]}${mega[2] ?? ""}`,
      `${mega[1]}メガ${mega[2] ?? ""}`
    );
  }
  return aliases;
}

export function createPokemonNameNormalizer(pokemon: PokemonEntry[]) {
  const aliases = new Map<string, AliasEntry[]>();
  const exactJapaneseNames = new Set(
    pokemon.map((entry) => aliasKey(entry.nameJa))
  );

  for (const entry of pokemon) {
    for (const alias of [
      entry.nameJa,
      entry.nameEn,
      entry.slug,
      ...formAliases(entry)
    ]) {
      register(aliases, alias, {
        slug: entry.slug,
        source: "pokemon-data"
      });
    }

    const baseName = entry.nameJa.replace(/\([^)]+\)$/, "");
    if (
      baseName !== entry.nameJa &&
      !exactJapaneseNames.has(aliasKey(baseName))
    ) {
      register(aliases, baseName, {
        slug: entry.slug,
        source: "pokemon-data"
      });
    }
  }

  for (const definition of POKEMON_NAME_ALIASES) {
    for (const alias of definition.aliases) {
      register(aliases, alias, {
        slug: definition.pokemonSlug,
        source: "explicit-alias"
      });
    }
  }

  return (rawName: string): PokemonNameResolution => {
    const cleaned = baseClean(rawName);
    const variants = decoratedVariants(cleaned);
    let sawAmbiguous = false;
    let ambiguousName = cleaned;

    for (let index = 0; index < variants.length; index += 1) {
      const normalizedName = variants[index];
      const matches = aliases.get(aliasKey(normalizedName)) ?? [];
      const slugs = [...new Set(matches.map((match) => match.slug))];
      if (slugs.length > 1) {
        sawAmbiguous = true;
        ambiguousName = normalizedName;
        continue;
      }
      if (slugs.length !== 1) continue;

      const explicit = matches.some(
        (match) => match.source === "explicit-alias"
      );
      const decorated = index > 0 || normalizedName !== cleaned;
      return {
        rawName,
        normalizedName,
        resolvedSlug: slugs[0],
        confidence: decorated
          ? "decorated"
          : explicit
            ? "alias"
            : "exact",
        reason: decorated
          ? "番号・装飾・持ち物・型説明等を除去して一意に解決"
          : explicit
            ? "明示的な安全別名辞書で一意に解決"
            : "pokemon.jsonの名称またはslugと完全一致"
      };
    }

    return {
      rawName,
      normalizedName: sawAmbiguous ? ambiguousName : cleaned,
      resolvedSlug: null,
      confidence: sawAmbiguous ? "ambiguous" : "unresolved",
      reason: sawAmbiguous
        ? "同じ表記が複数フォルムへ一致するため自動解決しない"
        : "pokemon.jsonまたは明示的な安全別名辞書に一意な一致がない"
    };
  };
}
