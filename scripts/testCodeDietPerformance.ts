import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import {
  filterPokemonSelectionByTypes,
  createPokemonSelectionIndex,
  filterPokemonSelectionIndexByTypes,
  getPokemonTypeFilterCacheKey
} from "@/lib/teamCandidateSelection";
import { BoundedCache } from "@/lib/boundedCache";
import {
  getIntegratedAdvisorSwapSimulation,
  getRecommendationRuntimeCacheKey
} from "@/lib/recommendationIntegrationRuntime";
import { integrateBattleValueRecommendation } from "@/lib/recommendationBattleValueIntegration";
import { getRegulationCandidatesForSeason } from "@/lib/regulationCandidateCache";
import { getAllPokemon } from "@/lib/typeChart";
import { buildRecommendationAnalyzerFixture } from "@/scripts/lib/recommendationAnalyzerHarness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function simulationOutput(simulation: ReturnType<typeof getIntegratedAdvisorSwapSimulation>) {
  return simulation.evaluatedPlans.map((plan) => ({
    slug: plan.candidate.pokemon.slug,
    action: plan.action,
    score: plan.finalRecommendation,
    categoryScore: plan.categoryScores.overall,
    battleValue: plan.battleValueContribution,
    battleExplanation: plan.battleValueExplanation,
    contestability: plan.contestability,
    contestabilityExplanation: plan.contestabilityExplanation,
    evidence: plan.evidence
  }));
}

