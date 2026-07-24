import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADVISOR_CATEGORY_LABELS,
  ADVISOR_RECOMMENDATION_RULES,
  ADVISOR_SWAP_WEIGHTS,
  ADVISOR_TEAM_RULES,
  evaluateAdvisorSwapPlan,
  getAdvisorSwapSimulation,
  type AdvisorSwapSimulationInput
} from "@/lib/advisorSwapSimulator";
import { getAdvisorTeamDiagnostics } from "@/lib/advisorTeamDiagnostics";
import { buildAdvisorExplanationPresentation } from "@/lib/advisorExplanation";
import { getThreatEnvironmentCatalog } from "@/lib/environmentData.server";
import { findThreatEnvironmentDataset } from "@/lib/environmentThreatData";
import { getAvailablePokemonBySeason } from "@/lib/regulations";
import {
  getTeamAdvisorAnalysis,
  type TeamAdvisorCandidate
} from "@/lib/teamAdvisor";
import { getTeamDiagnostics } from "@/lib/teamDiagnostics";
import { getThreatSnapshot } from "@/lib/threatSnapshot";
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
  const threatSnapshot = getThreatSnapshot({
    team,
    availablePokemon,
    environmentDataset: environment
  });
  const threats = threatSnapshot.currentDisplayedTop5;
  const advisor = getTeamAdvisorAnalysis({
    team,
    summary,
    diagnostics,
    threatSnapshot,
    availablePokemon: candidatePool,
    environmentDataset: environment
  });
  const input: AdvisorSwapSimulationInput = {
    team,
    advisor,
    availablePokemon,
    environmentDataset: environment,
    threatSnapshot
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

function displayedPlans(simulation: ReturnType<typeof getAdvisorSwapSimulation>) {
  return [
    ...Object.values(simulation.plansByCategory).flat(),
    ...Object.values(simulation.typePlans).flatMap((plans) => plans ?? [])
  ];
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
  ice.advisor.issues.length === 3 &&
    ice.advisor.candidates.length > 0 &&
    ice.advisor.candidates.length <= ADVISOR_RECOMMENDATION_RULES.maxPerCategory &&
    ice.advisor.candidatePool.length >= ice.advisor.candidates.length,
  "課題3件・最大5件の候補を持つ基準パーティを作れません"
);
assert(
  ice.simulation.additionPlans.length ===
    ice.simulation.candidatePoolCount &&
    ice.simulation.additionPlans.every(
      (plan) => plan.action.kind === "add"
    ) &&
    ice.simulation.evaluatedPatternCount >=
      ice.simulation.candidatePoolCount,
  "3体パーティで空き枠追加案だけを独立評価できません"
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
    (plan) => {
      const presentation = buildAdvisorExplanationPresentation({
        phase: "situationalCoverage",
        plan,
        mode: "overall"
      });
      const sections = [
        presentation.primaryReasons,
        presentation.otherImprovements,
        presentation.cautions
      ];
      return (
        plan.improvementScore > 0 &&
        sections.every(
          (section, index) =>
            new Set(section).size === section.length &&
            section.every((text) =>
              sections.every(
                (other, otherIndex) =>
                  otherIndex === index || !other.includes(text)
              )
            )
        )
      );
    }
  ),
  "改善量0以下の案、または重複した改善点・注意点を表示しました"
);

