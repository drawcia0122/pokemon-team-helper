import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import {
  addAdvisorCandidateToTeam,
  getAdvisorCandidateAddability
} from "@/lib/advisorCandidateAddition";
import { evaluateAdvisorPartnerSynergy } from "@/lib/advisorPartnerSynergy";
import { evaluateMoveAgainstPokemon } from "@/lib/battleEffectiveness";
import { getAdvisorMoveQuality } from "@/lib/advisorMoveQuality";
import {
  getAdvisorBuildPhase,
  getAdvisorPokemonCount
} from "@/lib/advisorBuildPhase";
import {
  getProgressiveAdvisorModePlans,
  getProgressiveTeamAdvisor,
  type ProgressiveTeamAdvisorAnalysis
} from "@/lib/progressiveTeamAdvisor";
import { addTeamSlotToFirstEmpty } from "@/lib/teamSlotLayout";
import {
  ADVISOR_ADD_BACKUP_KEY,
  ARTICLE_IMPORT_BACKUP_KEY,
  parseStoredTeam,
  parseTeamBackup,
  serializeTeam
} from "@/lib/teamStorage";
import { getPokemonBySlug } from "@/lib/typeChart";
import { analyzeAdvisorTeam } from "@/scripts/lib/trickRoomAdvisorHarness";
import type { TeamProfile } from "@/lib/teamProfile";
import type { TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function analyze(
  slugs: string[],
  profile: TeamProfile = "standard"
): {
  progressive: ProgressiveTeamAdvisorAnalysis;
  durationMs: number;
  base: ReturnType<typeof analyzeAdvisorTeam>;
} {
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
    progressive,
    durationMs: performance.now() - startedAt,
    base
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

const phaseTeams: TeamSlot[][] = Array.from({ length: 7 }, (_, count) =>
  Array.from({ length: count }, (__, index) => ({
    id: `slot-${index + 1}`,
    mode: "pokemon" as const,
    pokemonSlug: "dragonite"
  }))
);
const expectedPhases = [
  "empty",
  "partner",
  "coreCompletion",
  "situationalCoverage",
  "situationalCoverage",
  "situationalCoverage",
  "completeOptimization"
] as const;
for (const [count, team] of phaseTeams.entries()) {
  assert(
    getAdvisorBuildPhase(team) === expectedPhases[count],
    `${count}体のphaseが不正です`
  );
}
assert(
  getAdvisorBuildPhase([
    { id: "slot-1", mode: "type", primaryType: "water" }
  ]) === "empty",
  "タイプ代理枠を登録ポケモン数として数えました"
);

const empty = analyze([]);
assert(
  empty.progressive.phase === "empty" &&
    empty.progressive.evaluatedCandidateCount === 0 &&
    displayedSlugs(empty.progressive).length === 0,
  "0体でランキングを表示しました"
);

const caseA = analyze(["floette-mega"]);
assert(caseA.progressive.phase === "partner", "1体phaseが相棒候補ではありません");
assert(caseA.progressive.anchor?.slug === "floette-mega", "構築の軸が不正です");
assert(
  displayedSlugs(caseA.progressive).length > 0 &&
    displayedSlugs(caseA.progressive).length <= 6,
  "相棒候補の表示件数が不正です"
);
for (const candidate of caseA.progressive.candidatesByMode.overall) {
  assert(candidate.plan.action.kind === "add", "相棒候補へ入れ替え案が混入しました");
  assert(candidate.partnerSynergy, "相棒候補に双方向補完分析がありません");
  assert(
    new Set(candidate.evidence.map((entry) => entry.id)).size ===
      candidate.evidence.length,
    "相棒候補Evidenceが重複しています"
  );
  assert(
    candidate.partnerSynergy.teammateSynergyPoints <= 5,
    "teammates補助評価が5点を超えました"
  );
}
const topPartner = caseA.progressive.candidatesByMode.overall[0];
assert(topPartner?.reasonsByMode.overall.length, "相棒候補に具体的な理由がありません");
const caseAPartnerBySlug = new Map(
  caseA.progressive.candidatesByMode.overall.map((candidate) => [
    candidate.plan.candidate.pokemon.slug,
    candidate
  ])
);
const kingambitPartner = caseAPartnerBySlug.get("kingambit");
const garchompPartner = caseAPartnerBySlug.get("garchomp");
assert(
  displayedSlugs(caseA.progressive)[0] === "kingambit" &&
    kingambitPartner &&
    garchompPartner &&
    kingambitPartner.fitScore > garchompPartner.fitScore &&
    kingambitPartner.breakdown.defensive >
      garchompPartner.breakdown.defensive,
  "Golden: メガフラエッテと双方向に補完するドドゲザンが、高使用率の一方向補完候補より上になりません"
);
assert(
  garchompPartner.partnerSynergy?.teammateSynergyPoints === 5 &&
    displayedSlugs(caseA.progressive)[0] !== "garchomp",
  "Golden: teammates最大補正だけで補完候補の順位を逆転させました"
);
assert(
  topPartner.evidence.some((entry) =>
    entry.id.startsWith("partner:anchor-weakness-covered")
  ) &&
    !topPartner.evidence.some(
      (entry) =>
        entry.id.startsWith("defense:") ||
        entry.id === "offense:coverage"
    ),
  "相棒phaseでTASK037の広域タイプ差分と双方向Evidenceを重複加点しました"
);

const heatran = getPokemonBySlug("heatran");
const rotomWash = getPokemonBySlug("rotom-wash");
const garchompPokemon = getPokemonBySlug("garchomp");
const gliscor = getPokemonBySlug("gliscor");
const basculegion = getPokemonBySlug("basculegion-male");
assert(
  heatran && rotomWash && garchompPokemon && gliscor && basculegion,
  "相互補完の特性・4倍弱点fixtureが不足しています"
);
const levitateSynergy = evaluateAdvisorPartnerSynergy({
  anchor: heatran,
  candidate: rotomWash,
  environmentDataset: caseA.base.environmentDataset,
  profile: "standard"
});
assert(
  !levitateSynergy.candidateWeaknesses.includes("ground") &&
    !levitateSynergy.sharedWeaknesses.includes("ground"),
  "ふゆうによるじめん無効を候補弱点・共通弱点へ誤計上しました"
);
const quadSynergy = evaluateAdvisorPartnerSynergy({
  anchor: garchompPokemon,
  candidate: gliscor,
  environmentDataset: caseA.base.environmentDataset,
  profile: "standard"
});
assert(
  quadSynergy.sharedQuadWeaknesses.includes("ice") &&
    quadSynergy.evidence.some(
      (entry) =>
        entry.id === "partner:shared-weakness" && entry.points < 0
    ),
  "共通4倍弱点を重大な相棒リスクとしてEvidence化できません"
);
const moldBreakerGround = evaluateMoveAgainstPokemon({
  move: { type: "ground", damageClass: "physical" },
  attacker: basculegion,
  defender: rotomWash,
  attackerAbilityUsage: [
    { id: "moldbreaker", name: "かたやぶり", share: 1 }
  ],
  defenderAbilityUsage: [
    { id: "levitate", name: "ふゆう", share: 1 }
  ]
});
assert(
  moldBreakerGround.weaknessProbability === 1 &&
    moldBreakerGround.ignoredDefensiveAbilities.some(
      (effect) =>
        effect.attackerAbilityId === "moldbreaker" &&
        effect.defenderAbilityId === "levitate"
    ),
  "かたやぶりでふゆうが破られる主要技Evidenceを維持できません"
);
assert(
  !getAdvisorMoveQuality({
    move: {
      id: "aquajet",
      name: "アクアジェット",
      share: 1,
      type: "water",
      damageClass: "physical"
    },
    attacker: kingambitPartner.plan.candidate.pokemon
  }).reliable,
  "弱い非STAB技を相棒phaseの信頼できる攻撃補完として扱いました"
);

const beforeAdd = caseA.base.team.map((slot) => ({ ...slot }));
const added = addAdvisorCandidateToTeam({
  team: caseA.base.team,
  candidate: topPartner.plan.candidate.pokemon,
  availablePokemon: caseA.base.availablePokemon
});
assert(
  added.length === 2 &&
    getAdvisorBuildPhase(added) === "coreCompletion" &&
    caseA.base.team.length === 1 &&
    JSON.stringify(caseA.base.team) === JSON.stringify(beforeAdd),
  "相棒追加または入力配列の非破壊性に失敗しました"
);
assert(
  new Set([ADVISOR_ADD_BACKUP_KEY, ARTICLE_IMPORT_BACKUP_KEY]).size === 2 &&
    parseStoredTeam(serializeTeam(added)).length === 2 &&
    parseTeamBackup(serializeTeam(caseA.base.team))?.length === 1,
  "localStorage互換の保存・Undo復元に失敗しました"
);
assert(
  !getAdvisorCandidateAddability({
    team: added,
    candidate: topPartner.plan.candidate.pokemon,
    availablePokemon: caseA.base.availablePokemon
  }).allowed,
  "同一speciesの再追加を許可しました"
);
const unavailableCandidate = getPokemonBySlug("pikachu");
const invalidFormCandidate = getPokemonBySlug("charizard-gmax");
assert(
  unavailableCandidate &&
    invalidFormCandidate &&
    getAdvisorCandidateAddability({
      team: caseA.base.team,
      candidate: unavailableCandidate,
      availablePokemon: []
    }).code === "unavailable" &&
    getAdvisorCandidateAddability({
      team: caseA.base.team,
      candidate: invalidFormCandidate,
      availablePokemon: [invalidFormCandidate]
    }).code === "invalid-form",
  "使用不可または表示専用フォームの追加理由を分離できません"
);

const gapTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "floette-mega" },
  { id: "slot-3", mode: "pokemon", pokemonSlug: "dragonite" }
];
const gapCandidate = getPokemonBySlug("garchomp");
assert(gapCandidate, "空き枠fixtureが不足しています");
const filledGap = addTeamSlotToFirstEmpty(gapTeam, {
  mode: "pokemon",
  pokemonSlug: gapCandidate.slug
});
assert(
  filledGap.some((slot) => slot.id === "slot-2" && slot.mode === "pokemon"),
  "最初の空きスロットへ追加しませんでした"
);

