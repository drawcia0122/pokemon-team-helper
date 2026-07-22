import { readFileSync } from "node:fs";
import path from "node:path";
import { getThreatEnvironmentCatalog } from "@/lib/environmentData.server";
import { findThreatEnvironmentDataset } from "@/lib/environmentThreatData";
import { getAvailablePokemonBySeason } from "@/lib/regulations";
import {
  ADVISOR_WEIGHTS,
  getTeamAdvisorAnalysis,
  TEAM_ADVISOR_EVALUATED_TYPE_COUNT
} from "@/lib/teamAdvisor";
import { getTeamDiagnostics } from "@/lib/teamDiagnostics";
import {
  getThreatPokemonAnalysis,
  isThreatPokemonCandidate
} from "@/lib/teamThreats";
import { getPokemonBySlug, summarizeTeam } from "@/lib/typeChart";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pokemonSlot(id: string, pokemonSlug: string): TeamSlot {
  return { id, mode: "pokemon", pokemonSlug };
}

function advise(
  team: TeamSlot[],
  candidates = availablePokemon,
  environment = environmentDataset,
  includeThreats = true
) {
  const summary = summarizeTeam(team);
  const diagnostics = getTeamDiagnostics(team, summary, availablePokemon);
  const threats = includeThreats
    ? getThreatPokemonAnalysis(
        team,
        summary,
        availablePokemon,
        environment
      )
    : [];
  return getTeamAdvisorAnalysis({
    team,
    summary,
    diagnostics,
    threats,
    availablePokemon: candidates,
    environmentDataset: environment
  });
}

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

function syntheticPokemon(
  overrides: Partial<PokemonEntry> & Pick<PokemonEntry, "slug" | "speciesId" | "types">
): PokemonEntry {
  const { slug, speciesId, types, ...rest } = overrides;
  return {
    id: speciesId + 20000,
    slug,
    speciesId,
    isDefaultForm: true,
    formKind: "base",
    formOrder: 1,
    isBattleOnly: false,
    formSelection: "team",
    nameJa: slug,
    nameEn: slug,
    types,
    baseStats: {
      hp: 80,
      attack: 80,
      defense: 80,
      specialAttack: 80,
      specialDefense: 80,
      speed: 80
    },
    ...rest
  };
}

const availablePokemon = getAvailablePokemonBySeason("season-m4");
const environmentDataset = findThreatEnvironmentDataset(
  getThreatEnvironmentCatalog(),
  "M-B"
);
assert(environmentDataset, "M-BのAdvisor用環境snapshotがありません");

const empty = advise([]);
assert(
  empty.overallLabel === "分析待ち" &&
    empty.issues.length === 0 &&
    empty.candidates.length === 0,
  "空パーティを分析待ちにできません"
);
const one = advise([pokemonSlot("slot-1", "charizard")]);
assert(
  one.overallLabel === "分析待ち" &&
    one.issues.length === 0 &&
    one.candidates.length === 0,
  "1体パーティで確定的なAdvisor提案を表示しました"
);

