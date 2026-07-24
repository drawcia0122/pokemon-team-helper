import { readFile, unlink } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import aliasesData from "../../data/environment/sourcePokemonAliases.json";
import registryData from "../../data/environment/formatRegistry.json";
import localizationData from "../../data/environment/localization/ja.json";
import pokemonData from "../../data/pokemon.json";
import {
  validateEnvironmentIndex,
  validateEnvironmentSnapshot
} from "../../lib/validateEnvironmentData";
import type {
  EnvironmentFormatRegistry,
  EnvironmentPokemonAliases,
  EnvironmentSnapshot,
  EnvironmentSnapshotIndex,
  EnvironmentSnapshotIndexEntry
} from "../../types/environmentData";
import type { PokemonEntry } from "../../types/pokemon";
import type { EnvironmentLocalizationDictionary } from "../../types/environmentLocalization";
import {
  environmentSourceUrl,
  fetchShowdownChaosJson,
  parseEnvironmentSourceText,
  readEnvironmentIndex,
  resolveEnvironmentFormat,
  updateEnvironmentIndex,
  writeFileAtomically
} from "./collector";
import { normalizeShowdownSnapshot } from "./normalizer";

export const ENVIRONMENT_COMPARE_THRESHOLDS = {
  minimumPokemonCount: 10,
  maximumPokemonCountDropRate: 0.25,
  maximumTop10ReplacementRate: 0.8,
  maximumDistributionCountDropRate: 0.5,
  maximumUsageSumChangeRate: 0.3
} as const;

export const ENVIRONMENT_FETCH_POLICY = {
  maximumAttempts: 3,
  baseBackoffMs: 1_000
} as const;

export type EnvironmentUpdateTarget = {
  period: string;
  sourceFormatId: string;
  cutoff: number;
};

export type EnvironmentPipelineTimings = {
  fetchMs: number;
  normalizeMs: number;
  validateMs: number;
  compareMs: number;
  publishMs: number;
  totalMs: number;
};

export type EnvironmentDatasetComparison = {
  datasetId: string;
  previousDatasetId: string | null;
  changed: boolean;
  errors: string[];
  pokemonCount: { previous: number | null; next: number };
  top10ReplacementRate: number | null;
  usageSumChangeRate: number | null;
  moveCount: { previous: number | null; next: number };
  abilityCount: { previous: number | null; next: number };
};

export type EnvironmentPipelineResult = {
  dryRun: boolean;
  changed: boolean;
  published: boolean;
  fallbackUsed: boolean;
  snapshots: EnvironmentSnapshot[];
  comparisons: EnvironmentDatasetComparison[];
  timings: EnvironmentPipelineTimings;
  jsonBytes: number;
};

export type EnvironmentPipelineOptions = {
  targets: EnvironmentUpdateTarget[];
  dryRun?: boolean;
  rootDir?: string;
  now?: Date;
  registry?: EnvironmentFormatRegistry;
  aliases?: EnvironmentPokemonAliases;
  pokemon?: PokemonEntry[];
  fetchText?: (url: string, attempt: number) => Promise<string>;
  wait?: (milliseconds: number) => Promise<void>;
  atomicWrite?: (filePath: string, value: string) => Promise<void>;
};

type PreparedSnapshot = {
  snapshot: EnvironmentSnapshot;
  snapshotPath: string;
  previous: EnvironmentSnapshot | null;
};

function elapsed(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function sumDistribution(
  snapshot: EnvironmentSnapshot,
  key: "moves" | "abilities"
): number {
  return snapshot.pokemon.reduce((sum, entry) => sum + entry[key].length, 0);
}

function usageSum(snapshot: EnvironmentSnapshot): number {
  return snapshot.pokemon.reduce((sum, entry) => sum + entry.usage.rate, 0);
}

function changeRate(previous: number, next: number): number {
  if (previous === 0) return next === 0 ? 0 : 1;
  return Math.abs(next - previous) / previous;
}

function dropRate(previous: number, next: number): number {
  if (previous === 0 || next >= previous) return 0;
  return (previous - next) / previous;
}

function top10ReplacementRate(
  previous: EnvironmentSnapshot,
  next: EnvironmentSnapshot
): number {
  const previousTop10 = new Set(
    previous.pokemon.slice(0, 10).map((entry) => entry.slug)
  );
  const retained = next.pokemon
    .slice(0, 10)
    .filter((entry) => previousTop10.has(entry.slug)).length;
  return 1 - retained / 10;
}

function assertSafeSnapshotPath(relativePath: string): void {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.includes("..") ||
    !relativePath.startsWith(
      "data/environment/snapshots/pokemon-showdown/"
    )
  ) {
    throw new Error(`unsafe-snapshot-path: ${relativePath}`);
  }
}

