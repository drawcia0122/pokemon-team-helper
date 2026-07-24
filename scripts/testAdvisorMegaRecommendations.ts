import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  addAdvisorCandidateToTeam,
  getAdvisorCandidateAddability
} from "@/lib/advisorCandidateAddition";
import {
  getAdvisorMegaCandidateNote,
  getAdvisorMegaGuidance,
  getAdvisorMegaRecommendationDecision,
  getAdvisorMegaTeamState
} from "@/lib/advisorMegaRecommendation";
import {
  evaluateAdvisorSwapPlan,
  getAdvisorSwapSimulation,
  type AdvisorSwapPlan,
  type AdvisorSwapSimulationInput
} from "@/lib/advisorSwapSimulator";
import {
  getProgressiveTeamAdvisor,
  type ProgressiveTeamAdvisorAnalysis
} from "@/lib/progressiveTeamAdvisor";
import {
  parseStoredTeam,
  parseTeamBackup,
  serializeTeam
} from "@/lib/teamStorage";
import { getPokemonBySlug } from "@/lib/typeChart";
import { getThreatSnapshot } from "@/lib/threatSnapshot";
import { analyzeAdvisorTeam } from "@/scripts/lib/trickRoomAdvisorHarness";
import type { TeamProfile } from "@/lib/teamProfile";
import type {
  PokemonEntry,
  TeamSlot
} from "@/types/pokemon";
import type { TeamAdvisorCandidate } from "@/lib/teamAdvisor";

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

function teamSlugs(team: readonly TeamSlot[]): string[] {
  return team.flatMap((slot) =>
    slot.mode === "pokemon" ? [slot.pokemonSlug] : []
  );
}

function analyze(
  slugs: string[],
  profile: TeamProfile = "standard"
) {
  const startedAt = performance.now();
  const base = analyzeAdvisorTeam(slugs, profile);
  const progressive = getProgressiveTeamAdvisor({
    team: base.team,
    advisor: base.advisor,
    simulation: base.simulation,
    availablePokemon: base.availablePokemon,
    environmentDataset: base.environmentDataset,
    profile
  });
  return {
    ...base,
    progressive,
    profile,
    durationMs: performance.now() - startedAt
  };
}

function simulationInput(
  result: ReturnType<typeof analyze>
): AdvisorSwapSimulationInput {
  return {
    team: result.team,
    advisor: result.advisor,
    availablePokemon: result.availablePokemon,
    environmentDataset: result.environmentDataset,
    threatSnapshot: result.threatSnapshot,
    profile: result.profile
  };
}

