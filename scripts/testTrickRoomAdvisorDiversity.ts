import {
  ADVISOR_CATEGORY_WEIGHTS,
  ADVISOR_TEAM_RULES,
  getAdvisorProfileSpeedRoleImprovement,
  getAdvisorRoleCounts,
  type AdvisorSwapPlan
} from "@/lib/advisorSwapSimulator";
import {
  getTrickRoomLowSpeedBonusMultiplier,
  TEAM_SPEED_THRESHOLDS,
  TRICK_ROOM_RECOMMENDATION_CONFIG
} from "@/lib/teamProfile";
import {
  analyzeAdvisorTeam,
  analyzeTrickRoomFixture,
  TRICK_ROOM_DIVERSITY_FIXTURES
} from "@/scripts/lib/trickRoomAdvisorHarness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isSlow(plan: AdvisorSwapPlan): boolean {
  return (
    (plan.candidate.pokemon.baseStats?.speed ?? Infinity) <=
    TEAM_SPEED_THRESHOLDS.slowMaximum
  );
}

assert(
  TRICK_ROOM_RECOMMENDATION_CONFIG.lowSpeedThreshold ===
      TEAM_SPEED_THRESHOLDS.slowMaximum &&
    TRICK_ROOM_RECOMMENDATION_CONFIG.fullBonusUntil === 0 &&
    TRICK_ROOM_RECOMMENDATION_CONFIG.reducedBonusUntil === 2 &&
    TRICK_ROOM_RECOMMENDATION_CONFIG.noBonusFrom === 4 &&
    TRICK_ROOM_RECOMMENDATION_CONFIG.maxSlowRoleRecommendations === 2,
  "トリックルーム推薦の閾値が一箇所へ集約されていません"
);
assert(
  [0, 1, 2, 3, 4, 5]
    .map(getTrickRoomLowSpeedBonusMultiplier)
    .join(",") === "1,0.65,0.3,0.1,0,0",
  "低速枠の充足度に応じた逓減率が不正です"
);
assert(
  getAdvisorProfileSpeedRoleImprovement(
    {
      physicalAttacker: 0,
      specialAttacker: 0,
      mixedAttacker: 0,
      physicalWall: 0,
      specialWall: 0,
      fast: 0,
      mediumSpeed: 0,
      slow: 0
    },
    {
      physicalAttacker: 0,
      specialAttacker: 0,
      mixedAttacker: 0,
      physicalWall: 0,
      specialWall: 0,
      fast: 0,
      mediumSpeed: 0,
      slow: 1
    },
    "trick-room"
  ) === 1 &&
    getAdvisorProfileSpeedRoleImprovement(
      {
        physicalAttacker: 0,
        specialAttacker: 0,
        mixedAttacker: 0,
        physicalWall: 0,
        specialWall: 0,
        fast: 0,
        mediumSpeed: 0,
        slow: 3
      },
      {
        physicalAttacker: 0,
        specialAttacker: 0,
        mixedAttacker: 0,
        physicalWall: 0,
        specialWall: 0,
        fast: 0,
        mediumSpeed: 0,
        slow: 4
      },
      "trick-room"
    ) === 0.1 &&
    getAdvisorProfileSpeedRoleImprovement(
      {
        physicalAttacker: 0,
        specialAttacker: 0,
        mixedAttacker: 0,
        physicalWall: 0,
        specialWall: 0,
        fast: 0,
        mediumSpeed: 0,
        slow: 4
      },
      {
        physicalAttacker: 0,
        specialAttacker: 0,
        mixedAttacker: 0,
        physicalWall: 0,
        specialWall: 0,
        fast: 0,
        mediumSpeed: 0,
        slow: 5
      },
      "trick-room"
    ) === 0,
  "低速枠0・3・4体時の速度役割加点が不正です"
);
assert(
  !("speedRoleImprovement" in ADVISOR_CATEGORY_WEIGHTS.defensive) &&
    !("speedRoleImprovement" in ADVISOR_CATEGORY_WEIGHTS.offensive) &&
    !("speedRoleImprovement" in ADVISOR_CATEGORY_WEIGHTS.typeSpecific),
  "耐久・攻撃・タイプ別へ低速役割の直接加点が混入しました"
);

const results = TRICK_ROOM_DIVERSITY_FIXTURES.map(
  analyzeTrickRoomFixture
);
for (const result of results) {
  const { fixture, simulation } = result;
  const original = JSON.stringify(result.team);
  const roleCounts = getAdvisorRoleCounts(result.team);
  assert(
    roleCounts.slow === fixture.expectedSlowCount,
    `${fixture.label}の低速枠数が${roleCounts.slow}体です`
  );
  assert(
    simulation.evaluatedPatternCount >=
      simulation.candidatePoolCount *
        (result.team.length < 6 ? result.team.length + 1 : result.team.length) &&
      simulation.recomputedThreatAnalysisCount ===
        simulation.evaluatedPatternCount,
    `${fixture.label}で全入れ替え案・入れ替え後TOP5を再計算していません`
  );
  assert(
    JSON.stringify(result.team) === original &&
      Object.values(simulation.plansByCategory)
        .flat()
        .every((plan) => JSON.stringify(plan.beforeTeam) === original),
    `${fixture.label}で元のパーティ配列を変更しました`
  );
  assert(
    Object.values(simulation.plansByCategory)
      .flat()
      .every(
        (plan) =>
          plan.metrics.megaLimitPassed &&
          plan.metrics.megaCountAfter <=
            ADVISOR_TEAM_RULES.recommendedMegaLimit
      ),
    `${fixture.label}で推奨メガ上限2体を超えました`
  );
  for (const [type, plans] of Object.entries(simulation.typePlans)) {
    if (!plans || plans.length < 4) continue;
    assert(
      plans.filter(isSlow).length <=
        TRICK_ROOM_RECOMMENDATION_CONFIG.maxSlowOutsideTrickRoomCategory,
      `${fixture.label}の${type}タイプ別候補が低速だけに偏りました`
    );
  }
  assert(
    simulation.plansByCategory.speed.every(
      (plan) =>
        plan.metrics.popularMoveCoverageCount > 0 ||
        plan.metrics.stableCheckCount > 0 ||
        plan.metrics.threatReduction > 0 ||
        plan.metrics.issueReduction > 0
    ),
    `${fixture.label}で遅いだけの候補をトリル適性へ表示しました`
  );
}

