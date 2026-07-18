import { readFile } from "node:fs/promises";
import { createMeaningfulCursorCommitState } from "./build-article-collectors/cursorCommitState";
import type { CollectionStatus } from "./build-article-collectors/types";

async function readCursor(filePath: string): Promise<unknown> {
  const status = JSON.parse(
    await readFile(filePath, "utf8")
  ) as CollectionStatus;
  return createMeaningfulCursorCommitState(status);
}

async function main(): Promise<void> {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    throw new Error("比較元と比較先の状態JSONを指定してください");
  }

  const [before, after] = await Promise.all([
    readCursor(beforePath),
    readCursor(afterPath)
  ]);
  process.exitCode =
    JSON.stringify(before) === JSON.stringify(after) ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
