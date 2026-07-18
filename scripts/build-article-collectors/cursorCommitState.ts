import type {
  CandidateCollectionState,
  CollectionStatus,
  SourceCollectionCursor
} from "./types";

type CursorCommitCandidate = Pick<
  CandidateCollectionState,
  "url" | "sourceArticleId"
> & {
  checked: boolean;
};

type CursorCommitState = Record<
  string,
  {
    candidates: CursorCommitCandidate[];
  }
>;

function normalizeCursor(
  cursor: SourceCollectionCursor | undefined
): { candidates: CursorCommitCandidate[] } {
  return {
    candidates: (cursor?.candidates ?? [])
      .map((candidate) => ({
        url: candidate.url,
        sourceArticleId: candidate.sourceArticleId,
        checked: candidate.lastCheckedAt !== null
      }))
      .sort((a, b) => a.url.localeCompare(b.url))
  };
}

export function createMeaningfulCursorCommitState(
  status: Pick<CollectionStatus, "cursors"> | null | undefined
): CursorCommitState {
  return Object.fromEntries(
    Object.entries(status?.cursors ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([source, cursor]) => [source, normalizeCursor(cursor)])
  );
}
