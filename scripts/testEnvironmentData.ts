import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import aliasesData from "@/data/environment/sourcePokemonAliases.json";
import registryData from "@/data/environment/formatRegistry.json";
import indexData from "@/data/environment/index.json";
import pokemonData from "@/data/pokemon.json";
import {
  findEnvironmentPokemon,
  findLatestEnvironmentSnapshotReference,
  listEnvironmentSnapshotReferences
} from "@/lib/environmentData";
import {
  validateEnvironmentAliases,
  validateEnvironmentIndex,
  validateEnvironmentRegistry,
  validateEnvironmentSnapshot
} from "@/lib/validateEnvironmentData";
import type {
  EnvironmentFormatDefinition,
  EnvironmentFormatRegistry,
  EnvironmentPokemonAliases,
  EnvironmentSnapshot,
  EnvironmentSnapshotIndex
} from "@/types/environmentData";
import type { PokemonEntry } from "@/types/pokemon";
import { parseEnvironmentCollectionArgs } from "./collectEnvironmentData";
import {
  collectEnvironmentSnapshot,
  writeFileAtomically
} from "./environment-data/collector";
import { normalizeShowdownSnapshot } from "./environment-data/normalizer";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function pathExists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function expectReject(action: () => Promise<unknown>, expected: string) {
  let message = "";
  try {
    await action();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message.includes(expected), `期待したエラーではありません: ${expected} / ${message}`);
}

