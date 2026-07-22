import {
  ADVISOR_COUNTERPLAY_RULES,
  ADVISOR_USAGE_THRESHOLDS,
  evaluateAdvisorThreatCoverage,
  isAdvisorThreatCoverageEligible
} from "@/lib/advisorThreatCoverage";
import { getPokemonBySlug } from "@/lib/typeChart";
import type { ThreatPokemonAnalysis } from "@/lib/teamThreats";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentMove,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pokemon(slug: string): PokemonEntry {
  const value = getPokemonBySlug(slug);
  if (!value) throw new Error(`fixtureに必要な${slug}がありません`);
  return value;
}

function move(
  id: string,
  name: string,
  type: ThreatEnvironmentMove["type"],
  damageClass: ThreatEnvironmentMove["damageClass"],
  share: number
): ThreatEnvironmentMove {
  return { id, name, type, damageClass, share };
}

function environmentEntry({
  pokemon: entry,
  usageRate,
  rank,
  moves,
  choiceScarfShare = 0
}: {
  pokemon: PokemonEntry;
  usageRate: number;
  rank: number;
  moves: ThreatEnvironmentMove[];
  choiceScarfShare?: number;
}): ThreatEnvironmentPokemon {
  return {
    slug: entry.slug,
    usageRank: rank,
    usageRate,
    choiceScarfShare,
    offenseProfile: {
      physicalShare: 0.5,
      specialShare: 0.5,
      neutralShare: 0
    },
    moves,
    abilities: [],
    teammates: [],
    checksAndCounters: []
  };
}

function threat(
  entry: PokemonEntry,
  environment: ThreatEnvironmentPokemon,
  rank: number,
  score: number
): ThreatPokemonAnalysis {
  return {
    pokemon: entry,
    score,
    reasons: [],
    environment: {
      source: "Pokemon Showdown",
      period: "2026-06",
      battleFormat: "single",
      ratingCutoff: 1760,
      usageRank: environment.usageRank,
      usageRate: environment.usageRate,
      offenseProfile: environment.offenseProfile,
      topAbility: null,
      teammates: [],
      checksAndCounters: []
    },
    metrics: {
      superEffectiveTargetCount: 2,
      quadEffectiveTargetCount: 0,
      teamAnswerCount: 0,
      teamSpeedCount: 3,
      fasterTeamMemberCount: 1,
      slowerTeamMemberCount: 2,
      profileSpeedAdvantageCount: 2,
      speedPoints: 4,
      maxAttackingStat: 120,
      matchedTypeGaps: [],
      profile: "standard",
      nonSpeedMatchupPoints: 30,
      baseMatchupPoints: 34,
      usagePoints: 10,
      popularMovePoints: 5,
      popularSetPoints: 2,
      environmentPoints: 17,
      dominantDamageClass: "mixed",
      scoredPopularMoves: []
    }
  };
}

const raichu = pokemon("raichu-mega-y");
const garchomp = pokemon("garchomp");
const swampert = pokemon("swampert-mega");
const starmie = pokemon("starmie-mega");
const primarina = pokemon("primarina");
const steelix = pokemon("steelix");
const jolteon = pokemon("jolteon");
const meowscarada = pokemon("meowscarada");
const scarfCandidate = pokemon("mamoswine");
const passiveCandidate = pokemon("blissey");