function candidateFor(pokemon: PokemonEntry): TeamAdvisorCandidate {
  return {
    pokemon,
    score: 1,
    rating: 1,
    reasons: ["TASK039の段階型メガ候補判定fixture"],
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

function displayedSlugs(
  analysis: ProgressiveTeamAdvisorAnalysis,
  mode: "overall" | "defensive" | "offensive" | "role" = "overall"
): string[] {
  return analysis.candidatesByMode[mode].map(
    (candidate) => candidate.plan.candidate.pokemon.slug
  );
}

function collectPublishedPlans(
  result: ReturnType<typeof analyze>
): AdvisorSwapPlan[] {
  const simulation = result.simulation;
  return [
    ...simulation.additionPlans,
    ...simulation.plans,
    ...Object.values(simulation.plansByCategory).flat(),
    ...Object.values(simulation.typePlans).flatMap((plans) => plans ?? []),
    ...simulation.formChangePlans,
    ...simulation.threatRecommendations.flatMap((group) => [
      ...Object.values(group.plansByMode).flat(),
      ...Object.values(group.typePlans).flatMap((plans) => plans ?? [])
    ]),
    ...Object.values(result.progressive.candidatesByMode)
      .flat()
      .map((candidate) => candidate.plan),
    ...Object.values(result.progressive.typePlans)
      .flatMap((candidates) => candidates ?? [])
      .map((candidate) => candidate.plan)
  ];
}

function assertPublishedPlansRespectMegaRule(
  result: ReturnType<typeof analyze>,
  label: string
): void {
  for (const plan of collectPublishedPlans(result)) {
    const state = getAdvisorMegaTeamState(plan.beforeTeam);
    const removedSlot =
      plan.action.removedSlotId === null
        ? null
        : plan.beforeTeam.find(
            (slot) => slot.id === plan.action.removedSlotId
          ) ?? null;
    const removedPokemon =
      removedSlot?.mode === "pokemon"
        ? getPokemonBySlug(removedSlot.pokemonSlug)
        : null;
    const decision = getAdvisorMegaRecommendationDecision({
      currentTeamSize: state.currentTeamSize,
      currentMegaCount: state.currentMegaCount,
      candidateIsMega: plan.candidate.pokemon.formKind === "mega",
      actionKind:
        plan.action.kind === "form-change"
          ? "formChange"
          : plan.action.kind,
      removedSlotContainsPokemon:
        plan.action.removedSlotId === null
          ? undefined
          : removedSlot?.mode === "pokemon",
      removedPokemonIsMega: removedPokemon?.formKind === "mega"
    });
    assert(
      decision.allowed && plan.metrics.megaRecommendationPassed,
      `${label}の公開候補へ段階上限を超えるメガ案が混入しました: ${plan.candidate.pokemon.slug}`
    );
  }
}

const decisionFixtures = [
  {
    label: "0体から1体目のメガ",
    context: {
      currentTeamSize: 0,
      currentMegaCount: 0,
      candidateIsMega: true,
      actionKind: "add" as const
    },
    projectedTeamSize: 1,
    projectedMegaCount: 1,
    maxMegaCount: 1,
    allowed: true
  },
  {
    label: "1体メガ採用済みから2体目の別メガ",
    context: {
      currentTeamSize: 1,
      currentMegaCount: 1,
      candidateIsMega: true,
      actionKind: "add" as const
    },
    projectedTeamSize: 2,
    projectedMegaCount: 2,
    maxMegaCount: 1,
    allowed: false
  },
  {
    label: "2体メガ採用済みから3体目の別メガ",
    context: {
      currentTeamSize: 2,
      currentMegaCount: 1,
      candidateIsMega: true,
      actionKind: "add" as const
    },
    projectedTeamSize: 3,
    projectedMegaCount: 2,
    maxMegaCount: 1,
    allowed: false
  },
  {
    label: "3体から4体目の2体目メガ",
    context: {
      currentTeamSize: 3,
      currentMegaCount: 1,
      candidateIsMega: true,
      actionKind: "add" as const
    },
    projectedTeamSize: 4,
    projectedMegaCount: 2,
    maxMegaCount: 2,
    allowed: true
  },
  {
    label: "4体から5体目の3体目メガ",
    context: {
      currentTeamSize: 4,
      currentMegaCount: 2,
      candidateIsMega: true,
      actionKind: "add" as const
    },
    projectedTeamSize: 5,
    projectedMegaCount: 3,
    maxMegaCount: 2,
    allowed: false
  },
  {
    label: "5体から6体目の2体目メガ",
    context: {
      currentTeamSize: 5,
      currentMegaCount: 1,
      candidateIsMega: true,
      actionKind: "add" as const
    },
    projectedTeamSize: 6,
    projectedMegaCount: 2,
    maxMegaCount: 2,
    allowed: true
  },
  {
    label: "6体メガ2体からメガ枠を入れ替え",
    context: {
      currentTeamSize: 6,
      currentMegaCount: 2,
      candidateIsMega: true,
      actionKind: "replace" as const,
      removedPokemonIsMega: true
    },
    projectedTeamSize: 6,
    projectedMegaCount: 2,
    maxMegaCount: 2,
    allowed: true
  },
  {
    label: "6体メガ2体で通常枠を3体目のメガへ入れ替え",
    context: {
      currentTeamSize: 6,
      currentMegaCount: 2,
      candidateIsMega: true,
      actionKind: "replace" as const,
      removedPokemonIsMega: false
    },
    projectedTeamSize: 6,
    projectedMegaCount: 3,
    maxMegaCount: 2,
    allowed: false
  },
  {
    label: "3体メガ1体で通常からメガへフォーム変更",
    context: {
      currentTeamSize: 3,
      currentMegaCount: 1,
      candidateIsMega: true,
      actionKind: "formChange" as const,
      removedPokemonIsMega: false
    },
    projectedTeamSize: 3,
    projectedMegaCount: 2,
    maxMegaCount: 1,
    allowed: false
  },
  {
    label: "ポケモン3体＋タイプ枠から4体目の2体目メガ",
    context: {
      currentTeamSize: 3,
      currentMegaCount: 1,
      candidateIsMega: true,
      actionKind: "replace" as const,
      removedSlotContainsPokemon: false
    },
    projectedTeamSize: 4,
    projectedMegaCount: 2,
    maxMegaCount: 2,
    allowed: true
  },
  {
    label: "4体メガ1体で通常からメガへフォーム変更",
    context: {
      currentTeamSize: 4,
      currentMegaCount: 1,
      candidateIsMega: true,
      actionKind: "formChange" as const,
      removedPokemonIsMega: false
    },
    projectedTeamSize: 4,
    projectedMegaCount: 2,
    maxMegaCount: 2,
    allowed: true
  },
  {
    label: "既存上限超過データへ通常候補",
    context: {
      currentTeamSize: 3,
      currentMegaCount: 2,
      candidateIsMega: false,
      actionKind: "add" as const
    },
    projectedTeamSize: 4,
    projectedMegaCount: 2,
    maxMegaCount: 2,
    allowed: true
  }
] as const;

for (const fixture of decisionFixtures) {
  const decision = getAdvisorMegaRecommendationDecision(fixture.context);
  assert(
    decision.allowed === fixture.allowed &&
      decision.projectedTeamSize === fixture.projectedTeamSize &&
      decision.projectedMegaCount === fixture.projectedMegaCount &&
      decision.maxMegaCount === fixture.maxMegaCount,
    `${fixture.label}の純関数判定が不正です`
  );
}

const gapTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "floette-mega" },
  { id: "slot-6", mode: "pokemon", pokemonSlug: "kingambit" }
];
const gapState = getAdvisorMegaTeamState(gapTeam);
assert(
  gapState.currentTeamSize === 2 &&
    gapState.currentMegaCount === 1 &&
    !getAdvisorMegaRecommendationDecision({
      currentTeamSize: gapState.currentTeamSize,
      currentMegaCount: gapState.currentMegaCount,
      candidateIsMega: true,
      actionKind: "add"
    }).allowed,
  "空きslot番号ではなくoccupied実人数を使っていません"
);

