import { evaluateAdvisorSwapPlan } from "@/lib/advisorSwapSimulator";
import { getThreatEnvironmentCatalog } from "@/lib/environmentData.server";
import { findThreatEnvironmentDataset } from "@/lib/environmentThreatData";
import { getAvailablePokemonBySeason } from "@/lib/regulations";
import type {
  TeamAdvisorAnalysis,
  TeamAdvisorCandidate
} from "@/lib/teamAdvisor";
import { getPokemonBySlug } from "@/lib/typeChart";
import { getThreatSnapshot } from "@/lib/threatSnapshot";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pokemon(slug: string): PokemonEntry {
  const entry = getPokemonBySlug(slug);
  if (!entry) throw new Error(`品質fixtureに必要な${slug}がありません`);
  return entry;
}

const availablePokemon = getAvailablePokemonBySeason("season-m4");
const environmentDataset = findThreatEnvironmentDataset(
  getThreatEnvironmentCatalog(),
  "M-B"
);
assert(environmentDataset, "M-Bの環境snapshotがありません");
const dataset = environmentDataset;

function candidate(entry: PokemonEntry): TeamAdvisorCandidate {
  return {
    pokemon: entry,
    score: 1,
    rating: 1,
    reasons: ["品質fixture"],
    addressedIssueIds: [],
    environmentUsageRate:
      dataset.pokemon.find((item) => item.slug === entry.slug)
        ?.usageRate ?? null,
    metrics: {
      issueResolutionPoints: 0,
      threatResponsePoints: 0,
      rolePoints: 0,
      offensePoints: 0,
      environmentUsagePoints: 0,
      newWeaknessPenalty: 0
    }
  };
}

const team: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "dragonite" },
  { id: "slot-2", mode: "pokemon", pokemonSlug: "garchomp" },
  { id: "slot-3", mode: "pokemon", pokemonSlug: "gliscor" }
];
const tinkaton = candidate(pokemon("tinkaton"));
const scizor = candidate(pokemon("scizor"));
const threatSnapshot = getThreatSnapshot({
  team,
  availablePokemon,
  environmentDataset: dataset
});
const advisor: TeamAdvisorAnalysis = {
  overallLabel: "改善余地あり",
  issues: [],
  candidates: [tinkaton, scizor],
  candidatePool: [tinkaton, scizor],
  threatSnapshot
};
const input = {
  team,
  advisor,
  availablePokemon,
  environmentDataset: dataset,
  threatSnapshot,
  profile: "standard" as const
};
const tinkatonPlan = evaluateAdvisorSwapPlan(input, tinkaton, null);
const scizorPlan = evaluateAdvisorSwapPlan(input, scizor, null);

assert(
  tinkatonPlan.improvementScore === tinkatonPlan.evidenceScore.overall &&
    tinkatonPlan.categoryScores.defensive ===
      tinkatonPlan.evidenceScore.defensive,
  "最終順位がEvidence以外の旧加点を利用しています"
);
assert(
  new Set(tinkatonPlan.evidence.map((entry) => entry.id)).size ===
    tinkatonPlan.evidence.length,
  "同一Evidenceを複数回生成しました"
);
assert(
  tinkatonPlan.improvementScore > scizorPlan.improvementScore,
  `氷一貫fixtureでデカヌチャンをハッサムより低く評価しました: ${JSON.stringify({ tinkaton: { score: tinkatonPlan.improvementScore, evidence: tinkatonPlan.evidence }, scizor: { score: scizorPlan.improvementScore, evidence: scizorPlan.evidence } })}`
);
assert(
  tinkatonPlan.threatCoverage.threatAnswers.length ===
      tinkatonPlan.beforeThreats.length &&
    tinkatonPlan.recommendationThreatCoverage.threatAnswers.length >= 5 &&
    tinkatonPlan.recommendationThreatCoverage.threatAnswers.some(
      (answer) => answer.threatRank > 5
    ),
  "表示TOP5とRecommendation内部の追跡対象を分離できていません"
);
assert(
  tinkatonPlan.evidence.some(
    (entry) => entry.primaryDimension === "defensiveImprovement"
  ) &&
    tinkatonPlan.evidence.every(
      (entry) =>
        [
          "targetCounterplay",
          "postSwapThreatRisk",
          "teamIssueImprovement",
          "defensiveImprovement",
          "offensiveImprovement",
          "speedImprovement",
          "roleImprovement",
          "environmentValidity",
          "riskPenalty"
        ].includes(entry.primaryDimension)
    ),
  "Evidenceを定義済みカテゴリへ一意に配分できません"
);

const overlapTeam: TeamSlot[] = [
  { id: "overlap-1", mode: "pokemon", pokemonSlug: "gyarados-mega" },
  { id: "overlap-2", mode: "pokemon", pokemonSlug: "gengar" },
  { id: "overlap-3", mode: "pokemon", pokemonSlug: "mamoswine" },
  { id: "overlap-4", mode: "pokemon", pokemonSlug: "scizor" },
  { id: "overlap-5", mode: "pokemon", pokemonSlug: "primarina" }
];
const greninja = candidate(pokemon("greninja"));
const overlapThreatSnapshot = getThreatSnapshot({
  team: overlapTeam,
  availablePokemon,
  environmentDataset: dataset
});
const overlapAdvisor: TeamAdvisorAnalysis = {
  overallLabel: "改善余地あり",
  issues: [],
  candidates: [greninja],
  candidatePool: [greninja],
  threatSnapshot: overlapThreatSnapshot
};
const greninjaPlan = evaluateAdvisorSwapPlan(
  {
    team: overlapTeam,
    advisor: overlapAdvisor,
    availablePokemon,
    environmentDataset: dataset,
    threatSnapshot: overlapThreatSnapshot,
    profile: "standard"
  },
  greninja,
  null
);
assert(
  greninjaPlan.evidence.some(
    (entry) =>
      entry.id.startsWith("redundancy:") &&
      entry.primaryDimension === "riskPenalty"
  ) && !greninjaPlan.isRecommendation,
  `同タイプ・同役割・同攻撃範囲のゲッコウガを独自価値なしで総合推薦しました: ${JSON.stringify(greninjaPlan.evidence)}`
);

console.log(
  `[ok] Advisor品質fixture: デカヌチャン=${tinkatonPlan.improvementScore} / ハッサム=${scizorPlan.improvementScore} / ゲッコウガ重複=${greninjaPlan.improvementScore} / Evidence=${tinkatonPlan.evidence.length}件`
);