async function main() {
  const fixtureRoot = path.join(process.cwd(), "scripts/fixtures/environment-data");
  const validText = await readFile(path.join(fixtureRoot, "chaos-valid.json"), "utf8");
  const invalidText = await readFile(path.join(fixtureRoot, "chaos-invalid.json"), "utf8");
  const registry = registryData as EnvironmentFormatRegistry;
  const aliases = aliasesData as EnvironmentPokemonAliases;
  const pokemon = pokemonData as PokemonEntry[];
  assert(validateEnvironmentRegistry(registry).errors.length === 0, "registryを検証できません");
  assert(
    registry.formats.length === 4 &&
      registry.allowedCutoffs.length === 2 &&
      registry.allowedCutoffs.includes(0) &&
      registry.allowedCutoffs.includes(1760),
    "TASK023のformat/cutoff registryが不正です"
  );
  assert(validateEnvironmentAliases(aliases, pokemon).errors.length === 0, "aliasを検証できません");
  assert(
    registry.sourcePolicies.some(
      (policy) =>
        policy.source === "pokemon-home" &&
        !policy.automationAllowed &&
        policy.reason ===
          "no-public-api-and-terms-restrict-reverse-engineering-and-redistribution"
    ),
    "Pokemon HOME policy gateがありません"
  );

  const parsedArgs = parseEnvironmentCollectionArgs([
    "--period", "2026-06", "--format", "gen9championsbssregmb",
    "--cutoff", "1760", "--dry-run"
  ]);
  assert(parsedArgs.cutoff === 1760 && parsedArgs.dryRun, "collector引数を解析できません");

  const fixtureFormat = registry.formats.find(
    (format) => format.sourceFormatId === "gen9championsbssregmb"
  )!;
  const snapshot = normalizeShowdownSnapshot({
    rawText: validText,
    parsed: JSON.parse(validText),
    period: "2026-06",
    format: fixtureFormat,
    cutoff: 0,
    retrievedAt: "2026-07-22T00:00:00.000Z",
    sourceUrl:
      "https://www.smogon.com/stats/2026-06/chaos/gen9championsbssregmb-0.json",
    pokemon,
    aliases
  });
  assert(snapshot.pokemon.length === 3, "通常・メガ・aliasを正規化できません");
  assert(
    snapshot.source.datasetLicense === "not-explicitly-stated" &&
      snapshot.source.softwareLicense === "MIT" &&
      snapshot.normalization.normalizerVersion === "1.1.0",
    "データとソフトウェアのライセンスまたはnormalizer versionが不正です"
  );
  assert(snapshot.pokemon[0]?.slug === "garchomp", "通常ポケモンを解決できません");
  assert(
    snapshot.pokemon.some((entry) => entry.slug === "charizard-mega-x"),
    "メガフォームをslugへ解決できません"
  );
  assert(
    snapshot.pokemon.some((entry) => entry.slug === "indeedee-female"),
    "明示aliasを解決できません"
  );
  assert(
    snapshot.normalization.unresolvedPokemonCount === 1 &&
      snapshot.normalization.unresolvedReferenceCount === 2 &&
      snapshot.normalization.unresolvedNames.some(
        (entry) => entry.sourceName === "MissingNo" && entry.contexts.includes("pokemon")
      ),
    "unresolvedを推測吸収せず報告できません"
  );
  const garchomp = snapshot.pokemon.find((entry) => entry.slug === "garchomp")!;
  assert(
    garchomp.moves[0]?.id === "earthquake" &&
      garchomp.moves[0].sourceName === "Earthquake" &&
      garchomp.moves[0].share === 0.95,
    "技のID・表示名・割合を正規化できません"
  );
  assert(garchomp.items[0]?.rawWeight === 60, "持ち物のrawWeightを保持できません");
  assert(!garchomp.items.some((item) => item.id === "nothing"), "持ち物のnothingを表示用分布に含めています");
  assert(garchomp.abilities[0]?.share === 0.9, "特性を正規化できません");
  assert(
    garchomp.statSpreads[0]?.investmentSystem === "stat-points" &&
      garchomp.statSpreads[0].values.attack === 32,
    "Stat PointsをEVと区別できません"
  );
  assert(garchomp.teraTypes.length === 0 && snapshot.fieldAvailability.teraTypes === "not-applicable", "nothingをテラスタイプとして公開しています");
  assert(garchomp.checksAndCounters[0]?.score === 0.75, "checksAndCountersを正規化できません");
  assert(garchomp.teammates.some((entry) => entry.slug === null), "関連unresolvedを保持できません");
  assert(
    validateEnvironmentSnapshot(snapshot, { pokemon, registry, aliases }).length === 0,
    "正常snapshotの検証に失敗しました"
  );
  assert(findEnvironmentPokemon(snapshot, "garchomp") === garchomp, "slugで統計を取得できません");

  const currentIndex = indexData as EnvironmentSnapshotIndex;
  assert(
    listEnvironmentSnapshotReferences(currentIndex, {
      sourceFormatId: "gen9championsbssregmb",
      ratingCutoff: 0
    }).length === 1 &&
      listEnvironmentSnapshotReferences(currentIndex, {
        sourceFormatId: "gen9championsbssregmb",
        ratingCutoff: 1760
      }).length === 1,
    "format/cutoffを混在させずsnapshotを選択できません"
  );
  assert(
    findLatestEnvironmentSnapshotReference(currentIndex, {
      sourceFormatId: "gen9championsbssregmb",
      ratingCutoff: 1760
    })?.snapshotId === "pokemon-showdown:2026-06:gen9championsbssregmb:1760",
    "latest snapshotを取得できません"
  );

  const evRaw = JSON.parse(validText);
  evRaw.info.metagame = "gen9ou";
  evRaw.data.Garchomp.Spreads = { "Jolly:0/252/0/0/4/252": 100 };
  delete evRaw.data["Charizard-Mega-X"];
  delete evRaw.data["Indeedee-F"];
  delete evRaw.data.MissingNo;
  evRaw.data.Garchomp.Teammates = {};
  evRaw.data.Garchomp["Checks and Counters"] = {};
  const evFormat: EnvironmentFormatDefinition = {
    sourceFormatId: "gen9ou",
    gameId: "pokemon-champions",
    regulationId: "M-A",
    battleFormat: "single",
    investmentSystem: "ev",
    enabled: true
  };
  const evSnapshot = normalizeShowdownSnapshot({
    rawText: JSON.stringify(evRaw), parsed: evRaw, period: "2026-06",
    format: evFormat, cutoff: 0, retrievedAt: "2026-07-22T00:00:00.000Z",
    sourceUrl: "https://www.smogon.com/stats/2026-06/chaos/gen9ou-0.json",
    pokemon, aliases
  });
  assert(
    evSnapshot.pokemon[0]?.statSpreads[0]?.investmentSystem === "ev" &&
      evSnapshot.pokemon[0].statSpreads[0].values.attack === 252,
    "EV配分をStat Pointsと区別できません"
  );

  const invalidCases: Array<[string, (value: EnvironmentSnapshot) => void, string]> = [
    ["rank重複", (value) => { value.pokemon[1]!.usage.rank = value.pokemon[0]!.usage.rank; }, "rankが重複"],
    ["rate範囲", (value) => { value.pokemon[0]!.usage.rate = 1.1; }, "usage.rate"],
    ["slug存在", (value) => { value.pokemon[0]!.slug = "not-a-pokemon"; }, "slugが存在しません"],
    ["NaN", (value) => { value.pokemon[0]!.moves[0]!.rawWeight = Number.NaN; }, "rawWeight"],
    ["battleCount", (value) => { value.battleCount = 0; }, "battleCount"],
    ["investment", (value) => { value.pokemon[0]!.statSpreads[0]!.values.attack = 33; }, "配分値"]
  ];
  for (const [name, mutate, expected] of invalidCases) {
    const invalid = clone(snapshot);
    mutate(invalid);
    assert(
      validateEnvironmentSnapshot(invalid, { pokemon, registry, aliases }).some((error) => error.includes(expected)),
      `${name}を拒否できません`
    );
  }

  const dryRoot = await mkdtemp(path.join(tmpdir(), "environment-dry-run-"));
  const dry = await collectEnvironmentSnapshot({
    period: "2026-06", sourceFormatId: "gen9championsbssregmb", cutoff: 0,
    dryRun: true, rootDir: dryRoot, now: new Date("2026-07-22T00:00:00.000Z"),
    fetchText: async () => validText
  });
  assert(!dry.wroteFiles && dry.changed, "dry-run結果が不正です");
  assert(!(await pathExists(path.join(dryRoot, dry.snapshotPath))), "dry-runがsnapshotを書き込みました");
  assert(!(await pathExists(path.join(dryRoot, "data/environment/index.json"))), "dry-runがindexを書き込みました");

  const writeRoot = await mkdtemp(path.join(tmpdir(), "environment-write-"));
  const first = await collectEnvironmentSnapshot({
    period: "2026-06", sourceFormatId: "gen9championsbssregmb", cutoff: 0,
    rootDir: writeRoot, now: new Date("2026-07-22T00:00:00.000Z"), fetchText: async () => validText
  });
  assert(first.wroteFiles && await pathExists(path.join(writeRoot, first.snapshotPath)), "snapshotをatomic writeできません");
  const indexBefore = await readFile(path.join(writeRoot, "data/environment/index.json"), "utf8");
  const snapshotBefore = await readFile(path.join(writeRoot, first.snapshotPath), "utf8");
  const sameHash = await collectEnvironmentSnapshot({
    period: "2026-06", sourceFormatId: "gen9championsbssregmb", cutoff: 0,
    rootDir: writeRoot, now: new Date("2026-07-23T00:00:00.000Z"), fetchText: async () => validText
  });
  assert(sameHash.hashMatched && !sameHash.wroteFiles, "hash同一時に書き込みを停止できません");
  assert(
    await readFile(path.join(writeRoot, "data/environment/index.json"), "utf8") === indexBefore &&
      await readFile(path.join(writeRoot, first.snapshotPath), "utf8") === snapshotBefore,
    "hash同一時に取得時刻だけの差分を作りました"
  );

  const savedIndex = JSON.parse(indexBefore) as EnvironmentSnapshotIndex;
  const savedSnapshot = JSON.parse(snapshotBefore) as EnvironmentSnapshot;
  assert(
    validateEnvironmentIndex(savedIndex, new Map([[first.snapshotPath, savedSnapshot]])).length === 0,
    "indexとsnapshotの整合を検証できません"
  );
  const badIndex = clone(savedIndex);
  badIndex.snapshots[0]!.contentHash = "0".repeat(64);
  assert(
    validateEnvironmentIndex(badIndex, new Map([[first.snapshotPath, savedSnapshot]])).some((error) => error.includes("不一致")),
    "index不整合を拒否できません"
  );

  await expectReject(
    () => collectEnvironmentSnapshot({
      period: "2026-06", sourceFormatId: "gen9championsbssregmb", cutoff: 0,
      dryRun: true, rootDir: dryRoot, fetchText: async () => invalidText
    }),
    "invalid-json"
  );

  const atomicRoot = await mkdtemp(path.join(tmpdir(), "environment-atomic-failure-"));
  let atomicCalls = 0;
  await expectReject(
    () => collectEnvironmentSnapshot({
      period: "2026-06", sourceFormatId: "gen9championsbssregmb", cutoff: 0,
      rootDir: atomicRoot, fetchText: async () => validText,
      atomicWrite: async (filePath, value) => {
        atomicCalls += 1;
        if (atomicCalls === 2) throw new Error("fixture-atomic-write-failure");
        await writeFileAtomically(filePath, value);
      }
    }),
    "fixture-atomic-write-failure"
  );
  const expectedAtomicSnapshot = path.join(
    atomicRoot,
    "data/environment/snapshots/pokemon-showdown/2026-06/gen9championsbssregmb-0.json"
  );
  assert(!(await pathExists(expectedAtomicSnapshot)), "index write失敗後に孤立snapshotが残りました");

  console.log(
    `[ok] 環境データ: 通常・メガ・alias・unresolved・各分布・Stat Points/EV・不正JSON・hash・dry-run・atomic失敗を検証`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