function sourceDependencies(entry: string): Set<string> {
  const visited = new Set<string>();
  const pending = [resolve(entry)];
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    const imports = source.matchAll(
      /(?:from\s+|import\s*\()\s*["'](@\/[^"']+|\.[^"']+)["']/g
    );
    for (const match of imports) {
      const specifier = match[1];
      const base = specifier.startsWith("@/")
        ? resolve(specifier.slice(2))
        : resolve(file, "..", specifier);
      const candidates = extname(base)
        ? [base]
        : [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")];
      const target = candidates.find((candidate) => {
        try {
          readFileSync(candidate);
          return true;
        } catch {
          return false;
        }
      });
      if (target) pending.push(target);
    }
  }
  return visited;
}

const regulationBFirst = getRegulationCandidatesForSeason("season-m4");
const regulationBSecond = getRegulationCandidatesForSeason("season-m4");
const regulationA = getRegulationCandidatesForSeason("season-m1");
assert(
  regulationBFirst === regulationBSecond,
  "同一Regulationの候補集合が再生成されました"
);
assert(
  regulationA !== regulationBFirst,
  "Regulation変更時に候補集合が切り替わりません"
);

const selectionIndex = createPokemonSelectionIndex(
  getAllPokemon(),
  regulationBFirst
);
const waterPsychic = filterPokemonSelectionIndexByTypes({
  index: selectionIndex,
  primaryType: "water",
  secondaryType: "psychic"
});
const typeCacheSize = selectionIndex.typeFilterCache.size;
const psychicWater = filterPokemonSelectionIndexByTypes({
  index: selectionIndex,
  primaryType: "psychic",
  secondaryType: "water"
});
assert(
  getPokemonTypeFilterCacheKey("water", "psychic") ===
    getPokemonTypeFilterCacheKey("psychic", "water") &&
    waterPsychic === psychicWater &&
    selectionIndex.typeFilterCache.size === typeCacheSize,
  "タイプ順序を入れ替えた同一条件でcacheが再計算されました"
);
assert(
  JSON.stringify(waterPsychic.map((pokemon) => pokemon.slug)) ===
    JSON.stringify(
      filterPokemonSelectionByTypes({
        pokemon: regulationBFirst,
        primaryType: "water",
        secondaryType: "psychic"
      }).map((pokemon) => pokemon.slug)
    ),
  "index化前後でタイプ絞り込み結果または順序が変わりました"
);

const fixture = buildRecommendationAnalyzerFixture({
  teamSlugs: ["charizard"]
});
const input = {
  team: fixture.team,
  advisor: fixture.advisor,
  availablePokemon: fixture.analyzerInput.availablePokemon,
  environmentDataset: fixture.analyzerInput.environmentDataset,
  threatSnapshot: fixture.threatSnapshot,
  profile: fixture.analyzerInput.context.profile
};
const first = getIntegratedAdvisorSwapSimulation(input);
const second = getIntegratedAdvisorSwapSimulation(input);
assert(
  first === second,
  "同一Team・Regulation・Profile・Datasetの派生結果が再利用されません"
);

const bounded = new BoundedCache<string, object>(2);
const oldest = {};
bounded.set("oldest", oldest);
bounded.set("second", {});
bounded.set("third", {});
assert(
  bounded.maximumSize === 2 && bounded.get("oldest") === undefined,
  "bounded cacheが最大件数を超えました"
);

const datasetChanged = {
  ...input.environmentDataset,
  snapshotId: `${input.environmentDataset.snapshotId}-cache-test`,
  metadata: {
    ...input.environmentDataset.metadata,
    checksum: `${input.environmentDataset.metadata.checksum}-cache-test`
  }
};
const datasetChangedSimulation = getIntegratedAdvisorSwapSimulation({
  ...input,
  environmentDataset: datasetChanged
});
assert(
  datasetChangedSimulation !== first,
  "Dataset変更時にruntime cacheが無効化されません"
);

const regulationChangedInput = {
  ...input,
  environmentDataset: {
    ...input.environmentDataset,
    regulationId: "M-A" as const,
    metadata: {
      ...input.environmentDataset.metadata,
      regulation: "M-A" as const
    }
  }
};
assert(
  getRecommendationRuntimeCacheKey(regulationChangedInput) !==
    getRecommendationRuntimeCacheKey(input),
  "Regulation変更時にruntime cacheが無効化されません"
);

const teamFixture = buildRecommendationAnalyzerFixture({
  teamSlugs: ["charizard", "garchomp"]
});
const changedTeamSimulation = getIntegratedAdvisorSwapSimulation({
  team: teamFixture.team,
  advisor: teamFixture.advisor,
  availablePokemon: teamFixture.analyzerInput.availablePokemon,
  environmentDataset: teamFixture.analyzerInput.environmentDataset,
  threatSnapshot: teamFixture.threatSnapshot,
  profile: teamFixture.analyzerInput.context.profile
});
assert(
  changedTeamSimulation !== first,
  "team signature変更時にruntime cacheが再計算されません"
);

const cli = integrateBattleValueRecommendation({
  input,
  baseline: fixture.simulation
});
assert(
  JSON.stringify(simulationOutput(first)) ===
    JSON.stringify(simulationOutput(cli.simulation)),
  "最適化前後でFinal Score・候補順位・Explanationが変わりました"
);

const productionDependencies = sourceDependencies("app/page.tsx");
const pageSource = readFileSync("app/page.tsx", "utf8");
assert(
  (pageSource.match(/localStorage\.setItem\(TEAM_STORAGE_KEY/g) ?? []).length ===
    1,
  "同一team操作でlocalStorageへ重複保存する経路が残っています"
);
const forbidden = [...productionDependencies].filter(
  (file) =>
    file.includes("/scripts/") ||
    file.includes("/benchmarks/") ||
    file.endsWith("/lib/recommendationAnalyzer.ts") ||
    file.endsWith("/lib/recommendationBattleValueIntegration.ts")
);
assert(
  forbidden.length === 0,
  `本番client entryから分析・fixture専用moduleへ到達します: ${forbidden.join(", ")}`
);

console.log(
  `[ok] TASK052 Performance Golden: regulationForms=${regulationBFirst.length}, species=${new Set(regulationBFirst.map((pokemon) => pokemon.speciesId)).size}, typeCache=${selectionIndex.typeFilterCache.size}, runtimeCache=reused, clientDependencies=${productionDependencies.size}`
);
