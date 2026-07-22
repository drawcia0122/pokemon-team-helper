import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import localizationData from "@/data/environment/localization/ja.json";
import { getEnvironmentDetailExports, getEnvironmentRankingCatalog } from "@/lib/environmentData.server";
import { findEnvironmentRankingDataset } from "@/lib/environmentPresentation";
import type { EnvironmentLocalizationDictionary } from "@/types/environmentLocalization";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const catalog = getEnvironmentRankingCatalog();
const localization = localizationData as EnvironmentLocalizationDictionary;
assert(catalog.datasets.length === 2, "公開snapshotが2件ではありません");
assert(catalog.datasets.every((dataset) => dataset.ranking.length === 50), "ランキングがTOP50ではありません");
assert(
  findEnvironmentRankingDataset(catalog.datasets, {
    battleFormat: "single",
    regulationId: "M-B",
    ratingCutoff: 1760
  })?.ranking[0]?.slug === "garchomp",
  "M-B single cutoff 1760のランキングを選択できません"
);
assert(
  findEnvironmentRankingDataset(catalog.datasets, {
    battleFormat: "double",
    regulationId: "M-A",
    ratingCutoff: 0
  }) === null,
  "snapshotがない条件をデータありと判定しました"
);

const catalogJson = JSON.stringify(catalog);
assert(Buffer.byteLength(catalogJson) < 100_000, "ランキングDTOが大きすぎます");
assert(!catalogJson.includes("rawWeight"), "ランキングDTOへrawWeightを含めています");
assert(
  catalog.datasets.every((dataset) =>
    dataset.ranking.every((entry) => entry.detailUrl.includes(localization.dictionaryVersion))
  ),
  "辞書更新でdetail URLのcache keyが変わりません"
);

const detailExports = getEnvironmentDetailExports();
assert(detailExports.length === 100, "2 snapshot×TOP50の詳細JSONを生成できません");
assert(new Set(detailExports.map((entry) => entry.relativePath)).size === 100, "詳細JSON pathが重複しています");
const garchomp = detailExports.find(
  (entry) => entry.detail.snapshotId.endsWith(":1760") && entry.detail.slug === "garchomp"
)?.detail;
assert(garchomp?.moves[0]?.name === "じしん", "技を日本語表示できません");
assert(garchomp?.abilities[0]?.name === "さめはだ", "特性を日本語表示できません");
assert(garchomp?.statSpreads[0]?.natureName === "ようき", "性格を日本語表示できません");
assert(
  detailExports.some((entry) =>
    entry.detail.items.some(
      (item) => item.id === "floettite" && item.name === "フラエッテナイト"
    )
  ),
  "Champions追加アイテムを日本語表示できません"
);
assert(garchomp.items.length <= 10 && garchomp.statSpreads.length <= 10, "詳細のTOP10制限が効いていません");
for (const entry of detailExports) {
  const json = JSON.stringify(entry.detail);
  assert(!json.includes("rawWeight"), `詳細DTOへrawWeightを含めています: ${entry.relativePath}`);
  assert(!json.includes('"name":"earthquake"'), `技の内部IDが表示名に残っています: ${entry.relativePath}`);
  assert(Buffer.byteLength(json) < 40_000, `詳細DTOが大きすぎます: ${entry.relativePath}`);
}

const environmentIndex = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/environment/index.json"), "utf8")
) as { snapshots: Array<{ snapshotId: string; path: string }> };
const snapshotBytes = catalog.datasets.reduce((total, dataset) => {
  const reference = environmentIndex.snapshots.find(
    (entry) => entry.snapshotId === dataset.snapshotId
  );
  assert(reference, `snapshot indexがありません: ${dataset.snapshotId}`);
  return total + statSync(path.join(process.cwd(), reference.path)).size;
}, 0);
assert(snapshotBytes > 20_000_000, "20MB級snapshotを検証できません");
assert(Buffer.byteLength(catalogJson) * 200 < snapshotBytes, "Client用ランキングが十分に軽量化されていません");

const clientSource = readFileSync(
  path.join(process.cwd(), "components/environment/EnvironmentExplorer.tsx"),
  "utf8"
);
assert(!clientSource.includes("data/environment/"), "Client Componentがsnapshotを直接importしています");
const serverSource = readFileSync(path.join(process.cwd(), "lib/environmentData.server.ts"), "utf8");
assert(
  serverSource.includes("findLatestEnvironmentSnapshotReference") &&
    readFileSync(path.join(process.cwd(), "lib/environmentPresentation.ts"), "utf8").includes("findEnvironmentPokemon"),
  "TASK023のsnapshot選択・ポケモン取得APIを再利用していません"
);

console.log(
  `[ok] 環境UI: ${catalog.datasets.length} snapshot / ランキングDTO ${Buffer.byteLength(catalogJson)} bytes / 詳細${detailExports.length}件 / 元snapshot ${snapshotBytes} bytes`
);
