import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import overridesData from "@/data/environment/localization/showdown-ja-overrides.json";
import type {
  EnvironmentLocalizationCategory,
  EnvironmentLocalizationDictionary,
  EnvironmentLocalizationOverrides
} from "@/types/environmentLocalization";
import type {
  EnvironmentMoveDamageClass,
  EnvironmentMoveMetadataRegistry
} from "@/types/environmentThreat";
import type { TypeName } from "@/types/pokemon";

const POKEAPI_COMMIT = "f34ebd36c4328bad7fa406b276a24f72000a801d";
const POKEAPI_RAW_BASE = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_COMMIT}/data/v2/csv`;
const OUTPUT_PATH = path.join(
  process.cwd(),
  "data/environment/localization/ja.json"
);
const MOVE_METADATA_OUTPUT_PATH = path.join(
  process.cwd(),
  "data/environment/moveMetadata.json"
);
const JAPANESE_LANGUAGE_ID = "1";

const sourceFiles: Record<
  EnvironmentLocalizationCategory,
  { identifiers: string; names: string; identifierColumn: string; foreignKey: string }
> = {
  moves: {
    identifiers: "moves.csv",
    names: "move_names.csv",
    identifierColumn: "identifier",
    foreignKey: "move_id"
  },
  items: {
    identifiers: "items.csv",
    names: "item_names.csv",
    identifierColumn: "identifier",
    foreignKey: "item_id"
  },
  abilities: {
    identifiers: "abilities.csv",
    names: "ability_names.csv",
    identifierColumn: "identifier",
    foreignKey: "ability_id"
  },
  natures: {
    identifiers: "natures.csv",
    names: "nature_names.csv",
    identifierColumn: "identifier",
    foreignKey: "nature_id"
  }
};

function parseCsv(source: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...values] = rows;
  if (!headers) throw new Error("CSV headerがありません");
  return values
    .filter((entry) => entry.some(Boolean))
    .map((entry) =>
      Object.fromEntries(headers.map((header, index) => [header, entry[index] ?? ""]))
    );
}

function toShowdownId(identifier: string): string {
  return identifier.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function fetchCsv(fileName: string): Promise<Array<Record<string, string>>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${POKEAPI_RAW_BASE}/${fileName}`, {
      headers: { "User-Agent": "pokemon-team-helper-environment-localization/1.0" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${fileName}: HTTP ${response.status}`);
    return parseCsv(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

async function buildCategory(
  category: EnvironmentLocalizationCategory
): Promise<Record<string, string>> {
  const files = sourceFiles[category];
  const [identifiers, names] = await Promise.all([
    fetchCsv(files.identifiers),
    fetchCsv(files.names)
  ]);
  const identifiersById = new Map(
    identifiers.map((entry) => [entry.id, entry[files.identifierColumn]])
  );
  const result: Record<string, string> = {};
  for (const entry of names) {
    if (entry.local_language_id !== JAPANESE_LANGUAGE_ID) continue;
    const identifier = identifiersById.get(entry[files.foreignKey]);
    if (!identifier || !entry.name) continue;
    const sourceId = toShowdownId(identifier);
    const existing = result[sourceId];
    if (existing && existing !== entry.name) {
      throw new Error(`${category}:${sourceId}の日本語名が重複しています`);
    }
    result[sourceId] = entry.name;
  }
  return result;
}

function sortEntries(entries: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).sort(([left], [right]) => left.localeCompare(right)));
}

const pokeApiTypes: Record<string, TypeName> = {
  "1": "normal",
  "2": "fighting",
  "3": "flying",
  "4": "poison",
  "5": "ground",
  "6": "rock",
  "7": "bug",
  "8": "ghost",
  "9": "steel",
  "10": "fire",
  "11": "water",
  "12": "grass",
  "13": "electric",
  "14": "psychic",
  "15": "ice",
  "16": "dragon",
  "17": "dark",
  "18": "fairy"
};

const pokeApiDamageClasses: Record<string, EnvironmentMoveDamageClass> = {
  "1": "status",
  "2": "physical",
  "3": "special"
};

async function buildMoveMetadata(): Promise<EnvironmentMoveMetadataRegistry> {
  const moves = await fetchCsv("moves.csv");
  const entries: EnvironmentMoveMetadataRegistry["moves"] = {};
  for (const move of moves) {
    const sourceId = toShowdownId(move.identifier);
    const type = pokeApiTypes[move.type_id];
    const damageClass = pokeApiDamageClasses[move.damage_class_id];
    if (!sourceId || !type || !damageClass) continue;
    entries[sourceId] = { type, damageClass };
  }
  return {
    schemaVersion: 1,
    source: {
      repository: "https://github.com/PokeAPI/pokeapi",
      commit: POKEAPI_COMMIT
    },
    moves: Object.fromEntries(
      Object.entries(entries).sort(([left], [right]) => left.localeCompare(right))
    )
  };
}

async function main(): Promise<void> {
  const overrides = overridesData as EnvironmentLocalizationOverrides;
  const categoryEntries = await Promise.all(
    (Object.keys(sourceFiles) as EnvironmentLocalizationCategory[]).map(async (category) => {
      const generated = await buildCategory(category);
      const explicit = overrides.categories[category] ?? {};
      return [category, sortEntries({ ...generated, ...explicit })] as const;
    })
  );
  const dictionary: EnvironmentLocalizationDictionary = {
    schemaVersion: 1,
    locale: "ja",
    fallbackLabel: "未対応",
    dictionaryVersion: createHash("sha256")
      .update(JSON.stringify(Object.fromEntries(categoryEntries)))
      .digest("hex")
      .slice(0, 16),
    sources: {
      pokeApiRepository: "https://github.com/PokeAPI/pokeapi",
      pokeApiCommit: POKEAPI_COMMIT,
      overrideFile: "data/environment/localization/showdown-ja-overrides.json"
    },
    categories: Object.fromEntries(categoryEntries) as EnvironmentLocalizationDictionary["categories"]
  };
  const moveMetadata = await buildMoveMetadata();
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(dictionary, null, 2)}\n`, "utf8");
  await writeFile(
    MOVE_METADATA_OUTPUT_PATH,
    `${JSON.stringify(moveMetadata, null, 2)}\n`,
    "utf8"
  );
  const counts = Object.fromEntries(
    Object.entries(dictionary.categories).map(([category, entries]) => [
      category,
      Object.keys(entries).length
    ])
  );
  console.log(
    `[ok] 環境データ日本語辞書を生成しました: ${JSON.stringify(counts)} / 技メタデータ${Object.keys(moveMetadata.moves).length}件`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
