import { readFileSync } from "node:fs";
import path from "node:path";
import pokemonData from "@/data/pokemon.json";
import { getThreatEnvironmentCatalog } from "@/lib/environmentData.server";
import { findThreatEnvironmentDataset } from "@/lib/environmentThreatData";
import { getAvailablePokemonBySeason } from "@/lib/regulations";
import {
  getAdvisorCompatibleThreatAnalysis,
  getThreatPokemonAnalysis,
  isThreatPokemonCandidate,
  MIN_THREAT_USAGE_RATE,
  POPULAR_MOVE_MIN_SHARE,
  scoreThreatUsageRate,
  THREAT_USAGE_SCORE_CURVE,
  THREAT_WEIGHTS
} from "@/lib/teamThreats";
import { summarizeTeam } from "@/lib/typeChart";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function slot(id: string, pokemonSlug: string): TeamSlot {
  return { id, mode: "pokemon", pokemonSlug };
}

function analyze(
  team: TeamSlot[],
  available = seasonPokemon,
  environment = environmentDataset
) {
  return getThreatPokemonAnalysis(
    team,
    summarizeTeam(team),
    available,
    environment
  );
}

function analyzeAdvisorCompatible(
  team: TeamSlot[],
  available = seasonPokemon,
  environment = environmentDataset
) {
  return getAdvisorCompatibleThreatAnalysis(
    team,
    summarizeTeam(team),
    available,
    environment
  );
}

const allPokemon = pokemonData as PokemonEntry[];
const seasonPokemon = getAvailablePokemonBySeason("season-m4");
const environmentCatalog = getThreatEnvironmentCatalog();
const environmentDataset = findThreatEnvironmentDataset(
  environmentCatalog,
  "M-B"
);
assert(environmentDataset, "M-Bの要警戒診断用環境snapshotがありません");

const expectedUsagePoints = [
  [0.001, 0],
  [0.003, 2],
  [0.005, 4],
  [0.01, 7],
  [0.03, 11],
  [0.05, 14],
  [0.1, 18],
  [0.2, 20],
  [0.5, 20]
] as const;
assert(
  expectedUsagePoints.every(
    ([usageRate, expected]) =>
      scoreThreatUsageRate(usageRate) === expected
  ),
  `使用率スコアの実測値が不正です: ${JSON.stringify(
    expectedUsagePoints.map(([usageRate]) => [
      usageRate,
      scoreThreatUsageRate(usageRate)
    ])
  )}`
);
let previousUsagePoints = -1;
for (let basisPoints = 10; basisPoints <= 3000; basisPoints += 1) {
  const usageRate = basisPoints / 10000;
  const points = scoreThreatUsageRate(usageRate);
  assert(
    points >= previousUsagePoints,
    `使用率スコアが単調増加ではありません: ${usageRate}`
  );
  previousUsagePoints = points;
}
assert(
  THREAT_USAGE_SCORE_CURVE.length === 8 &&
    scoreThreatUsageRate(undefined) === 0 &&
    scoreThreatUsageRate(0.00099) === 0 &&
    scoreThreatUsageRate(1) === THREAT_WEIGHTS.usage,
  "使用率不明・0.1%未満・20%以上のスコア境界が不正です"
);
const seasonThreatCandidates = seasonPokemon.filter(isThreatPokemonCandidate);
const environmentBySlug = new Map(
  environmentDataset.pokemon.map((entry) => [entry.slug, entry])
);
const usageEligibleThreatCandidates = seasonThreatCandidates.filter(
  (pokemon) =>
    (environmentBySlug.get(pokemon.slug)?.usageRate ?? -1) >=
    MIN_THREAT_USAGE_RATE
);
const inheritedMegaCandidates = seasonThreatCandidates.filter(
  (pokemon) => pokemon.formKind === "mega"
);
const usageEligibleMegaCandidates = usageEligibleThreatCandidates.filter(
  (pokemon) => pokemon.formKind === "mega"
);

