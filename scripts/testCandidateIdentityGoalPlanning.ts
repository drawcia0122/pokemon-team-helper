import { readFileSync } from "node:fs";
import { buildGoalBuilderFixture } from "@/scripts/lib/goalBuilderHarness";
import type {
  CandidateIdentity,
  GoalOrientedCandidatePlan,
  TeamBuilderGoal
} from "@/types/goalOrientedTeamBuilder";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function candidate(
  plans: GoalOrientedCandidatePlan[],
  slug: string
): GoalOrientedCandidatePlan {
  const plan = plans.find((entry) => entry.candidateSlug === slug);
  assert(plan, `${slug}のGoal Builder結果がありません`);
  return plan;
}

function assertIdentityGoal(
  plans: GoalOrientedCandidatePlan[],
  slug: string,
  identity: CandidateIdentity,
  goals: TeamBuilderGoal[]
): void {
  const plan = candidate(plans, slug);
  assert(
    plan.candidateIdentity.primary === identity,
    `${slug}のPrimary Identityが${identity}ではありません: ${plan.candidateIdentity.primary}`
  );
  assert(
    goals.includes(plan.selectedGoal.goal),
    `${slug}のGoalがIdentityと一致しません: ${plan.selectedGoal.goal}`
  );
  assert(
    plan.identityGoalCompatibility >= 70 &&
      plan.selectedGoal.candidateRole !== "conflict",
    `${slug}のIdentity–Goal適合が不足しています`
  );
}

const fixture = buildGoalBuilderFixture({
  teamSlugs: ["garchomp", "sylveon"],
  profile: "standard"
}).runtime.goalBuilder;

assert(
  fixture.metadata.schemaVersion === 2 &&
    fixture.metadata.planningPriority === "candidate-identity-first",
  "Candidate Identity優先metadataがありません"
);

const volcarona = candidate(fixture.candidates, "volcarona");
assert(
  volcarona.candidateIdentity.primary === "setup-sweeper",
  `ウルガモスのPrimary Identityが不正です: ${volcarona.candidateIdentity.primary}`
);
assert(
  (volcarona.candidateIdentity.semanticPresence.Setup ?? 0) > 0.5 &&
    (volcarona.candidateIdentity.semanticPresence.WinCondition ?? 0) > 0.5,
  "ウルガモスのSetup / WinCondition Presenceを検出できません"
);
assert(
  volcarona.candidateIdentity.evidence.some(
    (entry) =>
      entry.source === "semantic" &&
      entry.adoptionRate !== null &&
      entry.adoptionRate >= 0.5
  ),
  "ウルガモスのIdentityに採用率付きSemantic Evidenceがありません"
);
assert(
  volcarona.candidateIdentity.confidence === "high" &&
    volcarona.candidateIdentity.adoptionRate >= 0.5,
  "ウルガモスのIdentity confidenceまたは採用率が不足しています"
);
assert(
  volcarona.selectedGoal.goal !== "hazard-stack" &&
    volcarona.inferredGoals[0]?.goal !== "hazard-stack",
  "Setup SweeperをHazard Stackの中心として扱っています"
);
assert(
  ["hyper-offense", "bulky-offense", "balance"].includes(
    volcarona.selectedGoal.goal
  ) &&
    /積みエース|勝ち筋/.test(volcarona.selectedGoal.label) &&
    volcarona.selectedGoal.candidateRole === "primary",
  "ウルガモスを積みエース中心のGoalとして表示できません"
);
assert(
  volcarona.identityGoalCompatibility >= 90 &&
    volcarona.identityConflictPenalty === 0,
  "ウルガモスのIdentity–Goal適合が正しくありません"
);
assert(
  volcarona.nextCandidates.some(
    (entry) =>
      entry.identitySupport >= 18 &&
      entry.reasons.some((reason) =>
        /起点作成|妨害|苦手な相手|再展開|除去|圏内/.test(reason)
      )
  ),
  "積みエースを支える次候補と理由がありません"
);
for (const next of volcarona.nextCandidates.filter(
  (entry) => entry.primaryIdentity === "hazard-setter"
)) {
  assert(
    next.goalRole === "support" &&
      next.reasons.some((reason) => /積みエース|圏内/.test(reason)),
    "Hazard Setterを積みエースの補助役として説明できません"
  );
}
assert(
  volcarona.chain.length >= 2 &&
    volcarona.chain.every(
      (entry) =>
        Boolean(entry.primaryIdentity) &&
        Boolean(entry.goal) &&
        Boolean(entry.goalLabel) &&
        entry.goalCompatibility >= 0 &&
        entry.identitySupport >= 0
    ),
  "Candidate ChainでIdentity / Goal / 支援適合を再評価できません"
);

assertIdentityGoal(
  fixture.candidates,
  "glimmora",
  "hazard-setter",
  ["hazard-stack"]
);
assertIdentityGoal(
  fixture.candidates,
  "rotom-wash",
  "pivot",
  ["pivot-cycle", "balance", "bulky-offense"]
);
assertIdentityGoal(
  fixture.candidates,
  "pelipper",
  "weather-enabler",
  ["rain"]
);
assertIdentityGoal(
  fixture.candidates,
  "hippowdon",
  "weather-enabler",
  ["sand"]
);
assertIdentityGoal(
  fixture.candidates,
  "torkoal",
  "weather-enabler",
  ["sun"]
);
assertIdentityGoal(
  fixture.candidates,
  "reuniclus",
  "trick-room-enabler",
  ["trick-room"]
);
assertIdentityGoal(
  fixture.candidates,
  "corviknight",
  "defensive-anchor",
  ["balance", "stall", "bulky-offense"]
);

for (const plan of fixture.candidates) {
  const concreteScores = Object.entries(plan.candidateIdentity.scores).filter(
    ([identity]) => identity !== "hybrid"
  );
  const maximum = Math.max(...concreteScores.map(([, score]) => score));
  assert(
    Math.abs(plan.candidateIdentity.scores[plan.candidateIdentity.primary] - maximum) <=
      0.001,
    `${plan.candidateSlug}のPrimary Identityが最強Evidenceと一致しません`
  );
}

const productionSources = [
  "lib/candidateIdentity.ts",
  "lib/goalOrientedTeamBuilder.ts",
  "lib/goalOrientedTeamBuilderConfig.ts"
].map((path) => readFileSync(path, "utf8")).join("\n");
for (const forbidden of [
  "volcarona",
  "glimmora",
  "rotom-wash",
  "pelipper",
  "hippowdon",
  "torkoal",
  "reuniclus",
  "corviknight"
]) {
  assert(
    !productionSources.includes(forbidden),
    `本番Goal Builderにポケモン名固定処理があります: ${forbidden}`
  );
}

console.log("[ok] TASK056 Candidate Identity–First Goal Planning Golden");
