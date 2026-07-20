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
import {
  planSavedParserMigration,
  type ParserMigrationOutcome
} from "./parserMigration";
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
  reevaluate?: boolean;
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
    reevaluationTargetCount: 0,
    reevaluationCompletedCount: 0,
    networkReevaluationCount: 0,
    savedStateReevaluationCount: 0,
    completeMaintainedCount: 0,
    metadataOnlyMaintainedCount: 0,
    metadataOnlyPromotedCount: 0,
    publicDemotedCount: 0,
    excludedMaintainedCount: 0,
    judgmentPendingCount: 0,
    registeredBlogCount: 0,
    newDiscoveredBlogCount: 0,
    promotedBlogCount: 0,
    pendingBlogCount: 0,
    targetGameSuccessCount: 0,
    formatSuccessCount: 0,
    seasonSuccessCount: 0,
    teamCandidateCount: 0,
    teamResolvedCount: 0,
    aliasResolvedCount: 0,
    decoratedResolvedCount: 0,
    ambiguousNameCount: 0,
    unresolvedNameCount: 0,
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
            : entry.platformVerified,
        verifiedAt:
          typeof entry.verifiedAt === "string"
            ? entry.verifiedAt
            : entry.platformVerified
              ? entry.discoveredAt
              : null,
        verificationMethod:
          typeof entry.verificationMethod === "string"
            ? entry.verificationMethod
            : entry.platformVerified
              ? "legacy-hatena-platform-registry"
              : null,
        promotionReason:
          typeof entry.promotionReason === "string"
            ? entry.promotionReason
            : entry.automationAllowed
              ? "TASK007で公開フィードと対象記事を確認済み"
              : "feed-and-robots-verification-pending",
        candidateCount:
          Number.isInteger(entry.candidateCount) &&
          Number(entry.candidateCount) >= 0
            ? Number(entry.candidateCount)
            : null,
        failureCount:
          Number.isInteger(entry.failureCount) &&
          Number(entry.failureCount) >= 0
            ? Number(entry.failureCount)
            : 0
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
      platformVerified: true,
      verifiedAt: nowIso,
      verificationMethod: "seeded-hatena-platform-domain-and-feed",
      promotionReason: "TASK007で公開フィードと対象記事を確認済み",
      candidateCount: null,
      failureCount: 0
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

