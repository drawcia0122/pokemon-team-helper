import { mkdtemp, mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import formatRegistryData from "../../data/environment/formatRegistry.json";
import aliasesData from "../../data/environment/sourcePokemonAliases.json";
import pokemonData from "../../data/pokemon.json";
import {
  validateEnvironmentAliases,
  validateEnvironmentIndex,
  validateEnvironmentRegistry,
  validateEnvironmentSnapshot
} from "../../lib/validateEnvironmentData";
import type {
  EnvironmentFormatDefinition,
  EnvironmentFormatRegistry,
  EnvironmentPokemonAliases,
  EnvironmentSnapshot,
  EnvironmentSnapshotIndex,
  EnvironmentSnapshotIndexEntry
} from "../../types/environmentData";
import type { PokemonEntry } from "../../types/pokemon";
import { normalizeShowdownSnapshot } from "./normalizer";

const USER_AGENT =
  "PokemonTeamHelperEnvironmentCollector/1.0 (+https://github.com/drawcia0122/pokemon-team-helper)";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;

export type EnvironmentCollectionOptions = {
  period: string;
  sourceFormatId: string;
  cutoff: number;
  dryRun?: boolean;
  rootDir?: string;
  now?: Date;
  fetchText?: (url: string) => Promise<string>;
  registry?: EnvironmentFormatRegistry;
  aliases?: EnvironmentPokemonAliases;
  pokemon?: PokemonEntry[];
  atomicWrite?: (filePath: string, value: string) => Promise<void>;
};

export type EnvironmentCollectionResult = {
  snapshot: EnvironmentSnapshot;
  snapshotPath: string;
  sourceUrl: string;
  dryRun: boolean;
  changed: boolean;
  wroteFiles: boolean;
  hashMatched: boolean;
};

function sourceUrl(period: string, sourceFormatId: string, cutoff: number) {
  return `https://www.smogon.com/stats/${period}/chaos/${sourceFormatId}-${cutoff}.json`;
}

async function readLimitedResponse(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type")?.toLocaleLowerCase("en") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`unsupported-content-type: ${contentType || "missing"}`);
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error("response-too-large");
  }
  if (!response.body) throw new Error("empty-response-body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("response-too-large");
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

export async function fetchShowdownChaosJson(url: string): Promise<string> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "www.smogon.com" ||
    !/^\/stats\/\d{4}-(?:0[1-9]|1[0-2])\/chaos\/[a-z0-9]+-(?:0|1760)\.json$/.test(
      parsed.pathname
    )
  ) {
    throw new Error("blocked-environment-url");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed, {
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT
      }
    });
    if (!response.ok) throw new Error(`http-${response.status}`);
    return await readLimitedResponse(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("request-timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function writeFileAtomically(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, value, "utf8");
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function assertConfiguration(options: {
  registry: EnvironmentFormatRegistry;
  aliases: EnvironmentPokemonAliases;
  pokemon: PokemonEntry[];
  sourceFormatId: string;
  cutoff: number;
}): EnvironmentFormatDefinition {
  const registryResult = validateEnvironmentRegistry(options.registry);
  if (registryResult.errors.length > 0) {
    throw new Error(registryResult.errors.join("\n"));
  }
  const aliasResult = validateEnvironmentAliases(options.aliases, options.pokemon);
  if (aliasResult.errors.length > 0) throw new Error(aliasResult.errors.join("\n"));
  const format = options.registry.formats.find(
    (entry) => entry.sourceFormatId === options.sourceFormatId && entry.enabled
  );
  if (!format) throw new Error(`未登録または無効なformatです: ${options.sourceFormatId}`);
  if (!options.registry.allowedCutoffs.includes(options.cutoff)) {
    throw new Error(`未登録のcutoffです: ${options.cutoff}`);
  }
  return format;
}

function emptyIndex(): EnvironmentSnapshotIndex {
  return { schemaVersion: 1, snapshots: [], latest: [] };
}

async function readIndex(rootDir: string): Promise<EnvironmentSnapshotIndex> {
  try {
    return JSON.parse(
      await readFile(path.join(rootDir, "data/environment/index.json"), "utf8")
    ) as EnvironmentSnapshotIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyIndex();
    throw error;
  }
}

function updateIndex(
  previous: EnvironmentSnapshotIndex,
  snapshot: EnvironmentSnapshot,
  snapshotPath: string
): EnvironmentSnapshotIndex {
  const entry: EnvironmentSnapshotIndexEntry = {
    snapshotId: snapshot.snapshotId,
    source: "pokemon-showdown",
    period: snapshot.period.value,
    regulationId: snapshot.regulationId,
    battleFormat: snapshot.battleFormat,
    sourceFormatId: snapshot.sourceFormatId,
    ratingCutoff: snapshot.ratingCutoff,
    status: "available",
    path: snapshotPath,
    retrievedAt: snapshot.retrievedAt,
    contentHash: snapshot.contentHash
  };
  const snapshots = previous.snapshots
    .filter((item) => item.snapshotId !== entry.snapshotId)
    .concat(entry)
    .sort(
      (left, right) =>
        left.period.localeCompare(right.period, "en") ||
        left.sourceFormatId.localeCompare(right.sourceFormatId, "en") ||
        left.ratingCutoff - right.ratingCutoff
    );
  const latestByKey = new Map<string, EnvironmentSnapshotIndexEntry>();
  for (const item of snapshots) {
    const key = `${item.sourceFormatId}:${item.ratingCutoff}`;
    const current = latestByKey.get(key);
    if (!current || item.period > current.period) latestByKey.set(key, item);
  }
  const latest = [...latestByKey.values()]
    .sort(
      (left, right) =>
        left.sourceFormatId.localeCompare(right.sourceFormatId, "en") ||
        left.ratingCutoff - right.ratingCutoff
    )
    .map((item) => ({
      sourceFormatId: item.sourceFormatId,
      ratingCutoff: item.ratingCutoff,
      snapshotId: item.snapshotId,
      path: item.path
    }));
  return { schemaVersion: 1, snapshots, latest };
}

async function parseThroughTemporaryFile(rawText: string): Promise<unknown> {
  const directory = await mkdtemp(path.join(tmpdir(), "pokemon-environment-"));
  const temporaryPath = path.join(directory, "source.json");
  try {
    await writeFile(temporaryPath, rawText, "utf8");
    return JSON.parse(await readFile(temporaryPath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("invalid-json");
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function collectEnvironmentSnapshot(
  options: EnvironmentCollectionOptions
): Promise<EnvironmentCollectionResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const registry = options.registry ?? (formatRegistryData as EnvironmentFormatRegistry);
  const aliases = options.aliases ?? (aliasesData as EnvironmentPokemonAliases);
  const pokemon = options.pokemon ?? (pokemonData as PokemonEntry[]);
  const format = assertConfiguration({
    registry,
    aliases,
    pokemon,
    sourceFormatId: options.sourceFormatId,
    cutoff: options.cutoff
  });
  const url = sourceUrl(options.period, options.sourceFormatId, options.cutoff);
  const rawText = await (options.fetchText ?? fetchShowdownChaosJson)(url);
  const parsed = await parseThroughTemporaryFile(rawText);
  const snapshot = normalizeShowdownSnapshot({
    rawText,
    parsed,
    period: options.period,
    format,
    cutoff: options.cutoff,
    retrievedAt: (options.now ?? new Date()).toISOString(),
    sourceUrl: url,
    pokemon,
    aliases
  });
  const errors = validateEnvironmentSnapshot(snapshot, { pokemon, registry, aliases });
  if (errors.length > 0) throw new Error(errors.join("\n"));

  const snapshotPath = `data/environment/snapshots/pokemon-showdown/${options.period}/${options.sourceFormatId}-${options.cutoff}.json`;
  const previousIndex = await readIndex(rootDir);
  const existing = previousIndex.snapshots.find(
    (entry) => entry.snapshotId === snapshot.snapshotId
  );
  let existingNormalizerVersion: string | undefined;
  if (existing?.contentHash === snapshot.contentHash) {
    try {
      const existingSnapshot = JSON.parse(
        await readFile(path.join(rootDir, existing.path), "utf8")
      ) as Partial<EnvironmentSnapshot>;
      existingNormalizerVersion = existingSnapshot.normalization?.normalizerVersion;
    } catch {
      existingNormalizerVersion = undefined;
    }
  }
  const hashMatched =
    existing?.contentHash === snapshot.contentHash &&
    existingNormalizerVersion === snapshot.normalization.normalizerVersion;
  if (hashMatched || options.dryRun) {
    return {
      snapshot,
      snapshotPath,
      sourceUrl: url,
      dryRun: Boolean(options.dryRun),
      changed: !hashMatched,
      wroteFiles: false,
      hashMatched
    };
  }

  const nextIndex = updateIndex(previousIndex, snapshot, snapshotPath);
  const indexErrors = validateEnvironmentIndex(
    nextIndex,
    new Map([[snapshotPath, snapshot]])
  ).filter((error) => !error.includes("snapshot fileがありません") && !error.includes("未登録snapshot"));
  if (indexErrors.length > 0) throw new Error(indexErrors.join("\n"));
  const writeAtomic = options.atomicWrite ?? writeFileAtomically;
  const absoluteSnapshotPath = path.join(rootDir, snapshotPath);
  const absoluteIndexPath = path.join(rootDir, "data/environment/index.json");
  let previousSnapshotText: string | null = null;
  try {
    previousSnapshotText = await readFile(absoluteSnapshotPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeAtomic(absoluteSnapshotPath, `${JSON.stringify(snapshot)}\n`);
  try {
    await writeAtomic(absoluteIndexPath, `${JSON.stringify(nextIndex, null, 2)}\n`);
  } catch (error) {
    if (previousSnapshotText === null) await unlink(absoluteSnapshotPath).catch(() => {});
    else await writeFileAtomically(absoluteSnapshotPath, previousSnapshotText);
    throw error;
  }
  return {
    snapshot,
    snapshotPath,
    sourceUrl: url,
    dryRun: false,
    changed: true,
    wroteFiles: true,
    hashMatched: false
  };
}

export const DEFAULT_ENVIRONMENT_REGISTRY = formatRegistryData as EnvironmentFormatRegistry;
export const DEFAULT_ENVIRONMENT_ALIASES = aliasesData as EnvironmentPokemonAliases;
