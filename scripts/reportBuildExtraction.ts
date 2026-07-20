import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BuildArticle,
  BuildArticleSource,
  GeneratedBuildArticle
} from "../types/buildArticle";
import {
  EXTRACTOR_VERSION,
  type CollectionStatus
} from "./build-article-collectors/types";
import { planSavedParserMigration } from "./build-article-collectors/parserMigration";

type CountMap = Record<string, number>;

function addCount(counts: CountMap, key: string, amount = 1): void {
  counts[key] = (counts[key] ?? 0) + amount;
}

export type BuildExtractionReport = {
  registeredBlogCount: number;
  activeBlogCount: number;
  pendingBlogCount: number;
  candidateArticleCount: number;
  publicArticleCount: number;
  manualArticleCount: number;
  generatedArticleCount: number;
  completeCount: number;
  metadataOnlyCount: number;
  thumbnailCount: number;
  fallbackCount: number;
  bySource: CountMap;
  bySeason: CountMap;
  byFormat: CountMap;
  exclusionReasons: CountMap;
  teamExtractionMethods: CountMap;
  parserVersions: CountMap;
  currentParserVersion: string;
  legacyParserVersionCount: number;
  reevaluationTargetCount: number;
  reevaluationCompletedCount: number;
  networkRefetchCount: number;
  savedStateReevaluationCount: number;
  plannedNetworkRefetchCount: number;
  plannedSavedStateReevaluationCount: number;
  completeMaintainedCount: number;
  completePromotedCount: number;
  metadataOnlyMaintainedCount: number;
  metadataOnlyPromotedCount: number;
  publicDemotedCount: number;
  excludedMaintainedCount: number;
  judgmentPendingCount: number;
  candidateOutcomes: {
    targetGameSuccessCount: number;
    formatSuccessCount: number;
    seasonSuccessCount: number;
    completeCount: number;
    metadataOnlyCount: number;
    excludedCount: number;
  };
  pokemonNameResolution: {
    alias: number;
    decorated: number;
    ambiguous: number;
    unresolved: number;
  };
};