const caseB = analyze(["dragonite", "garchomp"]);
assert(
  caseB.progressive.phase === "coreCompletion" &&
    displayedSlugs(caseB.progressive).length > 0,
  "2体の3匹目候補を生成できません"
);
assert(
  Object.values(caseB.progressive.candidatesByMode)
    .flat()
    .every((candidate) => candidate.plan.action.kind === "add"),
  "3匹目候補へ入れ替え案が混入しました"
);
assert(
  displayedSlugs(caseB.progressive, "defensive").join() !==
    displayedSlugs(caseB.progressive, "offensive").join(),
  "防御補完と攻撃補完で順位が変化しません"
);
assert(
  displayedSlugs(caseB.progressive)[0] === "corviknight",
  "Golden: 2匹共通課題を補うアーマーガアが3匹目候補の上位になりません"
);

const caseC = analyze(["dragonite", "garchomp", "gliscor"]);
assert(
  caseC.progressive.phase === "situationalCoverage" &&
    caseC.progressive.priorities.length > 0 &&
    displayedSlugs(caseC.progressive).length > 0,
  "3体の状況カバー候補を生成できません"
);
assert(
  caseC.progressive.candidatesByMode.overall.some((candidate) =>
    candidate.plan.threatCoverage.threatAnswers.some(
      (answer) =>
        answer.answerClass === "stableSwitch" ||
        answer.answerClass === "revengeKill"
    )
  ),
  "4匹目候補に要警戒相手への回答分類がありません"
);
assert(
  caseC.progressive.candidatesByMode.overall.every(
    (candidate) =>
      candidate.plan.evidenceScore.dimensionTotals
        .teamIssueImprovement > 0 ||
      candidate.breakdown.primaryNeed === 0
  ),
  "状況phaseでtargetCounterplayを最重要課題と対策へ二重加点しました"
);
const iceConsistencyWorsener =
  caseC.base.simulation.additionPlans.find((plan) =>
    plan.evidence.some(
      (entry) =>
        entry.id === "risk:type:ice" &&
        entry.beforeValue === 3 &&
        entry.afterValue === 4
    )
  );