assert(
  inheritedMegaCandidates.length === 78,
  `M-Bの継承メガ候補数が不正です: ${inheritedMegaCandidates.length}`
);
assert(
  ["charizard", "charizard-mega-x", "charizard-mega-y"].every((slug) =>
    seasonThreatCandidates.some((pokemon) => pokemon.slug === slug)
  ),
  "リザードの通常・メガX・メガYをすべて評価対象にできません"
);
assert(
  ["mewtwo", "mewtwo-mega-x", "mewtwo-mega-y"].every(
    (slug) => !seasonThreatCandidates.some((pokemon) => pokemon.slug === slug)
  ),
  "使用不可のミュウツーspeciesからメガ候補が混入しました"
);

assert(analyze([]).length === 0, "空パーティで警戒候補を表示しました");

const one = analyze([slot("slot-1", "charizard")]);
assert(
  one.length === 5 &&
    one.every(
      (threat) =>
        threat.reasons.length >= 1 &&
        threat.reasons.length <= 4 &&
        threat.score >= 0 &&
        threat.score <= 100 &&
        threat.metrics.environmentPoints ===
          threat.metrics.usagePoints +
            threat.metrics.popularMovePoints +
            threat.metrics.popularSetPoints &&
        threat.score ===
          Math.min(
            100,
            threat.metrics.baseMatchupPoints +
              threat.metrics.environmentPoints
          )
    ),
  "1体パーティの候補数・理由数・スコア内訳が不正です"
);

const iceWeakTeam = [
  slot("slot-1", "dragonite"),
  slot("slot-2", "garchomp"),
  slot("slot-3", "gliscor")
];
const iceThreats = analyze(iceWeakTeam);
const megaFroslassThreat = iceThreats.find(
  (threat) => threat.pokemon.slug === "froslass-mega"
);
assert(
  iceThreats.some(
    (threat) =>
      threat.pokemon.types.includes("ice") &&
      threat.reasons.some((reason) => reason.includes("こおりが一貫"))
  ),
  "カイリュー・ガブリアス・グライオンに氷タイプが上位表示されません"
);
assert(
  megaFroslassThreat?.pokemon.types.join(",") === "ice,ghost" &&
    megaFroslassThreat.pokemon.baseStats?.specialAttack === 140 &&
    megaFroslassThreat.pokemon.baseStats.speed === 120 &&
    megaFroslassThreat.environment?.usageRank === 107 &&
    megaFroslassThreat.environment.offenseProfile.specialShare > 0.98 &&
    megaFroslassThreat.environment.topAbility?.name === "ゆきふらし" &&
    megaFroslassThreat.metrics.dominantDamageClass === "special" &&
    megaFroslassThreat.metrics.popularMovePoints > 0 &&
    megaFroslassThreat.reasons.some((reason) =>
      reason.includes("こおりが一貫")
    ) &&
    megaFroslassThreat.reasons.some(
      (reason) => reason.includes("採用率100%のふぶき")
    ),
  "氷が一貫する例でメガユキメノコの環境統計・採用技を評価できません"
);
assert(
  megaFroslassThreat.environment.usageRate < 0.01 &&
    iceThreats.indexOf(megaFroslassThreat) < 5,
  "使用率が低くても極端に刺さる候補を残せません"
);

