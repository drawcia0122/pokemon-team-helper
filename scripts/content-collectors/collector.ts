import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PokemonEntry } from "../../types/pokemon";
import type {
  GeneratedPokemonContentItem,
  PokemonContentItem,
  PokemonContentSource
} from "../../types/pokemonContent";
import { normalizeContentUrl } from "../../lib/pokemonContent";
import { validatePokemonContent } from "../../lib/validatePokemonContent";
import {
  SafeContentHttpClient,
  isContentPathAllowedByRobots
} from "./http";
import {
  contentFingerprint,
  createPokemonGoContentItem,
  parsePokemonGoRss
} from "./pokemonGo";
import { getContentSourceConfigs } from "./sourceRegistry";
import {
  CONTENT_COLLECTOR_VERSION,
  type ContentCollectionResult,
  type ContentCollectionState,
  type ContentFetchClient,
  type ContentSourceConfig,
  type ContentSourceStats
} from "./types";

const currentFile = fileURLToPath(import.meta.url);
export const DEFAULT_CONTENT_ROOT = path.resolve(path.dirname(currentFile), "../..");

type CollectionPaths = {
  pokemon: string;
  manual: string;
  generated: string;
  status: string;
};

export type CollectPokemonContentOptions = {
  source?: PokemonContentSource;
  dryRun?: boolean;
  backfill?: boolean;
  rootDir?: string;
  now?: Date;
  clients?: Partial<Record<PokemonContentSource, ContentFetchClient>>;
  paths?: Partial<CollectionPaths>;
  writeFiles?: boolean;
};

const DEFAULT_PATHS: CollectionPaths = {
  pokemon: "data/pokemon.json",
  manual: "data/pokemonContent.manual.json",
  generated: "data/pokemonContent.generated.json",
  status: "data/pokemonContentCollectionStatus.json"
};

function emptyStats(status: ContentSourceStats["status"]): ContentSourceStats {
  return {
    status,
    candidateCount: 0,
    acceptedCount: 0,
    excludedCount: 0,
    duplicateCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    preservedCount: 0,
    exclusionReasons: {}
  };
}

function addReason(stats: ContentSourceStats, reason: string) {
  stats.excludedCount += 1;
  stats.exclusionReasons[reason] = (stats.exclusionReasons[reason] ?? 0) + 1;
}

function feedFingerprint(
  candidates: Array<{
    sourceArticleId: string;
    canonicalUrl: string;
    title: string;
    publishedAt: string;
  }>
) {
  const normalized = [...candidates].sort((a, b) =>
    a.sourceArticleId.localeCompare(b.sourceArticleId)
  );
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJsonIfChanged(filePath: string, value: unknown) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  const previous = await readFile(filePath, "utf8").catch(() => "");
  if (next === previous) return false;
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, next, "utf8");
  await rename(temporary, filePath);
  return true;
}

function normalizeState(value: unknown): ContentCollectionState {
  if (!value || typeof value !== "object") {
    return { version: 1, collectorVersion: CONTENT_COLLECTOR_VERSION, sources: {} };
  }
  const state = value as Partial<ContentCollectionState>;
  return {
    version: 1,
    collectorVersion: CONTENT_COLLECTOR_VERSION,
    sources: state.sources && typeof state.sources === "object" ? state.sources : {}
  };
}

function generatedBySource(
  generated: GeneratedPokemonContentItem[],
  source: PokemonContentSource
) {
  return generated.filter((item) => item.source === source);
}

function deduplicateAgainstManual(
  items: GeneratedPokemonContentItem[],
  manual: PokemonContentItem[],
  stats: ContentSourceStats
) {
  const manualIds = new Set(manual.map((item) => item.id));
  const manualUrls = new Set(manual.map((item) => normalizeContentUrl(item.url)));
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  return items.filter((item) => {
    const url = normalizeContentUrl(item.url);
    if (
      manualIds.has(item.id) ||
      manualUrls.has(url) ||
      seenIds.has(item.id) ||
      seenUrls.has(url)
    ) {
      stats.duplicateCount += 1;
      return false;
    }
    seenIds.add(item.id);
    seenUrls.add(url);
    return true;
  });
}

