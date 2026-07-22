import type {
  EnvironmentFormatRegistry,
  EnvironmentPokemonAliases,
  EnvironmentSnapshot,
  EnvironmentSnapshotIndex,
  EnvironmentSnapshotIndexEntry,
  InvestmentSystem
} from "@/types/environmentData";
import type { PokemonEntry } from "@/types/pokemon";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validNumber(value: unknown, minimum = 0, maximum = Number.POSITIVE_INFINITY) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function validateEnvironmentRegistry(
  value: unknown
): { errors: string[]; registry: EnvironmentFormatRegistry | null } {
  const errors: string[] = [];
  if (!isRecord(value)) return { errors: ["formatRegistry: オブジェクトではありません"], registry: null };
  const registry = value as unknown as EnvironmentFormatRegistry;
  if (registry.schemaVersion !== 1) errors.push("formatRegistry: schemaVersionが不正です");
  if (registry.source !== "pokemon-showdown") errors.push("formatRegistry: sourceが不正です");
  if (registry.allowedHost !== "www.smogon.com") errors.push("formatRegistry: allowedHostが不正です");
  if (
    !Array.isArray(registry.allowedCutoffs) ||
    registry.allowedCutoffs.length === 0 ||
    registry.allowedCutoffs.some((cutoff) => !Number.isInteger(cutoff) || cutoff < 0) ||
    new Set(registry.allowedCutoffs).size !== registry.allowedCutoffs.length
  ) {
    errors.push("formatRegistry: allowedCutoffsが不正です");
  } else if (
    registry.allowedCutoffs.length !== 2 ||
    !registry.allowedCutoffs.includes(0) ||
    !registry.allowedCutoffs.includes(1760)
  ) {
    errors.push("formatRegistry: cutoffは0と1760だけを許可してください");
  }
  if (!Array.isArray(registry.formats) || registry.formats.length === 0) {
    errors.push("formatRegistry: formatsが空です");
  } else {
    const ids = new Set<string>();
    for (const format of registry.formats) {
      if (!format || typeof format.sourceFormatId !== "string" || format.sourceFormatId.trim() === "") {
        errors.push("formatRegistry: sourceFormatIdが不正です");
        continue;
      }
      if (ids.has(format.sourceFormatId)) errors.push(`formatRegistry: format重複 ${format.sourceFormatId}`);
      ids.add(format.sourceFormatId);
      if (!(["M-A", "M-B"] as const).includes(format.regulationId)) {
        errors.push(`formatRegistry: regulationIdが不正です ${format.sourceFormatId}`);
      }
      if (!(["single", "double"] as const).includes(format.battleFormat)) {
        errors.push(`formatRegistry: battleFormatが不正です ${format.sourceFormatId}`);
      }
      if (!(["ev", "stat-points"] as InvestmentSystem[]).includes(format.investmentSystem)) {
        errors.push(`formatRegistry: investmentSystemが不正です ${format.sourceFormatId}`);
      }
    }
    const requiredFormats = new Set([
      "gen9championsbssregma",
      "gen9championsbssregmb",
      "gen9championsvgc2026regma",
      "gen9championsvgc2026regmb"
    ]);
    if (
      ids.size !== requiredFormats.size ||
      [...requiredFormats].some((id) => !ids.has(id))
    ) {
      errors.push("formatRegistry: TASK023対象の4 formatと一致しません");
    }
  }
  const homePolicy = Array.isArray(registry.sourcePolicies)
    ? registry.sourcePolicies.find((policy) => policy.source === "pokemon-home")
    : undefined;
  if (
    !homePolicy ||
    homePolicy.automationAllowed !== false ||
    homePolicy.reason !==
      "no-public-api-and-terms-restrict-reverse-engineering-and-redistribution"
  ) {
    errors.push("formatRegistry: Pokemon HOME policy gateが不正です");
  }
  return { errors, registry: errors.length === 0 ? registry : null };
}

