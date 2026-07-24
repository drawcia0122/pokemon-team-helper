import { readFileSync } from "node:fs";
import {
  buildAdvisorExplanationPresentation
} from "@/lib/advisorExplanation";
import type { AdvisorEvidence } from "@/lib/advisorEvidence";
import { getProgressiveTeamAdvisor } from "@/lib/progressiveTeamAdvisor";
import { MIN_THREAT_USAGE_RATE } from "@/lib/teamThreats";
import { getThreatSnapshotIds } from "@/lib/threatSnapshot";
import { analyzeAdvisorTeam } from "@/scripts/lib/trickRoomAdvisorHarness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameIds(left: string[], right: string[]): boolean {
  return left.join("|") === right.join("|");
}

function presentationTexts(presentation: ReturnType<
  typeof buildAdvisorExplanationPresentation
>): string[] {
  return [
    ...presentation.primaryReasons,
    ...presentation.otherImprovements,
    ...presentation.cautions
  ];
}

const situational = analyzeAdvisorTeam(
  ["dragonite", "garchomp", "gliscor"],
  "standard"
);
const displayedTop5Ids = getThreatSnapshotIds(
  situational.threatSnapshot.currentDisplayedTop5
);
const advisorTop5Ids = getThreatSnapshotIds(
  situational.advisor.threatSnapshot.currentDisplayedTop5
);
const explorerTop5Ids = situational.simulation.threatRecommendations.map(
  (group) => group.threat.pokemon.slug
);

assert(
  situational.advisor.threatSnapshot === situational.threatSnapshot &&
    situational.simulation.threatSnapshot === situational.threatSnapshot &&
    sameIds(displayedTop5Ids, advisorTop5Ids) &&
    sameIds(displayedTop5Ids, explorerTop5Ids) &&
    situational.simulation.additionPlans.every((plan) =>
      sameIds(
        displayedTop5Ids,
        getThreatSnapshotIds(plan.beforeThreats)
      )
    ),
  "Golden E: 画面TOP5・Advisor・Candidate Explorer・Swap Simulationが同じSnapshotを参照していません"
);

for (const plan of situational.simulation.additionPlans) {
  assert(
    sameIds(
      getThreatSnapshotIds(plan.afterThreats),
      getThreatSnapshotIds(
        plan.postActionThreatSnapshot.currentDisplayedTop5
      )
    ),
    "postActionTop5が追加後Snapshotと一致しません"
  );
  const unionIds = new Set([
    ...getThreatSnapshotIds(plan.beforeThreats),
    ...getThreatSnapshotIds(plan.afterThreats)
  ]);
  assert(
    plan.threatUnion.every((threat) =>
      unionIds.has(threat.pokemon.slug)
    ),
    "threatUnionへcurrentDisplayedTop5とpostActionTop5以外を混入しました"
  );
  for (const evidence of plan.evidence) {
    assert(
      [
        "selected-threat",
        "current-top5",
        "post-action-top5",
        "tracked-threat",
        "phase-specific",
        "team-general"
      ].includes(evidence.scope ?? "") &&
        Object.hasOwn(evidence, "targetThreatId") &&
        Object.hasOwn(evidence, "beforeRank") &&
        Object.hasOwn(evidence, "afterRank") &&
        Object.hasOwn(evidence, "beforeScore") &&
        Object.hasOwn(evidence, "afterScore") &&
        Object.hasOwn(evidence, "usageRate"),
      `Evidence Scopeまたは順位・使用率debug情報が不足しています: ${evidence.id}`
    );
  }
}

const situationalPresentations = situational.simulation.additionPlans.map(
  (plan) => ({
    plan,
    presentation: buildAdvisorExplanationPresentation({
      phase: "situationalCoverage",
      plan,
      mode: "overall"
    })
  })
);
for (const { plan, presentation } of situationalPresentations) {
  const primaryTargetIds = presentation.displayedEvidence
    .filter((evidence) =>
      presentation.primaryReasons.includes(evidence.displayText)
    )
    .flatMap((evidence) =>
      evidence.targetThreatId ? [evidence.targetThreatId] : []
    );
  assert(
    primaryTargetIds.every((threatId) =>
      displayedTop5Ids.includes(threatId)
    ),
    `Golden A: TOP5外ポケモンを${plan.candidate.pokemon.nameJa}の主要理由へ表示しました`
  );
  const sections = [
    presentation.primaryReasons,
    presentation.otherImprovements,
    presentation.cautions
  ];
  assert(
    sections.every(
      (section, index) =>
        section.every((text) =>
          sections.every(
            (other, otherIndex) =>
              otherIndex === index || !other.includes(text)
          )
        )
    ),
    "同じEvidenceを複数区分へ表示しました"
  );
}
assert(
  situationalPresentations.some(
    ({ presentation }) =>
      presentation.hasDirectThreatEvidence &&
      presentation.eligibleForPrimaryRecommendation
  ) &&
    situationalPresentations.every(
      ({ presentation }) =>
        !presentation.eligibleForPrimaryRecommendation ||
        presentation.hasDirectThreatEvidence ||
        presentation.label === "チーム全体の補完候補"
    ),
  "Golden I: situationalCoverageでcurrentDisplayedTop5を優先できません"
);