const slow0 = results.find((result) => result.fixture.id === "slow-0")!;
const slow2 = results.find((result) => result.fixture.id === "slow-2")!;
const slow3 = results.find((result) => result.fixture.id === "slow-3")!;
const slow4 = results.find((result) => result.fixture.id === "slow-4")!;

assert(
  slow0.simulation.plansByCategory.overall.some(
    (plan) => plan.profileRoles.includes("slowAttacker")
  ) &&
    slow0.simulation.plansByCategory.overall.filter(isSlow).length <= 2,
  "低速枠0体で有効な低速エースを評価できません"
);
assert(
  slow2.simulation.plansByCategory.overall.some(isSlow) &&
    slow2.simulation.plansByCategory.overall.some((plan) => !isSlow(plan)),
  "低速枠2体で低速候補と通常時の保険が混在しません"
);
assert(
  slow3.simulation.plansByCategory.overall.length >= 3 &&
    slow3.simulation.plansByCategory.overall.filter(isSlow).length <= 2 &&
    slow3.simulation.plansByCategory.defensive.some(
      (plan) => !isSlow(plan) && plan.profileRoles.includes("defensiveSupport")
    ),
  "低速枠3体で総合・耐久候補の偏りを解消できません"
);
const slow4PracticalPlans = [
  ...slow4.simulation.plansByCategory.overall,
  ...slow4.simulation.plansByCategory.defensive,
  ...slow4.simulation.plansByCategory.offensive
];
assert(
  slow4PracticalPlans
    .filter(isSlow)
    .every((plan) => plan.metrics.speedRoleImprovement <= 0) &&
    slow4.simulation.plansByCategory.overall.filter(isSlow).length <= 2 &&
    slow4.simulation.plansByCategory.defensive.some(
      (plan) =>
        (plan.candidate.pokemon.baseStats?.speed ?? 0) >=
          TEAM_SPEED_THRESHOLDS.mediumMinimum &&
        (plan.metrics.stableCheckCount > 0 ||
          plan.metrics.threatMoveResistanceCount > 0 ||
          plan.metrics.threatMoveImmunityCount > 0)
    ) &&
    slow4.simulation.plansByCategory.offensive.some(
      (plan) =>
        plan.profileRoles.includes("fastFallback") ||
        plan.profileRoles.includes("priorityUser") ||
        plan.profileRoles.includes("midSpeedFlexible")
    ),
  "低速枠4体以上で低速加点停止・中高速耐久補完・通常時保険を両立できません"
);

const priorityPlans = results.flatMap((result) =>
  Object.values(result.simulation.plansByCategory)
    .flat()
    .filter((plan) => plan.profileRoles.includes("priorityUser"))
);
assert(
  priorityPlans.length > 0 &&
    priorityPlans.every(
      (plan) =>
        plan.metrics.priorityMoveShare >=
          TRICK_ROOM_RECOMMENDATION_CONFIG.adoptedMoveMinimumShare &&
        Boolean(plan.metrics.priorityMoveName)
    ),
  "環境採用実績のない先制技を推薦役割へ使用しました"
);

const standardTeam = [
  "charizard",
  "garchomp",
  "rotom-wash",
  "corviknight",
  "clefable",
  "kingambit"
];
const standard = analyzeAdvisorTeam(standardTeam, "standard");
const standardSpeedPlans = standard.simulation.plansByCategory.speed;
assert(
  standardSpeedPlans.length > 0 &&
    standardSpeedPlans.every(
      (plan) =>
        plan.metrics.profileSpeedAdvantageCount > 0 ||
        plan.metrics.speedRoleImprovement > 0
    ) &&
    standardSpeedPlans.every((plan) =>
      plan.categoryReasons.speed.every(
        (reason) => !reason.includes("トリックルーム下")
      )
    ),
  "通常プロファイルの速度評価がトリックルーム向けに変化しました"
);

console.log("トリックルーム推薦多様性テストに成功しました");
for (const result of results) {
  const overall = result.simulation.plansByCategory.overall;
  console.log(
    `${result.fixture.label}: ${overall
      .map(
        (plan) =>
          `${plan.candidate.pokemon.nameJa}[${plan.profileRoles.join("+")}]`
      )
      .join(" / ")}（低速${overall.filter(isSlow).length}/${overall.length}）`
  );
}