const charizardForms = seasonThreatCandidates.filter(
  (pokemon) => pokemon.speciesId === 6
);
const usageEligibleCharizardForms = charizardForms.filter(
  (pokemon) =>
    (environmentBySlug.get(pokemon.slug)?.usageRate ?? -1) >=
    MIN_THREAT_USAGE_RATE
);
const charizardFormScores = usageEligibleCharizardForms.map((pokemon) => ({
  pokemon,
  result: analyze(iceWeakTeam, [pokemon])[0]
}));
const groupedCharizardThreat = analyze(iceWeakTeam, charizardForms)[0];
const highestCharizardScore = Math.max(
  ...charizardFormScores.map(({ result }) => result?.score ?? -1)
);
assert(
  charizardFormScores.length === 2 &&
    !usageEligibleCharizardForms.some(
      (pokemon) => pokemon.slug === "charizard"
    ) &&
    ["charizard-mega-x", "charizard-mega-y"].every((slug) =>
      usageEligibleCharizardForms.some((pokemon) => pokemon.slug === slug)
    ) &&
    charizardFormScores.every(({ result }) => result) &&
    groupedCharizardThreat?.score === highestCharizardScore &&
    new Set(
      analyze(iceWeakTeam, [...charizardForms, ...charizardForms]).map(
        (threat) => threat.pokemon.speciesId
      )
    ).size === 1,
  "使用率基準通過後のメガX・メガYを個別評価し、species内の最高スコア1フォームへ集約できません"
);

function environmentEntry(
  slug: string,
  usageRate: number,
  usageRank: number
): ThreatEnvironmentPokemon {
  return {
    slug,
    usageRank,
    usageRate,
    offenseProfile: {
      physicalShare: 0,
      specialShare: 0,
      neutralShare: 1
    },
    moves: [],
    abilities: [],
    teammates: [],
    checksAndCounters: []
  };
}

const boundaryPokemon = ["charizard", "garchomp", "venusaur"].map(
  (slug) => seasonThreatCandidates.find((pokemon) => pokemon.slug === slug)!
);
assert(
  boundaryPokemon.every(Boolean),
  "境界値テストに必要な使用可能ポケモンがありません"
);
const boundaryDataset: ThreatEnvironmentDataset = {
  ...environmentDataset,
  snapshotId: "usage-boundary-test",
  pokemon: [
    environmentEntry("charizard", 0.001, 1),
    environmentEntry("garchomp", 0.00099, 2)
  ]
};
const boundaryThreats = analyze(
  iceWeakTeam,
  boundaryPokemon,
  boundaryDataset
);
assert(
  boundaryThreats.length === 1 &&
    boundaryThreats[0].pokemon.slug === "charizard" &&
    boundaryThreats[0].environment?.usageRate === 0.001 &&
    boundaryThreats[0].metrics.usagePoints === 0,
  "使用率0.1%ちょうどを含め、0.099%と使用率不明を除外できません"
);

const charizardThreats = analyze([slot("slot-1", "charizard")]);
assert(
  charizardThreats.some((threat) =>
    threat.pokemon.types.some((type) => type === "rock" || type === "electric")
  ),
  "リザードンに岩・電気の警戒候補が上位表示されません"
);

const rotomThreats = analyze([slot("slot-1", "rotom")]);
assert(
  !rotomThreats.some((threat) => threat.pokemon.slug === "venusaur"),
  "ロトムに対し、抜群も一貫もない草候補が不自然に上位表示されました"
);

const sixTeam = [
  ...iceWeakTeam,
  slot("slot-4", "charizard"),
  slot("slot-5", "rotom-wash"),
  slot("slot-6", "corviknight")
];
const six = analyze(sixTeam);
assert(
  six.length === 5 &&
    six.every(
      (threat, index) =>
        index === 0 ||
        six[index - 1].score > threat.score ||
        (six[index - 1].score === threat.score &&
          six[index - 1].pokemon.speciesId <= threat.pokemon.speciesId)
    ),
  "6体パーティのスコア降順・同点図鑑番号順が不正です"
);
assert(
  six.every(
    (threat) =>
      threat.environment !== null &&
      threat.environment.usageRate >= MIN_THREAT_USAGE_RATE
  ),
  "使用率0.1%未満または使用率不明の候補がTOP5へ混入しました"
);
assert(
  new Set(six.map((threat) => threat.pokemon.speciesId)).size === six.length,
  "同一speciesのフォームが警戒上位を重複占有しました"
);

