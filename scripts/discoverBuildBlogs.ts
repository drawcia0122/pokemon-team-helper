import { discoverBuildBlogs } from "./build-article-collectors/blogDiscovery";

async function main(): Promise<void> {
  const argumentsSet = new Set(process.argv.slice(2));
  const unknown = [...argumentsSet].filter(
    (argument) => argument !== "--dry-run" && argument !== "--no-linked"
  );
  if (unknown.length > 0) {
    throw new Error(`不明な引数です: ${unknown.join(", ")}`);
  }
  const result = await discoverBuildBlogs({
    dryRun: argumentsSet.has("--dry-run"),
    includeLinkedDiscovery: !argumentsSet.has("--no-linked")
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("[fatal] はてなブログ探索に失敗しました");
  console.error(error);
  process.exitCode = 1;
});
