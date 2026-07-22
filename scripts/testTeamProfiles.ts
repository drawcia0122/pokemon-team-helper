import { readFileSync } from "node:fs";
import path from "node:path";
import { getAdvisorSwapSimulation } from "@/lib/advisorSwapSimulator";
import {
  getAdvisorCategoryLabels,
  getAdvisorProfileSpeedRoleImprovement,
  getAdvisorRoleCounts
} from "@/lib/advisorSwapSimulator";
import { getAdvisorTeamDiagnostics } from "@/lib/advisorTeamDiagnostics";
import { getTeamAdvisorAnalysis } from "@/lib/teamAdvisor";
import { getThreatEnvironmentCatalog } from "@/lib/environmentData.server";
import { findThreatEnvironmentDataset } from "@/lib/environmentThreatData";
import { getTeamDiagnostics } from "@/lib/teamDiagnostics";
import {
  countProfileSpeedAdvantages,
  formatThreatSpeedReason,
  isProfileSpeedAdvantage,
  PROFILE_SPEED_WEIGHTS,
  resolveStoredTeamProfile,
  TEAM_PROFILE_CONFIG,
  TEAM_PROFILE_STORAGE_KEY,
  TEAM_SPEED_THRESHOLDS,
  type TeamProfile
} from "@/lib/teamProfile";
import { getAvailablePokemonBySeason } from "@/lib/regulations";
import { TEAM_STORAGE_KEY } from "@/lib/teamStorage";
import {
  getAdvisorCompatibleThreatAnalysis,
  getThreatPokemonAnalysis,
  isThreatPokemonCandidate,
  MIN_THREAT_USAGE_RATE
} from "@/lib/teamThreats";
import { summarizeTeam } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function slot(id: string, pokemonSlug: string): TeamSlot {
  return { id, mode: "pokemon", pokemonSlug };
}

function teamFromSlugs(slugs: string[]): TeamSlot[] {
  return slugs.map((slug, index) => slot(`slot-${index + 1}`, slug));
}

const availablePokemon = getAvailablePokemonBySeason("season-m4");
const environmentDataset = findThreatEnvironmentDataset(
  getThreatEnvironmentCatalog(),
  "M-B"
);
assert(environmentDataset, "M-Bの環境snapshotがありません");

assert(resolveStoredTeamProfile(null) === "standard", "初期値が通常ではありません");
assert(resolveStoredTeamProfile("standard") === "standard", "通常を復元できません");
assert(resolveStoredTeamProfile("trick-room") === "trick-room", "トリックルームを復元できません");
assert(resolveStoredTeamProfile("tailwind") === "standard", "未知の保存値が通常へフォールバックしません");
assert(
  TEAM_PROFILE_CONFIG.standard.speedCategoryLabel === "素早さ重視" &&
    TEAM_PROFILE_CONFIG["trick-room"].speedCategoryLabel === "トリル適性" &&
    getAdvisorCategoryLabels("trick-room").speed === "トリル適性",
  "プロファイル別のカテゴリ名が不正です"
);
assert(
  TEAM_SPEED_THRESHOLDS.fastMinimum === 100 &&
    TEAM_SPEED_THRESHOLDS.mediumMinimum === 70 &&
    TEAM_SPEED_THRESHOLDS.slowMaximum === 69,
  "素早さ分類閾値が一箇所へ集約されていません"
);
assert(
  PROFILE_SPEED_WEIGHTS.standard.fastRoleLoss > 0 &&
    PROFILE_SPEED_WEIGHTS["trick-room"].slowRoleLoss > 0,
  "プロファイル別の速度役割喪失ウェイトがありません"
);

