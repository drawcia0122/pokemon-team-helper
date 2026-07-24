import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getEnvironmentDetailExports,
  getEnvironmentRankingCatalog,
  getThreatEnvironmentCatalog
} from "@/lib/environmentData.server";

async function main() {
  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, "public");
  const outputDir = path.join(publicDir, "environment-data");
  await mkdir(publicDir, { recursive: true });
  const temporaryDir = await mkdtemp(path.join(publicDir, ".environment-data-"));
  try {
    const exports = getEnvironmentDetailExports();
    let detailBytes = 0;
    for (const entry of exports) {
      const relativePath = entry.relativePath.replace(/^environment-data\//, "");
      if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
        throw new Error(`environment detail pathが不正です: ${relativePath}`);
      }
      const outputPath = path.join(temporaryDir, relativePath);
      await mkdir(path.dirname(outputPath), { recursive: true });
      const json = `${JSON.stringify(entry.detail)}\n`;
      detailBytes += Buffer.byteLength(json);
      await writeFile(outputPath, json, "utf8");
    }
    const catalog = getEnvironmentRankingCatalog();
    const threatCatalog = getThreatEnvironmentCatalog();
    const threatJson = `${JSON.stringify(threatCatalog)}\n`;
    await writeFile(
      path.join(temporaryDir, "_threats.json"),
      threatJson,
      "utf8"
    );
    const manifest = {
      schemaVersion: 1,
      generatedFrom: catalog.datasets.map((dataset) => ({
        snapshotId: dataset.snapshotId,
        contentHash: dataset.contentHash,
        metadata: dataset.metadata,
        detailCount: dataset.ranking.length
      })),
      detailFileCount: exports.length,
      detailBytes,
      threatBytes: Buffer.byteLength(threatJson)
    };
    await writeFile(
      path.join(temporaryDir, "_manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
    await rm(outputDir, { recursive: true, force: true });
    await rename(temporaryDir, outputDir);
    console.log(
      `[ok] 環境詳細用JSON ${exports.length}件 / ${detailBytes} bytes・脅威診断${Buffer.byteLength(threatJson)} bytesを生成しました`
    );
  } catch (error) {
    await rm(temporaryDir, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
