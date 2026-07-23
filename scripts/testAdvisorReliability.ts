import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADVISOR_EVIDENCE_CAPS,
  scoreAdvisorEvidence,
  type AdvisorEvidence
} from "@/lib/advisorEvidence";
import {
  evaluateAdvisorAttackPressure
} from "@/lib/advisorMoveQuality";
import {
  ADVISOR_RECOMMENDATION_RULES
} from "@/lib/advisorSwapSimulator";
import { getPokemonBySlug } from "@/lib/typeChart";
import { analyzeAdvisorTeam } from "@/scripts/lib/trickRoomAdvisorHarness";
import type { ThreatEnvironmentMove } from "@/types/environmentThreat";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function evidence(
  id: string,
  primaryDimension: AdvisorEvidence["primaryDimension"],
  points: number
): AdvisorEvidence {
  return {
    id,
    kind: primaryDimension === "riskPenalty" ? "risk" : "counterplay",
    source: "threat-union",
    primaryDimension,
    points,
    displayText: id,
    confidence: "high"
  };
}

const evidenceScore = scoreAdvisorEvidence([
  evidence("same-ground-immunity", "defensiveImprovement", 8),
  evidence("same-ground-immunity", "defensiveImprovement", 7),
  evidence("same-loss", "riskPenalty", -14),
  evidence("same-loss", "riskPenalty", -9),
  ...Array.from({ length: 8 }, (_, index) =>
    evidence(`target-${index}`, "targetCounterplay", 15)
  )
]);
assert(
  evidenceScore.dimensionTotals.defensiveImprovement === 8,
  "同じ改善Evidenceを二重加点しました"
);
assert(
  evidenceScore.dimensionTotals.riskPenalty === -14,
  "同じ損失Evidenceを二重減点しました"
);
assert(
  evidenceScore.dimensionTotals.targetCounterplay ===
    ADVISOR_EVIDENCE_CAPS.targetCounterplay,
  "Evidenceカテゴリ上限を超えました"
);
assert(evidenceScore.overall <= 100, "総合スコアが100を超えました");
for (const [dimension, cap] of Object.entries(ADVISOR_EVIDENCE_CAPS)) {
  const scored = scoreAdvisorEvidence(
    Array.from({ length: 12 }, (_, index) =>
      evidence(
        `${dimension}-${index}`,
        dimension as AdvisorEvidence["primaryDimension"],
        dimension === "riskPenalty" ? -20 : 20
      )
    )
  );
  const total =
    scored.dimensionTotals[
      dimension as AdvisorEvidence["primaryDimension"]
    ];
  assert(
    dimension === "riskPenalty" ? total >= -cap : total <= cap,
    `${dimension}のEvidence上限を超えました`
  );
}

const charizard = getPokemonBySlug("charizard");
const scizor = getPokemonBySlug("scizor");
const greninja = getPokemonBySlug("greninja");
const raichu = getPokemonBySlug("raichu-mega-y");
assert(charizard && scizor && greninja && raichu, "攻撃圧力fixtureが不足しています");
const fireBlast: ThreatEnvironmentMove = {
  id: "fireblast",
  name: "だいもんじ",
  type: "fire",
  damageClass: "special",
  share: 0.7
};
const mudShot: ThreatEnvironmentMove = {
  id: "mudshot",
  name: "マッドショット",
  type: "ground",
  damageClass: "special",
  share: 0.14
};
const strongStabPressure = evaluateAdvisorAttackPressure({
  move: fireBlast,
  attacker: charizard,
  defender: scizor,
  typeMultiplier: 4
});
const weakCoveragePressure = evaluateAdvisorAttackPressure({
  move: mudShot,
  attacker: greninja,
  defender: raichu,
  typeMultiplier: 2
});
assert(
  strongStabPressure.normalizedPressure >
    weakCoveragePressure.normalizedPressure &&
    strongStabPressure.tier === "high" &&
    weakCoveragePressure.tier !== "high",
  "弱い非STAB技を強いSTAB技以上に評価しました"
);