const caseA = analyze(["floette-mega"]);
const normalOne = analyze(["kingambit"]);
const caseB = analyze(["floette-mega", "kingambit"]);
const normalTwo = analyze(["kingambit", "rotom-wash"]);
const caseC = analyze([
  "floette-mega",
  "kingambit",
  "rotom-wash"
]);
const fourWithOneMega = analyze([
  "floette-mega",
  "kingambit",
  "rotom-wash",
  "dragonite"
]);
const fiveWithOneMega = analyze([
  "floette-mega",
  "kingambit",
  "rotom-wash",
  "dragonite",
  "garchomp"
]);
const caseD = analyze([
  "floette-mega",
  "metagross-mega",
  "dragonite",
  "garchomp",
  "gliscor"
]);
const caseE = analyze([
  "kingambit",
  "rotom-wash",
  "dragonite",
  "corviknight",
  "gholdengo"
]);
const caseF = analyze([
  "charizard-mega-x",
  "rotom-wash",
  "garchomp-mega",
  "empoleon",
  "gardevoir",
  "corviknight"
]);
const fullWithOneMega = analyze([
  "charizard-mega-x",
  "rotom-wash",
  "garchomp",
  "empoleon",
  "gardevoir",
  "corviknight"
]);
const trickRoomB = analyze(
  ["floette-mega", "kingambit"],
  "trick-room"
);

assert(
  caseA.simulation.megaRecommendationStats.candidatePoolBeforeMegaFilter ===
      182 &&
    caseA.simulation.megaRecommendationStats.candidatePoolAfterMegaFilter ===
      128 &&
    displayedSlugs(caseA.progressive).join(",") ===
      [
        "kingambit",
        "basculegion-male",
        "gholdengo",
        "garchomp",
        "archaludon",
        "corviknight"
      ].join(","),
  "Golden A: 1体目メガの母集団またはTOP6が不正です"
);
assert(
  caseA.simulation.additionPlans.every(
    (plan) => plan.candidate.pokemon.formKind !== "mega"
  ) &&
    caseA.progressive.megaGuidance.maxMegaCount === 1 &&
    caseA.progressive.megaGuidance.message.includes("現在のメガ枠"),
  "Golden A: 別メガ除外またはphase説明が不正です"
);

