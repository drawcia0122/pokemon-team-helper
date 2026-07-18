import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BuildArticle,
  BuildArticleSource,
  GeneratedBuildArticle
} from "../../types/buildArticle";
import type { AppMeta, PokemonEntry } from "../../types/pokemon";
import {
  applyFetchFailure,
  createOrUpdateGeneratedArticle,
  findGeneratedMatch,
  matchesManualArticle
} from "./deduplicate";
import { SafeHttpClient, isAllowedByRobots } from "./http";
import { normalizeUrl } from "./normalize";
import { parseNoteArticle, parseNoteCandidateList } from "./note";
import { parsePokesolArticle, parsePokesolCandidateList } from "./pokesol";
import { getSourceConfigs } from "./sourceRegistry";
import type {
  ArticleCandidate,
  CandidateCollectionState,
  CollectionStatus,
  FetchResult,
  SourceCollectionCursor,
  SourceCollectionStats,
  SourceConfig
} from "./types";
import { EXTRACTOR_VERSION } from "./types";
import { validateGeneratedCollection } from "./validate";

const currentFile = fileURLToPath(import.meta.url);
export const DEFAULT_ROOT_DIR = path.resolve(path.dirname(currentFile), "../..");

type FetchClient = {
  fetchText(
    value: string,
    expected: "html" | "text"
  ): Promise<FetchResult>;
};

export type CollectionPaths = {
  appMeta: string;
  pokemon: string;
  manualArticles: string;
  generatedArticles: string;
  status: string;
};

export type CollectionResult = {
  status: CollectionStatus;
  generatedArticles: GeneratedBuildArticle[];
  wroteFiles: boolean;
  failed: boolean;
};

export type CollectionOptions = {
  source?: BuildArticleSource;
  dryRun?: boolean;
  rootDir?: string;
  now?: Date;
  sourceConfigs?: SourceConfig[];
  clients?: Partial<Record<BuildArticleSource, FetchClient>>;
  paths?: Partial<CollectionPaths>;
  writeFiles?: boolean;
};

const DEFAULT_RELATIVE_PATHS: CollectionPaths = {
  appMeta: "data/appMeta.json",
  pokemon: "data/pokemon.json",
  manualArticles: "data/buildArticles.manual.json",
  generatedArticles: "data/buildArticles.generated.json",
  status: "data/buildArticleCollectionStatus.json"
};

function createStats(
  status: SourceCollectionStats["status"]
): SourceCollectionStats {
  return {
    status,
    candidateUrlCount: 0,
    candidateCount: 0,
    knownCandidateCount: 0,
    fetchedCount: 0,
    remainingCount: 0,
    publishedCount: 0,
    completePublishedCount: 0,
    metadataOnlyPublishedCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    excludedCount: 0,
    fetchFailureCount: 0,
    extractionSuccessCount: 0,
    completeCount: 0,
    metadataOnlyCount: 0,
    thumbnailFoundCount: 0,
    thumbnailMissingCount: 0,
    thumbnailUpdatedCount: 0,
    thumbnailRejectedCount: 0,
    fallbackCount: 0,
    completePromotedCount: 0,
    thumbnailDomains: {},
    teamExtractionMethods: {},
    metadataOnlyReasons: {},
    exclusionReasons: {}
  };
}

function emptyCursor(): SourceCollectionCursor {
  return { nextIndex: 0, candidates: [] };
}

function normalizeCursor(value: unknown): SourceCollectionCursor {
  if (!value || typeof value !== "object") return emptyCursor();
  const record = value as Partial<SourceCollectionCursor>;
  const candidates = Array.isArray(record.candidates)
    ? record.candidates.filter(
        (entry): entry is CandidateCollectionState =>
          Boolean(
            entry &&
              typeof entry.url === "string" &&
              typeof entry.firstSeenAt === "string" &&
              typeof entry.lastSeenAt === "string" &&
              (entry.lastCheckedAt === null ||
                typeof entry.lastCheckedAt === "string")
          )
      )
    : [];
  return {
    nextIndex:
      Number.isInteger(record.nextIndex) && Number(record.nextIndex) >= 0
        ? Number(record.nextIndex)
        : 0,
    candidates
  };
}

