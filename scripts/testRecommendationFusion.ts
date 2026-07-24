import { readFileSync } from "node:fs";
import { RECOMMENDATION_FUSION_CONFIG } from "@/lib/recommendationFusionConfig";
import { runRecommendationFusion } from "@/scripts/lib/recommendationFusionHarness";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Result = ReturnType<typeof runRecommendationFusion>;

function weight(result: Result, percent: number) {
  const found = result.weightResults.find(
    (entry) => entry.weightPercent === percent
  );
  assert(found, `${percent}%のFusion結果がありません`);
  return found;
}

function candidate(
  result: Result,
  percent: number,
  slug: string
) {
  const found = weight(result, percent).ranking.find(
    (entry) => entry.slug === slug
  );
  assert(found, `${percent}%に${slug}がありません`);
  return found;
}

const first = runRecommendationFusion();
const second = runRecommendationFusion();

assert(
  JSON.stringify(first) === JSON.stringify(second),
  "同一入力でFusion結果が再現しません"
);
assert(
  first.metadata.mode === "shadow" &&
    first.metadata.normalization === "percentile-rank" &&
    first.metadata.formula.includes("RecommendationNormalized") &&
    first.metadata.formula.includes("BattleValueNormalized") &&
    first.metadata.tieBreak.includes("slug"),
  "Shadow Mode・正規化・式・決定的tie-breakが明示されていません"
);
assert(
  first.weights.join("|") === "0|5|10|15|20|25|30|40|50" &&
    first.weights.join("|") ===
      RECOMMENDATION_FUSION_CONFIG.weights
        .map((entry) => entry * 100)
        .join("|"),
  "標準Fusion Weightが不正です"
);
assert(
  first.candidateCount === 179 &&
    first.weightResults.every(
      (entry) =>
        entry.ranking.length === first.candidateCount &&
        new Set(entry.ranking.map((candidate) => candidate.slug)).size ===
          first.candidateCount
    ),
  "Fusion候補母集団または順位一覧が不正です"
);

const zero = weight(first, 0);
assert(
  zero.ranking.every(
    (entry, index) =>
      entry.recommendationReferenceRank === index + 1 &&
      entry.fusionRank === index + 1 &&
      entry.rankDeltaVsRecommendation === 0 &&
      entry.recommendationNormalized >= 0 &&
      entry.recommendationNormalized <= 100 &&
      entry.battleValueNormalized >= 0 &&
      entry.battleValueNormalized <= 100
  ),
  "0%がRecommendation順と一致しないか、正規化値が範囲外です"
);
for (const result of first.weightResults) {
  for (const entry of result.ranking) {
    const expected =
      entry.recommendationNormalized * (1 - result.weight) +
      entry.battleValueNormalized * result.weight;
    assert(
      Math.abs(entry.fusionScore - expected) < 0.00001,
      `${result.weightPercent}% ${entry.slug}のFusion式が不正です`
    );
    assert(
      entry.rankDeltaVsRecommendation ===
        entry.recommendationReferenceRank - entry.fusionRank &&
        entry.rankDifferenceVsBattleValue ===
          entry.battleValueRank - entry.fusionRank,
      `${result.weightPercent}% ${entry.slug}の順位差が不正です`
    );
  }
}

assert(
  first.safeZone.weights.join("|") === "10|15" &&
    first.safeZone.recommendedWeight === 15 &&
    first.dangerZone.weights.join("|") === "40|50",
  "Safe Zone・Danger Zone・推奨WeightのGoldenが変化しました"
);
assert(
  weight(first, 10).stability.averageRankMovement === 5.14 &&
    weight(first, 10).stability.top20ChangeRate === 0.15 &&
    weight(first, 10).stability.top50ChangeRate === 0.02 &&
    weight(first, 15).stability.top20RetentionRate === 0.8 &&
    weight(first, 40).zone === "danger",
  "Stability・TOP変化率のGoldenが変化しました"
);

const representativeSlugs = [
  "gengar-mega",
  "starmie-mega",
  "lucario-mega",
  "blaziken-mega",
  "mawile-mega",
  "kingambit",
  "dragapult",
  "volcarona",
  "jolteon",
  "sylveon"
];
assert(
  first.representatives.map((entry) => entry.slug).join("|") ===
    representativeSlugs.join("|"),
  "代表10体の比較が揃っていません"
);
assert(
  candidate(first, 0, "starmie-mega").fusionRank === 133 &&
    candidate(first, 15, "starmie-mega").fusionRank === 119 &&
    candidate(first, 50, "starmie-mega").fusionRank === 50 &&
    candidate(first, 0, "gengar-mega").fusionRank === 35 &&
    candidate(first, 15, "gengar-mega").fusionRank === 24 &&
    candidate(first, 0, "kingambit").fusionRank === 20 &&
    candidate(first, 15, "kingambit").fusionRank === 8 &&
    candidate(first, 0, "jolteon").fusionRank === 15 &&
    candidate(first, 50, "jolteon").fusionRank === 35,
  "代表候補のFusion順位Goldenが変化しました"
);

