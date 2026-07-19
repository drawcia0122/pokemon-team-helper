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
import {
  createHatenaFeedThumbnail,
  extractHatenaBlogDomains,
  isHatenaFeed,
  isHatenaPlatformDomain,
  parseHatenaArticle,
  parseHatenaFeed
} from "./hatenaBlog";
import { normalizeUrl } from "./normalize";
import { parseNoteArticle, parseNoteCandidateList } from "./note";
import { parsePokesolArticle, parsePokesolCandidateList } from "./pokesol";
import {
  getSourceConfigs,
  INITIAL_HATENA_BLOGS
} from "./sourceRegistry";
import type {
  ArticleCandidate,
  CandidateCollectionState,
  CollectionStatus,
  FetchExpectedContent,
  FetchRequestOptions,
  FetchResult,
  HatenaBlogState,
  HatenaFeedState,
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
    expected: FetchExpectedContent,
    options?: FetchRequestOptions
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
  backfill?: boolean;
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

function normalizeHatenaFeedState(
  domain: string,
  value: unknown,
  configuredFeedUrl = `https://${domain}/feed?exclude_body=1`
): HatenaFeedState {
  const record =
    value && typeof value === "object"
      ? (value as Partial<HatenaFeedState>)
      : {};
  const entries =
    record.entries && typeof record.entries === "object"
      ? Object.fromEntries(
          Object.entries(record.entries).filter(
            ([url, entry]) =>
              typeof url === "string" &&
              entry &&
              typeof entry === "object" &&
              typeof entry.contentFingerprint === "string"
          )
        )
      : {};
  return {
    domain,
    feedUrl:
      typeof record.feedUrl === "string"
        ? record.feedUrl
        : configuredFeedUrl,
    etag: typeof record.etag === "string" ? record.etag : null,
    lastModified:
      typeof record.lastModified === "string" ? record.lastModified : null,
    lastCheckedAt:
      typeof record.lastCheckedAt === "string" ? record.lastCheckedAt : null,
    lastSuccessfulFetchAt:
      typeof record.lastSuccessfulFetchAt === "string"
        ? record.lastSuccessfulFetchAt
        : null,
    consecutiveFetchFailures:
      Number.isInteger(record.consecutiveFetchFailures) &&
      Number(record.consecutiveFetchFailures) >= 0
        ? Number(record.consecutiveFetchFailures)
        : 0,
    entries
  };
}

function normalizeHatenaBlogs(
  value: unknown,
  nowIso: string
): HatenaBlogState[] {
  const previous = Array.isArray(value)
    ? value.filter(
        (entry): entry is HatenaBlogState =>
          Boolean(
            entry &&
              typeof entry.domain === "string" &&
              typeof entry.discoveredAt === "string" &&
              typeof entry.customDomain === "boolean" &&
              typeof entry.platformVerified === "boolean"
          )
      )
      .map((entry) => ({
        ...entry,
        feedUrl:
          typeof entry.feedUrl === "string"
            ? entry.feedUrl
            : `https://${entry.domain}/feed?exclude_body=1`,
        automationAllowed:
          typeof entry.automationAllowed === "boolean"
            ? entry.automationAllowed
            : entry.platformVerified
      }))
    : [];
  const byDomain = new Map(previous.map((entry) => [entry.domain, entry]));
  for (const domain of INITIAL_HATENA_BLOGS) {
    if (byDomain.has(domain)) continue;
    byDomain.set(domain, {
      domain,
      discoveredFrom: null,
      discoveredAt: nowIso,
      feedUrl: `https://${domain}/feed?exclude_body=1`,
      automationAllowed: true,
      customDomain: false,
      platformVerified: true
    });
  }
  return [...byDomain.values()]
    .filter(
      (entry) =>
        isHatenaPlatformDomain(entry.domain) || entry.platformVerified
    )
    .sort((a, b) => a.domain.localeCompare(b.domain));
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
      lastCheckedAt: previous?.lastCheckedAt ?? null,
      updatedAt: candidate.updatedAt ?? previous?.updatedAt ?? null,
      contentFingerprint:
        candidate.contentFingerprint ?? previous?.contentFingerprint ?? null,
      consecutiveFetchFailures: previous?.consecutiveFetchFailures ?? 0
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

async function collectHatenaSource(input: {
  config: SourceConfig;
  client: FetchClient;
  appMeta: AppMeta;
  pokemon: PokemonEntry[];
  manualArticles: BuildArticle[];
  generatedArticles: GeneratedBuildArticle[];
  previousCursor: SourceCollectionCursor;
  previousFeeds: Record<string, HatenaFeedState>;
  blogs: HatenaBlogState[];
  nowIso: string;
  stats: SourceCollectionStats;
  backfill: boolean;
}): Promise<{
  generatedArticles: GeneratedBuildArticle[];
  cursor: SourceCollectionCursor;
  feeds: Record<string, HatenaFeedState>;
  blogs: HatenaBlogState[];
}> {
  const {
    config,
    client,
    appMeta,
    pokemon,
    manualArticles,
    previousCursor,
    previousFeeds,
    nowIso,
    stats,
    backfill
  } = input;
  let generatedArticles = input.generatedArticles;
  const feeds = { ...previousFeeds };
  const blogs = [...input.blogs];
  const blogByDomain = new Map(blogs.map((entry) => [entry.domain, entry]));
  const candidateMap = new Map<string, ArticleCandidate>();
  const changedUrls = new Set<string>();
  const robotsByDomain = new Map<string, string>();
  let successfulFeedRequests = 0;

  for (const blog of blogs) {
    const domain = blog.domain;
    const previousFeed = normalizeHatenaFeedState(
      domain,
      previousFeeds[domain],
      blog.feedUrl
    );
    const robotsUrl = `https://${domain}/robots.txt`;
    const regularFeedUrl = blog.feedUrl;
    const requestedFeed = new URL(regularFeedUrl);
    requestedFeed.search = "";
    if (backfill) requestedFeed.searchParams.set("size", "100");
    requestedFeed.searchParams.set("exclude_body", "1");
    const requestedFeedUrl = requestedFeed.toString();
    const robotsResult = await client.fetchText(robotsUrl, "text");
    if (!robotsResult.ok) {
      stats.fetchFailureCount += 1;
      addCount(stats.exclusionReasons, `robots-${robotsResult.reason}`);
      feeds[domain] = {
        ...previousFeed,
        lastCheckedAt: nowIso,
        consecutiveFetchFailures:
          previousFeed.consecutiveFetchFailures + 1
      };
      continue;
    }
    robotsByDomain.set(domain, robotsResult.text);
    if (
      !isAllowedByRobots(robotsResult.text, requestedFeedUrl)
    ) {
      stats.excludedCount += 1;
      addCount(stats.exclusionReasons, "robots-disallowed-feed");
      continue;
    }

    const conditionalHeaders: Record<string, string> = {};
    if (!backfill && previousFeed.etag) {
      conditionalHeaders["if-none-match"] = previousFeed.etag;
    }
    if (!backfill && previousFeed.lastModified) {
      conditionalHeaders["if-modified-since"] = previousFeed.lastModified;
    }
    const feedResult = await client.fetchText(requestedFeedUrl, "xml", {
      headers: conditionalHeaders,
      allowNotModified: !backfill
    });
    if (!feedResult.ok) {
      stats.fetchFailureCount += 1;
      addCount(stats.exclusionReasons, `feed-${feedResult.reason}`);
      feeds[domain] = {
        ...previousFeed,
        lastCheckedAt: nowIso,
        consecutiveFetchFailures:
          previousFeed.consecutiveFetchFailures + 1
      };
      continue;
    }

    successfulFeedRequests += 1;
    if (feedResult.notModified) {
      feeds[domain] = {
        ...previousFeed,
        etag: feedResult.headers?.etag ?? previousFeed.etag,
        lastModified:
          feedResult.headers?.lastModified ?? previousFeed.lastModified,
        lastCheckedAt: nowIso,
        lastSuccessfulFetchAt: nowIso,
        consecutiveFetchFailures: 0
      };
      continue;
    }
    if (
      (!blog.automationAllowed || blog.customDomain) &&
      !isHatenaFeed(feedResult.text)
    ) {
      stats.excludedCount += 1;
      addCount(stats.exclusionReasons, "custom-domain-not-verified-as-hatena");
      continue;
    }
    if (!blog.automationAllowed) {
      blog.automationAllowed = true;
      blog.platformVerified = true;
    }

    const candidates = parseHatenaFeed(
      feedResult.text,
      requestedFeedUrl,
      backfill ? 100 : 30
    );
    stats.candidateUrlCount += candidates.length;
    const nextEntries = { ...previousFeed.entries };
    for (const candidate of candidates) {
      candidateMap.set(candidate.url, candidate);
      const previousEntry = previousFeed.entries[candidate.url];
      if (
        !previousEntry ||
        previousEntry.contentFingerprint !== candidate.contentFingerprint
      ) {
        changedUrls.add(candidate.url);
      }
      nextEntries[candidate.url] = {
        updatedAt: candidate.updatedAt ?? null,
        contentFingerprint: candidate.contentFingerprint!
      };
    }
    feeds[domain] = {
      domain,
      feedUrl: regularFeedUrl,
      etag: feedResult.headers?.etag ?? null,
      lastModified: feedResult.headers?.lastModified ?? null,
      lastCheckedAt: nowIso,
      lastSuccessfulFetchAt: nowIso,
      consecutiveFetchFailures: 0,
      entries: nextEntries
    };
  }

  stats.candidateCount = candidateMap.size;
  if (successfulFeedRequests === 0) {
    stats.status = "failed";
    addCount(stats.exclusionReasons, "all-feed-requests-failed");
    return {
      generatedArticles,
      cursor: previousCursor,
      feeds,
      blogs
    };
  }

  const merged = mergeCandidateCursor({
    previous: previousCursor,
    discovered: [...candidateMap.values()],
    generatedArticles,
    source: "hatena-blog",
    nowIso
  });
  const cursor = merged.cursor;
  stats.knownCandidateCount = cursor.candidates.length;
  const eligible = cursor.candidates.filter(
    (candidate) =>
      backfill ||
      merged.newUrls.has(candidate.url) ||
      changedUrls.has(candidate.url) ||
      candidate.lastCheckedAt === null
  );
  const maxTotalFetches = backfill ? 150 : config.maxArticleFetches;
  const perBlogCounts = new Map<string, number>();
  const selected = eligible.filter((candidate) => {
    if (perBlogCounts.size > maxTotalFetches) return false;
    const domain = new URL(candidate.url).hostname;
    const current = perBlogCounts.get(domain) ?? 0;
    if (current >= 30) return false;
    const total = [...perBlogCounts.values()].reduce(
      (sum, count) => sum + count,
      0
    );
    if (total >= maxTotalFetches) return false;
    perBlogCounts.set(domain, current + 1);
    return true;
  });
  stats.remainingCount = Math.max(0, eligible.length - selected.length);

  for (const state of selected) {
    const domain = new URL(state.url).hostname;
    const robotsText = robotsByDomain.get(domain);
    if (!robotsText || !isAllowedByRobots(robotsText, state.url)) {
      stats.excludedCount += 1;
      addCount(stats.exclusionReasons, "robots-disallowed-article");
      continue;
    }

    stats.fetchedCount += 1;
    const fetchResult = await client.fetchText(state.url, "html");
    if (!fetchResult.ok) {
      stats.fetchFailureCount += 1;
      state.consecutiveFetchFailures =
        (state.consecutiveFetchFailures ?? 0) + 1;
      addCount(stats.exclusionReasons, fetchResult.reason);
      const existing = findExistingByUrl(
        generatedArticles,
        "hatena-blog",
        state.url
      );
      if (existing) {
        generatedArticles = replaceGenerated(
          generatedArticles,
          applyFetchFailure(existing, { permanent: fetchResult.permanent })
        );
      }
      continue;
    }

    state.lastCheckedAt = nowIso;
    state.consecutiveFetchFailures = 0;
    const outcome = parseHatenaArticle({
      html: fetchResult.text,
      url: fetchResult.url,
      appMeta,
      pokemon
    });
    for (const discoveredDomain of extractHatenaBlogDomains(
      fetchResult.text,
      domain
    )) {
      if (blogByDomain.has(discoveredDomain) || blogs.length >= 40) continue;
      const discovered: HatenaBlogState = {
        domain: discoveredDomain,
        discoveredFrom: state.url,
        discoveredAt: nowIso,
        feedUrl: `https://${discoveredDomain}/feed?exclude_body=1`,
        automationAllowed: false,
        customDomain: false,
        platformVerified: true
      };
      blogByDomain.set(discoveredDomain, discovered);
      blogs.push(discovered);
    }
    if (outcome.status === "excluded") {
      stats.excludedCount += 1;
      addCount(stats.exclusionReasons, outcome.reason);
      continue;
    }

    if (outcome.article.thumbnail === null) {
      outcome.article.thumbnail = createHatenaFeedThumbnail(
        candidateMap.get(state.url)?.thumbnailUrl,
        outcome.article.title
      );
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
      const thumbnailDomain = new URL(
        outcome.article.thumbnail.url
      ).hostname;
      stats.thumbnailDomains[thumbnailDomain] =
        (stats.thumbnailDomains[thumbnailDomain] ?? 0) + 1;
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
    const existing = findGeneratedMatch(
      outcome.article,
      generatedArticles
    );
    const updated = createOrUpdateGeneratedArticle({
      source: "hatena-blog",
      sourceUrl: state.url,
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
  stats.status = stats.fetchFailureCount > 0 ? "partial" : "completed";
  return {
    generatedArticles,
    cursor,
    feeds,
    blogs: blogs.sort((a, b) => a.domain.localeCompare(b.domain))
  };
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
      note: createStats("not-run"),
      "hatena-blog": createStats("not-run")
    },
    cursors: {
      pokesol: normalizeCursor(previousStatus.cursors?.pokesol),
      note: normalizeCursor(previousStatus.cursors?.note),
      "hatena-blog": normalizeCursor(
        previousStatus.cursors?.["hatena-blog"]
      )
    },
    hatenaFeeds: Object.fromEntries(
      Object.entries(previousStatus.hatenaFeeds ?? {}).map(
        ([domain, feed]) => [
          domain,
          normalizeHatenaFeedState(domain, feed)
        ]
      )
    ),
    hatenaBlogs: normalizeHatenaBlogs(previousStatus.hatenaBlogs, nowIso)
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

    const effectiveConfig =
      config.id === "hatena-blog"
        ? {
            ...config,
            allowedDomains: [
              ...new Set([
                ...config.allowedDomains,
                ...status.hatenaBlogs.map((blog) => blog.domain)
              ])
            ]
          }
        : config;
    const client =
      options.clients?.[config.id] ?? new SafeHttpClient(effectiveConfig);
    if (config.id === "hatena-blog") {
      const result = await collectHatenaSource({
        config: effectiveConfig,
        client,
        appMeta,
        pokemon,
        manualArticles,
        generatedArticles,
        previousCursor: status.cursors[config.id],
        previousFeeds: status.hatenaFeeds,
        blogs: status.hatenaBlogs,
        nowIso,
        stats,
        backfill: options.backfill ?? false
      });
      generatedArticles = result.generatedArticles;
      status.cursors[config.id] = result.cursor;
      status.hatenaFeeds = result.feeds;
      status.hatenaBlogs = result.blogs;
      continue;
    }
    const result = await collectSource({
      config: effectiveConfig,
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
    {
      appMeta,
      pokemon,
      allowedHatenaDomains: status.hatenaBlogs
        .filter((blog) => blog.platformVerified)
        .map((blog) => blog.domain)
    }
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