async function collectPokemonGoSource(input: {
  config: ContentSourceConfig;
  client: ContentFetchClient;
  existing: GeneratedPokemonContentItem[];
  manual: PokemonContentItem[];
  pokemon: PokemonEntry[];
  state: ContentCollectionState;
  nowIso: string;
  backfill: boolean;
}) {
  const stats = emptyStats("success");
  if (!input.config.automationAllowed) {
    stats.status = "disabled-by-policy";
    stats.preservedCount = input.existing.length;
    return { items: input.existing, state: input.state, stats, communicatedDomains: [] };
  }

  const communicatedDomains = [new URL(input.config.robotsUrl).hostname];
  const robots = await input.client.fetchText(input.config.robotsUrl, "text");
  if (!robots.ok) {
    stats.status = "failed";
    stats.error = `robots:${robots.reason}`;
    stats.preservedCount = input.existing.length;
    return { items: input.existing, state: input.state, stats, communicatedDomains };
  }
  if (!isContentPathAllowedByRobots(robots.text, input.config.feedUrl)) {
    stats.status = "failed";
    stats.error = "robots-disallowed";
    stats.preservedCount = input.existing.length;
    return { items: input.existing, state: input.state, stats, communicatedDomains };
  }

  communicatedDomains.push(new URL(input.config.feedUrl).hostname);
  const feed = await input.client.fetchText(input.config.feedUrl, "xml");
  if (!feed.ok) {
    stats.status = "failed";
    stats.error = `feed:${feed.reason}`;
    stats.preservedCount = input.existing.length;
    return { items: input.existing, state: input.state, stats, communicatedDomains };
  }

  let parsed: ReturnType<typeof parsePokemonGoRss>;
  try {
    parsed = parsePokemonGoRss(
      feed.text,
      input.backfill ? input.config.backfillItemLimit : input.config.normalItemLimit
    );
  } catch (error) {
    stats.status = "failed";
    stats.error = error instanceof Error ? error.message : "invalid-feed";
    stats.preservedCount = input.existing.length;
    return { items: input.existing, state: input.state, stats, communicatedDomains };
  }

  stats.candidateCount = parsed.candidates.length + parsed.excludedReasons.length;
  for (const reason of parsed.excludedReasons) addReason(stats, reason);
  if (parsed.candidates.length === 0) {
    stats.status = "empty-preserved";
    stats.preservedCount = input.existing.length;
    return { items: input.existing, state: input.state, stats, communicatedDomains };
  }

  const existingByArticleId = new Map(
    input.existing.map((item) => [item.sourceArticleId, item])
  );
  const items: GeneratedPokemonContentItem[] = [];
  const collectedArticleIds = new Set<string>();
  for (const candidate of parsed.candidates) {
    collectedArticleIds.add(candidate.sourceArticleId);
    const result = createPokemonGoContentItem({
      candidate,
      pokemon: input.pokemon,
      nowIso: input.nowIso,
      existing: existingByArticleId.get(candidate.sourceArticleId)
    });
    items.push(result.item);
    stats.acceptedCount += 1;
    if (result.change === "new") stats.newCount += 1;
    if (result.change === "updated") stats.updatedCount += 1;
    if (result.change === "unchanged") stats.unchangedCount += 1;
  }

  const retainedItems = input.existing.filter(
    (item) => !collectedArticleIds.has(item.sourceArticleId)
  );
  stats.preservedCount += retainedItems.length;
  items.push(...retainedItems);

  const deduplicated = deduplicateAgainstManual(items, input.manual, stats);
  const nextState: ContentCollectionState = {
    ...input.state,
    collectorVersion: CONTENT_COLLECTOR_VERSION,
    sources: {
      ...input.state.sources,
      "pokemon-go-official-rss": {
        feedFingerprint: feedFingerprint(parsed.candidates),
        articleIds: deduplicated.map((item) => item.sourceArticleId).sort(),
        itemFingerprints: Object.fromEntries(
          deduplicated
            .map((item) => [item.sourceArticleId, item.contentFingerprint] as const)
            .sort(([a], [b]) => a.localeCompare(b))
        )
      }
    }
  };
  return {
    items: deduplicated,
    state: nextState,
    stats,
    communicatedDomains
  };
}

