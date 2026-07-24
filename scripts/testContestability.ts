import { readFileSync } from "node:fs";
import { CONTESTABILITY_CONFIG } from "@/lib/contestabilityConfig";
import { runRecommendationIntegration } from "@/scripts/lib/recommendationIntegrationHarness";

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
      Object.values(CONTESTABILITY_CONFIG.axisWeights).reduce(
        (total, value) => total + value,
        0
      ) - 1
    ) < 0.000001,
  "Contestability Weightまたは4軸Weightが不正です"
);
assert(
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
  analysis.top20RetentionRate >= 0.8 &&
    analysis.top50RetentionRate >= 0.9,
  `Recommendation保護率が不足しています: TOP20=${analysis.top20RetentionRate} TOP50=${analysis.top50RetentionRate}`
);
assert(
  analysis.megaConstraintsPreserved,
  "TASK039のMega制限が変化しました"
);

const engineSource = readFileSync(
  "lib/contestabilityEngine.ts",
  "utf8"
);
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

const trickRoom = runRecommendationIntegration({
  profile: "trick-room"
});
assert(
  trickRoom.analysis &&
    trickRoom.analysis.top20RetentionRate >= 0.8 &&
    trickRoom.analysis.top50RetentionRate >= 0.9 &&
    trickRoom.analysis.megaConstraintsPreserved,
  "trick-roomでRecommendation保護率またはMega制限を維持できません"
);

console.log(
  `[ok] TASK050 Contestability: CASE001 kingambit=${kingambit.integratedRank} dragapult=${dragapult.integratedRank} jolteon=${jolteon.integratedRank} TOP20=${analysis.top20RetentionRate} TOP50=${analysis.top50RetentionRate}`
);