assert(
  iceConsistencyWorsener &&
    !displayedSlugs(caseC.progressive).includes(
      iceConsistencyWorsener.candidate.pokemon.slug
    ),
  "既存こおり弱点を3体から4体へ悪化させる候補を上位表示しました"
);
assert(
  caseC.base.simulation.additionPlans.some((plan) =>
    plan.evidence.some(
      (entry) => entry.id === "risk:post-swap-threat-summary"
    )
  ),
  "追加後に新しく浮上する要警戒TOP5をリスクEvidenceへ残せません"
);
assert(
  displayedSlugs(caseC.progressive).includes("floette-mega"),
  "Golden: 単タイプのメガフラエッテを複合タイプ数で不当に除外しました"
);

const caseD = analyze([
  "gyarados-mega",
  "gengar",
  "mamoswine",
  "scizor",
  "primarina"
]);
assert(
  caseD.progressive.phase === "situationalCoverage" &&
    displayedSlugs(caseD.progressive).length > 0 &&
    displayedSlugs(caseD.progressive).length <= 6,
  "5体の最後の1枠候補が不正です"
);
assert(
  Object.values(caseD.progressive.candidatesByMode)
    .flat()
    .every(
      (candidate) =>
        candidate.plan.action.kind === "add" &&
        candidate.fitScore >= 15
    ),
  "最後の1枠へ小幅改善案または入れ替え案を混在させました"
);
const completedFromCaseD = addAdvisorCandidateToTeam({
  team: caseD.base.team,
  candidate:
    caseD.progressive.candidatesByMode.overall[0].plan.candidate.pokemon,
  availablePokemon: caseD.base.availablePokemon
});
assert(
  getAdvisorPokemonCount(completedFromCaseD) === 6 &&
    getAdvisorBuildPhase(completedFromCaseD) ===
      "completeOptimization" &&
    parseTeamBackup(serializeTeam(caseD.base.team))?.length === 5 &&
    getAdvisorBuildPhase(
      parseTeamBackup(serializeTeam(caseD.base.team)) ?? []
    ) === "situationalCoverage",
  "最後の空き枠追加・completeOptimization移行・Undo phase復元に失敗しました"
);