const protectionCategories = new Set(
  first.protectionMetrics.map((entry) => entry.category)
);
assert(
  protectionCategories.size === 5 &&
    first.protectionMetrics.length === first.weights.length * 5 &&
    first.protectionMetrics.every(
      (entry) =>
        entry.protectedRate >= 0 &&
        entry.protectedRate <= 1 &&
        entry.candidateCount >= 0
    ),
  "Recommendation保護カテゴリまたは保護率が不正です"
);
assert(
  first.sensitivity.mostAffected.length === 10 &&
    first.sensitivity.leastAffected.length === 10 &&
    first.sensitivity.mostAffected[0].absoluteRankMovement >=
      first.sensitivity.leastAffected[0].absoluteRankMovement,
  "Sensitivity集計が不正です"
);
assert(
  first.megaConstraintsPreserved &&
    first.recommendationUnchanged &&
    first.battleValueUnchanged &&
    first.semanticGapUnchanged,
  "TASK039制限またはRecommendation・Battle Value・Semantic Gapが変化しました"
);
for (const result of first.weightResults) {
  for (const mega of result.ranking.filter((entry) =>
    entry.slug.includes("-mega")
  )) {
    assert(
      mega.eligibility ===
        first.baseline.recommendationRanking.find(
          (entry) => entry.slug === mega.slug
        )?.eligibility,
      `${mega.slug}の推薦可否がFusionで変化しました`
    );
  }
}

assert(
  first.baseline.recommendationRanking
    .slice(0, 3)
    .map((entry) => entry.slug)
    .join("|") === "zoroark-hisui|hydreigon|sableye" &&
    first.baseline.battleValueRanking[0].slug === "scizor-mega" &&
    first.baseline.battleValueRanking[0].finalBattleValue === 59.3 &&
    candidate(first, 0, "starmie-mega").recommendationRank === 113,
  "RecommendationまたはBattle Value既存Goldenが変化しました"
);

const focused = runRecommendationFusion({
  candidateSlug: "starmie-mega",
  weights: [0, 0.125, 0.5],
  topLimit: 30
});
assert(
  focused.input.candidate === "starmie-mega" &&
    focused.weights.join("|") === "0|12.5|50" &&
    focused.weightResults.every(
      (entry) => entry.ranking.length === focused.candidateCount
    ),
  "--candidateまたは設定可能Weightが不正です"
);

const trickRoom = runRecommendationFusion({
  teamSlugs: ["dragonite", "garchomp", "gliscor"],
  regulation: "M-B",
  profile: "trick-room",
  topLimit: 20
});
assert(
  trickRoom.input.profile === "trick-room" &&
    trickRoom.input.regulation === "M-B" &&
    trickRoom.weights.join("|") === first.weights.join("|") &&
    trickRoom.megaConstraintsPreserved &&
    trickRoom.recommendationUnchanged &&
    trickRoom.battleValueUnchanged &&
    trickRoom.semanticGapUnchanged &&
    JSON.stringify(
      trickRoom.representatives.find((entry) => entry.slug === "kingambit")
        ?.trajectories
    ) !==
      JSON.stringify(
        first.representatives.find((entry) => entry.slug === "kingambit")
          ?.trajectories
      ),
  "trick-roomのFusion比較または不変条件が不正です"
);

for (const file of [
  "lib/recommendationAnalyzer.ts",
  "lib/semanticRecommendationGap.ts",
  "lib/battleValueEngine.ts",
  "lib/advisorSwapSimulator.ts",
  "lib/teamAdvisor.ts",
  "lib/threatSnapshot.ts"
]) {
  const source = readFileSync(file, "utf8");
  assert(
    !source.includes("recommendationFusion"),
    `${file}からShadow Simulatorへの逆依存があります`
  );
}

JSON.stringify(first);
console.log("TASK047 Recommendation Fusion Golden: PASS");
console.log(
  `Safe=${first.safeZone.weights.join(",")}% Recommended=${first.safeZone.recommendedWeight}% Danger=${first.dangerZone.weights.join(",")}%`
);
console.log(
  `standard 15% TOP20 change=${weight(first, 15).stability.top20ChangeRate * 100}% TOP50 change=${weight(first, 15).stability.top50ChangeRate * 100}%`
);
console.log(
  `trick-room Safe=${trickRoom.safeZone.weights.join(",") || "none"}% Danger=${trickRoom.dangerZone.weights.join(",") || "none"}%`
);