const iceWeakTeam = [
  pokemonSlot("slot-1", "dragonite"),
  pokemonSlot("slot-2", "garchomp"),
  pokemonSlot("slot-3", "gliscor")
];
const iceAdvisor = advise(iceWeakTeam);
assert(
  iceAdvisor.issues.length <= 3 &&
    iceAdvisor.candidates.length === 3 &&
    iceAdvisor.issues.some(
      (issue) =>
        issue.id === "type-gap-ice" &&
        issue.title === "こおり技が一貫しています"
    ),
  "氷技の一貫を最大3件の課題として抽出できません"
);
assert(
  iceAdvisor.candidates.every(
    (candidate) =>
      candidate.reasons.length >= 1 &&
      candidate.reasons.length <= 3 &&
      candidate.rating >= 1 &&
      candidate.rating <= 5 &&
      availablePokemon.some(
        (pokemon) => pokemon.slug === candidate.pokemon.slug
      ) &&
      isThreatPokemonCandidate(candidate.pokemon)
  ),
  "改善候補の件数・理由・おすすめ度・使用可能判定が不正です"
);
assert(
  iceAdvisor.candidates.some((candidate) =>
    candidate.reasons.some(
      (reason) => reason.includes("こおりを半減") || reason.includes("こおりを1/4")
    )
  ) &&
    iceAdvisor.candidates.some(
      (candidate) => candidate.metrics.threatResponsePoints > 0
    ),
  "耐性改善または要警戒ポケモンへの実回答を候補理由へ反映できません"
);
assert(
  new Set(
    iceAdvisor.candidates.map((candidate) => candidate.pokemon.speciesId)
  ).size === iceAdvisor.candidates.length &&
    iceAdvisor.candidates.every(
      (candidate) =>
        !iceWeakTeam.some(
          (slot) =>
            slot.mode === "pokemon" &&
            getPokemonBySlug(slot.pokemonSlug)?.speciesId ===
              candidate.pokemon.speciesId
        )
    ),
  "同一speciesの重複または現在のパーティspeciesが候補へ混入しました"
);
assert(
  iceAdvisor.candidates.every(
    (candidate) =>
      candidate.metrics.environmentUsagePoints <=
        ADVISOR_WEIGHTS.environmentUsageMaximum
  ),
  "環境使用率の補助点が上限を超えました"
);

const sixTeam = [
  pokemonSlot("slot-1", "charizard"),
  pokemonSlot("slot-2", "rotom-wash"),
  pokemonSlot("slot-3", "garchomp"),
  pokemonSlot("slot-4", "empoleon"),
  pokemonSlot("slot-5", "gardevoir"),
  pokemonSlot("slot-6", "corviknight")
];
const six = advise(sixTeam);
assert(
  six.issues.length <= 3 && six.candidates.length <= 3,
  "6体パーティで課題または改善候補が最大3件を超えました"
);

const fireTypeTeam: TeamSlot[] = [
  { id: "slot-1", mode: "type", primaryType: "fire" },
  { id: "slot-2", mode: "type", primaryType: "fire" },
  { id: "slot-3", mode: "type", primaryType: "fire" }
];
const highUsageNoAnswer = syntheticPokemon({
  slug: "high-usage-no-answer",
  speciesId: 19001,
  types: ["normal"]
});
const lowerUsageAnswer = syntheticPokemon({
  slug: "lower-usage-answer",
  speciesId: 19002,
  types: ["water"]
});
const usageDominanceDataset: ThreatEnvironmentDataset = {
  ...environmentDataset,
  snapshotId: "advisor-usage-test",
  pokemon: [environmentEntry(highUsageNoAnswer.slug, 0.5, 1)]
};
const usageFairness = advise(
  fireTypeTeam,
  [highUsageNoAnswer, lowerUsageAnswer],
  usageDominanceDataset,
  false
);
assert(
  usageFairness.candidates.length === 1 &&
    usageFairness.candidates[0].pokemon.slug === lowerUsageAnswer.slug,
  "環境使用率だけで課題を改善しない候補を選びました"
);

const slowPhysicalTeam = [
  pokemonSlot("slot-1", "snorlax"),
  pokemonSlot("slot-2", "steelix"),
  pokemonSlot("slot-3", "donphan"),
  pokemonSlot("slot-4", "hippowdon")
];
const floetteMega = availablePokemon.find(
  (pokemon) => pokemon.slug === "floette-mega"
);
assert(floetteMega, "メガフラエッテがM-Bの候補にありません");
const irrelevantDualType = syntheticPokemon({
  slug: "dual-type-control",
  speciesId: 19003,
  types: ["water", "steel"],
  baseStats: {
    hp: 80,
    attack: 105,
    defense: 80,
    specialAttack: 60,
    specialDefense: 80,
    speed: 110
  }
});
const floetteEnvironment = environmentDataset.pokemon.find(
  (pokemon) => pokemon.slug === "floette-mega"
);
assert(floetteEnvironment, "メガフラエッテの環境統計がありません");
const singleTypeDataset: ThreatEnvironmentDataset = {
  ...environmentDataset,
  snapshotId: "advisor-single-type-test",
  pokemon: [
    floetteEnvironment,
    environmentEntry(irrelevantDualType.slug, 0.2, 1)
  ]
};
const singleTypeFairness = advise(
  slowPhysicalTeam,
  [floetteMega, irrelevantDualType],
  singleTypeDataset,
  false
);
assert(
  floetteMega.types.length === 1 &&
    irrelevantDualType.types.length === 2 &&
    singleTypeFairness.candidates[0]?.pokemon.slug === "floette-mega" &&
    singleTypeFairness.candidates[0].reasons.some(
      (reason) =>
        reason.includes("高速アタッカー") ||
        reason.includes("特殊攻撃")
    ),
  "単タイプのメガフラエッテをタイプ数だけで過小評価しました"
);