const threatEntries = [
  environmentEntry({
    pokemon: raichu,
    usageRate: 0.12,
    rank: 2,
    moves: [
      move("zapcannon", "でんじほう", "electric", "special", 0.82),
      move("focusblast", "きあいだま", "fighting", "special", 0.56)
    ]
  }),
  environmentEntry({
    pokemon: garchomp,
    usageRate: 0.46,
    rank: 1,
    moves: [
      move("earthquake", "じしん", "ground", "physical", 0.99),
      move("outrage", "げきりん", "dragon", "physical", 0.34)
    ]
  }),
  environmentEntry({
    pokemon: swampert,
    usageRate: 0.09,
    rank: 5,
    moves: [
      move("earthquake", "じしん", "ground", "physical", 0.78),
      move("waterfall", "たきのぼり", "water", "physical", 0.65)
    ]
  }),
  environmentEntry({
    pokemon: starmie,
    usageRate: 0.06,
    rank: 8,
    moves: [
      move("psychic", "サイコキネシス", "psychic", "special", 0.72),
      move("icebeam", "れいとうビーム", "ice", "special", 0.58)
    ]
  }),
  environmentEntry({
    pokemon: primarina,
    usageRate: 0.18,
    rank: 3,
    moves: [
      move("moonblast", "ムーンフォース", "fairy", "special", 0.96),
      move("sparklingaria", "うたかたのアリア", "water", "special", 0.72)
    ]
  })
];

const candidateEntries = [
  environmentEntry({
    pokemon: steelix,
    usageRate: 0.02,
    rank: 40,
    moves: [move("earthquake", "じしん", "ground", "physical", 0.8)]
  }),
  environmentEntry({
    pokemon: jolteon,
    usageRate: 0.002,
    rank: 180,
    moves: [
      move("thunderbolt", "10まんボルト", "electric", "special", 0.82)
    ]
  }),
  environmentEntry({
    pokemon: meowscarada,
    usageRate: 0.02,
    rank: 35,
    moves: [
      move("flowertrick", "トリックフラワー", "grass", "physical", 0.76),
      move("suckerpunch", "ふいうち", "dark", "physical", 0.42)
    ]
  }),
  environmentEntry({
    pokemon: scarfCandidate,
    usageRate: 0.006,
    rank: 90,
    choiceScarfShare: 0.24,
    moves: [
      move("iceshard", "こおりのつぶて", "ice", "physical", 0.18),
      move("iciclecrash", "つららおとし", "ice", "physical", 0.7),
      move("earthquake", "じしん", "ground", "physical", 0.8)
    ]
  }),
  environmentEntry({
    pokemon: passiveCandidate,
    usageRate: 0.2,
    rank: 4,
    moves: []
  })
];

const dataset: ThreatEnvironmentDataset = {
  snapshotId: "task036-fixture",
  source: "Pokemon Showdown",
  period: "2026-06",
  regulationId: "M-B",
  battleFormat: "single",
  ratingCutoff: 1760,
  investmentSystem: "stat-points",
  pokemon: [...threatEntries, ...candidateEntries]
};
const threats = threatEntries.map((entry, index) =>
  threat(
    pokemon(entry.slug),
    entry,
    index + 1,
    [94, 91, 82, 77, 74][index]
  )
);
const currentTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "charizard" },
  { id: "slot-2", mode: "pokemon", pokemonSlug: "empoleon" },
  { id: "slot-3", mode: "pokemon", pokemonSlug: "gliscor" }
];
const originalTeam = JSON.stringify(currentTeam);
const evaluate = (candidate: PokemonEntry) =>
  evaluateAdvisorThreatCoverage({
    candidate,
    threats,
    currentTeam,
    environmentDataset: dataset,
    profile: "standard"
  });

const steelixCoverage = evaluate(steelix);
const jolteonCoverage = evaluate(jolteon);
const meowscaradaCoverage = evaluate(meowscarada);
const scarfCoverage = evaluate(scarfCandidate);
const passiveCoverage = evaluate(passiveCandidate);
const unknownCoverage = evaluate(pokemon("corviknight"));

