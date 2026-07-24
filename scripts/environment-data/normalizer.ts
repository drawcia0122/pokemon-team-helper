import { createHash } from "node:crypto";
import type {
  EnvironmentCheckCounter,
  EnvironmentFormatDefinition,
  EnvironmentPokemonAliases,
  EnvironmentPokemonReference,
  EnvironmentSnapshot,
  EnvironmentStatSpread,
  InvestmentSystem,
  UnresolvedEnvironmentName,
  WeightedEnvironmentValue
} from "../../types/environmentData";
import type { PokemonEntry } from "../../types/pokemon";

type RawPokemonStats = {
  "Raw count": number;
  usage: number;
  Abilities: Record<string, number>;
  Items: Record<string, number>;
  Spreads: Record<string, number>;
  Moves: Record<string, number>;
  "Tera Types"?: Record<string, number>;
  Teammates?: Record<string, number>;
  "Checks and Counters"?: Record<
    string,
    { n?: number; p?: number; d?: number }
  >;
};

type RawChaosStats = {
  info: {
    metagame: string;
    cutoff: number;
    "number of battles": number;
  };
  data: Record<string, RawPokemonStats>;
};

type ResolutionContext = "pokemon" | "teammate" | "check-and-counter";

const POPULATION_NOTE =
  "Pokemon Showdown上の対戦をSmogonが集計した月次統計です。公式Pokémon HOMEまたはPokémon Championsの利用統計ではありません。";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeEnvironmentUsageRate(value: unknown): number {
  const isPercentage =
    typeof value === "string" && value.trim().endsWith("%");
  const numeric =
    typeof value === "string"
      ? Number(value.trim().replace(/%$/, ""))
      : value;
  if (!isFiniteNumber(numeric) || numeric < 0) {
    throw new Error(`usageが数値ではありません: ${String(value)}`);
  }
  const rate = isPercentage || numeric > 1 ? numeric / 100 : numeric;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`usageが0〜1へ正規化できません: ${String(value)}`);
  }
  return rate;
}

function assertWeightMap(value: unknown, context: string): asserts value is Record<string, number> {
  if (
    !isRecord(value) ||
    Object.values(value).some(
      (weight) => !isFiniteNumber(weight) || weight < 0
    )
  ) {
    throw new Error(`${context}: 重みデータが不正です`);
  }
}

export function parseRawChaosStats(
  value: unknown,
  expectedFormat: string,
  expectedCutoff: number
): RawChaosStats {
  if (!isRecord(value) || !isRecord(value.info) || !isRecord(value.data)) {
    throw new Error("chaos JSONのルート構造が不正です");
  }
  if (value.info.metagame !== expectedFormat) {
    throw new Error(`metagameが一致しません: ${String(value.info.metagame)}`);
  }
  if (value.info.cutoff !== expectedCutoff) {
    throw new Error(`cutoffが一致しません: ${String(value.info.cutoff)}`);
  }
  if (
    !Number.isInteger(value.info["number of battles"]) ||
    Number(value.info["number of battles"]) <= 0
  ) {
    throw new Error("number of battlesが不正です");
  }

  for (const [sourceName, rawValue] of Object.entries(value.data)) {
    if (!isRecord(rawValue)) throw new Error(`${sourceName}: 統計がオブジェクトではありません`);
    if (!Number.isInteger(rawValue["Raw count"]) || Number(rawValue["Raw count"]) < 0) {
      throw new Error(`${sourceName}: Raw countが不正です`);
    }
    try {
      rawValue.usage = normalizeEnvironmentUsageRate(rawValue.usage);
    } catch {
      throw new Error(`${sourceName}: usageが0〜1ではありません`);
    }
    for (const key of ["Abilities", "Items", "Spreads", "Moves"] as const) {
      assertWeightMap(rawValue[key], `${sourceName}.${key}`);
    }
    if (rawValue["Tera Types"] !== undefined) {
      assertWeightMap(rawValue["Tera Types"], `${sourceName}.Tera Types`);
    }
    if (rawValue.Teammates !== undefined) {
      assertWeightMap(rawValue.Teammates, `${sourceName}.Teammates`);
    }
    if (rawValue["Checks and Counters"] !== undefined) {
      if (!isRecord(rawValue["Checks and Counters"])) {
        throw new Error(`${sourceName}.Checks and Countersが不正です`);
      }
      for (const [name, check] of Object.entries(rawValue["Checks and Counters"])) {
        if (
          name.trim() === "" ||
          !isRecord(check) ||
          !isFiniteNumber(check.n) ||
          check.n < 0 ||
          !isFiniteNumber(check.p) ||
          check.p < 0 ||
          check.p > 1 ||
          !isFiniteNumber(check.d) ||
          check.d < 0
        ) {
          throw new Error(`${sourceName}.Checks and Counters.${name}が不正です`);
        }
      }
    }
  }
  return value as unknown as RawChaosStats;
}