assert(isProfileSpeedAdvantage(101, 100, "standard"), "通常の高速判定が不正です");
assert(!isProfileSpeedAdvantage(100, 100, "standard"), "通常で同速を含めました");
assert(isProfileSpeedAdvantage(99, 100, "trick-room"), "トリルの低速判定が不正です");
assert(!isProfileSpeedAdvantage(100, 100, "trick-room"), "トリルで同速を含めました");
assert(countProfileSpeedAdvantages(100, [80, 100, 120], "standard") === 1, "通常の体数判定が不正です");
assert(countProfileSpeedAdvantages(100, [80, 100, 120], "trick-room") === 1, "トリルの体数判定が不正です");
assert(formatThreatSpeedReason({ advantageCount: 1, memberCount: 1, profile: "standard" }) === null, "1体で速度理由を生成しました");
assert(
  formatThreatSpeedReason({ advantageCount: 5, memberCount: 6, profile: "standard" }) ===
    "6体中5体より速く、先に動かれやすい相手です。" &&
    formatThreatSpeedReason({ advantageCount: 5, memberCount: 6, profile: "trick-room" }) ===
      "6体中5体より遅く、トリックルーム下で先に動かれやすい相手です。",
  "体数ベースの理由文が不正です"
);

const environmentBySlug = new Map(
  environmentDataset.pokemon.map((entry) => [entry.slug, entry])
);
const eligibleCandidates = availablePokemon.filter(
  (pokemon) =>
    pokemon.baseStats &&
    isThreatPokemonCandidate(pokemon) &&
    (environmentBySlug.get(pokemon.slug)?.usageRate ?? -1) >=
      MIN_THREAT_USAGE_RATE
);
const fastestCandidate = [...eligibleCandidates].sort(
  (left, right) => right.baseStats!.speed - left.baseStats!.speed
)[0];
const slowestCandidate = [...eligibleCandidates].sort(
  (left, right) => left.baseStats!.speed - right.baseStats!.speed
)[0];
assert(fastestCandidate && slowestCandidate, "速度比較用の環境候補がありません");

const slowTeam = teamFromSlugs([
  "torkoal",
  "snorlax",
  "slowbro",
  "ferrothorn",
  "clodsire",
  "copperajah"
]);
const fastTeam = teamFromSlugs([
  "dragapult",
  "electrode",
  "aerodactyl",
  "jolteon",
  "ninjask",
  "weavile"
]);

function analyzeOne(
  team: TeamSlot[],
  candidate: PokemonEntry,
  profile: TeamProfile
) {
  return getThreatPokemonAnalysis(
    team,
    summarizeTeam(team),
    [candidate],
    environmentDataset,
    1,
    profile
  )[0];
}

const fastStandard = analyzeOne(slowTeam, fastestCandidate, "standard");
const fastTrickRoom = analyzeOne(slowTeam, fastestCandidate, "trick-room");
const slowStandard = analyzeOne(fastTeam, slowestCandidate, "standard");
const slowTrickRoom = analyzeOne(fastTeam, slowestCandidate, "trick-room");
assert(fastStandard && fastTrickRoom && slowStandard && slowTrickRoom, "速度評価を生成できません");
assert(
  fastStandard.metrics.speedPoints > fastTrickRoom.metrics.speedPoints,
  "トリルで速いだけの相手の速度加点が残っています"
);
assert(
  slowTrickRoom.metrics.speedPoints > slowStandard.metrics.speedPoints,
  "トリルで遅い相手へ速度加点できていません"
);
assert(
  fastStandard.metrics.nonSpeedMatchupPoints ===
      fastTrickRoom.metrics.nonSpeedMatchupPoints &&
    fastStandard.metrics.environmentPoints ===
      fastTrickRoom.metrics.environmentPoints &&
    slowStandard.metrics.nonSpeedMatchupPoints ===
      slowTrickRoom.metrics.nonSpeedMatchupPoints &&
    slowStandard.metrics.environmentPoints ===
      slowTrickRoom.metrics.environmentPoints,
  "プロファイル変更で速度以外の評価が変わりました"
);
assert(
  [...fastStandard.reasons, ...fastTrickRoom.reasons, ...slowStandard.reasons, ...slowTrickRoom.reasons]
    .every((reason) => !reason.includes("平均")),
  "平均差の速度理由文が残っています"
);

