import { readFileSync } from "node:fs";
import { CONTESTABILITY_CONFIG } from "@/lib/contestabilityConfig";
import { integrateBattleValueRecommendation } from "@/lib/recommendationBattleValueIntegration";
import { RECOMMENDATION_INTEGRATION_CONFIG } from "@/lib/recommendationIntegrationConfig";
import { buildRecommendationAnalyzerFixture } from "@/scripts/lib/recommendationAnalyzerHarness";
import { runRecommendationIntegration } from "@/scripts/lib/recommendationIntegrationHarness";
import { formatRankingRetentionAudit } from "@/scripts/lib/recommendationReleaseGate";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const team = [
  "garchomp",
  "hydreigon",
  "dragonite",
  "corviknight",
  "clefable"
];
const first = runRecommendationIntegration({
  teamSlugs: team,
  profile: "standard",
  topLimit: 100
});
const second = runRecommendationIntegration({
  teamSlugs: team,
  profile: "standard",
  topLimit: 100
});
assert(first.analysis && second.analysis, "Contestability結果がありません");
assert(
  JSON.stringify(first.analysis) === JSON.stringify(second.analysis),
  "Contestabilityが同一入力で再現しません"
);

const analysis = first.analysis;
assert(
  CONTESTABILITY_CONFIG.weight === 0.1 &&
    Math.abs(
      RECOMMENDATION_INTEGRATION_CONFIG.recommendationWeight +
        RECOMMENDATION_INTEGRATION_CONFIG.battleValueWeight +
        CONTESTABILITY_CONFIG.weight -
        1
    ) < 0.000001 &&
    Math.abs(
      Object.values(CONTESTABILITY_CONFIG.axisWeights).reduce(
        (total, value) => total + value,
        0
      ) - 1
    ) < 0.000001,
  "Recommendation・Battle Value・Contestabilityまたは4軸Weightが不正です"
);
assert(
  analysis.config.recommendationWeight === 0.75 &&
    analysis.config.battleValueWeight === 0.15 &&
    analysis.config.contestabilityWeight === 0.1 &&
    analysis.metadata.formula.includes("Contestability × 10%"),
  "Contestability 10%統合が明示されていません"
);
for (const candidate of analysis.candidates) {
  assert(
    candidate.contestability >= 0 &&
      candidate.contestability <= 100 &&
      Object.values(candidate.contestabilityAxes).every(
        (score) => score >= 0 && score <= 100
      ),
    `${candidate.slug}のContestabilityまたは4軸が0〜100の範囲外です`
  );
  assert(
    candidate.contestabilityReasons.every(
      (reason) => reason.text.length > 0
    ),
    `${candidate.slug}のContestability理由が不正です`
  );
}

function candidate(slug: string) {
  const found = analysis.candidates.find((entry) => entry.slug === slug);
  assert(found, `${slug}のContestability結果がありません`);
  return found;
}

const kingambit = candidate("kingambit");
const dragapult = candidate("dragapult");
const jolteon = candidate("jolteon");
for (const slug of [
  "starmie-mega",
  "gengar-mega",
  "kingambit",
  "dragapult",
  "jolteon",
  "sylveon"
]) {
  candidate(slug);
}
assert(
  kingambit.integratedRank <= jolteon.integratedRank,
  `CASE001: ドドゲザンがサンダース以上ではありません: ${kingambit.integratedRank} > ${jolteon.integratedRank}`
);
assert(
  dragapult.integratedRank <= 50,
  `CASE001: ドラパルトがTOP50外です: ${dragapult.integratedRank}位`
);
assert(
  jolteon.contestability < kingambit.contestability &&
    jolteon.contestability < dragapult.contestability,
  "サンダースがContestability以外の固定補正で抑制されています"
);
assert(
  kingambit.contestabilityReasons.length > 0 &&
    dragapult.contestabilityReasons.length > 0,
  "代表候補のContestability理由がありません"
);
assert(
  analysis.megaConstraintsPreserved,
  "TASK039のMega制限が変化しました"
);

const engineSource = readFileSync(
  "lib/contestabilityEngine.ts",
  "utf8"
);
const integrationSource = readFileSync(
  "lib/recommendationBattleValueIntegration.ts",
  "utf8"
) + readFileSync("lib/recommendationIntegrationRuntime.ts", "utf8");
const progressiveCardSource = readFileSync(
  "components/team/AdvisorNextCandidateCard.tsx",
  "utf8"
);
assert(
  [
    "選出しやすさ",
    "環境上位への対応",
    "現在のチームとの相性",
    "主要対面での動きやすさ",
    "仕事の安定性"
  ].every((label) => progressiveCardSource.includes(label)),
  "主推薦カードへContestability内訳を表示できません"
);
for (const forbidden of [
  "jolteon",
  "kingambit",
  "dragapult",
  "gengar-mega",
  "starmie-mega"
]) {
  assert(
    !engineSource.includes(forbidden),
    `Contestability Engineへポケモン名例外が含まれています: ${forbidden}`
  );
}

for (const forbidden of [
  "applyRecommendationRetentionGuard",
  "scoreSlots",
  "previousTop20",
  "previousTop50",
  "desiredOrder",
  "recommendationProtectionAdjustment",
  "protectedPlans"
]) {
  assert(
    !integrationSource.includes(forbidden),
    `本番Recommendationに順位保護処理が残っています: ${forbidden}`
  );
}

