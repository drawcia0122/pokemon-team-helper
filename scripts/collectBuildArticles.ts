import type { BuildArticleSource } from "../types/buildArticle";
import { collectBuildArticles } from "./build-article-collectors/collector";

function parseArgs(argv: string[]): {
  source?: BuildArticleSource;
  dryRun: boolean;
  backfill: boolean;
  reevaluate: boolean;
} {
  let source: BuildArticleSource | undefined;
  let dryRun = false;
  let backfill = false;
  let reevaluate = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--backfill") {
      backfill = true;
      continue;
    }
    if (argument === "--reevaluate") {
      reevaluate = true;
      continue;
    }
    if (argument === "--source") {
      const value = argv[index + 1];
      if (
        value !== "note" &&
        value !== "pokesol" &&
        value !== "hatena-blog"
      ) {
        throw new Error(
          "--source には note、hatena-blog、pokesol のいずれかを指定してください"
        );
      }
      source = value;
      index += 1;
      continue;
    }
    throw new Error(`不明な引数です: ${argument}`);
  }

  return { source, dryRun, backfill, reevaluate };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await collectBuildArticles(options);

  console.log(JSON.stringify(result.status, null, 2));
  console.log(
    `[${result.wroteFiles ? "write" : "dry-run"}] 生成記事 ${
      result.generatedArticles.length
    }件`
  );
  if (result.failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[fatal] 構築記事の自動収集に失敗しました");
  console.error(error);
  process.exitCode = 1;
});