const trackedEvidence = situational.simulation.additionPlans.flatMap(
  (plan) => plan.evidence.filter((entry) => entry.scope === "tracked-threat")
);
assert(
  trackedEvidence.length > 0 &&
    situationalPresentations.every(({ presentation }) =>
      presentation.displayedEvidence.every(
        (entry) => entry.scope !== "tracked-threat"
      )
    ),
  "Golden F: trackedThreatを内部評価専用にできません"
);

const rankFour = situational.simulation.additionPlans
  .flatMap((plan) =>
    plan.evidence.map((evidence) => ({ plan, evidence }))
  )
  .find(
    ({ evidence }) =>
      evidence.id.startsWith("risk:post-action-top5:") &&
      evidence.afterRank === 4
  );
assert(rankFour, "Golden C用の実TOP5入りfixtureがありません");
const rankFourPresentation = buildAdvisorExplanationPresentation({
  phase: "situationalCoverage",
  plan: rankFour.plan,
  mode: "overall"
});
assert(
  rankFour.evidence.beforeRank !== null &&
    rankFour.evidence.beforeRank !== undefined &&
    rankFour.evidence.beforeRank > 5 &&
    rankFour.evidence.usageRate !== null &&
    rankFour.evidence.usageRate !== undefined &&
    rankFour.evidence.usageRate >= MIN_THREAT_USAGE_RATE &&
    rankFourPresentation.cautions.includes(
      rankFour.evidence.displayText
    ) &&
    rankFour.evidence.displayText.includes("要警戒4位へ入ります"),
  "Golden C: 実際に4位へ入る脅威を正しい順位で表示できません"
);

for (const { presentation } of situationalPresentations) {
  assert(
    presentation.cautions.every(
      (text) =>
        !text.includes("要警戒TOP5へ現れます") &&
        !text.includes("追跡対象")
    ) &&
      presentation.displayedEvidence
        .filter(
          (entry) =>
            entry.id.startsWith("risk:post-action-top5:") ||
            entry.id.startsWith("risk:threat-rank-rise:")
        )
        .every(
          (entry) =>
            entry.afterRank !== null &&
            entry.afterRank !== undefined &&
            entry.afterRank <= 5
        ),
    "Golden B: 6〜10位またはtrackedThreatをTOP5入りとして表示しました"
  );
}

const lowUsageEvidence: AdvisorEvidence = {
  id: "risk:post-action-top5:low-usage-fixture",
  kind: "risk",
  source: "threat-union",
  primaryDimension: "riskPenalty",
  points: 0,
  displayText: "追加後、低使用率fixtureが要警戒4位へ入ります。",
  confidence: "high",
  scope: "post-action-top5",
  targetThreatId: "low-usage-fixture",
  beforeRank: 9,
  afterRank: 4,
  beforeScore: 40,
  afterScore: 48,
  usageRate: MIN_THREAT_USAGE_RATE - 0.0001
};
const lowUsagePresentation = buildAdvisorExplanationPresentation({
  phase: "situationalCoverage",
  plan: rankFour.plan,
  mode: "overall",
  evidence: [...rankFour.plan.evidence, lowUsageEvidence]
});
assert(
  !lowUsagePresentation.cautions.includes(
    lowUsageEvidence.displayText
  ),
  "Golden D: 使用率0.1%未満をユーザー向け警告へ表示しました"
);

const partnerBase = analyzeAdvisorTeam(["floette-mega"], "standard");
const partner = getProgressiveTeamAdvisor({
  team: partnerBase.team,
  advisor: partnerBase.advisor,
  simulation: partnerBase.simulation,
  availablePokemon: partnerBase.availablePokemon,
  environmentDataset: partnerBase.environmentDataset,
  profile: "standard"
});
assert(
  partner.candidatesByMode.overall.length > 0 &&
    partner.candidatesByMode.overall.every(
      (candidate) =>
        candidate.explanationsByMode.overall
          .eligibleForPrimaryRecommendation
    ),
  "Golden G: partnerでTOP5直接理由を必須にしました"
);