const categoryNames = Object.keys(
  ice.simulation.plansByCategory
) as Array<keyof typeof ice.simulation.plansByCategory>;
assert(
  categoryNames.join(",") === "overall,defensive,offensive,speed" &&
    Object.keys(ADVISOR_CATEGORY_LABELS).join(",") ===
      "overall,defensive,offensive,speed,typeSpecific",
  "5種類の推薦カテゴリを定義できません"
);
for (const category of categoryNames) {
  const plans = ice.simulation.plansByCategory[category];
  assert(
    plans.length <= ADVISOR_RECOMMENDATION_RULES.maxPerCategory &&
      new Set(plans.map((plan) => plan.candidate.pokemon.speciesId)).size ===
        plans.length &&
      plans.every(
        (plan) =>
          plan.isRecommendationByCategory[category] &&
          plan.categoryScores[category] > 0 &&
          plan.categoryEvidenceIds[category].length >= 1 &&
          plan.categoryEvidenceIds[category].length <= 3
      ),
    `${ADVISOR_CATEGORY_LABELS[category]}の件数・species集約・推薦理由が不正です`
  );
  for (const plan of plans) {
    if (plan.action.kind !== "add") continue;
    const addition = evaluateAdvisorSwapPlan(
      ice.input,
      plan.candidate,
      null
    );
    assert(
      addition.isRecommendationByCategory[category] &&
        plan.categoryScores[category] ===
          addition.categoryScores[category],
      `${ADVISOR_CATEGORY_LABELS[category]}で空き枠追加案を独立評価できていません`
    );
  }
}
assert(
  ice.simulation.typeOptions.length > 0 &&
    ice.simulation.typeOptions.length <=
      ADVISOR_RECOMMENDATION_RULES.maxTypeOptions &&
    ice.simulation.typeOptions.every((option) => {
      const plans = ice.simulation.typePlans[option.type] ?? [];
      return (
        plans.length > 0 &&
        plans.length <= ADVISOR_RECOMMENDATION_RULES.maxPerCategory &&
        new Set(plans.map((plan) => plan.candidate.pokemon.speciesId)).size ===
          plans.length &&
        plans.every(
          (plan) =>
            plan.candidate.pokemon.types.includes(option.type) &&
            plan.isRecommendationByCategory.typeSpecific
        )
      );
    }),
  "課題改善に関連するタイプ別候補を最大5件で生成できません"
);
assert(
  ice.simulation.plans.filter(
    (plan) => plan.candidate.pokemon.formKind === "mega"
  ).length <= ADVISOR_RECOMMENDATION_RULES.maxMegaInOverall &&
    Math.max(
      0,
      ...Array.from(
        ice.simulation.plans.reduce((counts, plan) => {
          const role = plan.selectedOverallRole ?? "balanced";
          counts.set(role, (counts.get(role) ?? 0) + 1);
          return counts;
        }, new Map<string, number>()).values()
      )
    ) <= ADVISOR_RECOMMENDATION_RULES.maxSameRole,
  "総合候補のメガ最大2件・同一役割最大2件を守れていません"
);
assert(
  ice.simulation.plansByCategory.defensive.some(
    (plan) =>
      (plan.candidate.pokemon.baseStats?.attack ?? 255) < 100 &&
      plan.metrics.stableCheckCount > 0 &&
      plan.evidence.some(
        (evidence) =>
          plan.categoryEvidenceIds.defensive.includes(evidence.id) &&
          evidence.displayText.includes("採用率") &&
          (evidence.displayText.includes("半減") ||
            evidence.displayText.includes("無効"))
      )
  ) &&
    ice.simulation.plansByCategory.defensive.some(
      (plan) =>
        plan.metrics.recoveryMoveShare >= 0.1 &&
        plan.evidence.some(
          (evidence) =>
            plan.categoryEvidenceIds.defensive.includes(evidence.id) &&
            evidence.displayText.includes("採用率") &&
            evidence.displayText.includes("継続的な受け役")
        )
    ) &&
    ice.simulation.plansByCategory.defensive.every(
      (plan) =>
        plan.metrics.threatMoveImmunityCount +
          plan.metrics.threatMoveResistanceCount >
        0
    ),
  "攻撃種族値に偏らず、実採用技・回復技による耐久候補を選べていません"
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
    result.simulation.additionPlans.length ===
      result.simulation.candidatePoolCount &&
      result.simulation.additionPlans.every(
        (plan) => plan.action.kind === "add"
      ) &&
      result.simulation.evaluatedPatternCount >=
        result.simulation.candidatePoolCount,
    `${size}体パーティで空き枠追加案を入れ替え案と分離できません`
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
    six.simulation.evaluatedPatternCount >=
      six.simulation.candidatePoolCount * sixTeam.length,
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
const noImprovementAvailablePokemon = [
  ...availablePokemon,
  unchangedSource,
  neutralPokemon
];
const noImprovementThreatSnapshot = getThreatSnapshot({
  team: unchangedTeam,
  availablePokemon: noImprovementAvailablePokemon,
  environmentDataset: null
});
const noImprovementInput: AdvisorSwapSimulationInput = {
  team: unchangedTeam,
  advisor: {
    overallLabel: "改善余地あり",
    issues: [],
    candidates: [candidateFor(neutralPokemon)],
    candidatePool: [candidateFor(neutralPokemon)],
    threatSnapshot: noImprovementThreatSnapshot
  },
  availablePokemon: noImprovementAvailablePokemon,
  environmentDataset: null,
  threatSnapshot: noImprovementThreatSnapshot
};
const noImprovement = getAdvisorSwapSimulation(noImprovementInput);
assert(
  noImprovement.plans.length === 0 &&
    Object.values(noImprovement.plansByCategory).every(
      (plans) => plans.length === 0
    ) &&
    noImprovement.typeOptions.length === 0 &&
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
const lossPresentation = buildAdvisorExplanationPresentation({
  phase: "situationalCoverage",
  plan: lossPlan,
  mode: "overall"
});
assert(
  lossPlan.metrics.uniqueImmunityLossCount > 0 &&
    lossPresentation.cautions.some((item) => item.includes("無効枠")) &&
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
    roleLossPlan.evidence.some(
      (evidence) => evidence.id === "risk:removed-member-loss"
    ) &&
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
    ],
    candidatePool: [
      ...ice.advisor.candidatePool,
      ice.advisor.candidatePool[0],
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
const megaZeroAdd = evaluateAdvisorSwapPlan(
  ice.input,
  candidateFor(metagrossMega),
  null
);
assert(
  megaZeroAdd.metrics.megaCountBefore === 0 &&
    megaZeroAdd.metrics.megaCountAfter === 1 &&
    megaZeroAdd.metrics.megaLimitPassed &&
    displayedPlans(ice.simulation).some(
      (plan) => plan.candidate.pokemon.formKind === "mega"
    ) &&
    displayedPlans(ice.simulation).some(
      (plan) => plan.candidate.pokemon.formKind !== "mega"
    ),
  "メガ0体時にメガと非メガの両方を比較できません"
);
const oneMega = analyze(
  pokemonTeam(["charizard-mega-x", "garchomp", "gliscor"])
);
const megaOneAdd = evaluateAdvisorSwapPlan(
  oneMega.input,
  candidateFor(metagrossMega),
  null
);
assert(
  megaOneAdd.metrics.megaCountBefore === 1 &&
    megaOneAdd.metrics.megaCountAfter === 2 &&
    megaOneAdd.metrics.megaLimitPassed &&
    displayedPlans(oneMega.simulation).some(
      (plan) => plan.candidate.pokemon.formKind === "mega"
    ) &&
    displayedPlans(oneMega.simulation).some(
      (plan) => plan.candidate.pokemon.formKind !== "mega"
    ),
  "メガ1体時にメガと非メガの両方を比較できません"
);
const twoMegaTeam = pokemonTeam([
  "charizard-mega-x",
  "garchomp-mega",
  "gliscor"
]);
const twoMega = analyze(twoMegaTeam);
const megaTwoAdd = evaluateAdvisorSwapPlan(
  twoMega.input,
  candidateFor(metagrossMega),
  null
);
const megaTwoReplaceNonMega = evaluateAdvisorSwapPlan(
  twoMega.input,
  candidateFor(metagrossMega),
  "slot-3"
);
const megaTwoReplaceMega = evaluateAdvisorSwapPlan(
  twoMega.input,
  candidateFor(metagrossMega),
  "slot-1"
);
assert(
  ADVISOR_TEAM_RULES.recommendedMegaLimit === 2 &&
    !megaTwoAdd.metrics.megaLimitPassed &&
    !megaTwoAdd.metrics.megaRecommendationPassed &&
    !megaTwoReplaceNonMega.metrics.megaLimitPassed &&
    !megaTwoReplaceNonMega.metrics.megaRecommendationPassed &&
    megaTwoReplaceMega.metrics.megaLimitPassed &&
    !megaTwoReplaceMega.metrics.megaRecommendationPassed &&
    megaTwoReplaceMega.metrics.megaCountAfter === 2 &&
    twoMega.simulation.megaRecommendationStats
      .candidatePoolAfterMegaFilter <
      twoMega.simulation.megaRecommendationStats
        .candidatePoolBeforeMegaFilter &&
    twoMega.simulation.additionPlans.every(
      (plan) => plan.candidate.pokemon.formKind !== "mega"
    ) &&
    !displayedPlans(twoMega.simulation).some(
      (plan) =>
        plan.action.kind === "add" &&
        plan.candidate.pokemon.formKind === "mega" &&
        plan.metrics.megaRecommendationPassed
    ),
  "メガ2体の序盤構築で正式上限と段階型推薦上限を分離し、追加前に別メガを除外できません"
);
const mawileMega = availablePokemon.find(
  (pokemon) => pokemon.slug === "mawile-mega"
);
assert(mawileMega, "メガクチートが使用可能一覧にいません");
const threeMega = analyze(
  pokemonTeam([
    "charizard-mega-x",
    "garchomp-mega",
    "metagross-mega",
    "gliscor"
  ])
);
const megaThreeReplaceMega = evaluateAdvisorSwapPlan(
  threeMega.input,
  candidateFor(mawileMega),
  "slot-1"
);
assert(
  !megaThreeReplaceMega.metrics.megaLimitPassed &&
    displayedPlans(threeMega.simulation).length > 0 &&
    displayedPlans(threeMega.simulation).every(
      (plan) => plan.candidate.pokemon.formKind !== "mega"
    ),
  "メガ3体時に非メガ案を残しつつ、新たなメガ案を除外できません"
);
const megaCandidateAnalysis = analyze(iceTeam, [metagrossMega]);
assert(
  megaCandidateAnalysis.advisor.candidates[0]?.pokemon.slug ===
    "metagross-mega" &&
    megaCandidateAnalysis.simulation.additionPlans.some(
      (plan) =>
        plan.action.kind === "add" &&
        plan.candidate.pokemon.slug === "metagross-mega"
    ),
  "現在のルールで使用可能なメガフォームを追加候補から除外しました"
);

const physicalGap = analyze(
  pokemonTeam(["blissey", "sylveon", "florges"])
);
const steelix = getPokemonBySlug("steelix");
assert(steelix, "物理耐久検証用のハガネールがいません");
const physicalWallPlan = evaluateAdvisorSwapPlan(
  physicalGap.input,
  candidateFor(steelix),
  null
);
const specialGap = analyze(
  pokemonTeam(["steelix", "donphan", "hippowdon"])
);
const blissey = getPokemonBySlug("blissey");
assert(blissey, "特殊耐久検証用のハピナスがいません");
const specialWallPlan = evaluateAdvisorSwapPlan(
  specialGap.input,
  candidateFor(blissey),
  null
);
assert(
  physicalWallPlan.metrics.physicalWallImprovement > 0 &&
    specialWallPlan.metrics.specialWallImprovement > 0,
  "物理受け・特殊受け不足を独立した役割変化として評価できません"
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
    sectionSource.includes("ProgressiveAdvisorRecommendations") &&
    sectionSource.includes("現在のチームに加えたとき") &&
    sectionSource.includes("おすすめの入れ替え候補") &&
    sectionSource.includes("入れ替えるとどうなるか") &&
    sectionSource.includes("改善点") &&
    sectionSource.includes("注意点") &&
    sectionSource.includes("チーム詳細診断") &&
    sectionSource.includes("候補の見方") &&
    sectionSource.includes("getAdvisorCategoryLabels") &&
    sectionSource.includes("改善タイプ") &&
    !sectionSource.includes("補完スコア候補") &&
    !sectionSource.includes("段階内の適合度") &&
    !sectionSource.includes("総合改善量") &&
    !sectionSource.includes("4位以下") &&
    !sectionSource.includes("この案を試す") &&
    styleSource.includes(".advisorDiagnosticsGrid") &&
    styleSource.includes(".advisorChangeGrid") &&
    !styleSource.includes(".advisorCandidateGrid { display: flex;") &&
    simulatorSource.includes("getThreatSnapshot") &&
    simulatorSource.includes("currentDisplayedTop5") &&
    simulatorSource.includes("recommendationThreatCoverage") &&
    simulatorSource.includes("ADVISOR_TEAM_RULES") &&
    simulatorSource.includes("ADVISOR_CATEGORY_WEIGHTS") &&
    simulatorSource.indexOf("!plan.isRecommendationByCategory[category]") <
      simulatorSource.indexOf("const speciesId = plan.candidate.pokemon.speciesId") &&
    !simulatorSource.includes("getAdvisorCompatibleThreatAnalysis("),
  "段階型追加UI・完成後入れ替えUI・4分野診断、または旧重複表示の整理が不十分です"
);

console.log(
  `[ok] Advisor入れ替え: ${ice.simulation.evaluatedPatternCount}通り / TOP5再抽出 / 役割損失減点 / 4分野詳細診断を検証しました`
);