const standardB = caseB;
const trickRoomB = analyze(["dragonite", "garchomp"], "trick-room");
assert(
  displayedSlugs(standardB.progressive, "role").join() !==
    displayedSlugs(trickRoomB.progressive, "role").join(),
  "通常／トリックルームで役割補完順位が変化しません"
);
const selectedType = caseC.progressive.typeOptions[0]?.type ?? "";
const evaluationCountBeforeModeSwitch =
  caseC.progressive.evaluatedCandidateCount;
const modeStartedAt = performance.now();
getProgressiveAdvisorModePlans(caseC.progressive, "defensive", "");
const modeDurationMs = performance.now() - modeStartedAt;
const typeStartedAt = performance.now();
const typePlans = getProgressiveAdvisorModePlans(
  caseC.progressive,
  "typeSpecific",
  selectedType
);
const typeDurationMs = performance.now() - typeStartedAt;
assert(
  caseC.progressive.evaluatedCandidateCount === evaluationCountBeforeModeSwitch,
  "モード切り替えで候補を再評価しました"
);
assert(
  !selectedType ||
    typePlans.every((candidate) =>
      candidate.plan.candidate.pokemon.types.includes(selectedType)
    ),
  "タイプ別filterへ選択外タイプが混入しました"
);

const caseE = analyze([
  "charizard",
  "rotom-wash",
  "garchomp",
  "empoleon",
  "gardevoir",
  "corviknight"
]);
assert(
  caseE.progressive.phase === "completeOptimization" &&
    caseE.progressive.completeSimulation === caseE.base.simulation,
  "6体時にTASK037の既存評価経路をそのまま使用していません"
);
assert(
  caseE.base.simulation.plans
    .map(
      (plan) =>
        `${plan.candidate.pokemon.slug}:${plan.action.removedSlotId}:${plan.improvementScore}`
    )
    .join("|") ===
    [
      "floette-mega:slot-5:15",
      "umbreon:slot-4:9",
      "hydreigon:slot-4:8",
      "kingambit:slot-4:8",
      "volcarona:slot-1:6"
    ].join("|"),
  "Golden: 6体時のTASK037順位・入れ替え元・スコアが変化しました"
);
assert(
  caseE.base.simulation.plans.every(
    (plan) => plan.action.kind === "replace"
  ) &&
    caseE.base.simulation.formChangePlans.some(
      (plan) => plan.action.kind === "form-change"
    ),
  "6体時の入れ替え・フォーム変更案を維持できません"
);