export function validateEnvironmentAliases(
  value: unknown,
  pokemon: PokemonEntry[]
): { errors: string[]; aliases: EnvironmentPokemonAliases | null } {
  const errors: string[] = [];
  if (!isRecord(value)) return { errors: ["sourcePokemonAliases: オブジェクトではありません"], aliases: null };
  const aliases = value as unknown as EnvironmentPokemonAliases;
  if (aliases.schemaVersion !== 1) errors.push("sourcePokemonAliases: schemaVersionが不正です");
  if (aliases.source !== "pokemon-showdown") errors.push("sourcePokemonAliases: sourceが不正です");
  if (!isRecord(aliases.aliases)) {
    errors.push("sourcePokemonAliases: aliasesが不正です");
  } else {
    const known = new Set(pokemon.map((entry) => entry.slug));
    for (const [sourceName, slug] of Object.entries(aliases.aliases)) {
      if (sourceName.trim() === "" || typeof slug !== "string" || !known.has(slug)) {
        errors.push(`sourcePokemonAliases: aliasが不正です ${sourceName} -> ${String(slug)}`);
      }
    }
  }
  return { errors, aliases: errors.length === 0 ? aliases : null };
}

function validateWeightedValues(
  values: unknown,
  context: string,
  errors: string[]
) {
  if (!Array.isArray(values)) {
    errors.push(`${context}: 配列ではありません`);
    return;
  }
  const ids = new Set<string>();
  for (const value of values) {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      value.id.trim() === "" ||
      typeof value.sourceName !== "string" ||
      value.sourceName.trim() === ""
    ) {
      errors.push(`${context}: idが不正です`);
      continue;
    }
    if (ids.has(value.id)) errors.push(`${context}: id重複 ${value.id}`);
    ids.add(value.id);
    if (!validNumber(value.share, 0, 1)) errors.push(`${context}.${value.id}: shareが不正です`);
    if (!validNumber(value.rawWeight)) errors.push(`${context}.${value.id}: rawWeightが不正です`);
  }
}