const normalFormThreats = analyze([slot("slot-1", "charizard")]);
const megaFormThreats = analyze([slot("slot-1", "charizard-mega-x")]);
assert(
  JSON.stringify(normalFormThreats.map((threat) => [threat.pokemon.slug, threat.score])) !==
    JSON.stringify(megaFormThreats.map((threat) => [threat.pokemon.slug, threat.score])),
  "メガ切り替え後のタイプ・種族値を警戒候補へ反映できません"
);

const charizardMegaX = seasonThreatCandidates.find(
  (pokemon) => pokemon.slug === "charizard-mega-x"
);
assert(charizardMegaX, "メガ自身の使用率検証用リザードンXがいません");
const baseUsageOnlyDataset: ThreatEnvironmentDataset = {
  ...environmentDataset,
  snapshotId: "mega-base-usage-only",
  pokemon: [environmentEntry("charizard", 0.2, 1)]
};
const ownMegaUsageDataset: ThreatEnvironmentDataset = {
  ...baseUsageOnlyDataset,
  snapshotId: "mega-own-usage",
  pokemon: [
    environmentEntry("charizard", 0.2, 1),
    environmentEntry("charizard-mega-x", 0.001, 2)
  ]
};
assert(
  analyze(iceWeakTeam, [charizardMegaX], baseUsageOnlyDataset).length === 0 &&
    analyze(iceWeakTeam, [charizardMegaX], ownMegaUsageDataset)[0]?.metrics
      .usagePoints === 0,
  "通常フォームの使用率をメガへ継承しました"
);

const equivalentSource = allPokemon.find(
  (pokemon) => pokemon.slug === "froslass-mega"
);
assert(equivalentSource, "使用率だけが異なる比較候補を作成できません");
const lowUsageEquivalent: PokemonEntry = {
  ...equivalentSource,
  id: 900001,
  speciesId: 900001,
  slug: "test-low-usage-equivalent",
  nameJa: "低使用率検証候補"
};
const highUsageEquivalent: PokemonEntry = {
  ...equivalentSource,
  id: 900002,
  speciesId: 900002,
  slug: "test-high-usage-equivalent",
  nameJa: "高使用率検証候補"
};
const equivalentUsageDataset: ThreatEnvironmentDataset = {
  ...environmentDataset,
  snapshotId: "equivalent-usage-test",
  pokemon: [
    environmentEntry(lowUsageEquivalent.slug, 0.005, 2),
    environmentEntry(highUsageEquivalent.slug, 0.05, 1)
  ]
};
const equivalentUsageThreats = analyze(
  iceWeakTeam,
  [lowUsageEquivalent, highUsageEquivalent],
  equivalentUsageDataset
);
assert(
  equivalentUsageThreats.length === 2 &&
    equivalentUsageThreats[0].pokemon.slug === highUsageEquivalent.slug &&
    equivalentUsageThreats[0].metrics.baseMatchupPoints ===
      equivalentUsageThreats[1].metrics.baseMatchupPoints &&
    equivalentUsageThreats[0].metrics.usagePoints === 14 &&
    equivalentUsageThreats[1].metrics.usagePoints === 4,
  "同じ相性根拠の候補で使用率の非線形補正を反映できません"
);

const extremeLowUsageSlugs = [
  "froslass-mega",
  "weavile",
  "ninetales-alola",
  "mamoswine",
  "vanilluxe"
];
const extremeLowUsagePool = [
  ...extremeLowUsageSlugs.map(
    (slug) => allPokemon.find((pokemon) => pokemon.slug === slug)!
  ),
  allPokemon.find((pokemon) => pokemon.slug === "blissey")!
];
assert(
  extremeLowUsagePool.every(Boolean),
  "低使用率の極端相性・高使用率の無関係候補がいません"
);
const matchupPriorityDataset: ThreatEnvironmentDataset = {
  ...environmentDataset,
  snapshotId: "matchup-priority-test",
  pokemon: [
    ...extremeLowUsageSlugs.map((slug, index) =>
      environmentEntry(slug, 0.001, index + 2)
    ),
    environmentEntry("blissey", 0.2, 1)
  ]
};
const matchupPriorityThreats = analyze(
  iceWeakTeam,
  extremeLowUsagePool,
  matchupPriorityDataset
);
assert(
  matchupPriorityThreats.length === 5 &&
    matchupPriorityThreats.some(
      (threat) => threat.pokemon.slug === "froslass-mega"
    ) &&
    !matchupPriorityThreats.some(
      (threat) => threat.pokemon.slug === "blissey"
    ),
  "使用率だけで無関係な候補をTOP5へ上げたか、低使用率の極端相性候補を消しました"
);