const megaCandidates = [
  getPokemonBySlug("floette-mega"),
  getPokemonBySlug("charizard-mega-x"),
  getPokemonBySlug("gyarados-mega")
].filter((pokemon): pokemon is NonNullable<typeof pokemon> => Boolean(pokemon));
assert(megaCandidates.length === 3, "メガ枠fixtureが不足しています");
const twoMegaTeam: TeamSlot[] = megaCandidates.slice(0, 2).map((pokemon, index) => ({
  id: `slot-${index + 1}`,
  mode: "pokemon",
  pokemonSlug: pokemon.slug
}));
assert(
  getAdvisorCandidateAddability({
    team: twoMegaTeam,
    candidate: megaCandidates[2],
    availablePokemon: caseA.base.availablePokemon
  }).code === "mega-limit",
  "メガ枠上限を検証できません"
);
const fullTeam = caseE.base.team;
assert(
  getAdvisorCandidateAddability({
    team: fullTeam,
    candidate: topPartner.plan.candidate.pokemon,
    availablePokemon: caseE.base.availablePokemon
  }).code === "team-full",
  "6枠満杯で追加ボタンを無効化できません"
);
assert(
  getAdvisorPokemonCount(twoMegaTeam) === 2,
  "ポケモン登録数の算出が不正です"
);

const pageSource = readFileSync(
  new URL("../app/page.tsx", import.meta.url),
  "utf8"
);
const candidateCardSource = readFileSync(
  new URL(
    "../components/team/AdvisorNextCandidateCard.tsx",
    import.meta.url
  ),
  "utf8"
);
const candidateButtonSource = readFileSync(
  new URL(
    "../components/team/AdvisorAddCandidateButton.tsx",
    import.meta.url
  ),
  "utf8"
);
assert(
  pageSource.includes("ADVISOR_ADD_BACKUP_KEY") &&
    pageSource.includes("window.localStorage.setItem") &&
    pageSource.includes("function undoAdvisorCandidate") &&
    pageSource.includes("function updateTeamFromInput") &&
    pageSource.includes("clearAdvisorAddUndo();") &&
    pageSource.includes("STEP 4は「") &&
    candidateButtonSource.includes("aria-describedby") &&
    candidateButtonSource.includes("disabled={!addability.allowed}"),
  "追加前backup・localStorage・Undo・手入力時破棄・無効理由のUI統合が不足しています"
);
assert(
  candidateCardSource.includes("環境使用率") &&
    candidateCardSource.includes("confidenceLabel") &&
    candidateCardSource.includes("共通4倍"),
  "相棒カードへ環境使用率・役割confidence・共通4倍弱点を表示できません"
);

const reports = [
  ["0体", empty],
  ["1体", caseA],
  ["2体", caseB],
  ["3体", caseC],
  ["5体", caseD],
  ["6体", caseE]
] as const;
for (const [label, result] of reports) {
  console.log(
    `[progressive] ${label}: phase=${result.progressive.phase}, pool=${result.progressive.candidatePoolCount}, evaluated=${result.progressive.evaluatedCandidateCount}, displayed=${displayedSlugs(result.progressive).join(",") || "none"}, duration=${result.durationMs.toFixed(1)}ms`
  );
}
console.log(
  `[progressive] mode-switch=${modeDurationMs.toFixed(3)}ms, type-switch=${typeDurationMs.toFixed(3)}ms, type=${selectedType || "none"}`
);
console.log(
  `[ok] 段階型Advisor Golden fixture: A=${displayedSlugs(caseA.progressive).join(",")}, B=${displayedSlugs(caseB.progressive).join(",")}, C=${displayedSlugs(caseC.progressive).join(",")}, D=${displayedSlugs(caseD.progressive).join(",")}, E=${caseE.base.simulation.plans.map((plan) => `${plan.candidate.pokemon.slug}<-${plan.action.removedSlotId}`).join(",")}`
);
