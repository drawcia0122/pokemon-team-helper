import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADVISOR_SWAP_WEIGHTS,
  evaluateAdvisorSwapPlan,
  getAdvisorSwapSimulation,
  type AdvisorSwapSimulationInput
} from "@/lib/advisorSwapSimulator";
import { getAdvisorTeamDiagnostics } from "@/lib/advisorTeamDiagnostics";
import { getThreatEnvironmentCatalog } from "@/lib/environmentData.server";
import { findThreatEnvironmentDataset } from "@/lib/environmentThreatData";
import { getAvailablePokemonBySeason } from "@/lib/regulations";
import {
  getTeamAdvisorAnalysis,
  type TeamAdvisorCandidate
} from "@/lib/teamAdvisor";
import { getTeamDiagnostics } from "@/lib/teamDiagnostics";
import { getAdvisorCompatibleThreatAnalysis } from "@/lib/teamThreats";
import { getPokemonBySlug, summarizeTeam } from "@/lib/typeChart";
import type { ThreatEnvironmentDataset } from "@/types/environmentThreat";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pokemonTeam(slugs: string[]): TeamSlot[] {
  return slugs.map((pokemonSlug, index) => ({
    id: `slot-${index + 1}`,
    mode: "pokemon",
    pokemonSlug
  }));
}

function analyze(
  team: TeamSlot[],
  candidatePool = availablePokemon,
  environment: ThreatEnvironmentDataset | null = environmentDataset
) {
  const summary = summarizeTeam(team);
  const diagnostics = getTeamDiagnostics(team, summary, availablePokemon);
  const threats = getAdvisorCompatibleThreatAnalysis(
    team,
    summary,
    availablePokemon,
    environment
  );
  const advisor = getTeamAdvisorAnalysis({
    team,
    summary,
    diagnostics,
    threats,
    availablePokemon: candidatePool,
    environmentDataset: environment
  });
  const input: AdvisorSwapSimulationInput = {
    team,
    advisor,
    availablePokemon,
    environmentDataset: environment
  };
  return {
    summary,
    threats,
    advisor,
    input,
    simulation: getAdvisorSwapSimulation(input)
  };
}

function candidateFor(pokemon: PokemonEntry): TeamAdvisorCandidate {
  return {
    pokemon,
    score: 1,
    rating: 1,
    reasons: ["検証用の長い改善理由です。現在の弱点と失われる役割の両方を比較します。"],
    addressedIssueIds: [],
    environmentUsageRate: null,
    metrics: {
      issueResolutionPoints: 0,
      threatResponsePoints: 0,
      rolePoints: 0,
      offensePoints: 0,
      environmentUsagePoints: 0,
      newWeaknessPenalty: 0
    }
  };
}

const availablePokemon = getAvailablePokemonBySeason("season-m4");
const environmentDataset = findThreatEnvironmentDataset(
  getThreatEnvironmentCatalog(),
  "M-B"
);
assert(environmentDataset, "M-Bの環境snapshotがありません");

const iceTeam = pokemonTeam(["dragonite", "garchomp", "gliscor"]);
const iceOriginal = JSON.stringify(iceTeam);
const ice = analyze(iceTeam);
assert(
  ice.advisor.issues.length === 3 && ice.advisor.candidates.length === 3,
  "課題3件・候補3件の基準パーティを作れません"
);
assert(
  ice.simulation.evaluatedPatternCount ===
    ice.advisor.candidates.length * (iceTeam.length + 1),
  "3体パーティで空き枠追加と全入れ替えを比較できません"
);
assert(
  ice.simulation.recomputedThreatAnalysisCount ===
    ice.simulation.evaluatedPatternCount &&
    ice.simulation.plans.some(
      (plan) =>
        plan.beforeThreats.map((entry) => entry.pokemon.slug).join(",") !==
        plan.afterThreats.map((entry) => entry.pokemon.slug).join(",")
    ),
  "入れ替え後のチームから要警戒TOP5を再抽出できません"
);
assert(
  ice.simulation.plans.every(
    (plan) =>
      plan.beforeThreatAverage !== null &&
      plan.afterThreatAverage !== null &&
      plan.threatAverageDelta ===
        plan.afterThreatAverage - plan.beforeThreatAverage
  ),
  "要警戒TOP5平均の前後差を計算できません"
);
assert(
  ice.simulation.plans.every(
    (plan) =>
      plan.improvementScore > 0 &&
      new Set(plan.improvements).size === plan.improvements.length &&
      new Set(plan.cautions).size === plan.cautions.length &&
      plan.improvements.every((item) => !plan.cautions.includes(item))
  ) &&
    ice.simulation.plans.some(
      (plan) => plan.improvements.length > 0 && plan.cautions.length > 0
    ),
  "改善量0以下の案、または重複した改善点・注意点を表示しました"
);
assert(
  JSON.stringify(iceTeam) === iceOriginal &&
    ice.simulation.plans.every(
      (plan) => JSON.stringify(plan.beforeTeam) === iceOriginal
    ),
  "シミュレーションが元のパーティ配列を変更しました"
);