const legacyTopFive = {
  ice: [
    "froslass-mega",
    "weavile",
    "ninetales-alola",
    "mamoswine",
    "vanilluxe"
  ],
  charizard: [
    "aerodactyl-mega",
    "raichu-mega-y",
    "starmie-mega",
    "greninja-mega",
    "glimmora"
  ],
  rotom: [
    "garchomp",
    "gengar-mega",
    "meowscarada",
    "swampert-mega",
    "weavile"
  ],
  balanced: [
    "raichu-mega-y",
    "swampert-mega",
    "jolteon",
    "heliolisk",
    "rotom-mow"
  ]
} as const;
const balancedComparisonTeam = [
  slot("slot-1", "charizard"),
  slot("slot-2", "rotom-wash"),
  slot("slot-3", "garchomp"),
  slot("slot-4", "empoleon"),
  slot("slot-5", "gardevoir"),
  slot("slot-6", "corviknight")
];
const currentComparison = {
  ice: iceThreats,
  charizard: charizardThreats,
  rotom: rotomThreats,
  balanced: analyze(balancedComparisonTeam)
};
const advisorCompatibleComparison = {
  ice: analyzeAdvisorCompatible(iceWeakTeam),
  charizard: analyzeAdvisorCompatible([slot("slot-1", "charizard")]),
  rotom: analyzeAdvisorCompatible([slot("slot-1", "rotom")]),
  balanced: analyzeAdvisorCompatible(balancedComparisonTeam)
};
const advisorCompatibleSlugs = Object.fromEntries(
  Object.entries(advisorCompatibleComparison).map(([key, threats]) => [
    key,
    threats.map((threat) => threat.pokemon.slug)
  ])
);
const currentComparisonSlugs = Object.fromEntries(
  Object.entries(currentComparison).map(([key, threats]) => [
    key,
    threats.map((threat) => threat.pokemon.slug)
  ])
);
const advisorCompatibleFroslass = advisorCompatibleComparison.ice.find(
  (threat) => threat.pokemon.slug === "froslass-mega"
);
assert(
  JSON.stringify(advisorCompatibleSlugs) === JSON.stringify(legacyTopFive) &&
    advisorCompatibleFroslass?.score === 86 &&
    advisorCompatibleFroslass.metrics.usagePoints === 1,
  "TASK031の再調整がチームアドバイザー用の従来脅威評価へ波及しました"
);
const legacyComparisonSlugs = Object.values(legacyTopFive).flat();
const currentComparisonThreats = Object.values(currentComparison).flat();
const countLegacyUsageBand = (minimum: number, maximum: number) =>
  legacyComparisonSlugs.filter((slug) => {
    const usageRate = environmentBySlug.get(slug)?.usageRate;
    return (
      typeof usageRate === "number" &&
      usageRate >= minimum &&
      usageRate < maximum
    );
  }).length;
const countCurrentUsageBand = (minimum: number, maximum: number) =>
  currentComparisonThreats.filter((threat) => {
    const usageRate = threat.environment?.usageRate;
    return (
      typeof usageRate === "number" &&
      usageRate >= minimum &&
      usageRate < maximum
    );
  }).length;