const coreBase = analyzeAdvisorTeam(
  ["dragonite", "garchomp"],
  "standard"
);
const core = getProgressiveTeamAdvisor({
  team: coreBase.team,
  advisor: coreBase.advisor,
  simulation: coreBase.simulation,
  availablePokemon: coreBase.availablePokemon,
  environmentDataset: coreBase.environmentDataset,
  profile: "standard"
});
const coreWithIssueEvidence = core.candidatesByMode.overall.find(
  (candidate) =>
    candidate.explanationsByMode.overall.displayedEvidence.some(
      (evidence) =>
        evidence.primaryDimension === "teamIssueImprovement"
    )
);
assert(
  coreWithIssueEvidence &&
    coreWithIssueEvidence.explanationsByMode.overall
      .displayedEvidence[0]?.primaryDimension ===
      "teamIssueImprovement",
  "Golden H: coreCompletionで共通課題改善を最優先できません"
);

const complete = analyzeAdvisorTeam(
  [
    "charizard",
    "rotom-wash",
    "garchomp",
    "empoleon",
    "gardevoir",
    "corviknight"
  ],
  "standard"
);
for (const group of complete.simulation.threatRecommendations) {
  for (const plan of group.plansByMode.recommended) {
    const presentation = buildAdvisorExplanationPresentation({
      phase: "completeOptimization",
      plan,
      mode: "overall",
      selectedThreatId: group.threat.pokemon.slug
    });
    assert(
      presentation.eligibleForPrimaryRecommendation &&
        presentation.hasDirectThreatEvidence &&
        presentation.displayedEvidence[0]?.scope === "selected-threat" &&
        presentation.displayedEvidence[0]?.targetThreatId ===
          group.threat.pokemon.slug,
      "Golden J: completeOptimizationでselected-threat直接Evidenceを最優先できません"
    );
  }
}

const trickRoom = analyzeAdvisorTeam(
  ["dragonite", "garchomp", "gliscor"],
  "trick-room"
);
assert(
  sameIds(
    getThreatSnapshotIds(trickRoom.threats),
    trickRoom.simulation.threatRecommendations.map(
      (group) => group.threat.pokemon.slug
    )
  ) &&
    sameIds(
      getThreatSnapshotIds(situational.threats),
      explorerTop5Ids
    ),
  "Golden K: 通常・トリックルームで画面TOP5とAdvisor TOP5が一致しません"
);

const publishedPlans = [
  ...situational.simulation.additionPlans,
  ...complete.simulation.plans,
  ...complete.simulation.formChangePlans,
  ...complete.simulation.threatRecommendations.flatMap((group) =>
    Object.values(group.plansByMode).flat()
  )
];
assert(
  publishedPlans.every(
    (plan) =>
      plan.metrics.megaLimitPassed &&
      plan.metrics.megaRecommendationPassed
  ),
  "Golden L: TASK039のメガ段階制御を維持できません"
);

const scoreBeforeExplanation = rankFour.plan.improvementScore;
const evidenceBeforeExplanation = JSON.stringify(rankFour.plan.evidence);
buildAdvisorExplanationPresentation({
  phase: "situationalCoverage",
  plan: rankFour.plan,
  mode: "overall"
});
assert(
  rankFour.plan.improvementScore === scoreBeforeExplanation &&
    JSON.stringify(rankFour.plan.evidence) === evidenceBeforeExplanation &&
    lowUsagePresentation.displayedEvidence.length > 0 &&
    lowUsagePresentation.hiddenEvidence.length > 0,
  "Explanation BuilderまたはPresentationがRecommendation Score・Evidenceを書き換えました"
);

const pageSource = readFileSync(
  new URL("../app/page.tsx", import.meta.url),
  "utf8"
);
const sectionSource = readFileSync(
  new URL(
    "../components/team/TeamAdvisorSection.tsx",
    import.meta.url
  ),
  "utf8"
);
const candidateSource = readFileSync(
  new URL(
    "../components/team/AdvisorNextCandidateCard.tsx",
    import.meta.url
  ),
  "utf8"
);
assert(
  pageSource.includes("getThreatSnapshot") &&
    pageSource.includes("threatSnapshot.currentDisplayedTop5") &&
    sectionSource.includes("buildAdvisorExplanationPresentation") &&
    sectionSource.includes("その他の改善") &&
    candidateSource.includes("おすすめ理由") &&
    candidateSource.includes("その他の改善") &&
    candidateSource.includes("注意点"),
  "Threat Snapshotまたは3区分PresentationのUI統合が不足しています"
);

console.log(
  `[ok] TASK040 Golden A-L: currentTop5=${displayedTop5Ids.join(",")}, tracked=${situational.threatSnapshot.trackedThreats.length}, rank4=${rankFour.evidence.displayText}, partner=${partner.candidatesByMode.overall.length}, core=${core.candidatesByMode.overall.length}, complete=${complete.simulation.threatRecommendations.length}`
);
