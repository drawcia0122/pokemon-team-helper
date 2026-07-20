import type {
  CandidateCollectionState,
  CollectionStatus,
  SourceCollectionCursor
} from "./types";

type CursorCommitCandidate = Pick<
  CandidateCollectionState,
  | "url"
  | "source"
  | "discoveredAt"
  | "sourceArticleId"
  | "publishedAt"
  | "contentFingerprint"
  | "targetGameResult"
  | "formatResult"
  | "seasonResult"
  | "teamResult"
  | "exclusionReason"
  | "parserVersion"
  | "previousParserVersion"
  | "reevaluationMethod"
  | "reevaluationStatus"
  | "reevaluationOutcome"
  | "reevaluationReason"
> & {
  checked: boolean;
};

type CursorCommitState = {
  cursors: Record<string, { candidates: CursorCommitCandidate[] }>;
  hatenaFeeds: Record<
    string,
    {
      etag: string | null;
      lastModified: string | null;
      consecutiveFetchFailures: number;
      entries: Record<
        string,
        { updatedAt: string | null; contentFingerprint: string }
      >;
    }
  >;
  hatenaBlogs: Array<{
    domain: string;
    discoveredFrom: string | null;
    feedUrl: string;
    automationAllowed: boolean;
    customDomain: boolean;
    platformVerified: boolean;
    verificationMethod: string | null;
    promotionReason: string | null;
    candidateCount: number | null;
    failureCount: number;
  }>;
};

function normalizeCursor(
  cursor: SourceCollectionCursor | undefined
): { candidates: CursorCommitCandidate[] } {
  return {
    candidates: (cursor?.candidates ?? [])
      .map((candidate) => ({
        url: candidate.url,
        source: candidate.source,
        discoveredAt: candidate.discoveredAt,
        sourceArticleId: candidate.sourceArticleId,
        publishedAt: candidate.publishedAt,
        checked: candidate.lastCheckedAt !== null,
        contentFingerprint: candidate.contentFingerprint,
        targetGameResult: candidate.targetGameResult,
        formatResult: candidate.formatResult,
        seasonResult: candidate.seasonResult,
        teamResult: candidate.teamResult,
        exclusionReason: candidate.exclusionReason,
        parserVersion: candidate.parserVersion,
        previousParserVersion: candidate.previousParserVersion,
        reevaluationMethod: candidate.reevaluationMethod,
        reevaluationStatus: candidate.reevaluationStatus,
        reevaluationOutcome: candidate.reevaluationOutcome,
        reevaluationReason: candidate.reevaluationReason
      }))
      .sort((a, b) => a.url.localeCompare(b.url))
  };
}

export function createMeaningfulCursorCommitState(
  status:
    | {
        cursors: Partial<CollectionStatus["cursors"]>;
        hatenaFeeds?: CollectionStatus["hatenaFeeds"];
        hatenaBlogs?: CollectionStatus["hatenaBlogs"];
      }
    | null
    | undefined
): CursorCommitState {
  return {
    cursors: Object.fromEntries(
      Object.entries(status?.cursors ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([source, cursor]) => [source, normalizeCursor(cursor)])
    ),
    hatenaFeeds: Object.fromEntries(
      Object.entries(status?.hatenaFeeds ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([domain, feed]) => [
          domain,
          {
            etag: feed.etag,
            lastModified: feed.lastModified,
            consecutiveFetchFailures: feed.consecutiveFetchFailures,
            entries: Object.fromEntries(
              Object.entries(feed.entries)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([url, entry]) => [
                  url,
                  {
                    updatedAt: entry.updatedAt,
                    contentFingerprint: entry.contentFingerprint
                  }
                ])
            )
          }
        ])
    ),
    hatenaBlogs: [...(status?.hatenaBlogs ?? [])]
      .sort((a, b) => a.domain.localeCompare(b.domain))
      .map((blog) => ({
        domain: blog.domain,
        discoveredFrom: blog.discoveredFrom,
        feedUrl: blog.feedUrl,
        automationAllowed: blog.automationAllowed,
        customDomain: blog.customDomain,
        platformVerified: blog.platformVerified,
        verificationMethod: blog.verificationMethod ?? null,
        promotionReason: blog.promotionReason ?? null,
        candidateCount: blog.candidateCount ?? null,
        failureCount: blog.failureCount ?? 0
      }))
  };
}