const metagross = getPokemonBySlug("metagross");
const metagrossMega = getPokemonBySlug("metagross-mega");
const scizor = getPokemonBySlug("scizor");
const scizorMega = getPokemonBySlug("scizor-mega");
assert(
  metagross && metagrossMega && scizor && scizorMega,
  "通常・メガフォームfixtureが不足しています"
);
const mixedBoundaryTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "floette-mega" },
  { id: "slot-2", mode: "pokemon", pokemonSlug: "kingambit" },
  { id: "slot-3", mode: "pokemon", pokemonSlug: "rotom-wash" },
  { id: "slot-4", mode: "type", primaryType: "water" },
  { id: "slot-5", mode: "type", primaryType: "fire" },
  { id: "slot-6", mode: "type", primaryType: "grass" }
];
const mixedBoundaryInput: AdvisorSwapSimulationInput = {
  ...simulationInput(caseC),
  team: mixedBoundaryTeam,
  threatSnapshot: getThreatSnapshot({
    team: mixedBoundaryTeam,
    availablePokemon: caseC.availablePokemon,
    environmentDataset: caseC.environmentDataset,
    profile: caseC.profile
  })
};
const mixedTypeReplacement = evaluateAdvisorSwapPlan(
  mixedBoundaryInput,
  candidateFor(metagrossMega),
  "slot-4"
);
const mixedPokemonReplacement = evaluateAdvisorSwapPlan(
  mixedBoundaryInput,
  candidateFor(metagrossMega),
  "slot-2"
);
const mixedBoundarySimulation =
  getAdvisorSwapSimulation(mixedBoundaryInput);
assert(
  getAdvisorMegaTeamState(mixedTypeReplacement.beforeTeam)
    .currentTeamSize === 3 &&
    getAdvisorMegaTeamState(mixedTypeReplacement.afterTeam)
      .currentTeamSize === 4 &&
    mixedTypeReplacement.metrics.megaCountAfter === 2 &&
    mixedTypeReplacement.metrics.megaRecommendationPassed &&
    mixedTypeReplacement.action.kind === "replace" &&
    !mixedPokemonReplacement.metrics.megaRecommendationPassed &&
    mixedBoundarySimulation.megaRecommendationStats
      .candidatePoolBeforeMegaFilter === 93 &&
    mixedBoundarySimulation.megaRecommendationStats
      .candidatePoolAfterMegaFilter === 93 &&
    mixedBoundarySimulation.megaRecommendationStats
      .actionPatternsBeforeMegaFilter === 564 &&
    mixedBoundarySimulation.megaRecommendationStats
      .actionPatternsAfterMegaFilter === 496,
  "タイプ入力枠をポケモンへ置換するときの実人数境界が不正です"
);
console.log(
  `[mega-mixed-boundary] candidates=${mixedBoundarySimulation.megaRecommendationStats.candidatePoolBeforeMegaFilter}->${mixedBoundarySimulation.megaRecommendationStats.candidatePoolAfterMegaFilter}, patterns=${mixedBoundarySimulation.megaRecommendationStats.actionPatternsBeforeMegaFilter}->${mixedBoundarySimulation.megaRecommendationStats.actionPatternsAfterMegaFilter}`
);
const caseAAdditionSlugs = new Set(
  caseA.simulation.additionPlans.map(
    (plan) => plan.candidate.pokemon.slug
  )
);
assert(
  caseAAdditionSlugs.has(metagross.slug) &&
    caseAAdditionSlugs.has(scizor.slug) &&
    !caseAAdditionSlugs.has(metagrossMega.slug) &&
    !caseAAdditionSlugs.has(scizorMega.slug),
  "メガだけを除外し、同speciesの通常フォームを残せません"
);

assert(
  normalOne.simulation.additionPlans.some(
    (plan) => plan.candidate.pokemon.formKind === "mega"
  ) &&
    normalTwo.simulation.additionPlans.some(
      (plan) => plan.candidate.pokemon.formKind === "mega"
    ),
  "メガ未採用の2・3体目候補からメガを誤って除外しました"
);