function recordExtractionStats(
  stats: SourceCollectionStats,
  article: {
    collectionCompleteness: "complete" | "metadata-only";
    qualityScore: {
      targetGameConfidence: number;
      formatConfidence: number;
      seasonConfidence: number;
    };
    pokemonNameResolutionStats: {
      alias: number;
      decorated: number;
      ambiguous: number;
      unresolved: number;
    };
  }
): void {
  if (article.qualityScore.targetGameConfidence >= 0.5) {
    stats.targetGameSuccessCount += 1;
  }
  if (article.qualityScore.formatConfidence >= 0.5) {
    stats.formatSuccessCount += 1;
  }
  if (article.qualityScore.seasonConfidence >= 0.5) {
    stats.seasonSuccessCount += 1;
  }
  stats.teamCandidateCount += 1;
  if (article.collectionCompleteness === "complete") {
    stats.teamResolvedCount += 1;
  }
  stats.aliasResolvedCount += article.pokemonNameResolutionStats.alias;
  stats.decoratedResolvedCount +=
    article.pokemonNameResolutionStats.decorated;
  stats.ambiguousNameCount +=
    article.pokemonNameResolutionStats.ambiguous;
  stats.unresolvedNameCount +=
    article.pokemonNameResolutionStats.unresolved;
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
      source: input.source,
      discoveredAt:
        previous?.discoveredAt ?? previous?.firstSeenAt ?? input.nowIso,
      sourceArticleId: candidate.sourceArticleId,
      publishedAt: candidate.publishedAt ?? previous?.publishedAt ?? null,
      firstSeenAt: previous?.firstSeenAt ?? input.nowIso,
      lastSeenAt: input.nowIso,
      lastCheckedAt: previous?.lastCheckedAt ?? null,
      updatedAt: candidate.updatedAt ?? previous?.updatedAt ?? null,
      contentFingerprint:
        candidate.contentFingerprint ?? previous?.contentFingerprint ?? null,
      consecutiveFetchFailures: previous?.consecutiveFetchFailures ?? 0,
      targetGameResult: previous?.targetGameResult ?? null,
      formatResult: previous?.formatResult ?? null,
      seasonResult: previous?.seasonResult ?? null,
      teamResult: previous?.teamResult ?? null,
      exclusionReason: previous?.exclusionReason ?? null,
      parserVersion: previous?.parserVersion ?? null,
      previousParserVersion: previous?.previousParserVersion ?? null,
      reevaluationMethod: previous?.reevaluationMethod ?? null,
      reevaluationStatus: previous?.reevaluationStatus ?? null,
      reevaluationOutcome: previous?.reevaluationOutcome ?? null,
      reevaluationReason: previous?.reevaluationReason ?? null
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
      source: input.source,
      discoveredAt: article.firstCollectedAt,
      sourceArticleId: article.sourceArticleId,
      publishedAt: article.publishedAt,
      firstSeenAt: article.firstCollectedAt,
      lastSeenAt: article.lastCollectedAt,
      lastCheckedAt: article.lastSuccessfulFetchAt,
      targetGameResult: "pokemon-champions",
      formatResult: article.battleFormat,
      seasonResult: article.builderSeasonId,
      teamResult: article.collectionCompleteness,
      exclusionReason: null,
      parserVersion: article.extractorVersion
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

function recordCandidateOutcome(
  cursor: SourceCollectionCursor,
  url: string,
  outcome:
    | { status: "excluded"; reason: string }
    | {
        status: "accepted";
        article: {
          battleFormat: string;
          builderSeasonId: string;
          collectionCompleteness: string;
        };
      }
): void {
  const candidate = cursor.candidates.find((entry) => entry.url === url);
  if (!candidate) return;
  candidate.parserVersion = EXTRACTOR_VERSION;
  if (outcome.status === "excluded") {
    candidate.exclusionReason = outcome.reason;
    candidate.targetGameResult =
      outcome.reason === "not-pokemon-champions" ||
      outcome.reason === "other-pokemon-game" ||
      outcome.reason.startsWith("other-game-") ||
      outcome.reason.startsWith("pokemon-")
        ? "not-pokemon-champions"
        : null;
    candidate.formatResult = null;
    candidate.seasonResult = null;
    candidate.teamResult = "excluded";
    return;
  }
  candidate.exclusionReason = null;
  candidate.targetGameResult = "pokemon-champions";
  candidate.formatResult = outcome.article.battleFormat;
  candidate.seasonResult = outcome.article.builderSeasonId;
  candidate.teamResult = outcome.article.collectionCompleteness;
}

function recordMigrationOutcome(
  stats: SourceCollectionStats,
  outcome: ParserMigrationOutcome
): void {
  if (outcome === "complete-maintained") {
    stats.completeMaintainedCount += 1;
    return;
  }
  if (outcome === "complete-promoted") {
    stats.completePromotedCount += 1;
    return;
  }
  if (outcome === "metadata-only-maintained") {
    stats.metadataOnlyMaintainedCount += 1;
    return;
  }
  if (outcome === "metadata-only-promoted") {
    stats.metadataOnlyPromotedCount += 1;
    return;
  }
  if (outcome === "public-demoted") {
    stats.publicDemotedCount += 1;
    return;
  }
  stats.excludedMaintainedCount += 1;
}

function markCandidateMigration(input: {
  candidate: CandidateCollectionState;
  previousVersion: string | null;
  method: "saved-state" | "network";
  status: "completed" | "pending";
  outcome: ParserMigrationOutcome | null;
  reason: string;
}): void {
  input.candidate.previousParserVersion = input.previousVersion;
  input.candidate.parserVersion = EXTRACTOR_VERSION;
  input.candidate.reevaluationMethod = input.method;
  input.candidate.reevaluationStatus = input.status;
  input.candidate.reevaluationOutcome = input.outcome;
  input.candidate.reevaluationReason = input.reason;
}

function determineNetworkMigrationOutcome(input: {
  existing: GeneratedBuildArticle | null;
  outcome:
    | { status: "excluded"; reason: string }
    | {
        status: "accepted";
        article: {
          collectionCompleteness: "complete" | "metadata-only";
        };
      };
}): ParserMigrationOutcome {
  if (input.outcome.status === "excluded") {
    return input.existing
      ? "public-demoted"
      : "excluded-maintained";
  }
  if (input.outcome.article.collectionCompleteness === "complete") {
    return input.existing?.collectionCompleteness === "complete"
      ? "complete-maintained"
      : "complete-promoted";
  }
  return input.existing?.collectionCompleteness === "metadata-only"
    ? "metadata-only-maintained"
    : "metadata-only-promoted";
}

async function reevaluateSourceFromSavedState(input: {
  config: SourceConfig;
  client: FetchClient;
  appMeta: AppMeta;
  pokemon: PokemonEntry[];
  manualArticles: BuildArticle[];
  generatedArticles: GeneratedBuildArticle[];
  previousCursor: SourceCollectionCursor;
  nowIso: string;
  stats: SourceCollectionStats;
  backfill: boolean;
  hatenaBlogs: HatenaBlogState[];
}): Promise<{
  generatedArticles: GeneratedBuildArticle[];
  cursor: SourceCollectionCursor;
}> {
  const cursor: SourceCollectionCursor = {
    nextIndex: input.previousCursor.nextIndex,
    candidates: input.previousCursor.candidates.map((candidate) => ({
      ...candidate
    }))
  };
  let generatedArticles = [...input.generatedArticles];
  const targets = cursor.candidates.filter(
    (candidate) => candidate.parserVersion !== EXTRACTOR_VERSION
  );
  const networkTargets: CandidateCollectionState[] = [];
  input.stats.knownCandidateCount = cursor.candidates.length;
  input.stats.reevaluationTargetCount = targets.length;
  if (input.config.id === "hatena-blog") {
    input.stats.registeredBlogCount = input.hatenaBlogs.length;
    input.stats.pendingBlogCount = input.hatenaBlogs.filter(
      (blog) => !blog.automationAllowed
    ).length;
  }

  for (const candidate of targets) {
    const previousVersion = candidate.parserVersion ?? null;
    const plan = planSavedParserMigration({
      candidate,
      source: input.config.id,
      generatedArticles
    });
    if (plan.method === "network") {
      networkTargets.push(candidate);
      continue;
    }

    if (plan.outcome === "public-demoted") {
      generatedArticles = generatedArticles.filter(
        (article) => article.id !== plan.article?.id
      );
      recordCandidateOutcome(cursor, candidate.url, {
        status: "excluded",
        reason: plan.reason
      });
    } else if (plan.article) {
      generatedArticles = replaceGenerated(generatedArticles, {
        ...plan.article,
        extractorVersion: EXTRACTOR_VERSION
      });
    }
    markCandidateMigration({
      candidate,
      previousVersion,
      method: "saved-state",
      status: "completed",
      outcome: plan.outcome,
      reason: plan.reason
    });
    input.stats.savedStateReevaluationCount += 1;
    input.stats.reevaluationCompletedCount += 1;
    recordMigrationOutcome(input.stats, plan.outcome);
  }

  const maxNetworkFetches = input.backfill
    ? Math.min(150, input.config.maxCandidates)
    : input.config.maxArticleFetches;
  const selected: CandidateCollectionState[] = [];
  const perDomainCounts = new Map<string, number>();
  for (const candidate of networkTargets) {
    if (selected.length >= maxNetworkFetches) break;
    const domain = new URL(candidate.url).hostname;
    const domainCount = perDomainCounts.get(domain) ?? 0;
    if (input.config.id === "hatena-blog" && domainCount >= 30) {
      continue;
    }
    perDomainCounts.set(domain, domainCount + 1);
    selected.push(candidate);
  }
  input.stats.remainingCount = networkTargets.length - selected.length;
  const robotsByDomain = new Map<
    string,
    { ok: true; text: string } | { ok: false; reason: string }
  >();

  for (const candidate of selected) {
    const previousVersion = candidate.parserVersion ?? null;
    const domain = new URL(candidate.url).hostname;
    const robotsKey =
      input.config.id === "hatena-blog" ? domain : input.config.id;
    let robots = robotsByDomain.get(robotsKey);
    if (!robots) {
      const robotsUrl =
        input.config.id === "hatena-blog"
          ? `https://${domain}/robots.txt`
          : input.config.robotsUrl;
      const result = await input.client.fetchText(robotsUrl, "text");
      robots = result.ok
        ? { ok: true, text: result.text }
        : { ok: false, reason: `robots-${result.reason}` };
      robotsByDomain.set(robotsKey, robots);
    }
    if (!robots.ok || !isAllowedByRobots(robots.text, candidate.url)) {
      const reason = robots.ok
        ? "robots-disallowed-article"
        : robots.reason;
      markCandidateMigration({
        candidate,
        previousVersion,
        method: "network",
        status: "pending",
        outcome: null,
        reason
      });
      input.stats.judgmentPendingCount += 1;
      addCount(input.stats.exclusionReasons, reason);
      continue;
    }

    input.stats.networkReevaluationCount += 1;
    input.stats.fetchedCount += 1;
    const fetchResult = await input.client.fetchText(
      candidate.url,
      "html"
    );
    if (!fetchResult.ok) {
      markCandidateMigration({
        candidate,
        previousVersion,
        method: "network",
        status: "pending",
        outcome: null,
        reason: fetchResult.reason
      });
      input.stats.fetchFailureCount += 1;
      input.stats.judgmentPendingCount += 1;
      addCount(input.stats.exclusionReasons, fetchResult.reason);
      continue;
    }

    candidate.lastCheckedAt = input.nowIso;
    candidate.consecutiveFetchFailures = 0;
    const outcome =
      input.config.id === "hatena-blog"
        ? parseHatenaArticle({
            html: fetchResult.text,
            url: fetchResult.url,
            appMeta: input.appMeta,
            pokemon: input.pokemon
          })
        : parserForSource(input.config.id)({
            html: fetchResult.text,
            url: fetchResult.url,
            appMeta: input.appMeta,
            pokemon: input.pokemon
          });
    const existing = findExistingByUrl(
      generatedArticles,
      input.config.id,
      candidate.url
    );
    const migrationOutcome = determineNetworkMigrationOutcome({
      existing,
      outcome
    });
    recordCandidateOutcome(cursor, candidate.url, outcome);

    if (outcome.status === "excluded") {
      if (existing) {
        generatedArticles = generatedArticles.filter(
          (article) => article.id !== existing.id
        );
      }
      input.stats.excludedCount += 1;
      addCount(input.stats.exclusionReasons, outcome.reason);
    } else if (matchesManualArticle(outcome.article, input.manualArticles)) {
      input.stats.duplicateCount += 1;
      addCount(input.stats.exclusionReasons, "duplicate-of-manual-article");
    } else {
      const matched = findGeneratedMatch(
        outcome.article,
        generatedArticles
      );
      const updated = createOrUpdateGeneratedArticle({
        source: input.config.id,
        sourceUrl: candidate.url,
        article: outcome.article,
        existing: matched,
        nowIso: input.nowIso
      });
      generatedArticles = replaceGenerated(
        generatedArticles,
        updated.article
      );
      if (updated.change === "new") input.stats.publishedCount += 1;
      if (updated.change === "updated") input.stats.updatedCount += 1;
      if (updated.change === "unchanged") {
        input.stats.duplicateCount += 1;
      }
    }
    markCandidateMigration({
      candidate,
      previousVersion,
      method: "network",
      status: "completed",
      outcome: migrationOutcome,
      reason:
        outcome.status === "excluded"
          ? outcome.reason
          : "network-reevaluation-completed"
    });
    input.stats.reevaluationCompletedCount += 1;
    recordMigrationOutcome(input.stats, migrationOutcome);
  }

  input.stats.status =
    input.stats.judgmentPendingCount > 0 ||
    input.stats.remainingCount > 0
      ? "partial"
      : "completed";
  return { generatedArticles, cursor };
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
  reevaluate: boolean;
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
    stats,
    reevaluate
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
  const legacyGeneratedUrls = new Set(
    generatedArticles
      .filter(
        (article) =>
          article.source === config.id &&
          article.extractorVersion !== EXTRACTOR_VERSION
      )
      .map((article) => article.sourceUrl)
  );
  if (cursor.candidates.length === 0) {
    stats.status = "partial";
    addCount(stats.exclusionReasons, "no-candidates");
    return { generatedArticles, cursor };
  }

  const selection = selectCandidatesForRun({
    cursor,
    newUrls: merged.newUrls,
    priorityUrls: new Set(
      reevaluate
        ? cursor.candidates
            .filter(
              (candidate) =>
                candidate.parserVersion !== EXTRACTOR_VERSION ||
                legacyGeneratedUrls.has(candidate.url)
            )
            .map((candidate) => candidate.url)
        : generatedArticles
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
    recordCandidateOutcome(cursor, candidate.url, outcome);
    if (outcome.status === "excluded") {
      if (reevaluate && legacyGeneratedUrls.has(candidate.url)) {
        generatedArticles = generatedArticles.filter(
          (article) =>
            !(
              article.source === config.id &&
              (article.sourceUrl === candidate.url ||
                article.canonicalUrl === candidate.url)
            )
        );
      }
      stats.excludedCount += 1;
      addCount(stats.exclusionReasons, outcome.reason);
      continue;
    }

    stats.extractionSuccessCount =
      (stats.extractionSuccessCount ?? 0) + 1;
    recordExtractionStats(stats, outcome.article);
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
  reevaluate: boolean;
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
    backfill,
    reevaluate
  } = input;
  let generatedArticles = input.generatedArticles;
  const feeds = { ...previousFeeds };
  const blogs = [...input.blogs];
  const blogByDomain = new Map(blogs.map((entry) => [entry.domain, entry]));
  const candidateMap = new Map<string, ArticleCandidate>();
  const changedUrls = new Set<string>();
  const robotsByDomain = new Map<string, string>();
  let successfulFeedRequests = 0;
  stats.registeredBlogCount = blogs.length;
  stats.pendingBlogCount = blogs.filter(
    (blog) => !blog.automationAllowed
  ).length;
  const recordBlogFailure = (blog: HatenaBlogState, reason: string): void => {
    blog.failureCount = (blog.failureCount ?? 0) + 1;
    blog.promotionReason = reason;
    if (blog.failureCount >= 3) {
      blog.automationAllowed = false;
      stats.pendingBlogCount += 1;
    }
  };

  for (const blog of blogs.filter((entry) => entry.automationAllowed)) {
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
      recordBlogFailure(blog, `robots-${robotsResult.reason}`);
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
      recordBlogFailure(blog, "robots-disallowed-feed");
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
      recordBlogFailure(blog, `feed-${feedResult.reason}`);
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
    blog.failureCount = 0;
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
    if (blog.customDomain && !isHatenaFeed(feedResult.text)) {
      stats.excludedCount += 1;
      addCount(stats.exclusionReasons, "custom-domain-not-verified-as-hatena");
      continue;
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
      reevaluate ||
      merged.newUrls.has(candidate.url) ||
      changedUrls.has(candidate.url) ||
      candidate.lastCheckedAt === null ||
      candidate.parserVersion !== EXTRACTOR_VERSION
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
    recordCandidateOutcome(cursor, state.url, outcome);
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
        platformVerified: false,
        verifiedAt: null,
        verificationMethod: null,
        promotionReason: "feed-and-robots-verification-pending",
        candidateCount: null,
        failureCount: 0
      };
      blogByDomain.set(discoveredDomain, discovered);
      blogs.push(discovered);
      stats.newDiscoveredBlogCount += 1;
      stats.pendingBlogCount += 1;
    }
    if (outcome.status === "excluded") {
      if (reevaluate) {
        const legacy = generatedArticles.find(
          (article) =>
            article.source === "hatena-blog" &&
            article.extractorVersion !== EXTRACTOR_VERSION &&
            (article.sourceUrl === state.url ||
              article.canonicalUrl === state.url)
        );
        if (legacy) {
          generatedArticles = generatedArticles.filter(
            (article) => article.id !== legacy.id
          );
        }
      }
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
    recordExtractionStats(stats, outcome.article);
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
    if (options.reevaluate) {
      const result = await reevaluateSourceFromSavedState({
        config: effectiveConfig,
        client,
        appMeta,
        pokemon,
        manualArticles,
        generatedArticles,
        previousCursor: status.cursors[config.id],
        nowIso,
        stats,
        backfill: options.backfill ?? false,
        hatenaBlogs: status.hatenaBlogs
      });
      generatedArticles = result.generatedArticles;
      status.cursors[config.id] = result.cursor;
      continue;
    }
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
        backfill: options.backfill ?? false,
        reevaluate: options.reevaluate ?? false
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
      stats,
      reevaluate: options.reevaluate ?? false
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