const legacyLowUsageCount = countLegacyUsageBand(0.001, 0.01);
const currentLowUsageCount = countCurrentUsageBand(0.001, 0.01);
const legacyMidUsageCount = countLegacyUsageBand(0.01, 0.05);
const currentMidUsageCount = countCurrentUsageBand(0.01, 0.05);
const legacyHighUsageCount = countLegacyUsageBand(0.05, Infinity);
const currentHighUsageCount = countCurrentUsageBand(0.05, Infinity);
const currentFroslassIndex = currentComparison.ice.findIndex(
  (threat) => threat.pokemon.slug === "froslass-mega"
);
assert(
  legacyLowUsageCount === 7 &&
    currentLowUsageCount === 1 &&
    legacyMidUsageCount === 3 &&
    currentMidUsageCount === 2 &&
    legacyHighUsageCount === 10 &&
    currentHighUsageCount === 17,
  `使用率帯別のTOP5変化が不正です: ${JSON.stringify({
    legacyLowUsageCount,
    currentLowUsageCount,
    legacyMidUsageCount,
    currentMidUsageCount,
    legacyHighUsageCount,
    currentHighUsageCount
  })}`
);
assert(
  currentComparison.ice[0]?.pokemon.slug === "ninetales-alola" &&
    currentComparison.ice[0].metrics.usagePoints === 18 &&
    currentFroslassIndex > 0 &&
    currentFroslassIndex < 5 &&
    currentComparison.ice[currentFroslassIndex].metrics.usagePoints === 5,
  "氷一貫例で高使用率を優遇しつつ、極端に刺さるメガユキメノコを残せません"
);
assert(
  currentComparisonThreats.every(
    (threat) =>
      threat.score <= 100 &&
      threat.metrics.baseMatchupPoints <= 72 &&
      threat.metrics.environmentPoints <= 28 &&
      threat.metrics.popularMovePoints <= THREAT_WEIGHTS.popularMoves &&
      threat.metrics.scoredPopularMoves.every(
        (move) =>
          move.move.share >= POPULAR_MOVE_MIN_SHARE &&
          move.move.damageClass !== "status"
      )
  ),
  "基礎72点・環境28点・総合100点の上限、または人気技条件が不正です"
);

const excludedCandidates = allPokemon.filter(
  (pokemon) =>
    pokemon.formKind === "gmax" ||
    pokemon.formKind === "battle-only" ||
    pokemon.formKind === "appearance" ||
    pokemon.formSelection === "excluded"
);
assert(
  excludedCandidates.length > 0 &&
    excludedCandidates.every((pokemon) => !isThreatPokemonCandidate(pokemon)),
  "G-MAX・戦闘中限定・移動形態・appearanceフォームを除外できません"
);
assert(
  allPokemon
    .filter(
      (pokemon) => pokemon.isBattleOnly && pokemon.formKind !== "mega"
    )
    .every((pokemon) => !isThreatPokemonCandidate(pokemon)),
  "メガ以外の戦闘中限定フォームを候補に含めました"
);
assert(
  six.every((threat) =>
    seasonPokemon.some((pokemon) => pokemon.slug === threat.pokemon.slug)
  ),
  "現在のルールで使用不可のポケモンが候補に混入しました"
);
assert(
  Object.values(THREAT_WEIGHTS).reduce((sum, value) => sum + value, 0) === 100 &&
    THREAT_WEIGHTS.attackCoverage +
      THREAT_WEIGHTS.quadCoverage +
      THREAT_WEIGHTS.defensivePressure +
      THREAT_WEIGHTS.speed +
      THREAT_WEIGHTS.offense +
      THREAT_WEIGHTS.typeGap ===
      72 &&
    THREAT_WEIGHTS.usage === 20 &&
    THREAT_WEIGHTS.popularMoves === 6 &&
    THREAT_WEIGHTS.popularSet === 2 &&
    MIN_THREAT_USAGE_RATE === 0.001 &&
    POPULAR_MOVE_MIN_SHARE === 0.2,
  "脅威スコアの重み定義が意図せず変更されました"
);