assert(
  caseB.simulation.megaRecommendationStats.candidatePoolBeforeMegaFilter ===
      181 &&
    caseB.simulation.megaRecommendationStats.candidatePoolAfterMegaFilter ===
      127 &&
    displayedSlugs(caseB.progressive).join(",") ===
      [
        "rotom-wash",
        "talonflame",
        "volcarona",
        "corviknight",
        "hippowdon",
        "toxapex"
      ].join(",") &&
    caseB.simulation.additionPlans.every(
      (plan) => plan.candidate.pokemon.formKind !== "mega"
    ),
  "Golden B: 2体中メガ1体の別メガ除外またはTOP6が不正です"
);

assert(
  caseC.simulation.megaRecommendationStats.candidatePoolBeforeMegaFilter ===
      caseC.simulation.megaRecommendationStats.candidatePoolAfterMegaFilter &&
    caseC.simulation.additionPlans.some(
      (plan) => plan.candidate.pokemon.formKind === "mega"
    ) &&
    displayedSlugs(caseC.progressive).join(",") ===
      [
        "skarmory-mega",
        "staraptor-mega",
        "delphox-mega",
        "charizard-mega-y",
        "dragonite-mega",
        "bellibolt"
      ].join(",") &&
    caseC.progressive.megaGuidance.message.includes(
      "2体目のメガシンカ"
    ),
  "Golden C: 4体目の2体目メガ候補または説明が不正です"
);
const caseCTop = caseC.progressive.candidatesByMode.overall[0]?.plan;
assert(
  caseCTop &&
    getAdvisorMegaCandidateNote({
      currentTeamSize: 3,
      currentMegaCount: 1,
      candidateIsMega:
        caseCTop.candidate.pokemon.formKind === "mega",
      actionKind: "add"
    }) === "2体目のメガ候補",
  "2体目のメガ候補カード注記を生成できません"
);

for (const [label, result] of [
  ["4体中メガ1体", fourWithOneMega],
  ["5体中メガ1体", fiveWithOneMega]
] as const) {
  assert(
    result.simulation.additionPlans.some(
      (plan) =>
        plan.candidate.pokemon.formKind === "mega" &&
        plan.metrics.megaCountAfter === 2
    ),
    `${label}で2体目のメガ候補を評価できません`
  );
}

assert(
  caseD.simulation.megaRecommendationStats
    .candidatePoolBeforeMegaFilter >
    caseD.simulation.megaRecommendationStats
      .candidatePoolAfterMegaFilter &&
    caseD.simulation.additionPlans.length > 0 &&
    caseD.simulation.additionPlans.every(
      (plan) => plan.candidate.pokemon.formKind !== "mega"
    ),
  "Golden D: 5体中メガ2体で通常候補を残し、3体目メガを除外できません"
);

assert(
  caseE.simulation.megaRecommendationStats
    .candidatePoolBeforeMegaFilter ===
    caseE.simulation.megaRecommendationStats
      .candidatePoolAfterMegaFilter &&
    caseE.simulation.additionPlans.some(
      (plan) => plan.candidate.pokemon.formKind === "mega"
    ),
  "Golden E: メガ未採用5体の6体目候補からメガを誤除外しました"
);

const caseFMegaPlans = collectPublishedPlans(caseF).filter(
  (plan) => plan.candidate.pokemon.formKind === "mega"
);
assert(
  caseF.simulation.megaRecommendationStats
    .candidatePoolBeforeMegaFilter ===
    caseF.simulation.megaRecommendationStats
      .candidatePoolAfterMegaFilter &&
    caseF.simulation.megaRecommendationStats
      .actionPatternsAfterMegaFilter <
      caseF.simulation.megaRecommendationStats
        .actionPatternsBeforeMegaFilter &&
    caseFMegaPlans.length > 0 &&
    caseFMegaPlans.every(
      (plan) =>
        (plan.action.removedSlotId === "slot-1" ||
          plan.action.removedSlotId === "slot-3") &&
        plan.metrics.megaCountAfter === 2
    ),
  "Golden F: メガ2体完成後のメガ枠入れ替えだけを残せません"
);
const completeMegaSwap = caseFMegaPlans[0];
assert(
  getAdvisorMegaCandidateNote({
    currentTeamSize: 6,
    currentMegaCount: 2,
    candidateIsMega: true,
    actionKind:
      completeMegaSwap.action.kind === "form-change"
        ? "formChange"
        : "replace",
    removedPokemonIsMega: true
  }) === "メガ枠の入れ替え",
  "完成後のメガ枠入れ替え注記を生成できません"
);