for (const size of [2, 3, 5]) {
  const source = [
    "dragonite",
    "garchomp",
    "gliscor",
    "charizard",
    "rotom-wash"
  ].slice(0, size);
  const result = analyze(pokemonTeam(source));
  assert(
    result.simulation.evaluatedPatternCount ===
      result.advisor.candidates.length * (size + 1),
    `${size}体パーティで空き枠追加と${size}通りの入れ替えを比較できません`
  );
}

const sixTeam = pokemonTeam([
  "charizard",
  "rotom-wash",
  "garchomp",
  "empoleon",
  "gardevoir",
  "corviknight"
]);
const six = analyze(sixTeam);
assert(
  six.advisor.issues.length === 0 &&
    six.simulation.evaluatedPatternCount ===
      six.advisor.candidates.length * sixTeam.length,
  "6体パーティで課題0件または全6入れ替えを比較できません"
);
for (const candidate of six.advisor.candidates) {
  const comparedSlots = sixTeam.map((slot) =>
    evaluateAdvisorSwapPlan(six.input, candidate, slot.id)
  );
  assert(
    new Set(
      comparedSlots.map((plan) => plan.action.removedSlotId)
    ).size === sixTeam.length,
    `6体パーティで${candidate.pokemon.nameJa}の全6入れ替え先を比較できません`
  );
}

const neutralPokemon = getPokemonBySlug("minun");
const unchangedSource = getPokemonBySlug("plusle");
assert(neutralPokemon, "検証用マイナンがいません");
assert(unchangedSource, "検証用プラスルがいません");
const unchangedTeam = pokemonTeam(Array(6).fill("plusle"));
const noImprovementInput: AdvisorSwapSimulationInput = {
  team: unchangedTeam,
  advisor: {
    overallLabel: "改善余地あり",
    issues: [],
    candidates: [candidateFor(neutralPokemon)]
  },
  availablePokemon: [
    ...availablePokemon,
    unchangedSource,
    neutralPokemon
  ],
  environmentDataset
};
const noImprovement = getAdvisorSwapSimulation(noImprovementInput);
assert(
  noImprovement.plans.length === 0 &&
    noImprovement.evaluatedPatternCount === 6,
  "明確な改善のない案を非表示にできません"
);

const corviknightTeam = pokemonTeam(["corviknight", "snorlax", "blissey"]);
const corviknightAnalysis = analyze(corviknightTeam);
const replacement = availablePokemon.find(
  (pokemon) => pokemon.slug === "tinkaton"
);
assert(replacement, "検証用デカヌチャンがいません");
const lossPlan = evaluateAdvisorSwapPlan(
  corviknightAnalysis.input,
  candidateFor(replacement),
  "slot-1"
);
assert(
  lossPlan.metrics.uniqueImmunityLossCount > 0 &&
    lossPlan.cautions.some((item) => item.includes("無効枠")) &&
    ADVISOR_SWAP_WEIGHTS.uniqueImmunityLossPenalty > 0 &&
    ADVISOR_SWAP_WEIGHTS.uniqueResistanceLossPenalty > 0,
  "唯一の無効・耐性を失う案を減点または注意表示できません"
);

const uniqueRoleTeam = pokemonTeam(["weavile", "blissey", "snorlax"]);
const uniqueRoleAnalysis = analyze(uniqueRoleTeam);
const roleLossPlan = evaluateAdvisorSwapPlan(
  uniqueRoleAnalysis.input,
  candidateFor(replacement),
  "slot-1"
);
assert(
  roleLossPlan.metrics.roleLossCount > 0 &&
    roleLossPlan.lostRoles.some((role) => role.includes("高速枠")) &&
    roleLossPlan.cautions.some((item) => item.includes("高速枠")) &&
    ADVISOR_SWAP_WEIGHTS.roleLossPenalty > 0,
  "唯一の高速枠を失う案を減点・注意表示できません"
);