const fastStandardDiagnostics = getTeamDiagnostics(
  fastTeam,
  summarizeTeam(fastTeam),
  availablePokemon,
  "standard"
);
const fastTrickDiagnostics = getTeamDiagnostics(
  fastTeam,
  summarizeTeam(fastTeam),
  availablePokemon,
  "trick-room"
);
const slowStandardDiagnostics = getTeamDiagnostics(
  slowTeam,
  summarizeTeam(slowTeam),
  availablePokemon,
  "standard"
);
const slowTrickDiagnostics = getTeamDiagnostics(
  slowTeam,
  summarizeTeam(slowTeam),
  availablePokemon,
  "trick-room"
);
assert(
  fastStandardDiagnostics.strengths.some((item) => item.id === "fast-attackers") &&
    fastTrickDiagnostics.cautions.some((item) => item.id === "low-trick-room") &&
    slowStandardDiagnostics.cautions.some((item) => item.id === "low-speed") &&
    slowTrickDiagnostics.strengths.some((item) => item.id === "trick-room-attackers"),
  "高速中心・低速中心パーティの課題判定をプロファイル別に切り替えられません"
);

const advisorTeam = teamFromSlugs([
  "charizard",
  "garchomp",
  "rotom-wash",
  "corviknight",
  "clefable",
  "kingambit"
]);

function analyzeAdvisor(team: TeamSlot[], profile: TeamProfile) {
  const summary = summarizeTeam(team);
  const diagnostics = getTeamDiagnostics(
    team,
    summary,
    availablePokemon,
    profile
  );
  const threats = getAdvisorCompatibleThreatAnalysis(
    team,
    summary,
    availablePokemon,
    environmentDataset,
    5,
    profile
  );
  const advisor = getTeamAdvisorAnalysis({
    team,
    summary,
    diagnostics,
    threats,
    availablePokemon,
    environmentDataset,
    profile
  });
  const simulation = getAdvisorSwapSimulation({
    team,
    advisor,
    availablePokemon,
    environmentDataset,
    profile
  });
  const details = getAdvisorTeamDiagnostics({
    team,
    summary,
    threats,
    profile
  });
  return { diagnostics, threats, advisor, simulation, details };
}

const standardAdvisor = analyzeAdvisor(advisorTeam, "standard");
const trickRoomAdvisor = analyzeAdvisor(advisorTeam, "trick-room");
assert(
  standardAdvisor.threats.every((threat) => threat.metrics.profile === "standard") &&
    trickRoomAdvisor.threats.every((threat) => threat.metrics.profile === "trick-room"),
  "Advisor内の要警戒TOP5をプロファイル別に再抽出できていません"
);
assert(
  standardAdvisor.details.profile === "standard" &&
    trickRoomAdvisor.details.profile === "trick-room" &&
    standardAdvisor.details.categories.find((category) => category.id === "speed")?.items.some((item) => item.label.includes("高速枠")) &&
    trickRoomAdvisor.details.categories.find((category) => category.id === "speed")?.items.some((item) => item.label.includes("トリル向け低速枠")),
  "チーム詳細診断がプロファイルを反映していません"
);
assert(
  getAdvisorProfileSpeedRoleImprovement(
    { ...getAdvisorRoleCounts(advisorTeam), fast: 1, slow: 0 },
    { ...getAdvisorRoleCounts(advisorTeam), fast: 0, slow: 0 },
    "standard"
  ) < 0 &&
    getAdvisorProfileSpeedRoleImprovement(
      { ...getAdvisorRoleCounts(advisorTeam), fast: 0, slow: 1 },
      { ...getAdvisorRoleCounts(advisorTeam), fast: 0, slow: 0 },
      "trick-room"
    ) < 0,
  "プロファイル別の重要速度枠喪失を減点できません"
);
assert(
  standardAdvisor.simulation.evaluatedPatternCount > 0 &&
    trickRoomAdvisor.simulation.evaluatedPatternCount > 0 &&
    standardAdvisor.simulation.plans.every((plan) =>
      [...plan.beforeThreats, ...plan.afterThreats].every(
        (threat) => threat.metrics.profile === "standard"
      )
    ) &&
    trickRoomAdvisor.simulation.plans.every((plan) =>
      [...plan.beforeThreats, ...plan.afterThreats].every(
        (threat) => threat.metrics.profile === "trick-room"
      )
    ),
  "入れ替え後の要警戒TOP5を選択プロファイルで再計算できていません"
);
const standardSpeedPlans = standardAdvisor.simulation.plansByCategory.speed;
const trickRoomSpeedPlans = trickRoomAdvisor.simulation.plansByCategory.speed;
const averagePlanSpeed = (plans: typeof standardSpeedPlans) =>
  plans.length
    ? plans.reduce(
        (total, plan) => total + (plan.candidate.pokemon.baseStats?.speed ?? 0),
        0
      ) / plans.length
    : 0;
