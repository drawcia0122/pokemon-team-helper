import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pokemonData from "@/data/pokemon.json";
import { getEnvironmentRankingCatalog, getThreatEnvironmentCatalog } from "@/lib/environmentData.server";
import { ENVIRONMENT_MINIMUM_USAGE_RATE } from "@/lib/environmentDataset";
import { MIN_THREAT_USAGE_RATE } from "@/lib/teamThreats";
import { getThreatSnapshot } from "@/lib/threatSnapshot";
import type {
  EnvironmentFormatRegistry,
  EnvironmentPokemonAliases,
  EnvironmentSnapshot
} from "@/types/environmentData";
import type { PokemonEntry } from "@/types/pokemon";
import {
  compareEnvironmentDatasets,
  fetchEnvironmentSourceWithRetry,
  runEnvironmentDataPipeline,
  validateEnvironmentDatasetQuality
} from "./environment-data/pipeline";
import { writeFileAtomically } from "./environment-data/collector";
import {
  parseEnvironmentUpdateArgs,
  previousCompleteMonth
} from "./updateEnvironmentData";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function expectReject(
  action: () => Promise<unknown>,
  expected: string
): Promise<void> {
  let message = "";
  try {
    await action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(
    message.includes(expected),
    `期待したエラーではありません: ${expected} / ${message}`
  );
}

const SOURCE_NAMES = [
  "Bulbasaur",
  "Ivysaur",
  "Venusaur",
  "Charmander",
  "Charmeleon",
  "Charizard",
  "Squirtle",
  "Wartortle",
  "Blastoise",
  "Caterpie",
  "Metapod",
  "Butterfree"
] as const;

function sourceEntry(index: number) {
  return {
    "Raw count": 100 - index,
    usage: 0.2 - index * 0.01,
    Abilities: { Overgrow: 100 },
    Items: { Leftovers: 100 },
    Spreads: { "Hardy:0/0/0/0/0/0": 100 },
    Moves: { Tackle: 100 },
    "Tera Types": { nothing: 100 },
    Teammates: {},
    "Checks and Counters": {}
  };
}

function validSourceText(options: {
  cutoff?: number;
  firstUsage?: number;
  includeUnknownForm?: boolean;
  removeMoves?: boolean;
  empty?: boolean;
} = {}): string {
  const data = Object.fromEntries(
    SOURCE_NAMES.map((name, index) => [name, sourceEntry(index)])
  ) as Record<string, ReturnType<typeof sourceEntry>>;
  if (typeof options.firstUsage === "number") {
    data[SOURCE_NAMES[0]]!.usage = options.firstUsage;
  }
  if (options.includeUnknownForm) {
    data.MissingNo = sourceEntry(SOURCE_NAMES.length);
  }
  if (options.removeMoves) {
    delete (data[SOURCE_NAMES[0]] as Partial<ReturnType<typeof sourceEntry>>)
      .Moves;
  }
  return JSON.stringify({
    info: {
      metagame: "gen9championsbssregmb",
      cutoff: options.cutoff ?? 1760,
      "cutoff deviation": 0,
      "team type": null,
      "number of battles": 1_000
    },
    data: options.empty ? {} : data
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function main() {
  assert(
    previousCompleteMonth(new Date("2026-01-15T00:00:00.000Z")) ===
      "2025-12",
    "年跨ぎの前月を算出できません"
  );
  const parsedArgs = parseEnvironmentUpdateArgs(
    ["--dry-run", "--period", "2026-06", "--cutoff", "1760"],
    new Date("2026-07-24T00:00:00.000Z")
  );
  assert(
    parsedArgs.dryRun &&
      parsedArgs.period === "2026-06" &&
      parsedArgs.cutoffs.length === 1 &&
      parsedArgs.cutoffs[0] === 1760,
    "environment:update引数を解析できません"
  );

  let retryAttempts = 0;
  const retryDelays: number[] = [];
  const retryText = await fetchEnvironmentSourceWithRetry("fixture://retry", {
    fetchText: async (_url, attempt) => {
      retryAttempts = attempt;
      if (attempt < 3) throw new Error("http-429");
      return "ok";
    },
    wait: async (milliseconds) => {
      retryDelays.push(milliseconds);
    }
  });
  assert(
    retryText === "ok" &&
      retryAttempts === 3 &&
      retryDelays.join(",") === "1000,2000",
    "429を最大3回・指数backoff対象として再試行できません"
  );

  const rootDir = await mkdtemp(
    path.join(tmpdir(), "environment-pipeline-")
  );
  const target = {
    period: "2026-07",
    sourceFormatId: "gen9championsbssregmb",
    cutoff: 1760
  };
  const initial = await runEnvironmentDataPipeline({
    rootDir,
    targets: [target],
    now: new Date("2026-08-01T00:00:00.000Z"),
    fetchText: async () => validSourceText(),
    wait: async () => {}
  });
  assert(
    initial.changed &&
      initial.published &&
      !initial.fallbackUsed &&
      initial.snapshots[0]?.pokemon.length === SOURCE_NAMES.length,
    "正常取得をValidate後にPublishできません"
  );
  const snapshotPath = path.join(
    rootDir,
    "data/environment/snapshots/pokemon-showdown/2026-07/gen9championsbssregmb-1760.json"
  );
  const indexPath = path.join(rootDir, "data/environment/index.json");
  const snapshotBefore = await readFile(snapshotPath, "utf8");
  const indexBefore = await readFile(indexPath, "utf8");
  const index = JSON.parse(indexBefore);
  assert(
    index.snapshots[0]?.metadata?.datasetId ===
      "pokemon-showdown:2026-07:gen9championsbssregmb:1760" &&
      index.snapshots[0]?.metadata?.minimumUsageRate === 0.001 &&
      index.snapshots[0]?.metadata?.publishedAt ===
        "2026-08-01T00:00:00.000Z",
    "Dataset Metadataをindexへ保存できません"
  );

  const noChange = await runEnvironmentDataPipeline({
    rootDir,
    targets: [target],
    now: new Date("2026-08-02T00:00:00.000Z"),
    fetchText: async () => validSourceText(),
    wait: async () => {}
  });
  assert(
    !noChange.changed && !noChange.published && !noChange.fallbackUsed,
    "同一content hashでPublishを停止できません"
  );
  assert(
    (await readFile(snapshotPath, "utf8")) === snapshotBefore &&
      (await readFile(indexPath, "utf8")) === indexBefore,
    "変更なしで取得時刻または公開Datasetを更新しました"
  );

  const dryRoot = await mkdtemp(
    path.join(tmpdir(), "environment-pipeline-dry-")
  );
  const dryRun = await runEnvironmentDataPipeline({
    rootDir: dryRoot,
    targets: [target],
    dryRun: true,
    now: new Date("2026-08-01T00:00:00.000Z"),
    fetchText: async () => validSourceText(),
    wait: async () => {}
  });
  assert(
    dryRun.changed &&
      !dryRun.published &&
      !dryRun.fallbackUsed &&
      !(await exists(path.join(dryRoot, "data/environment/index.json"))),
    "dry-runがPublishしました"
  );

  let failureAttempts = 0;
  await expectReject(
    () =>
      runEnvironmentDataPipeline({
        rootDir,
        targets: [target],
        fetchText: async () => {
          failureAttempts += 1;
          throw new Error("fixture-network-failure");
        },
        wait: async () => {}
      }),
    "fetch-failed-after-3-attempts"
  );
  assert(failureAttempts === 3, "取得失敗時のRetry回数が3回ではありません");
  assert(
    (await readFile(snapshotPath, "utf8")) === snapshotBefore &&
      (await readFile(indexPath, "utf8")) === indexBefore,
    "取得失敗時に旧Datasetを維持できません"
  );

  for (const [name, rawText, expected] of [
    ["0件", validSourceText({ empty: true }), "pokemon件数"],
    ["使用率異常", validSourceText({ firstUsage: 101 }), "usageが0〜1"],
    [
      "未知フォーム",
      validSourceText({ includeUnknownForm: true }),
      "未知のポケモンまたはフォーム"
    ],
    ["Schema変更", validSourceText({ removeMoves: true }), "Moves"]
  ] as const) {
    await expectReject(
      () =>
        runEnvironmentDataPipeline({
          rootDir,
          targets: [target],
          dryRun: true,
          fetchText: async () => rawText,
          wait: async () => {}
        }),
      expected
    );
    assert(
      (await readFile(snapshotPath, "utf8")) === snapshotBefore &&
        (await readFile(indexPath, "utf8")) === indexBefore,
      `${name}で旧Datasetを維持できません`
    );
  }

  let atomicCalls = 0;
  await expectReject(
    () =>
      runEnvironmentDataPipeline({
        rootDir,
        targets: [target],
        now: new Date("2026-08-03T00:00:00.000Z"),
        fetchText: async () => validSourceText({ firstUsage: 0.201 }),
        wait: async () => {},
        atomicWrite: async (filePath, value) => {
          atomicCalls += 1;
          if (atomicCalls === 2) {
            throw new Error("fixture-publish-failure");
          }
          await writeFileAtomically(filePath, value);
        }
      }),
    "fixture-publish-failure"
  );
  assert(
    (await readFile(snapshotPath, "utf8")) === snapshotBefore &&
      (await readFile(indexPath, "utf8")) === indexBefore,
    "Publish失敗時に旧snapshot/indexへFallbackできません"
  );

  const batchRoot = await mkdtemp(
    path.join(tmpdir(), "environment-pipeline-batch-")
  );
  let batchAtomicCalls = 0;
  await expectReject(
    () =>
      runEnvironmentDataPipeline({
        rootDir: batchRoot,
        targets: [
          { ...target, cutoff: 0 },
          { ...target, cutoff: 1760 }
        ],
        now: new Date("2026-08-03T00:00:00.000Z"),
        fetchText: async (url) =>
          validSourceText({ cutoff: url.includes("-0.json") ? 0 : 1760 }),
        wait: async () => {},
        atomicWrite: async (filePath, value) => {
          batchAtomicCalls += 1;
          if (batchAtomicCalls === 3) {
            throw new Error("fixture-batch-index-failure");
          }
          await writeFileAtomically(filePath, value);
        }
      }),
    "fixture-batch-index-failure"
  );
  assert(
    !(await exists(path.join(batchRoot, "data/environment/index.json"))) &&
      !(await exists(
        path.join(
          batchRoot,
          "data/environment/snapshots/pokemon-showdown/2026-07/gen9championsbssregmb-0.json"
        )
      )) &&
      !(await exists(
        path.join(
          batchRoot,
          "data/environment/snapshots/pokemon-showdown/2026-07/gen9championsbssregmb-1760.json"
        )
      )),
    "複数cutoffの途中失敗で部分Publishが残りました"
  );

  const previous = JSON.parse(snapshotBefore) as EnvironmentSnapshot;
  const countDrop = clone(previous);
  countDrop.pokemon = countDrop.pokemon.slice(0, 5);
  assert(
    compareEnvironmentDatasets(previous, countDrop).errors.some((error) =>
      error.includes("pokemon件数")
    ),
    "件数大幅減少を検知できません"
  );
  const allTop10Changed = clone(previous);
  allTop10Changed.pokemon.slice(0, 10).forEach((entry, index) => {
    entry.slug = `replacement-${index}`;
  });
  assert(
    compareEnvironmentDatasets(previous, allTop10Changed).errors.some(
      (error) => error.includes("TOP10")
    ),
    "TOP10全入れ替えを検知できません"
  );
  const distributionsGone = clone(previous);
  distributionsGone.pokemon.forEach((entry) => {
    entry.moves = [];
    entry.abilities = [];
  });
  const missingDistributionErrors = compareEnvironmentDatasets(
    previous,
    distributionsGone
  ).errors;
  assert(
    missingDistributionErrors.some((error) => error.includes("技データ")) &&
      missingDistributionErrors.some((error) =>
        error.includes("特性データ")
      ),
    "技・特性データ消失を検知できません"
  );
  const rollback = clone(previous);
  rollback.period.value = "2026-06";
  assert(
    compareEnvironmentDatasets(previous, rollback).errors.some((error) =>
      error.includes("巻き戻")
    ),
    "season巻き戻りを検知できません"
  );
  const wrongRegulation = clone(previous);
  wrongRegulation.regulationId = "M-A";
  assert(
    compareEnvironmentDatasets(previous, wrongRegulation).errors.some(
      (error) => error.includes("regulation")
    ),
    "regulation変更を検知できません"
  );
  const duplicateForm = clone(previous);
  duplicateForm.pokemon[1]!.slug = duplicateForm.pokemon[0]!.slug;
  const duplicateErrors = validateEnvironmentDatasetQuality(duplicateForm, {
    target,
    registry: (await import("@/data/environment/formatRegistry.json"))
      .default as EnvironmentFormatRegistry,
    aliases: (await import("@/data/environment/sourcePokemonAliases.json"))
      .default as EnvironmentPokemonAliases,
    pokemon: pokemonData as PokemonEntry[]
  });
  assert(
    duplicateErrors.some((error) => error.includes("slugが重複")),
    "フォーム重複を拒否できません"
  );

  const ranking = getEnvironmentRankingCatalog().datasets.find(
    (dataset) =>
      dataset.regulationId === "M-B" && dataset.ratingCutoff === 1760
  );
  const threatDataset = getThreatEnvironmentCatalog().datasets.find(
    (dataset) =>
      dataset.regulationId === "M-B" && dataset.ratingCutoff === 1760
  );
  assert(ranking && threatDataset, "公開Datasetを選択できません");
  const threatSnapshot = getThreatSnapshot({
    team: [],
    availablePokemon: pokemonData as PokemonEntry[],
    environmentDataset: threatDataset
  });
  assert(
    ranking.snapshotId === threatDataset.snapshotId &&
      ranking.metadata.datasetId === threatDataset.metadata.datasetId &&
      threatSnapshot.analysisContext.datasetId ===
        threatDataset.metadata.datasetId,
    "環境ランキング・要警戒・Advisorが同じDataset IDを参照していません"
  );
  assert(
    ranking.metadata.minimumUsageRate ===
      ENVIRONMENT_MINIMUM_USAGE_RATE &&
      ENVIRONMENT_MINIMUM_USAGE_RATE === MIN_THREAT_USAGE_RATE &&
      MIN_THREAT_USAGE_RATE === 0.001,
    "TASK027の使用率境界とDataset Metadataが一致しません"
  );
  const workflowSource = await readFile(
    path.join(
      process.cwd(),
      ".github/workflows/refresh-environment-data.yml"
    ),
    "utf8"
  );
  assert(
    workflowSource.includes("schedule:") &&
      workflowSource.includes("workflow_dispatch:") &&
      workflowSource.includes("dry_run:") &&
      workflowSource.includes("concurrency:") &&
      workflowSource.includes("npm run environment:update") &&
      workflowSource.includes("chore: update environment dataset") &&
      workflowSource.includes("actions/deploy-pages@v5"),
    "自動更新Workflowにschedule・手動dry-run・排他・更新・commit・Deployがありません"
  );

  console.log(
    `[ok] 環境更新基盤: 正常取得・変更なし・Retry・0件・使用率・フォーム・Schema・Compare・Fallback・dry-run・Dataset ID・TASK027境界を検証`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