const delphoxMega = getPokemonBySlug("delphox-mega");
assert(delphoxMega, "完成後入れ替え用メガfixtureが不足しています");
const forbiddenFullSwap = evaluateAdvisorSwapPlan(
  simulationInput(caseF),
  candidateFor(delphoxMega),
  "slot-4"
);
const allowedFullSwap = evaluateAdvisorSwapPlan(
  simulationInput(caseF),
  candidateFor(delphoxMega),
  "slot-3"
);
const allowedSecondMegaSwap = evaluateAdvisorSwapPlan(
  simulationInput(fullWithOneMega),
  candidateFor(delphoxMega),
  "slot-4"
);
assert(
  !forbiddenFullSwap.metrics.megaLimitPassed &&
    !forbiddenFullSwap.metrics.megaRecommendationPassed &&
    allowedFullSwap.metrics.megaLimitPassed &&
    allowedFullSwap.metrics.megaRecommendationPassed &&
    allowedFullSwap.metrics.megaCountAfter === 2 &&
    allowedSecondMegaSwap.metrics.megaLimitPassed &&
    allowedSecondMegaSwap.metrics.megaRecommendationPassed &&
    allowedSecondMegaSwap.metrics.megaCountAfter === 2,
  "完成後のメガ2体許可・3体禁止・メガ同士入れ替え判定が不正です"
);

for (const [label, result] of [
  ["A", caseA],
  ["B", caseB],
  ["C", caseC],
  ["D", caseD],
  ["E", caseE],
  ["F", caseF],
  ["通常構築", normalTwo],
  ["トリックルーム", trickRoomB]
] as const) {
  assertPublishedPlansRespectMegaRule(result, label);
}
assert(
  trickRoomB.simulation.additionPlans.every(
    (plan) => plan.candidate.pokemon.formKind !== "mega"
  ) &&
    caseB.simulation.additionPlans
      .map((plan) => plan.candidate.pokemon.slug)
      .sort()
      .join(",") ===
      trickRoomB.simulation.additionPlans
        .map((plan) => plan.candidate.pokemon.slug)
        .sort()
        .join(","),
  "通常／トリックルームでメガ許可母集団が変化しました"
);
assert(
  caseB.simulation.threatRecommendations.length > 0 &&
    Object.values(caseB.simulation.typePlans)
      .flatMap((plans) => plans ?? [])
      .every((plan) => plan.candidate.pokemon.formKind !== "mega") &&
    Object.values(caseB.progressive.typePlans)
      .flatMap((plans) => plans ?? [])
      .every(
        (candidate) =>
          candidate.plan.candidate.pokemon.formKind !== "mega"
      ),
  "タイプ別またはCandidate Explorerへ序盤の禁止メガが混入しました"
);

const earlyForm = analyze(["floette-mega", "charizard"]);
const allowedForm = analyze([
  "floette-mega",
  "charizard",
  "kingambit",
  "rotom-wash"
]);
const charizardMegaX = getPokemonBySlug("charizard-mega-x");
assert(charizardMegaX, "フォーム変更用メガリザードンが不足しています");
const earlyFormPlan = evaluateAdvisorSwapPlan(
  simulationInput(earlyForm),
  candidateFor(charizardMegaX),
  "slot-2"
);
const allowedFormPlan = evaluateAdvisorSwapPlan(
  simulationInput(allowedForm),
  candidateFor(charizardMegaX),
  "slot-2"
);
assert(
  earlyFormPlan.metrics.megaLimitPassed &&
    !earlyFormPlan.metrics.megaRecommendationPassed &&
    earlyForm.simulation.megaRecommendationStats
      .actionPatternsAfterMegaFilter <
      earlyForm.simulation.megaRecommendationStats
        .actionPatternsBeforeMegaFilter &&
    allowedFormPlan.metrics.megaLimitPassed &&
    allowedFormPlan.metrics.megaRecommendationPassed,
  "フォーム変更で正式上限と段階型推薦上限を分離できません"
);