const fixture = buildRecommendationAnalyzerFixture({
  teamSlugs: team,
  profile: "standard",
  topLimit: 100
});
const integrationInput = {
  team: fixture.team,
  advisor: fixture.advisor,
  availablePokemon: fixture.analyzerInput.availablePokemon,
  environmentDataset: fixture.analyzerInput.environmentDataset,
  threatSnapshot: fixture.threatSnapshot,
  profile: fixture.analyzerInput.context.profile
};
const legacyRankPoisonedBaseline = {
  ...fixture.simulation,
  evaluatedPlans: fixture.simulation.evaluatedPlans.map((plan, index) => ({
    ...plan,
    preContestabilityRecommendation:
      fixture.simulation.evaluatedPlans.length - index
  }))
};
const regularIntegration = integrateBattleValueRecommendation({
  input: integrationInput,
  baseline: fixture.simulation,
  environmentSnapshot: fixture.analyzerInput.environmentSnapshot
});
const poisonedIntegration = integrateBattleValueRecommendation({
  input: integrationInput,
  baseline: legacyRankPoisonedBaseline,
  environmentSnapshot: fixture.analyzerInput.environmentSnapshot
});
assert(
  regularIntegration.analysis && poisonedIntegration.analysis,
  "旧順位非参照Goldenの統合結果がありません"
);
const resultSignature = (
  result: NonNullable<typeof regularIntegration.analysis>
) =>
  result.candidates.map((entry) => ({
    slug: entry.slug,
    contestability: entry.contestability,
    axes: entry.contestabilityAxes,
    reasons: entry.contestabilityReasons,
    finalRecommendation: entry.finalRecommendation
  }));
assert(
  JSON.stringify(resultSignature(regularIntegration.analysis)) ===
    JSON.stringify(resultSignature(poisonedIntegration.analysis)),
  "旧順位情報の変更でContestabilityまたはFinal Scoreが変化しました"
);
const bestPlanBySpecies = new Map<
  number,
  (typeof regularIntegration.simulation.evaluatedPlans)[number]
>();
for (const plan of regularIntegration.simulation.evaluatedPlans) {
  if (plan.action.kind === "form-change") continue;
  const speciesId = plan.candidate.pokemon.speciesId;
  const current = bestPlanBySpecies.get(speciesId);
  if (
    !current ||
    plan.finalRecommendation > current.finalRecommendation ||
    (plan.finalRecommendation === current.finalRecommendation &&
      plan.candidate.pokemon.slug.localeCompare(
        current.candidate.pokemon.slug
      ) < 0)
  ) {
    bestPlanBySpecies.set(speciesId, plan);
  }
}
const pureScoreRanks = new Map(
  [...bestPlanBySpecies.values()]
    .sort(
      (left, right) =>
        right.finalRecommendation - left.finalRecommendation ||
        left.candidate.pokemon.slug.localeCompare(
          right.candidate.pokemon.slug
        )
    )
    .map((plan, index) => [plan.candidate.pokemon.slug, index + 1])
);
for (const [index, entry] of regularIntegration.analysis.candidates.entries()) {
  const expectedFinal =
    entry.confidenceAdjustedRecommendation *
      regularIntegration.analysis.config.recommendationWeight +
    entry.battleValueNormalized *
      regularIntegration.analysis.config.battleValueWeight +
    entry.contestability *
      regularIntegration.analysis.config.contestabilityWeight;
  assert(
    Math.abs(entry.finalRecommendation - expectedFinal) <= 0.001,
    `${entry.slug}のFinal Scoreが統合式と一致しません`
  );
  assert(
    entry.integratedRank === pureScoreRanks.get(entry.slug),
    `${entry.slug}の順位とFinal Score順が一致しません`
  );
  const next = regularIntegration.analysis.candidates[index + 1];
  if (!next) continue;
  assert(
    entry.integratedRank < next.integratedRank &&
      (entry.finalRecommendation > next.finalRecommendation ||
        (entry.finalRecommendation === next.finalRecommendation &&
          entry.slug.localeCompare(next.slug) < 0)),
    `${entry.slug}と${next.slug}の順位がFinal Score降順ではありません`
  );
}

const trickRoom = runRecommendationIntegration({
  profile: "trick-room"
});
assert(trickRoom.analysis, "trick-roomのContestability結果がありません");
assert(
  trickRoom.analysis.megaConstraintsPreserved,
  "trick-roomでMega制限を維持できません"
);

console.log(
  `[ok] TASK050-FIX pure ranking audit: legacy-rank-independent=true final-score-order=true CASE001 kingambit=${kingambit.integratedRank} dragapult=${dragapult.integratedRank} jolteon=${jolteon.integratedRank}`
);
console.warn(
  formatRankingRetentionAudit({
    top20: analysis.top20RetentionRate,
    top50: analysis.top50RetentionRate
  })
);
console.warn(
  `[audit] trick-room\n${formatRankingRetentionAudit({
    top20: trickRoom.analysis.top20RetentionRate,
    top50: trickRoom.analysis.top50RetentionRate
  })}`
);