export function createBuildExtractionReport(input: {
  manualArticles: BuildArticle[];
  generatedArticles: GeneratedBuildArticle[];
  status: CollectionStatus;
}): BuildExtractionReport {
  const bySource: CountMap = { manual: input.manualArticles.length };
  const bySeason: CountMap = {};
  const byFormat: CountMap = {};
  const exclusionReasons: CountMap = {};
  const teamExtractionMethods: CountMap = {};
  const parserVersions: CountMap = {};
  const articles = [...input.manualArticles, ...input.generatedArticles];
  let thumbnailCount = 0;
  let generatedCompleteCount = 0;
  let metadataOnlyCount = 0;
  const pokemonNameResolution = {
    alias: 0,
    decorated: 0,
    ambiguous: 0,
    unresolved: 0
  };

  for (const article of articles) {
    addCount(bySeason, article.builderSeasonId);
    addCount(byFormat, article.battleFormat);
    if (article.thumbnail) thumbnailCount += 1;
  }
  for (const article of input.generatedArticles) {
    addCount(bySource, article.source);
    if (article.collectionCompleteness === "complete") {
      generatedCompleteCount += 1;
    } else {
      metadataOnlyCount += 1;
    }
    if (article.teamExtractionMethod) {
      addCount(teamExtractionMethods, article.teamExtractionMethod);
    }
    pokemonNameResolution.alias +=
      article.pokemonNameResolutionStats?.alias ?? 0;
    pokemonNameResolution.decorated +=
      article.pokemonNameResolutionStats?.decorated ?? 0;
    pokemonNameResolution.ambiguous +=
      article.pokemonNameResolutionStats?.ambiguous ?? 0;
    pokemonNameResolution.unresolved +=
      article.pokemonNameResolutionStats?.unresolved ?? 0;
  }
  const candidates = Object.values(input.status.cursors).flatMap(
    (cursor) => cursor.candidates
  );
  for (const candidate of candidates) {
    if (candidate.exclusionReason) {
      addCount(exclusionReasons, candidate.exclusionReason);
    }
    if (candidate.parserVersion) {
      addCount(parserVersions, candidate.parserVersion);
    }
  }
  const candidatesWithSource = Object.entries(input.status.cursors).flatMap(
    ([source, cursor]) =>
      cursor.candidates.map((candidate) => ({
        source: source as BuildArticleSource,
        candidate
      }))
  );
  const migratedCandidates = candidates.filter(
    (candidate) =>
      candidate.previousParserVersion !== undefined &&
      candidate.previousParserVersion !== null &&
      candidate.reevaluationMethod !== undefined &&
      candidate.reevaluationMethod !== null
  );
  const legacyCandidates = candidatesWithSource.filter(
    ({ candidate }) => candidate.parserVersion !== EXTRACTOR_VERSION
  );
  let plannedNetworkRefetchCount = 0;
  let plannedSavedStateReevaluationCount = 0;
  for (const { source, candidate } of legacyCandidates) {
    const plan = planSavedParserMigration({
      candidate,
      source,
      generatedArticles: input.generatedArticles
    });
    if (plan.method === "network") {
      plannedNetworkRefetchCount += 1;
    } else {
      plannedSavedStateReevaluationCount += 1;
    }
  }
  const migrationOutcomeCount = (outcome: string): number =>
    migratedCandidates.filter(
      (candidate) => candidate.reevaluationOutcome === outcome
    ).length;

  const registeredBlogCount = input.status.hatenaBlogs?.length ?? 0;
  return {
    registeredBlogCount,
    activeBlogCount:
      input.status.hatenaBlogs?.filter((blog) => blog.automationAllowed)
        .length ?? 0,
    pendingBlogCount:
      input.status.hatenaBlogs?.filter((blog) => !blog.automationAllowed)
        .length ?? 0,
    candidateArticleCount: Object.values(input.status.cursors).reduce(
      (sum, cursor) => sum + cursor.candidates.length,
      0
    ),
    publicArticleCount: articles.length,
    manualArticleCount: input.manualArticles.length,
    generatedArticleCount: input.generatedArticles.length,
    completeCount: input.manualArticles.length + generatedCompleteCount,
    metadataOnlyCount,
    thumbnailCount,
    fallbackCount: articles.length - thumbnailCount,
    bySource,
    bySeason,
    byFormat,
    exclusionReasons,
    teamExtractionMethods,
    parserVersions,
    currentParserVersion: EXTRACTOR_VERSION,
    legacyParserVersionCount: legacyCandidates.length,
    reevaluationTargetCount:
      migratedCandidates.length + legacyCandidates.length,
    reevaluationCompletedCount: migratedCandidates.filter(
      (candidate) => candidate.reevaluationStatus === "completed"
    ).length,
    networkRefetchCount: migratedCandidates.filter(
      (candidate) => candidate.reevaluationMethod === "network"
    ).length,
    savedStateReevaluationCount: migratedCandidates.filter(
      (candidate) => candidate.reevaluationMethod === "saved-state"
    ).length,
    plannedNetworkRefetchCount,
    plannedSavedStateReevaluationCount,
    completeMaintainedCount: migrationOutcomeCount(
      "complete-maintained"
    ),
    completePromotedCount: migrationOutcomeCount("complete-promoted"),
    metadataOnlyMaintainedCount: migrationOutcomeCount(
      "metadata-only-maintained"
    ),
    metadataOnlyPromotedCount: migrationOutcomeCount(
      "metadata-only-promoted"
    ),
    publicDemotedCount: migrationOutcomeCount("public-demoted"),
    excludedMaintainedCount: migrationOutcomeCount(
      "excluded-maintained"
    ),
    judgmentPendingCount: migratedCandidates.filter(
      (candidate) => candidate.reevaluationStatus === "pending"
    ).length,
    candidateOutcomes: {
      targetGameSuccessCount: candidates.filter(
        (candidate) =>
          candidate.targetGameResult === "pokemon-champions"
      ).length,
      formatSuccessCount: candidates.filter(
        (candidate) =>
          candidate.formatResult === "single" ||
          candidate.formatResult === "double"
      ).length,
      seasonSuccessCount: candidates.filter(
        (candidate) => Boolean(candidate.seasonResult)
      ).length,
      completeCount: candidates.filter(
        (candidate) => candidate.teamResult === "complete"
      ).length,
      metadataOnlyCount: candidates.filter(
        (candidate) => candidate.teamResult === "metadata-only"
      ).length,
      excludedCount: candidates.filter(
        (candidate) => Boolean(candidate.exclusionReason)
      ).length
    },
    pokemonNameResolution
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const [manualArticles, generatedArticles, status] = await Promise.all([
    readJson<BuildArticle[]>(
      path.join(rootDir, "data/buildArticles.manual.json")
    ),
    readJson<GeneratedBuildArticle[]>(
      path.join(rootDir, "data/buildArticles.generated.json")
    ),
    readJson<CollectionStatus>(
      path.join(rootDir, "data/buildArticleCollectionStatus.json")
    )
  ]);
  console.log(
    JSON.stringify(
      createBuildExtractionReport({
        manualArticles,
        generatedArticles,
        status
      }),
      null,
      2
    )
  );
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error("[fatal] 抽出レポートの作成に失敗しました");
    console.error(error);
    process.exitCode = 1;
  });
}