const gyarados = getPokemonBySlug("gyarados");
assert(gyarados, "同一species優先fixtureが不足しています");
assert(
  getAdvisorCandidateAddability({
    team: pokemonTeam(["gyarados-mega"]),
    candidate: gyarados,
    availablePokemon: caseA.availablePokemon
  }).code === "duplicate-species",
  "同一species判定よりメガ判定を先に適用しました"
);
assert(
  getAdvisorCandidateAddability({
    team: caseA.team,
    candidate: metagrossMega,
    availablePokemon: caseA.availablePokemon
  }).reason ===
    "構築の核ではメガシンカを1体までとしているため追加できません。" &&
    getAdvisorCandidateAddability({
      team: caseD.team,
      candidate: scizorMega,
      availablePokemon: caseD.availablePokemon
    }).reason === "メガシンカポケモンは2体までです。",
  "追加ボタンの段階別メガ上限理由が不正です"
);
const rejectedSource = caseA.team.map((slot) => ({ ...slot }));
const rejectedAdd = addAdvisorCandidateToTeam({
  team: caseA.team,
  candidate: metagrossMega,
  availablePokemon: caseA.availablePokemon
});
assert(
  JSON.stringify(rejectedAdd) === JSON.stringify(rejectedSource) &&
    JSON.stringify(caseA.team) === JSON.stringify(rejectedSource),
  "禁止メガの実追加を拒否できないか、入力teamを変更しました"
);

const firstUndoSource = normalOne.team.map((slot) => ({ ...slot }));
const firstUndoAdded = addAdvisorCandidateToTeam({
  team: firstUndoSource,
  candidate: getPokemonBySlug("floette-mega")!,
  availablePokemon: normalOne.availablePokemon
});
assert(
  firstUndoAdded.length === 2 &&
    getAdvisorMegaTeamState(firstUndoAdded).currentMegaCount === 1 &&
    !getAdvisorCandidateAddability({
      team: firstUndoAdded,
      candidate: metagrossMega,
      availablePokemon: normalOne.availablePokemon
    }).allowed,
  "通常1体からメガ追加後に別メガを禁止できません"
);
const firstUndoRestored = parseTeamBackup(
  serializeTeam(firstUndoSource)
);
assert(
  firstUndoRestored &&
    getAdvisorMegaTeamState(firstUndoRestored).currentMegaCount === 0 &&
    getAdvisorCandidateAddability({
      team: firstUndoRestored,
      candidate: metagrossMega,
      availablePokemon: normalOne.availablePokemon
    }).allowed,
  "Undo後にメガ0体へ戻してメガ候補を再許可できません"
);

const secondMegaCandidate =
  caseC.progressive.candidatesByMode.overall.find(
    (candidate) =>
      candidate.plan.candidate.pokemon.formKind === "mega"
  )?.plan.candidate.pokemon;
assert(secondMegaCandidate, "4体目の2体目メガ候補が不足しています");
const secondUndoSource = caseC.team.map((slot) => ({ ...slot }));
const secondUndoAdded = addAdvisorCandidateToTeam({
  team: secondUndoSource,
  candidate: secondMegaCandidate,
  availablePokemon: caseC.availablePokemon
});
assert(
  getAdvisorMegaTeamState(secondUndoAdded).currentTeamSize === 4 &&
    getAdvisorMegaTeamState(secondUndoAdded).currentMegaCount === 2 &&
    !getAdvisorCandidateAddability({
      team: secondUndoAdded,
      candidate: metagrossMega,
      availablePokemon: caseC.availablePokemon
    }).allowed,
  "4体目に2体目メガ追加後、5体目の別メガを禁止できません"
);
const secondUndoRestored = parseTeamBackup(
  serializeTeam(secondUndoSource)
);
assert(
  secondUndoRestored &&
    getAdvisorMegaTeamState(secondUndoRestored).currentMegaCount === 1 &&
    getAdvisorCandidateAddability({
      team: secondUndoRestored,
      candidate: metagrossMega,
      availablePokemon: caseC.availablePokemon
    }).allowed,
  "2体目メガ追加のUndo後に別メガ候補を再許可できません"
);