export function validateEnvironmentSnapshot(
  value: unknown,
  options: {
    pokemon: PokemonEntry[];
    registry: EnvironmentFormatRegistry;
    aliases: EnvironmentPokemonAliases;
  }
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["snapshot: オブジェクトではありません"];
  const snapshot = value as unknown as EnvironmentSnapshot;
  const format = options.registry.formats.find(
    (entry) => entry.sourceFormatId === snapshot.sourceFormatId
  );
  if (snapshot.schemaVersion !== 1) errors.push("snapshot: schemaVersionが不正です");
  const expectedId = `pokemon-showdown:${snapshot.period?.value}:${snapshot.sourceFormatId}:${snapshot.ratingCutoff}`;
  if (snapshot.snapshotId !== expectedId) errors.push("snapshot: snapshotIdが不正です");
  if (snapshot.source?.id !== "pokemon-showdown" || snapshot.source?.publisher !== "Smogon") {
    errors.push("snapshot: sourceが不正です");
  }
  if (
    snapshot.source?.datasetLicense !== "not-explicitly-stated" ||
    snapshot.source?.softwareLicense !== "MIT"
  ) {
    errors.push("snapshot: sourceのライセンス表記が不正です");
  }
  try {
    const sourceUrl = new URL(snapshot.sourceUrl);
    if (
      sourceUrl.protocol !== "https:" ||
      sourceUrl.hostname !== options.registry.allowedHost ||
      !sourceUrl.pathname.endsWith(`/${snapshot.sourceFormatId}-${snapshot.ratingCutoff}.json`)
    ) {
      errors.push("snapshot: sourceUrlがallowlistまたはformatと一致しません");
    }
  } catch {
    errors.push("snapshot: sourceUrlがURLではありません");
  }
  if (!validIsoDateTime(snapshot.retrievedAt)) errors.push("snapshot: retrievedAtが不正です");
  if (!validHash(snapshot.contentHash)) errors.push("snapshot: contentHashが不正です");
  if (!format) {
    errors.push(`snapshot: 未登録formatです ${snapshot.sourceFormatId}`);
  } else {
    if (snapshot.regulationId !== format.regulationId) errors.push("snapshot: regulationIdがregistryと不一致です");
    if (snapshot.battleFormat !== format.battleFormat) errors.push("snapshot: battleFormatがregistryと不一致です");
    if (snapshot.normalization?.investmentSystem !== format.investmentSystem) {
      errors.push("snapshot: investmentSystemがregistryと不一致です");
    }
  }
  if (!options.registry.allowedCutoffs.includes(snapshot.ratingCutoff)) {
    errors.push("snapshot: ratingCutoffがregistryにありません");
  }
  if (!Number.isInteger(snapshot.battleCount) || snapshot.battleCount <= 0) {
    errors.push("snapshot: battleCountが不正です");
  }
  if (!Array.isArray(snapshot.pokemon)) {
    errors.push("snapshot: pokemonが配列ではありません");
    return errors;
  }
  const knownSlugs = new Set(options.pokemon.map((entry) => entry.slug));
  const slugs = new Set<string>();
  const ranks = new Set<number>();
  for (const entry of snapshot.pokemon) {
    const context = `snapshot.pokemon.${String(entry?.sourceName ?? "unknown")}`;
    if (!entry || !knownSlugs.has(entry.slug)) errors.push(`${context}: slugが存在しません ${String(entry?.slug)}`);
    if (slugs.has(entry.slug)) errors.push(`${context}: slugが重複しています`);
    slugs.add(entry.slug);
    if (!Number.isInteger(entry.usage?.rank) || entry.usage.rank <= 0) errors.push(`${context}: rankが不正です`);
    else if (ranks.has(entry.usage.rank)) errors.push(`${context}: rankが重複しています`);
    else ranks.add(entry.usage.rank);
    if (!validNumber(entry.usage?.rate, 0, 1)) errors.push(`${context}: usage.rateが不正です`);
    if (!Number.isInteger(entry.usage?.rawCount) || entry.usage.rawCount < 0) errors.push(`${context}: rawCountが不正です`);
    if (!validNumber(entry.usage?.rawWeight)) errors.push(`${context}: usage.rawWeightが不正です`);
    validateWeightedValues(entry.moves, `${context}.moves`, errors);
    validateWeightedValues(entry.items, `${context}.items`, errors);
    validateWeightedValues(entry.abilities, `${context}.abilities`, errors);
    validateWeightedValues(entry.teraTypes, `${context}.teraTypes`, errors);
    if (!Array.isArray(entry.statSpreads)) {
      errors.push(`${context}.statSpreads: 配列ではありません`);
    } else {
      for (const spread of entry.statSpreads) {
        const max = spread.investmentSystem === "stat-points" ? 32 : 252;
        if (
          typeof spread.natureId !== "string" ||
          spread.natureId.trim() === "" ||
          typeof spread.natureSourceName !== "string" ||
          spread.natureSourceName.trim() === ""
        ) {
          errors.push(`${context}.statSpreads: natureが不正です`);
        }
        if (spread.investmentSystem !== format?.investmentSystem) errors.push(`${context}.statSpreads: investmentSystemが不一致です`);
        if (!validNumber(spread.share, 0, 1) || !validNumber(spread.rawWeight)) errors.push(`${context}.statSpreads: share/rawWeightが不正です`);
        if (
          !spread.values ||
          Object.values(spread.values).some(
            (amount) => !Number.isInteger(amount) || amount < 0 || amount > max
          )
        ) {
          errors.push(`${context}.statSpreads: 配分値が不正です`);
        }
      }
    }
    for (const [key, references] of [
      ["teammates", entry.teammates],
      ["checksAndCounters", entry.checksAndCounters]
    ] as const) {
      if (!Array.isArray(references)) {
        errors.push(`${context}.${key}: 配列ではありません`);
        continue;
      }
      for (const reference of references) {
        if (reference.slug !== null && !knownSlugs.has(reference.slug)) errors.push(`${context}.${key}: slugが存在しません ${reference.slug}`);
        if (!validNumber(reference.share, 0, 1) || !validNumber(reference.rawWeight)) errors.push(`${context}.${key}: share/rawWeightが不正です`);
      }
    }
  }
  if (
    !snapshot.normalization ||
    snapshot.normalization.normalizerVersion !== "1.1.0" ||
    !Number.isInteger(snapshot.normalization.unresolvedPokemonCount) ||
    snapshot.normalization.unresolvedPokemonCount < 0 ||
    !Number.isInteger(snapshot.normalization.unresolvedReferenceCount) ||
    snapshot.normalization.unresolvedReferenceCount < 0 ||
    !Array.isArray(snapshot.normalization.unresolvedNames)
  ) {
    errors.push("snapshot: normalizationのunresolved情報が不正です");
  }
  return errors;
}