const fixture = analyzeAdvisorTeam(
  ["charizard", "garchomp", "gliscor"],
  "standard"
);
const simulation = fixture.simulation;
assert(
  simulation.threatRecommendations.length === 5,
  "要警戒TOP5ごとの推薦グループを生成できません"
);
assert(
  simulation.threatTypeOptions.length === 18 &&
    new Set(simulation.threatTypeOptions.map((entry) => entry.type)).size ===
      18,
  "タイプ別探索へ全18タイプを提供できません"
);
for (const group of simulation.threatRecommendations) {
  assert(
    group.plansByMode.recommended.length <=
      ADVISOR_RECOMMENDATION_RULES.maxPerThreatMode &&
      group.plansByMode.stableSwitch.every((plan) =>
        plan.threatCoverage.threatAnswers.some(
          (answer) =>
            answer.threatId === group.threat.pokemon.slug &&
            answer.answerClass === "stableSwitch"
        )
      ) &&
      group.plansByMode.revengeKill.every((plan) =>
        plan.threatCoverage.threatAnswers.some(
          (answer) =>
            answer.threatId === group.threat.pokemon.slug &&
            answer.answerClass === "revengeKill"
        )
      ),
    `${group.threat.pokemon.nameJa}の探索モードと対策分類が一致しません`
  );
  for (const type of simulation.threatTypeOptions) {
    assert(
      (group.typePlans[type.type] ?? []).every((plan) =>
        plan.candidate.pokemon.types.includes(type.type)
      ),
      `${type.label}タイプ以外の候補がタイプ別探索へ混入しました`
    );
  }
  assert(
    group.plansByMode.recommended.every((plan) => {
      const answer = plan.threatCoverage.threatAnswers.find(
        (entry) => entry.threatId === group.threat.pokemon.slug
      );
      return (
        answer?.answerClass !== "coverageOnly" &&
        answer?.answerClass !== "notCounter"
      );
    }),
    "CoverageOnlyをおすすめ候補へ含めました"
  );
}
assert(
  simulation.formChangePlans.some(
    (plan) =>
      plan.action.kind === "form-change" &&
      plan.candidate.pokemon.speciesId === charizard.speciesId &&
      plan.candidate.pokemon.formKind === "mega"
  ),
  "通常リザードンからメガフォームへの改善案を分離表示できません"
);
assert(
  Object.values(simulation.plansByCategory)
    .flat()
    .every((plan) => plan.action.kind !== "form-change") &&
    simulation.threatRecommendations.every((group) =>
      [
        ...Object.values(group.plansByMode),
        ...Object.values(group.typePlans)
      ]
        .flat()
        .every((plan) => plan.action.kind !== "form-change")
    ),
  "フォーム変更案を通常候補・要警戒別候補へ混在させました"
);
assert(
  simulation.formChangePlans.every(
    (plan) => plan.metrics.megaLimitPassed
  ),
  "メガ枠上限を超えるフォーム変更案を表示しました"
);
assert(
  simulation.formChangePlans
    .filter((plan) => plan.candidate.pokemon.formKind === "mega")
    .every((plan) =>
      plan.evidence.some(
        (entry) => entry.id === "risk:mega-opportunity-cost"
      )
    ),
  "メガフォーム変更の機会コストをEvidenceへ含めていません"
);
assert(
  simulation.plans.some((plan) =>
    plan.evidence.some(
      (entry) => entry.id === "risk:post-swap-threat-summary"
    )
  ),
  "交換後に浮上した脅威をEvidenceとして減点できません"
);

const advisorUiSource = readFileSync(
  path.join(process.cwd(), "components/team/TeamAdvisorSection.tsx"),
  "utf8"
);
assert(
  advisorUiSource.includes("ほかの候補を探す") &&
    advisorUiSource.includes('value="stableSwitch"') &&
    advisorUiSource.includes('value="revengeKill"') &&
    advisorUiSource.includes('value="type"') &&
    advisorUiSource.includes("フォーム変更案"),
  "要警戒別探索またはフォーム変更のUI導線が不足しています"
);

console.log(
  `[ok] Advisor信頼性Golden fixture: Evidence重複排除、圧力=${strongStabPressure.normalizedPressure.toFixed(2)}/${weakCoveragePressure.normalizedPressure.toFixed(2)}、要警戒別=${simulation.threatRecommendations.length}、タイプ=${simulation.threatTypeOptions.length}、フォーム変更=${simulation.formChangePlans.length}、評価=${simulation.evaluatedPatternCount}通り`
);