async function collectPokemonContentWithConfigs(
  options: CollectPokemonContentOptions,
  configs: ContentSourceConfig[]
): Promise<ContentCollectionResult> {
  const root = options.rootDir ?? DEFAULT_CONTENT_ROOT;
  const relativePaths = { ...DEFAULT_PATHS, ...options.paths };
  const paths = Object.fromEntries(
    Object.entries(relativePaths).map(([key, value]) => [
      key,
      path.isAbsolute(value) ? value : path.join(root, value)
    ])
  ) as CollectionPaths;
  const [pokemon, manual, generated, rawState] = await Promise.all([
    readJson<PokemonEntry[]>(paths.pokemon),
    readJson<PokemonContentItem[]>(paths.manual),
    readJson<GeneratedPokemonContentItem[]>(paths.generated),
    readJson<unknown>(paths.status)
  ]);
  let state = normalizeState(rawState);
  let nextGenerated = [...generated];
  const sourceStats: ContentCollectionResult["sourceStats"] = {};
  const communicatedDomains = new Set<string>();
  let successCount = 0;
  let attemptedCount = 0;

  for (const config of configs) {
    if (config.automationAllowed) attemptedCount += 1;
    const client = options.clients?.[config.id] ?? new SafeContentHttpClient(config);
    const result = await collectPokemonGoSource({
      config,
      client,
      existing: generatedBySource(nextGenerated, config.id),
      manual,
      pokemon,
      state,
      nowIso: (options.now ?? new Date()).toISOString(),
      backfill: options.backfill ?? false
    });
    sourceStats[config.id] = result.stats;
    result.communicatedDomains.forEach((domain) => communicatedDomains.add(domain));
    if (result.stats.status === "success") successCount += 1;
    state = result.state;
    nextGenerated = [
      ...nextGenerated.filter((item) => item.source !== config.id),
      ...result.items
    ];
  }

  nextGenerated.sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)
  );
  const validationErrors = validatePokemonContent(
    [...manual, ...nextGenerated],
    new Set(pokemon.map((entry) => entry.slug))
  );
  for (const item of nextGenerated) {
    if (item.contentFingerprint !== contentFingerprint(item)) {
      validationErrors.push(`${item.id}: contentFingerprint が一致しません`);
    }
  }
  if (validationErrors.length > 0) {
    throw new Error(`生成コンテンツ検証エラー:\n${validationErrors.join("\n")}`);
  }

  const shouldWrite =
    attemptedCount > 0 &&
    (options.writeFiles ?? true) &&
    !(options.dryRun ?? false);
  let wroteFiles = false;
  if (shouldWrite) {
    const [generatedChanged, statusChanged] = await Promise.all([
      writeJsonIfChanged(paths.generated, nextGenerated),
      writeJsonIfChanged(paths.status, state)
    ]);
    wroteFiles = generatedChanged || statusChanged;
  }

  return {
    generatedItems: nextGenerated,
    state,
    sourceStats,
    wroteFiles,
    failed: attemptedCount > 0 && successCount === 0,
    communicatedDomains: [...communicatedDomains].sort()
  };
}

export async function collectPokemonContent(
  options: CollectPokemonContentOptions = {}
): Promise<ContentCollectionResult> {
  const configs = getContentSourceConfigs(options.source);
  return collectPokemonContentWithConfigs(options, configs);
}

export async function collectPokemonContentForFixtureTest(
  options: CollectPokemonContentOptions,
  fixtureConfigs: ContentSourceConfig[]
): Promise<ContentCollectionResult> {
  return collectPokemonContentWithConfigs(options, fixtureConfigs);
}