const excludedStrongForm = syntheticPokemon({
  slug: "excluded-gmax-control",
  speciesId: 19004,
  types: ["water"],
  formKind: "gmax",
  formSelection: "excluded",
  baseStats: {
    hp: 255,
    attack: 255,
    defense: 255,
    specialAttack: 255,
    specialDefense: 255,
    speed: 255
  }
});
assert(
  !advise(
    fireTypeTeam,
    [excludedStrongForm, lowerUsageAnswer],
    null,
    false
  ).candidates.some(
    (candidate) => candidate.pokemon.slug === excludedStrongForm.slug
  ),
  "G-MAX・非表示フォームを改善候補へ含めました"
);

const normalForm = advise([
  pokemonSlot("slot-1", "charizard"),
  pokemonSlot("slot-2", "garchomp")
]);
const megaForm = advise([
  pokemonSlot("slot-1", "charizard-mega-x"),
  pokemonSlot("slot-2", "garchomp")
]);
assert(
  JSON.stringify(normalForm) !== JSON.stringify(megaForm),
  "フォーム変更後のタイプ・種族値・要警戒情報でAdvisorを更新できません"
);
assert(
  TEAM_ADVISOR_EVALUATED_TYPE_COUNT === 18 &&
    !Object.keys(ADVISOR_WEIGHTS).some(
      (key) => key.includes("typeCount") || key.includes("resistanceCount")
    ),
  "複合タイプ数または全耐性数を構造的に加点しています"
);

const panelSource = readFileSync(
  path.join(process.cwd(), "components/team/TeamAdvisorPanel.tsx"),
  "utf8"
);
const pageSource = readFileSync(
  path.join(process.cwd(), "app/page.tsx"),
  "utf8"
);
const styleSource = readFileSync(
  path.join(process.cwd(), "components/team/TeamWorkspace.module.css"),
  "utf8"
);
assert(
  panelSource.includes("チームアドバイザー") &&
    panelSource.includes("総合評価") &&
    panelSource.includes("現在の課題") &&
    panelSource.includes("改善候補") &&
    panelSource.includes("改善理由") &&
    panelSource.includes("おすすめ度 5段階中") &&
    panelSource.includes("PokemonVisual") &&
    panelSource.includes("candidate.reasons.map"),
  "Advisorカードの見出し・候補・理由・アクセシビリティが不足しています"
);
assert(
  pageSource.includes("getTeamAdvisorAnalysis") &&
    pageSource.includes("<TeamAdvisorPanel advisor={advisor} />") &&
    pageSource.indexOf("<TeamAdvisorPanel advisor={advisor} />") >
      pageSource.indexOf("<AnalysisSummary"),
  "AdvisorEngineまたは独立カードを既存分析直後へ統合できません"
);
assert(
  styleSource.includes(
    ".advisorCandidateGrid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr));"
  ) &&
    styleSource.includes(
      ".advisorCandidateGrid { display: flex; gap: 6px; overflow-x: auto;"
    ) &&
    styleSource.includes(
      ".advisorCandidateGrid > li { flex: 0 0 min(76vw,250px);"
    ) &&
    styleSource.includes(".advisorCandidateGrid > li { min-width: 0;") &&
    !panelSource.includes("ThreatPokemon"),
  "Advisorのモバイル横スワイプ化、ページの横はみ出し防止、要警戒からの独立が不十分です"
);

console.log(
  `[ok] チームアドバイザー: 課題${iceAdvisor.issues.length}件 / 改善候補${iceAdvisor.candidates.length}件 / 単タイプ公平性・使用率非支配を検証しました`
);