function sourceNameToExactSlug(sourceName: string): string {
  return sourceName
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sourceValueId(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sumWeights(value: Record<string, number>): number {
  return Object.values(value).reduce((sum, weight) => sum + weight, 0);
}

function normalizedShare(rawWeight: number, denominator: number, context: string): number {
  if (denominator <= 0) return 0;
  const share = rawWeight / denominator;
  if (share > 1.000000001) {
    throw new Error(`${context}: shareが1を超えました (${share})`);
  }
  return Math.max(0, Math.min(1, share));
}

function normalizeWeightedMap(
  value: Record<string, number>,
  denominator: number,
  context: string,
  excludedIds: string[] = []
): WeightedEnvironmentValue[] {
  const excluded = new Set(excludedIds);
  return Object.entries(value)
    .filter(([name, rawWeight]) => {
      const id = sourceValueId(name);
      return id !== "" && rawWeight > 0 && !excluded.has(id);
    })
    .map(([name, rawWeight]) => ({
      id: sourceValueId(name),
      sourceName: name,
      share: normalizedShare(rawWeight, denominator, `${context}.${name}`),
      rawWeight
    }))
    .sort((left, right) => right.share - left.share || left.id.localeCompare(right.id, "en"));
}

function parseSpread(
  raw: string,
  rawWeight: number,
  denominator: number,
  investmentSystem: InvestmentSystem
): EnvironmentStatSpread {
  const separator = raw.indexOf(":");
  const nature = separator >= 0 ? raw.slice(0, separator) : "";
  const values = separator >= 0 ? raw.slice(separator + 1).split("/").map(Number) : [];
  if (
    nature.trim() === "" ||
    values.length !== 6 ||
    values.some((value) => !Number.isInteger(value) || value < 0)
  ) {
    throw new Error(`Spreadsの形式が不正です: ${raw}`);
  }
  const maximum = investmentSystem === "stat-points" ? 32 : 252;
  if (values.some((value) => value > maximum)) {
    throw new Error(`${investmentSystem}の上限を超えています: ${raw}`);
  }
  return {
    natureId: sourceValueId(nature),
    natureSourceName: nature,
    investmentSystem,
    values: {
      hp: values[0]!,
      attack: values[1]!,
      defense: values[2]!,
      specialAttack: values[3]!,
      specialDefense: values[4]!,
      speed: values[5]!
    },
    share: normalizedShare(rawWeight, denominator, `Spreads.${raw}`),
    rawWeight
  };
}

function periodRange(period: string): { startAt: string; endAt: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new Error(`periodはYYYY-MM形式で指定してください: ${period}`);
  }
  const [year, month] = period.split("-").map(Number);
  const endDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return {
    startAt: `${period}-01`,
    endAt: `${period}-${String(endDay).padStart(2, "0")}`
  };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeShowdownSnapshot(options: {
  rawText: string;
  parsed: unknown;
  period: string;
  format: EnvironmentFormatDefinition;
  cutoff: number;
  retrievedAt: string;
  sourceUrl: string;
  pokemon: PokemonEntry[];
  aliases: EnvironmentPokemonAliases;
}): EnvironmentSnapshot {
  const raw = parseRawChaosStats(
    options.parsed,
    options.format.sourceFormatId,
    options.cutoff
  );
  const knownSlugs = new Set(options.pokemon.map((entry) => entry.slug));
  const unresolved = new Map<
    string,
    { contexts: Set<ResolutionContext>; occurrences: number }
  >();

  const resolvePokemon = (
    sourceName: string,
    context: ResolutionContext
  ): string | null => {
    const exactCandidate = sourceNameToExactSlug(sourceName);
    if (knownSlugs.has(exactCandidate)) return exactCandidate;
    const alias = options.aliases.aliases[sourceName];
    if (alias && knownSlugs.has(alias)) return alias;
    const current = unresolved.get(sourceName) ?? {
      contexts: new Set<ResolutionContext>(),
      occurrences: 0
    };
    current.contexts.add(context);
    current.occurrences += 1;
    unresolved.set(sourceName, current);
    return null;
  };

  const ranked = Object.entries(raw.data).sort(
    ([leftName, left], [rightName, right]) =>
      right.usage - left.usage || leftName.localeCompare(rightName, "en")
  );
  let unresolvedPokemonCount = 0;
  let unresolvedReferenceCount = 0;
  const pokemon = ranked.flatMap(([sourceName, value], index) => {
    const slug = resolvePokemon(sourceName, "pokemon");
    if (!slug) {
      unresolvedPokemonCount += 1;
      return [];
    }
    const distributionWeight =
      sumWeights(value.Abilities) ||
      sumWeights(value.Items) ||
      sumWeights(value.Spreads) ||
      value["Raw count"];
    const teammates: EnvironmentPokemonReference[] = Object.entries(
      value.Teammates ?? {}
    )
      .filter(([, rawWeight]) => rawWeight > 0)
      .map(([name, rawWeight]) => {
        const relatedSlug = resolvePokemon(name, "teammate");
        if (!relatedSlug) unresolvedReferenceCount += 1;
        return {
          slug: relatedSlug,
          sourceName: name,
          share: normalizedShare(rawWeight, distributionWeight, `Teammates.${name}`),
          rawWeight
        };
      })
      .sort((left, right) => right.share - left.share || left.sourceName.localeCompare(right.sourceName, "en"));
    const checksAndCounters: EnvironmentCheckCounter[] = Object.entries(
      value["Checks and Counters"] ?? {}
    )
      .map(([name, check]) => {
        const relatedSlug = resolvePokemon(name, "check-and-counter");
        if (!relatedSlug) unresolvedReferenceCount += 1;
        return {
          slug: relatedSlug,
          sourceName: name,
          share: check.p ?? 0,
          rawWeight: check.n ?? 0,
          sampleCount: check.n ?? 0,
          score: check.p ?? 0,
          uncertainty: check.d ?? 0
        };
      })
      .sort((left, right) => right.score - left.score || left.sourceName.localeCompare(right.sourceName, "en"));
    const teraSource = value["Tera Types"] ?? {};
    const teraWeight = sumWeights(teraSource) || distributionWeight;
    return [{
      slug,
      sourceName,
      usage: {
        rank: index + 1,
        rate: value.usage,
        rawCount: value["Raw count"],
        rawWeight: distributionWeight
      },
      moves: normalizeWeightedMap(value.Moves, distributionWeight, `${sourceName}.Moves`),
      items: normalizeWeightedMap(
        value.Items,
        distributionWeight,
        `${sourceName}.Items`,
        ["nothing"]
      ),
      abilities: normalizeWeightedMap(value.Abilities, distributionWeight, `${sourceName}.Abilities`),
      statSpreads: Object.entries(value.Spreads)
        .filter(([, rawWeight]) => rawWeight > 0)
        .map(([spread, rawWeight]) =>
          parseSpread(spread, rawWeight, distributionWeight, options.format.investmentSystem)
        )
        .sort((left, right) => right.share - left.share || left.natureId.localeCompare(right.natureId, "en")),
      teraTypes: normalizeWeightedMap(
        teraSource,
        teraWeight,
        `${sourceName}.Tera Types`,
        ["nothing"]
      ),
      teammates,
      checksAndCounters
    }];
  });

  const unresolvedNames: UnresolvedEnvironmentName[] = [...unresolved.entries()]
    .map(([sourceName, value]) => ({
      sourceName,
      contexts: [...value.contexts].sort(),
      occurrences: value.occurrences
    }))
    .sort((left, right) => left.sourceName.localeCompare(right.sourceName, "en"));
  const range = periodRange(options.period);
  const contentHash = sha256(options.rawText);
  const snapshotId = `pokemon-showdown:${options.period}:${options.format.sourceFormatId}:${options.cutoff}`;
  const anyTeraTypes = pokemon.some((entry) => entry.teraTypes.length > 0);
  return {
    schemaVersion: 1,
    snapshotId,
    source: {
      id: "pokemon-showdown",
      publisher: "Smogon",
      datasetKind: "simulator-aggregate",
      datasetLicense: "not-explicitly-stated",
      softwareLicense: "MIT"
    },
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
    contentHash,
    period: { kind: "month", value: options.period, ...range },
    regulationId: options.format.regulationId,
    battleFormat: options.format.battleFormat,
    sourceFormatId: options.format.sourceFormatId,
    ratingCutoff: options.cutoff,
    battleCount: raw.info["number of battles"],
    populationNote: POPULATION_NOTE,
    fieldAvailability: {
      usage: "available",
      moves: "available",
      items: "available",
      abilities: "available",
      statSpreads: "available",
      teraTypes: anyTeraTypes ? "available" : "not-applicable",
      teammates: "available",
      checksAndCounters: "available"
    },
    pokemon,
    normalization: {
      normalizerVersion: "1.1.0",
      usageUnit: "ratio",
      distributionUnit: "share-and-source-weight",
      topK: null,
      investmentSystem: options.format.investmentSystem,
      unresolvedPokemonCount,
      unresolvedReferenceCount,
      unresolvedNames
    }
  };
}