async function readSnapshot(
  rootDir: string,
  reference: EnvironmentSnapshotIndexEntry
): Promise<EnvironmentSnapshot> {
  assertSafeSnapshotPath(reference.path);
  return JSON.parse(
    await readFile(path.join(rootDir, reference.path), "utf8")
  ) as EnvironmentSnapshot;
}

function latestPreviousReference(
  index: EnvironmentSnapshotIndex,
  target: EnvironmentUpdateTarget
): EnvironmentSnapshotIndexEntry | null {
  return (
    index.snapshots
      .filter(
        (entry) =>
          entry.sourceFormatId === target.sourceFormatId &&
          entry.ratingCutoff === target.cutoff &&
          entry.status === "available"
      )
      .sort((left, right) => right.period.localeCompare(left.period, "en"))[0] ??
    null
  );
}

export async function fetchEnvironmentSourceWithRetry(
  url: string,
  options: {
    fetchText?: (url: string, attempt: number) => Promise<string>;
    wait?: (milliseconds: number) => Promise<void>;
  } = {}
): Promise<string> {
  const wait =
    options.wait ??
    ((milliseconds: number) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  for (
    let attempt = 1;
    attempt <= ENVIRONMENT_FETCH_POLICY.maximumAttempts;
    attempt += 1
  ) {
    try {
      return await (options.fetchText
        ? options.fetchText(url, attempt)
        : fetchShowdownChaosJson(url));
    } catch (error) {
      lastError = error;
      if (attempt === ENVIRONMENT_FETCH_POLICY.maximumAttempts) break;
      await wait(
        ENVIRONMENT_FETCH_POLICY.baseBackoffMs * 2 ** (attempt - 1)
      );
    }
  }
  throw new Error(
    `fetch-failed-after-${ENVIRONMENT_FETCH_POLICY.maximumAttempts}-attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

export function validateEnvironmentDatasetQuality(
  snapshot: EnvironmentSnapshot,
  options: {
    target: EnvironmentUpdateTarget;
    registry: EnvironmentFormatRegistry;
    aliases: EnvironmentPokemonAliases;
    pokemon: PokemonEntry[];
  }
): string[] {
  const errors = validateEnvironmentSnapshot(snapshot, {
    pokemon: options.pokemon,
    registry: options.registry,
    aliases: options.aliases
  });
  if (snapshot.period.value !== options.target.period) {
    errors.push("quality: seasonが要求値と一致しません");
  }
  if (snapshot.sourceFormatId !== options.target.sourceFormatId) {
    errors.push("quality: sourceFormatIdが要求値と一致しません");
  }
  if (snapshot.ratingCutoff !== options.target.cutoff) {
    errors.push("quality: cutoffが要求値と一致しません");
  }
  if (
    snapshot.pokemon.length <
    ENVIRONMENT_COMPARE_THRESHOLDS.minimumPokemonCount
  ) {
    errors.push(
      `quality: pokemon件数が${ENVIRONMENT_COMPARE_THRESHOLDS.minimumPokemonCount}件未満です`
    );
  }
  const top10 = snapshot.pokemon.slice(0, 10);
  if (top10.length !== 10) errors.push("quality: TOP10が存在しません");
  if (snapshot.pokemon.every((entry) => entry.usage.rate === 0)) {
    errors.push("quality: 使用率が全件0です");
  }
  if (top10.some((entry) => entry.moves.length === 0)) {
    errors.push("quality: TOP10の技データが欠損しています");
  }
  if (top10.some((entry) => entry.abilities.length === 0)) {
    errors.push("quality: TOP10の特性データが欠損しています");
  }
  const allowedUnresolved = new Set(
    options.registry.allowedUnresolvedPokemonNames
  );
  const unexpectedUnresolved = snapshot.normalization.unresolvedNames.filter(
    (entry) =>
      entry.contexts.includes("pokemon") &&
      !allowedUnresolved.has(entry.sourceName)
  );
  if (unexpectedUnresolved.length > 0) {
    errors.push(
      `quality: 未知のポケモンまたはフォームがあります (${unexpectedUnresolved
        .map((entry) => entry.sourceName)
        .join(", ")})`
    );
  }
  const localization =
    localizationData as EnvironmentLocalizationDictionary;
  const unknownValues = new Set<string>();
  for (const entry of snapshot.pokemon) {
    for (const [category, values] of [
      ["moves", entry.moves],
      ["items", entry.items],
      ["abilities", entry.abilities]
    ] as const) {
      for (const value of values) {
        if (!localization.categories[category][value.id]) {
          unknownValues.add(`${category}:${value.id}`);
        }
      }
    }
    for (const spread of entry.statSpreads) {
      if (!localization.categories.natures[spread.natureId]) {
        unknownValues.add(`natures:${spread.natureId}`);
      }
    }
  }
  if (unknownValues.size > 0) {
    errors.push(
      `quality: 未知の技・持ち物・特性・性格があります (${[
        ...unknownValues
      ].join(", ")})`
    );
  }
  return errors;
}

export function compareEnvironmentDatasets(
  previous: EnvironmentSnapshot | null,
  next: EnvironmentSnapshot
): EnvironmentDatasetComparison {
  const errors: string[] = [];
  const nextMoveCount = sumDistribution(next, "moves");
  const nextAbilityCount = sumDistribution(next, "abilities");
  if (!previous) {
    return {
      datasetId: next.snapshotId,
      previousDatasetId: null,
      changed: true,
      errors,
      pokemonCount: { previous: null, next: next.pokemon.length },
      top10ReplacementRate: null,
      usageSumChangeRate: null,
      moveCount: { previous: null, next: nextMoveCount },
      abilityCount: { previous: null, next: nextAbilityCount }
    };
  }

  const previousMoveCount = sumDistribution(previous, "moves");
  const previousAbilityCount = sumDistribution(previous, "abilities");
  const replacementRate = top10ReplacementRate(previous, next);
  const totalUsageChangeRate = changeRate(usageSum(previous), usageSum(next));
  if (next.period.value < previous.period.value) {
    errors.push(
      `compare: seasonが巻き戻っています (${previous.period.value} -> ${next.period.value})`
    );
  }
  if (next.regulationId !== previous.regulationId) {
    errors.push(
      `compare: regulationが変わりました (${previous.regulationId} -> ${next.regulationId})`
    );
  }
  if (
    next.sourceFormatId !== previous.sourceFormatId ||
    next.ratingCutoff !== previous.ratingCutoff
  ) {
    errors.push("compare: formatまたはcutoffが前回Datasetと一致しません");
  }
  const pokemonDrop = dropRate(
    previous.pokemon.length,
    next.pokemon.length
  );
  if (
    pokemonDrop >
    ENVIRONMENT_COMPARE_THRESHOLDS.maximumPokemonCountDropRate
  ) {
    errors.push(
      `compare: pokemon件数が大幅に減少しました (${previous.pokemon.length} -> ${next.pokemon.length})`
    );
  }
  if (
    replacementRate >
    ENVIRONMENT_COMPARE_THRESHOLDS.maximumTop10ReplacementRate
  ) {
    errors.push(
      `compare: TOP10の入れ替わりが閾値を超えました (${Math.round(
        replacementRate * 100
      )}%)`
    );
  }
  if (
    nextMoveCount === 0 ||
    dropRate(previousMoveCount, nextMoveCount) >
      ENVIRONMENT_COMPARE_THRESHOLDS.maximumDistributionCountDropRate
  ) {
    errors.push(
      `compare: 技データが消失または大幅減少しました (${previousMoveCount} -> ${nextMoveCount})`
    );
  }
  if (
    nextAbilityCount === 0 ||
    dropRate(previousAbilityCount, nextAbilityCount) >
      ENVIRONMENT_COMPARE_THRESHOLDS.maximumDistributionCountDropRate
  ) {
    errors.push(
      `compare: 特性データが消失または大幅減少しました (${previousAbilityCount} -> ${nextAbilityCount})`
    );
  }
  if (
    totalUsageChangeRate >
    ENVIRONMENT_COMPARE_THRESHOLDS.maximumUsageSumChangeRate
  ) {
    errors.push(
      `compare: 使用率分布の合計変化が閾値を超えました (${Math.round(
        totalUsageChangeRate * 100
      )}%)`
    );
  }
  return {
    datasetId: next.snapshotId,
    previousDatasetId: previous.snapshotId,
    changed:
      previous.contentHash !== next.contentHash ||
      previous.normalization.normalizerVersion !==
        next.normalization.normalizerVersion,
    errors,
    pokemonCount: {
      previous: previous.pokemon.length,
      next: next.pokemon.length
    },
    top10ReplacementRate: replacementRate,
    usageSumChangeRate: totalUsageChangeRate,
    moveCount: { previous: previousMoveCount, next: nextMoveCount },
    abilityCount: {
      previous: previousAbilityCount,
      next: nextAbilityCount
    }
  };
}

async function validateNextIndex(
  rootDir: string,
  index: EnvironmentSnapshotIndex,
  preparedByPath: Map<string, EnvironmentSnapshot>
): Promise<void> {
  const snapshotsByPath = new Map<string, EnvironmentSnapshot>();
  for (const entry of index.snapshots) {
    snapshotsByPath.set(
      entry.path,
      preparedByPath.get(entry.path) ?? (await readSnapshot(rootDir, entry))
    );
  }
  const errors = validateEnvironmentIndex(index, snapshotsByPath);
  if (errors.length > 0) {
    throw new Error(`publish-index-invalid:\n${errors.join("\n")}`);
  }
}

async function publishPreparedSnapshots(options: {
  rootDir: string;
  previousIndex: EnvironmentSnapshotIndex;
  prepared: PreparedSnapshot[];
  publishedAt: string;
  atomicWrite: (filePath: string, value: string) => Promise<void>;
}): Promise<void> {
  let nextIndex = options.previousIndex;
  const changed = options.prepared.filter(({ snapshot, previous }) => {
    return (
      !previous ||
      previous.contentHash !== snapshot.contentHash ||
      previous.normalization.normalizerVersion !==
        snapshot.normalization.normalizerVersion
    );
  });
  for (const entry of changed) {
    nextIndex = updateEnvironmentIndex(
      nextIndex,
      entry.snapshot,
      entry.snapshotPath,
      options.publishedAt
    );
  }
  const preparedByPath = new Map(
    changed.map((entry) => [entry.snapshotPath, entry.snapshot])
  );
  await validateNextIndex(options.rootDir, nextIndex, preparedByPath);

  const backups = new Map<string, string | null>();
  const writtenPaths: string[] = [];
  const indexPath = path.join(
    options.rootDir,
    "data/environment/index.json"
  );
  try {
    for (const entry of changed) {
      const absolutePath = path.join(options.rootDir, entry.snapshotPath);
      let previousText: string | null = null;
      try {
        previousText = await readFile(absolutePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      backups.set(absolutePath, previousText);
      await options.atomicWrite(
        absolutePath,
        `${JSON.stringify(entry.snapshot)}\n`
      );
      writtenPaths.push(absolutePath);
    }
    await options.atomicWrite(
      indexPath,
      `${JSON.stringify(nextIndex, null, 2)}\n`
    );
  } catch (error) {
    for (const absolutePath of writtenPaths.reverse()) {
      const backup = backups.get(absolutePath);
      if (backup === null) {
        await unlink(absolutePath).catch(() => {});
      } else if (typeof backup === "string") {
        await writeFileAtomically(absolutePath, backup);
      }
    }
    throw error;
  }
}

export async function runEnvironmentDataPipeline(
  options: EnvironmentPipelineOptions
): Promise<EnvironmentPipelineResult> {
  if (options.targets.length === 0) {
    throw new Error("environment update targetがありません");
  }
  const totalStartedAt = performance.now();
  const timings: EnvironmentPipelineTimings = {
    fetchMs: 0,
    normalizeMs: 0,
    validateMs: 0,
    compareMs: 0,
    publishMs: 0,
    totalMs: 0
  };
  const rootDir = options.rootDir ?? process.cwd();
  const registry =
    options.registry ?? (registryData as EnvironmentFormatRegistry);
  const aliases =
    options.aliases ?? (aliasesData as EnvironmentPokemonAliases);
  const pokemon = options.pokemon ?? (pokemonData as PokemonEntry[]);
  const previousIndex = await readEnvironmentIndex(rootDir);
  const prepared: PreparedSnapshot[] = [];

  for (const target of options.targets) {
    const format = resolveEnvironmentFormat({
      registry,
      aliases,
      pokemon,
      sourceFormatId: target.sourceFormatId,
      cutoff: target.cutoff
    });
    const url = environmentSourceUrl(
      target.period,
      target.sourceFormatId,
      target.cutoff
    );
    const fetchStartedAt = performance.now();
    const rawText = await fetchEnvironmentSourceWithRetry(url, {
      fetchText: options.fetchText,
      wait: options.wait
    });
    timings.fetchMs += elapsed(fetchStartedAt);

    const normalizeStartedAt = performance.now();
    const parsed = await parseEnvironmentSourceText(rawText);
    const snapshot = normalizeShowdownSnapshot({
      rawText,
      parsed,
      period: target.period,
      format,
      cutoff: target.cutoff,
      retrievedAt: (options.now ?? new Date()).toISOString(),
      sourceUrl: url,
      pokemon,
      aliases
    });
    timings.normalizeMs += elapsed(normalizeStartedAt);

    const validateStartedAt = performance.now();
    const errors = validateEnvironmentDatasetQuality(snapshot, {
      target,
      registry,
      aliases,
      pokemon
    });
    timings.validateMs += elapsed(validateStartedAt);
    if (errors.length > 0) {
      throw new Error(`validation-failed:\n${errors.join("\n")}`);
    }

    const reference = latestPreviousReference(previousIndex, target);
    const previous = reference
      ? await readSnapshot(rootDir, reference)
      : null;
    prepared.push({
      snapshot,
      snapshotPath: `data/environment/snapshots/pokemon-showdown/${target.period}/${target.sourceFormatId}-${target.cutoff}.json`,
      previous
    });
  }

  const compareStartedAt = performance.now();
  const comparisons = prepared.map((entry) =>
    compareEnvironmentDatasets(entry.previous, entry.snapshot)
  );
  timings.compareMs = elapsed(compareStartedAt);
  const compareErrors = comparisons.flatMap((comparison) =>
    comparison.errors.map(
      (error) => `${comparison.datasetId}: ${error}`
    )
  );
  if (compareErrors.length > 0) {
    throw new Error(`compare-failed:\n${compareErrors.join("\n")}`);
  }
  const changed = comparisons.some((comparison) => comparison.changed);
  let published = false;
  if (changed && !options.dryRun) {
    const publishStartedAt = performance.now();
    await publishPreparedSnapshots({
      rootDir,
      previousIndex,
      prepared,
      publishedAt: (options.now ?? new Date()).toISOString(),
      atomicWrite: options.atomicWrite ?? writeFileAtomically
    });
    timings.publishMs = elapsed(publishStartedAt);
    published = true;
  }
  timings.totalMs = elapsed(totalStartedAt);
  return {
    dryRun: Boolean(options.dryRun),
    changed,
    published,
    fallbackUsed: false,
    snapshots: prepared.map((entry) => entry.snapshot),
    comparisons,
    timings,
    jsonBytes: prepared.reduce(
      (sum, entry) =>
        sum + Buffer.byteLength(JSON.stringify(entry.snapshot)),
      0
    )
  };
}