function indexEntryMatchesSnapshot(
  entry: EnvironmentSnapshotIndexEntry,
  snapshot: EnvironmentSnapshot
): boolean {
  return (
    entry.snapshotId === snapshot.snapshotId &&
    entry.sourceFormatId === snapshot.sourceFormatId &&
    entry.ratingCutoff === snapshot.ratingCutoff &&
    entry.period === snapshot.period.value &&
    entry.regulationId === snapshot.regulationId &&
    entry.battleFormat === snapshot.battleFormat &&
    entry.retrievedAt === snapshot.retrievedAt &&
    entry.contentHash === snapshot.contentHash
  );
}

export function validateEnvironmentIndex(
  value: unknown,
  snapshotsByPath: Map<string, EnvironmentSnapshot>
): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["environment index: オブジェクトではありません"];
  const index = value as unknown as EnvironmentSnapshotIndex;
  if (index.schemaVersion !== 1) errors.push("environment index: schemaVersionが不正です");
  if (!Array.isArray(index.snapshots) || !Array.isArray(index.latest)) {
    errors.push("environment index: snapshots/latestが不正です");
    return errors;
  }
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const entry of index.snapshots) {
    if (ids.has(entry.snapshotId)) errors.push(`environment index: snapshotId重複 ${entry.snapshotId}`);
    if (paths.has(entry.path)) errors.push(`environment index: path重複 ${entry.path}`);
    ids.add(entry.snapshotId);
    paths.add(entry.path);
    if (entry.status !== "available") errors.push(`environment index: statusが不正です ${entry.snapshotId}`);
    const snapshot = snapshotsByPath.get(entry.path);
    if (!snapshot) errors.push(`environment index: snapshot fileがありません ${entry.path}`);
    else if (!indexEntryMatchesSnapshot(entry, snapshot)) errors.push(`environment index: snapshotと不一致です ${entry.path}`);
  }
  for (const [path] of snapshotsByPath) {
    if (!paths.has(path)) errors.push(`environment index: 未登録snapshotです ${path}`);
  }
  const latestKeys = new Set<string>();
  for (const latest of index.latest) {
    const key = `${latest.sourceFormatId}:${latest.ratingCutoff}`;
    if (latestKeys.has(key)) errors.push(`environment index: latest重複 ${key}`);
    latestKeys.add(key);
    const entry = index.snapshots.find((candidate) => candidate.snapshotId === latest.snapshotId);
    if (!entry || entry.path !== latest.path || entry.sourceFormatId !== latest.sourceFormatId || entry.ratingCutoff !== latest.ratingCutoff) {
      errors.push(`environment index: latestがsnapshotと不一致です ${key}`);
    }
  }
  return errors;
}