function addCount(target: Record<string, number>, reason: string): void {
  target[reason] = (target[reason] ?? 0) + 1;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJsonAtomically(
  filePath: string,
  value: unknown
): Promise<void> {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function resolvePaths(
  rootDir: string,
  overrides: Partial<CollectionPaths> = {}
): CollectionPaths {
  const configured = { ...DEFAULT_RELATIVE_PATHS, ...overrides };
  return Object.fromEntries(
    Object.entries(configured).map(([key, value]) => [
      key,
      path.isAbsolute(value) ? value : path.join(rootDir, value)
    ])
  ) as CollectionPaths;
}

function parserForSource(source: BuildArticleSource) {
  return source === "note" ? parseNoteArticle : parsePokesolArticle;
}

function candidateParserForSource(source: BuildArticleSource) {
  return source === "note"
    ? parseNoteCandidateList
    : parsePokesolCandidateList;
}

function findExistingByUrl(
  generatedArticles: GeneratedBuildArticle[],
  source: BuildArticleSource,
  url: string
): GeneratedBuildArticle | null {
  const normalized = normalizeUrl(url);
  return (
    generatedArticles.find(
      (article) =>
        article.source === source &&
        (article.sourceUrl === normalized ||
          article.canonicalUrl === normalized)
    ) ?? null
  );
}

function replaceGenerated(
  articles: GeneratedBuildArticle[],
  article: GeneratedBuildArticle
): GeneratedBuildArticle[] {
  const index = articles.findIndex((entry) => entry.id === article.id);
  if (index < 0) return [...articles, article];
  const next = [...articles];
  next[index] = article;
  return next;
}

export function mergeCandidateCursor(input: {
  previous: SourceCollectionCursor;
  discovered: ArticleCandidate[];
  generatedArticles: GeneratedBuildArticle[];
  source: BuildArticleSource;
  nowIso: string;
}): {
  cursor: SourceCollectionCursor;
  newUrls: Set<string>;
} {
  const previousByUrl = new Map(
    input.previous.candidates.map((entry) => [entry.url, entry])
  );
  const newUrls = new Set<string>();
  const states: CandidateCollectionState[] = [];
  const seen = new Set<string>();

  for (const candidate of input.discovered) {
    if (seen.has(candidate.url)) continue;
    const previous = previousByUrl.get(candidate.url);
    if (!previous) newUrls.add(candidate.url);
    states.push({
      url: candidate.url,
      sourceArticleId: candidate.sourceArticleId,
      firstSeenAt: previous?.firstSeenAt ?? input.nowIso,
      lastSeenAt: input.nowIso,
      lastCheckedAt: previous?.lastCheckedAt ?? null
    });
    seen.add(candidate.url);
  }

  for (const previous of input.previous.candidates) {
    if (!seen.has(previous.url)) {
      states.push(previous);
      seen.add(previous.url);
    }
  }
  for (const article of input.generatedArticles) {
    if (article.source !== input.source || seen.has(article.sourceUrl)) continue;
    states.push({
      url: article.sourceUrl,
      sourceArticleId: article.sourceArticleId,
      firstSeenAt: article.firstCollectedAt,
      lastSeenAt: article.lastCollectedAt,
      lastCheckedAt: article.lastSuccessfulFetchAt
    });
    seen.add(article.sourceUrl);
  }

  return {
    cursor: {
      nextIndex:
        states.length === 0
          ? 0
          : Math.min(input.previous.nextIndex, states.length - 1),
      candidates: states
    },
    newUrls
  };
}

export function selectCandidatesForRun(input: {
  cursor: SourceCollectionCursor;
  newUrls: Set<string>;
  priorityUrls?: Set<string>;
  maxFetches: number;
  source: BuildArticleSource;
  rotationIndex?: number;
}): {
  candidates: ArticleCandidate[];
  nextIndex: number;
} {
  if (input.cursor.candidates.length === 0 || input.maxFetches <= 0) {
    return { candidates: [], nextIndex: 0 };
  }

  const selected: CandidateCollectionState[] = [];
  const selectedUrls = new Set<string>();
  for (const state of input.cursor.candidates) {
    if (!input.newUrls.has(state.url)) continue;
    selected.push(state);
    selectedUrls.add(state.url);
    if (selected.length >= input.maxFetches) break;
  }
  for (const state of input.cursor.candidates) {
    if (
      !input.priorityUrls?.has(state.url) ||
      selectedUrls.has(state.url) ||
      selected.length >= input.maxFetches
    ) {
      continue;
    }
    selected.push(state);
    selectedUrls.add(state.url);
  }
  for (const state of input.cursor.candidates) {
    if (
      state.lastCheckedAt !== null ||
      selectedUrls.has(state.url) ||
      selected.length >= input.maxFetches
    ) {
      continue;
    }
    selected.push(state);
    selectedUrls.add(state.url);
  }

  const total = input.cursor.candidates.length;
  const start = (input.rotationIndex ?? input.cursor.nextIndex) % total;
  let lastSelectedIndex =
    selected.length > 0
      ? input.cursor.candidates.findIndex(
          (entry) => entry.url === selected[selected.length - 1].url
        )
      : start - 1;

  for (
    let offset = 0;
    offset < total && selected.length < input.maxFetches;
    offset += 1
  ) {
    const index = (start + offset) % total;
    const state = input.cursor.candidates[index];
    if (selectedUrls.has(state.url)) continue;
    selected.push(state);
    selectedUrls.add(state.url);
    lastSelectedIndex = index;
  }

  return {
    candidates: selected.map((state) => ({
      source: input.source,
      url: state.url,
      sourceArticleId: state.sourceArticleId
    })),
    nextIndex:
      selected.length === 0 ? start : (lastSelectedIndex + 1 + total) % total
  };
}

export function getScheduledRotationIndex(input: {
  now: Date;
  candidateCount: number;
  maxFetches: number;
}): number {
  if (input.candidateCount <= 0 || input.maxFetches <= 0) return 0;
  const halfHourBucket = Math.floor(
    input.now.getTime() / (30 * 60 * 1000)
  );
  return (
    (halfHourBucket * input.maxFetches) %
    input.candidateCount
  );
}

function markCandidateChecked(
  cursor: SourceCollectionCursor,
  url: string,
  nowIso: string
): void {
  const candidate = cursor.candidates.find((entry) => entry.url === url);
  if (candidate) candidate.lastCheckedAt = nowIso;
}

async function collectSource(input: {
  config: SourceConfig;
  client: FetchClient;
  appMeta: AppMeta;
  pokemon: PokemonEntry[];
  manualArticles: BuildArticle[];
  generatedArticles: GeneratedBuildArticle[];
  previousCursor: SourceCollectionCursor;
  nowIso: string;
  stats: SourceCollectionStats;
}): Promise<{
  generatedArticles: GeneratedBuildArticle[];
  cursor: SourceCollectionCursor;
}> {
  const {
    config,
    client,
    appMeta,
    pokemon,
    manualArticles,
    previousCursor,
    nowIso,
    stats
  } = input;
  let generatedArticles = input.generatedArticles;

  const robotsResult = await client.fetchText(config.robotsUrl, "text");
  if (!robotsResult.ok) {
    stats.status = "failed";
    stats.fetchFailureCount += 1;
    addCount(stats.exclusionReasons, `robots-${robotsResult.reason}`);
    return { generatedArticles, cursor: previousCursor };
  }

  const candidateMap = new Map<string, ArticleCandidate>();
  const discoveryShare = Math.max(
    1,
    Math.ceil(config.maxCandidates / config.discoveryUrls.length)
  );
  let successfulDiscoveryRequests = 0;

  for (const discoveryUrl of config.discoveryUrls) {
    if (!isAllowedByRobots(robotsResult.text, discoveryUrl)) {
      stats.excludedCount += 1;
      addCount(stats.exclusionReasons, "robots-disallowed-discovery");
      continue;
    }

    const discoveryResult = await client.fetchText(discoveryUrl, "html");
    if (!discoveryResult.ok) {
      stats.fetchFailureCount += 1;
      addCount(
        stats.exclusionReasons,
        `discovery-${discoveryResult.reason}`
      );
      continue;
    }
    successfulDiscoveryRequests += 1;
    const candidates = candidateParserForSource(config.id)(
      discoveryResult.text,
      discoveryShare
    );
    stats.candidateUrlCount += candidates.length;
    for (const candidate of candidates) {
      if (candidateMap.size >= config.maxCandidates) break;
      candidateMap.set(candidate.url, candidate);
    }
  }

  stats.candidateCount = candidateMap.size;
  if (successfulDiscoveryRequests === 0) {
    stats.status = "failed";
    addCount(stats.exclusionReasons, "all-discovery-requests-failed");
    return { generatedArticles, cursor: previousCursor };
  }

  const merged = mergeCandidateCursor({
    previous: previousCursor,
    discovered: [...candidateMap.values()],
    generatedArticles,
    source: config.id,
    nowIso
  });
  const cursor = merged.cursor;
  stats.knownCandidateCount = cursor.candidates.length;
  if (cursor.candidates.length === 0) {
    stats.status = "partial";
    addCount(stats.exclusionReasons, "no-candidates");
    return { generatedArticles, cursor };
  }

  const selection = selectCandidatesForRun({
    cursor,
    newUrls: merged.newUrls,
    priorityUrls: new Set(
      generatedArticles
        .filter(
          (article) =>
            article.source === config.id &&
            (article.extractorVersion !== EXTRACTOR_VERSION ||
              !Object.prototype.hasOwnProperty.call(article, "thumbnail") ||
              article.thumbnail === null)
        )
        .map((article) => article.sourceUrl)
    ),
    maxFetches: config.maxArticleFetches,
    source: config.id,
    rotationIndex:
      merged.newUrls.size === 0 &&
      cursor.candidates.every(
        (candidate) => candidate.lastCheckedAt !== null
      )
        ? getScheduledRotationIndex({
            now: new Date(nowIso),
            candidateCount: cursor.candidates.length,
            maxFetches: config.maxArticleFetches
          })
        : undefined
  });
  stats.remainingCount = Math.max(
    0,
    cursor.candidates.length - selection.candidates.length
  );
  let canAdvanceCursor = true;

  for (const candidate of selection.candidates) {
    if (!isAllowedByRobots(robotsResult.text, candidate.url)) {
      stats.excludedCount += 1;
      canAdvanceCursor = false;
      addCount(stats.exclusionReasons, "robots-disallowed-article");
      continue;
    }

    stats.fetchedCount += 1;
    const fetchResult = await client.fetchText(candidate.url, "html");
    if (!fetchResult.ok) {
      stats.fetchFailureCount += 1;
      canAdvanceCursor = false;
      addCount(stats.exclusionReasons, fetchResult.reason);
      const existing = findExistingByUrl(
        generatedArticles,
        config.id,
        candidate.url
      );
      if (existing) {
        generatedArticles = replaceGenerated(
          generatedArticles,
          applyFetchFailure(existing, { permanent: fetchResult.permanent })
        );
      }
      continue;
    }

    markCandidateChecked(cursor, candidate.url, nowIso);
    const outcome = parserForSource(config.id)({
      html: fetchResult.text,
      url: fetchResult.url,
      appMeta,
      pokemon
    });
    if (outcome.status === "excluded") {
      stats.excludedCount += 1;
      addCount(stats.exclusionReasons, outcome.reason);
      continue;
    }

    stats.extractionSuccessCount =
      (stats.extractionSuccessCount ?? 0) + 1;
    stats.thumbnailRejectedCount +=
      outcome.article.thumbnailExtraction.rejectedCount;
    for (const [reason, count] of Object.entries(
      outcome.article.thumbnailExtraction.rejectionReasons
    )) {
      stats.exclusionReasons[`thumbnail:${reason}`] =
        (stats.exclusionReasons[`thumbnail:${reason}`] ?? 0) + count;
    }
    if (outcome.article.thumbnail) {
      stats.thumbnailFoundCount += 1;
      const domain = new URL(outcome.article.thumbnail.url).hostname;
      stats.thumbnailDomains[domain] =
        (stats.thumbnailDomains[domain] ?? 0) + 1;
    } else {
      stats.thumbnailMissingCount += 1;
    }
    if (outcome.article.collectionCompleteness === "complete") {
      stats.completeCount += 1;
      if (outcome.article.teamExtractionMethod) {
        const method = outcome.article.teamExtractionMethod;
        stats.teamExtractionMethods[method] =
          (stats.teamExtractionMethods[method] ?? 0) + 1;
      }
    } else {
      stats.metadataOnlyCount += 1;
      addCount(
        stats.metadataOnlyReasons,
        outcome.article.teamExtractionIssue ?? "team-unavailable"
      );
    }

    if (matchesManualArticle(outcome.article, manualArticles)) {
      stats.duplicateCount += 1;
      addCount(stats.exclusionReasons, "duplicate-of-manual-article");
      continue;
    }

    const existing = findGeneratedMatch(outcome.article, generatedArticles);
    const updated = createOrUpdateGeneratedArticle({
      source: config.id,
      sourceUrl: candidate.url,
      article: outcome.article,
      existing,
      nowIso
    });
    generatedArticles = replaceGenerated(generatedArticles, updated.article);
    if (updated.article.thumbnail === null) stats.fallbackCount += 1;
    if (
      existing &&
      JSON.stringify(existing.thumbnail ?? null) !==
        JSON.stringify(updated.article.thumbnail)
    ) {
      stats.thumbnailUpdatedCount += 1;
    }
    if (
      existing?.collectionCompleteness === "metadata-only" &&
      updated.article.collectionCompleteness === "complete"
    ) {
      stats.completePromotedCount += 1;
    }

    if (updated.change === "new") {
      stats.publishedCount += 1;
      if (outcome.article.collectionCompleteness === "complete") {
        stats.completePublishedCount += 1;
      } else {
        stats.metadataOnlyPublishedCount += 1;
      }
    }
    if (updated.change === "updated") stats.updatedCount += 1;
    if (updated.change === "unchanged") stats.duplicateCount += 1;
  }

  stats.remainingCount = cursor.candidates.filter(
    (candidate) => candidate.lastCheckedAt === null
  ).length;
  if (canAdvanceCursor) cursor.nextIndex = selection.nextIndex;
  stats.status = stats.fetchFailureCount > 0 ? "partial" : "completed";
  return { generatedArticles, cursor };
}

export async function collectBuildArticles(
  options: CollectionOptions = {}
): Promise<CollectionResult> {
  const startedAt = Date.now();
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const paths = resolvePaths(rootDir, options.paths);
  const [
    appMeta,
    pokemon,
    manualArticles,
    initialGeneratedArticles,
    previousStatus
  ] = await Promise.all([
    readJson<AppMeta>(paths.appMeta),
    readJson<PokemonEntry[]>(paths.pokemon),
    readJson<BuildArticle[]>(paths.manualArticles),
    readJson<GeneratedBuildArticle[]>(paths.generatedArticles),
    readJson<Partial<CollectionStatus>>(paths.status).catch(
      (): Partial<CollectionStatus> => ({})
    )
  ]);

  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  let generatedArticles = [...initialGeneratedArticles];
  const status: CollectionStatus = {
    lastRunAt: nowIso,
    durationMs: 0,
    dryRun: options.dryRun ?? false,
    sources: {
      pokesol: createStats("not-run"),
      note: createStats("not-run")
    },
    cursors: {
      pokesol: normalizeCursor(previousStatus.cursors?.pokesol),
      note: normalizeCursor(previousStatus.cursors?.note)
    }
  };
  const sourceConfigs =
    options.sourceConfigs ?? getSourceConfigs(options.source);

  for (const config of sourceConfigs) {
    const stats = status.sources[config.id];
    if (!config.automationAllowed) {
      stats.status = "disabled-by-policy";
      stats.excludedCount = 1;
      addCount(
        stats.exclusionReasons,
        "source-policy-disallows-automation"
      );
      continue;
    }

    const client =
      options.clients?.[config.id] ?? new SafeHttpClient(config);
    const result = await collectSource({
      config,
      client,
      appMeta,
      pokemon,
      manualArticles,
      generatedArticles,
      previousCursor: status.cursors[config.id],
      nowIso,
      stats
    });
    generatedArticles = result.generatedArticles;
    status.cursors[config.id] = result.cursor;
  }

  const validationErrors = validateGeneratedCollection(
    generatedArticles,
    manualArticles,
    { appMeta, pokemon }
  );
  if (validationErrors.length > 0) {
    throw new Error(
      `生成記事データの検証に失敗しました:\n${validationErrors.join("\n")}`
    );
  }

  status.durationMs = Date.now() - startedAt;
  const failed = sourceConfigs.some(
    (config) => status.sources[config.id].status === "failed"
  );
  const shouldWrite =
    !(options.dryRun ?? false) && (options.writeFiles ?? true);
  if (shouldWrite) {
    await writeJsonAtomically(paths.generatedArticles, generatedArticles);
    await writeJsonAtomically(paths.status, status);
  }

  return {
    status,
    generatedArticles,
    wroteFiles: shouldWrite,
    failed
  };
}