const duplicateCandidateInput: AdvisorSwapSimulationInput = {
  ...ice.input,
  advisor: {
    ...ice.advisor,
    candidates: [
      ...ice.advisor.candidates,
      ice.advisor.candidates[0],
      candidateFor(getPokemonBySlug("dragonite")!)
    ]
  }
};
const noDuplicates = getAdvisorSwapSimulation(duplicateCandidateInput);
assert(
  new Set(
    noDuplicates.plans.map((plan) => plan.candidate.pokemon.speciesId)
  ).size === noDuplicates.plans.length &&
    noDuplicates.plans.every(
      (plan) => plan.candidate.pokemon.speciesId !== 149
    ),
  "同一speciesまたは現在のパーティspeciesを改善案へ含めました"
);
const metagrossMega = availablePokemon.find(
  (pokemon) => pokemon.slug === "metagross-mega"
);
assert(metagrossMega, "メガメタグロスが使用可能一覧にいません");
const megaCandidateAnalysis = analyze(iceTeam, [metagrossMega]);
assert(
  megaCandidateAnalysis.advisor.candidates[0]?.pokemon.slug ===
    "metagross-mega" &&
    megaCandidateAnalysis.simulation.plans[0]?.candidate.pokemon.slug ===
      "metagross-mega",
  "現在のルールで使用可能なメガフォームを入れ替え候補から除外しました"
);

const floetteMega = availablePokemon.find(
  (pokemon) => pokemon.slug === "floette-mega"
);
assert(floetteMega, "メガフラエッテが使用可能一覧にいません");
const slowTeam = pokemonTeam(["snorlax", "steelix", "donphan", "hippowdon"]);
const slow = analyze(slowTeam, [floetteMega]);
const floetteSimulation = getAdvisorSwapSimulation(slow.input);
assert(
  floetteMega.types.length === 1 &&
    slow.advisor.candidates[0]?.pokemon.slug === "floette-mega" &&
    floetteSimulation.plans[0]?.candidate.pokemon.slug === "floette-mega",
  "単タイプのメガフラエッテをタイプ数だけで過小評価しました"
);

const detail = getAdvisorTeamDiagnostics({
  team: iceTeam,
  summary: ice.summary,
  threats: ice.threats
});
assert(
  detail.profile === "standard" &&
    detail.categories.map((category) => category.id).join(",") ===
      "defense,offense,speed,types" &&
    detail.categories.every(
      (category) => category.summary.length > 0 && category.items.length > 0
    ),
  "チーム詳細診断を4分野の具体的な数値へ変換できません"
);

const sectionSource = readFileSync(
  path.join(process.cwd(), "components/team/TeamAdvisorSection.tsx"),
  "utf8"
);
const simulatorSource = readFileSync(
  path.join(process.cwd(), "lib/advisorSwapSimulator.ts"),
  "utf8"
);
const styleSource = readFileSync(
  path.join(process.cwd(), "components/team/TeamWorkspace.module.css"),
  "utf8"
);
assert(
  sectionSource.includes("推奨する変更") &&
    sectionSource.includes("要警戒TOP5平均") &&
    sectionSource.includes("改善点") &&
    sectionSource.includes("注意点") &&
    sectionSource.includes("チーム詳細診断") &&
    !sectionSource.includes("補完スコア候補") &&
    !sectionSource.includes("4位以下") &&
    !sectionSource.includes("この案を試す") &&
    styleSource.includes(".advisorDiagnosticsGrid") &&
    styleSource.includes(".advisorChangeGrid") &&
    !styleSource.includes(".advisorCandidateGrid { display: flex;") &&
    simulatorSource.includes("getAdvisorCompatibleThreatAnalysis") &&
    !simulatorSource.includes("getThreatPokemonAnalysis("),
  "新しい入れ替えUI・4分野診断、または旧重複表示の整理が不十分です"
);

console.log(
  `[ok] Advisor入れ替え: ${ice.simulation.evaluatedPatternCount}通り / TOP5再抽出 / 役割損失減点 / 4分野詳細診断を検証しました`
);