assert(
  standardSpeedPlans.length > 0 &&
    trickRoomSpeedPlans.length > 0 &&
    averagePlanSpeed(standardSpeedPlans) > averagePlanSpeed(trickRoomSpeedPlans) &&
    standardSpeedPlans.map((plan) => plan.candidate.pokemon.slug).join(",") !==
      trickRoomSpeedPlans.map((plan) => plan.candidate.pokemon.slug).join(",") &&
    trickRoomSpeedPlans.every(
      (plan) =>
        plan.categoryReasons.speed.some((reason) => reason.includes("より遅く")) &&
        plan.metrics.popularMoveCoverageCount > 0
    ),
  "通常の高速案とトリルの低速・実戦改善案を切り替えられません"
);

const pageSource = readFileSync(path.resolve("app/page.tsx"), "utf8");
const inputSource = readFileSync(
  path.resolve("components/team/TeamInputPanel.tsx"),
  "utf8"
);
assert(
  pageSource.includes(`localStorage.setItem(TEAM_PROFILE_STORAGE_KEY, teamProfile)`) &&
    String(TEAM_PROFILE_STORAGE_KEY) !== String(TEAM_STORAGE_KEY) &&
    inputSource.includes("構築プロファイル") &&
    !inputSource.includes("この構築はトリックルームではありませんか"),
  "プロファイルUI・別キー保存・自動提案禁止の回帰を確認できません"
);

const formatTop = (items: typeof standardAdvisor.threats) =>
  items.map((item) => `${item.pokemon.nameJa}:${item.score}`).join(", ");
const formatPlans = (profile: TeamProfile, analysis: typeof standardAdvisor) =>
  analysis.simulation.plansByCategory.speed
    .map((plan) => `${plan.candidate.pokemon.nameJa}->${plan.action.removedLabel ?? "空き枠"}`)
    .join(", ") || `${TEAM_PROFILE_CONFIG[profile].speedCategoryLabel}:該当案なし`;

console.log("構築プロファイルテストに成功しました");
console.log(`通常の要警戒TOP5: ${formatTop(standardAdvisor.threats)}`);
console.log(`トリルの要警戒TOP5: ${formatTop(trickRoomAdvisor.threats)}`);
console.log(`通常の素早さ案: ${formatPlans("standard", standardAdvisor)}`);
console.log(`トリル適性案: ${formatPlans("trick-room", trickRoomAdvisor)}`);
console.log(`最速検証候補: ${fastestCandidate.nameJa} S${fastestCandidate.baseStats!.speed}`);
console.log(`最遅検証候補: ${slowestCandidate.nameJa} S${slowestCandidate.baseStats!.speed}`);