assert(
  steelixCoverage.threatAnswers[0].threatId === "raichu-mega-y" &&
    !steelixCoverage.threatAnswers[0].stableSwitch &&
    steelixCoverage.threatAnswers[0].failureReasons.some((reason) =>
      reason.includes("きあいだま")
    ),
  "でんじほう無効だけでハガネールをメガライチュウYの安定受けにしました"
);
assert(
  jolteonCoverage.usageEligibility === "below-minimum" &&
    !isAdvisorThreatCoverageEligible(jolteonCoverage, 3),
  "使用率0.3%未満の高速候補を除外できません"
);
assert(
  unknownCoverage.usageEligibility === "unknown" &&
    !isAdvisorThreatCoverageEligible(unknownCoverage, 3),
  "使用率不明の候補を除外できません"
);
assert(
  meowscaradaCoverage.distinctThreatCount >= 3 &&
    meowscaradaCoverage.threatAnswers.some((answer) =>
      answer.counterplayMethods.includes("priority")
    ) &&
    isAdvisorThreatCoverageEligible(meowscaradaCoverage, 1),
  "異なる方法でTOP5の3体以上へ回答する候補を評価できません"
);
assert(
  scarfCoverage.usageEligibility === "conditional" &&
    scarfCoverage.distinctThreatCount >= 3 &&
    isAdvisorThreatCoverageEligible(scarfCoverage, 1) &&
    scarfCoverage.threatAnswers.some((answer) =>
      answer.counterplayMethods.includes("choice-scarf")
    ) &&
    scarfCoverage.threatAnswers.some((answer) =>
      answer.counterplayMethods.includes("priority")
    ),
  "スカーフ・先制技の実採用率を区別して評価できません"
);
assert(
  passiveCoverage.candidateUsage === 0.2 &&
    passiveCoverage.distinctThreatCount < meowscaradaCoverage.distinctThreatCount &&
    passiveCoverage.finalScore < meowscaradaCoverage.finalScore &&
    steelixCoverage.finalScore < meowscaradaCoverage.finalScore,
  "高使用率や単一相手だけでTOP5へ役割がない候補を上位にしました"
);
assert(
  meowscaradaCoverage.threatAnswers.map((answer) => answer.threatId).join(",") ===
    "raichu-mega-y,garchomp,swampert-mega,starmie-mega,primarina",
  "現在の要警戒TOP5ではなく環境使用率上位を評価対象にしました"
);
assert(
  meowscaradaCoverage.threatAnswers[0].importanceWeight !==
      meowscaradaCoverage.threatAnswers[4].importanceWeight &&
    meowscaradaCoverage.weightedThreatCoverage > 0 &&
    meowscaradaCoverage.weightedThreatCoverage <= 1,
  "順位・脅威スコア・使用率を加重カバレッジへ反映できません"
);
assert(
  ADVISOR_USAGE_THRESHOLDS.normalCandidate === 0.01 &&
    ADVISOR_USAGE_THRESHOLDS.conditionalCandidate === 0.003 &&
    ADVISOR_COUNTERPLAY_RULES.recommendationMinimumDistinctThreats === 2,
  "使用率・複数回答の閾値が設定へ集約されていません"
);
assert(JSON.stringify(currentTeam) === originalTeam, "元のパーティ配列を変更しました");

console.log(
  `[ok] Advisor要警戒カバレッジ: メガライチュウY/ガブリアスを含むTOP5、使用率閾値、受け・上から・スカーフ・先制技を検証しました`
);
for (const [label, coverage] of [
  ["ハガネール", steelixCoverage],
  ["サンダース", jolteonCoverage],
  ["マスカーニャ", meowscaradaCoverage],
  ["マンムー", scarfCoverage],
  ["ハピナス", passiveCoverage]
] as const) {
  console.log(
    `[fixture] ${label}: usage=${coverage.candidateUsage === null ? "unknown" : `${(coverage.candidateUsage * 100).toFixed(1)}%`} answers=${coverage.distinctThreatCount}/5 weighted=${coverage.weightedThreatCoverage.toFixed(3)} score=${coverage.finalScore} methods=${[...new Set(coverage.threatAnswers.flatMap((answer) => answer.counterplayMethods))].join("+")}`
  );
}