const withoutRelations = {
  ...environmentDataset,
  pokemon: environmentDataset.pokemon.map((entry) => ({
    ...entry,
    teammates: [],
    checksAndCounters: []
  }))
};
assert(
  JSON.stringify(
    analyze(iceWeakTeam).map((entry) => [entry.pokemon.slug, entry.score])
  ) ===
    JSON.stringify(
      analyze(iceWeakTeam, seasonPokemon, withoutRelations).map((entry) => [
        entry.pokemon.slug,
        entry.score
      ])
    ),
  "teammatesまたはChecks and Countersがスコアへ混入しました"
);

const missingUsageThreats = analyze(
  iceWeakTeam,
  [allPokemon.find((entry) => entry.slug === "froslass-mega")!],
  null
);
assert(
  missingUsageThreats.length === 0,
  "使用率データなしのフォームを要警戒候補から除外できません"
);

const panelSource = readFileSync(
  path.join(process.cwd(), "components/team/AnalysisPanels.tsx"),
  "utf8"
);
const styleSource = readFileSync(
  path.join(process.cwd(), "components/team/TeamWorkspace.module.css"),
  "utf8"
);
assert(
  panelSource.includes("要警戒ポケモン") &&
    panelSource.includes("Pokemon Showdown環境統計") &&
    panelSource.includes("環境使用率0.1%以上") &&
    panelSource.includes("環境使用率") &&
    panelSource.includes("主流型") &&
    panelSource.includes("主な特性") &&
    panelSource.includes("相性の良い味方") &&
    panelSource.includes("苦手な相手") &&
    panelSource.includes("threat.reasons.map") &&
    panelSource.includes("threat.score") &&
    panelSource.includes("slug={threat.pokemon.slug}") &&
    panelSource.includes("threat.pokemon.types.map"),
  "要警戒ポケモンの説明・理由・スコア表示が不足しています"
);
assert(
  styleSource.includes(".threatList { display: flex;") &&
    styleSource.includes("overflow-x: auto;") &&
    styleSource.includes("min-width: 0;"),
  "モバイルで警戒候補を省スペース表示できません"
);

console.log(
  `[compare] 旧TOP5=${JSON.stringify(legacyTopFive)} 新TOP5=${JSON.stringify(currentComparisonSlugs)}`
);
const formatScoreBreakdown = (threat: (typeof iceThreats)[number]) => ({
  slug: threat.pokemon.slug,
  score: threat.score,
  usageRate: threat.environment?.usageRate ?? null,
  base: threat.metrics.baseMatchupPoints,
  usage: threat.metrics.usagePoints,
  popularMoves: threat.metrics.popularMovePoints,
  popularSet: threat.metrics.popularSetPoints
});
console.log(
  `[breakdown] 旧=${JSON.stringify(
    Object.fromEntries(
      Object.entries(advisorCompatibleComparison).map(([key, threats]) => [
        key,
        threats.map(formatScoreBreakdown)
      ])
    )
  )}`
);
console.log(
  `[breakdown] 新=${JSON.stringify(
    Object.fromEntries(
      Object.entries(currentComparison).map(([key, threats]) => [
        key,
        threats.map(formatScoreBreakdown)
      ])
    )
  )}`
);
console.log(
  `[compare] 0.1〜1%: ${legacyLowUsageCount}→${currentLowUsageCount} / 1〜5%: ${legacyMidUsageCount}→${currentMidUsageCount} / 5%以上: ${legacyHighUsageCount}→${currentHighUsageCount} / メガユキメノコ: 1位86点(使用1)→${currentFroslassIndex + 1}位${currentComparison.ice[currentFroslassIndex].score}点(使用${currentComparison.ice[currentFroslassIndex].metrics.usagePoints})`
);
console.log(
  `[ok] 要警戒候補を使用率で${seasonThreatCandidates.length}件→${usageEligibleThreatCandidates.length}件（メガ${inheritedMegaCandidates.length}件→${usageEligibleMegaCandidates.length}件）へ絞り込みました`
);