const legacyTeam = pokemonTeam([
  "floette-mega",
  "metagross-mega",
  "kingambit"
]);
const parsedLegacy = parseStoredTeam(serializeTeam(legacyTeam));
const legacy = analyze(teamSlugs(parsedLegacy));
assert(
  JSON.stringify(parsedLegacy) === JSON.stringify(legacyTeam) &&
    getAdvisorMegaTeamState(parsedLegacy).currentMegaCount === 2 &&
    legacy.simulation.additionPlans.length > 0 &&
    legacy.simulation.additionPlans.every(
      (plan) => plan.candidate.pokemon.formKind !== "mega"
    ) &&
    legacy.progressive.megaGuidance.message.includes(
      "既存メンバーはそのまま保持"
    ),
  "既存複数メガデータを保持し、通常候補だけを残せません"
);

const headerSource = readFileSync(
  path.join(process.cwd(), "components/team/AdvisorPhaseHeader.tsx"),
  "utf8"
);
const nextCardSource = readFileSync(
  path.join(
    process.cwd(),
    "components/team/AdvisorNextCandidateCard.tsx"
  ),
  "utf8"
);
const sectionSource = readFileSync(
  path.join(process.cwd(), "components/team/TeamAdvisorSection.tsx"),
  "utf8"
);
const buttonSource = readFileSync(
  path.join(
    process.cwd(),
    "components/team/AdvisorAddCandidateButton.tsx"
  ),
  "utf8"
);
const pageSource = readFileSync(
  path.join(process.cwd(), "app/page.tsx"),
  "utf8"
);
const styleSource = readFileSync(
  path.join(process.cwd(), "components/team/TeamWorkspace.module.css"),
  "utf8"
);
assert(
  headerSource.includes("advisorMegaGuidance") &&
    headerSource.includes("次の候補でのメガ上限") &&
    nextCardSource.includes("getAdvisorMegaCandidateNote") &&
    sectionSource.includes("getPlanMegaCandidateNote") &&
    sectionSource.includes("advisorMegaCandidateBadge") &&
    buttonSource.includes("aria-describedby") &&
    buttonSource.includes("disabled={!addability.allowed}") &&
    pageSource.includes("ADVISOR_ADD_BACKUP_KEY") &&
    pageSource.includes("undoAdvisorCandidate") &&
    styleSource.includes(".advisorMegaGuidance") &&
    styleSource.includes(".advisorCandidateBadges") &&
    styleSource.includes("flex-wrap: wrap"),
  "phase説明・候補注記・追加不可理由・Undo・モバイル折り返しのUI統合が不足しています"
);

const emptyGuidance = getAdvisorMegaGuidance([]);
assert(
  emptyGuidance.maxMegaCount === 1 &&
    emptyGuidance.message.includes("1〜3体目") &&
    getAdvisorMegaGuidance(
      pokemonTeam([
        "dragonite-mega",
        "garchomp-mega",
        "metagross-mega",
        "gliscor"
      ])
    ).message.includes("メガシンカが3体"),
  "empty phaseのメガ上限説明が不正です"
);

const performanceCases = [
  ["1体", caseA],
  ["2体", caseB],
  ["3体", caseC],
  ["4体", fourWithOneMega],
  ["5体", caseD],
  ["6体", caseF]
] as const;
for (const [label, result] of performanceCases) {
  const stats = result.simulation.megaRecommendationStats;
  assert(
    result.simulation.evaluatedPatternCount ===
        stats.actionPatternsAfterMegaFilter &&
      result.simulation.recomputedThreatAnalysisCount ===
        result.simulation.evaluatedPatternCount,
    `${label}で禁止patternを評価前に除外できません`
  );
  console.log(
    `[mega-performance] ${label}: candidates=${stats.candidatePoolBeforeMegaFilter}->${stats.candidatePoolAfterMegaFilter}, patterns=${stats.actionPatternsBeforeMegaFilter}->${stats.actionPatternsAfterMegaFilter}, excluded=${stats.actionPatternsBeforeMegaFilter - stats.actionPatternsAfterMegaFilter}, duration=${result.durationMs.toFixed(1)}ms`
  );
}

console.log(
  `[ok] TASK039 Mega Golden: A=${displayedSlugs(caseA.progressive).join(",")}; B=${displayedSlugs(caseB.progressive).join(",")}; C=${displayedSlugs(caseC.progressive).join(",")}; D=${displayedSlugs(caseD.progressive).join(",") || "通常候補あり"}; E=${displayedSlugs(caseE.progressive).join(",")}; F=${caseFMegaPlans[0]?.candidate.pokemon.slug}<-${caseFMegaPlans[0]?.action.removedSlotId}`
);
