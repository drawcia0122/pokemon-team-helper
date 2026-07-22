import { readFileSync } from "node:fs";
import path from "node:path";
import pokemonData from "@/data/pokemon.json";
import { getAvailablePokemonBySeason } from "@/lib/regulations";
import {
  getThreatPokemonAnalysis,
  isThreatPokemonCandidate,
  THREAT_SCORE_WEIGHTS
} from "@/lib/teamThreats";
import { summarizeTeam } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function slot(id: string, pokemonSlug: string): TeamSlot {
  return { id, mode: "pokemon", pokemonSlug };
}

function analyze(team: TeamSlot[], available = seasonPokemon) {
  return getThreatPokemonAnalysis(team, summarizeTeam(team), available);
}

const allPokemon = pokemonData as PokemonEntry[];
const seasonPokemon = getAvailablePokemonBySeason("season-m4");
const seasonThreatCandidates = seasonPokemon.filter(isThreatPokemonCandidate);
const inheritedMegaCandidates = seasonThreatCandidates.filter(
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
        threat.reasons.length <= 3 &&
        threat.score >= 0 &&
        threat.score <= 100
    ),
  "1体パーティの候補数・理由数・スコア範囲が不正です"
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
    megaFroslassThreat.reasons.some((reason) =>
      reason.includes("こおりが一貫")
    ),
  "氷が一貫する例で使用可能なメガユキメノコが評価されません"
);

const charizardForms = seasonThreatCandidates.filter(
  (pokemon) => pokemon.speciesId === 6
);
const charizardFormScores = charizardForms.map((pokemon) => ({
  pokemon,
  result: analyze(iceWeakTeam, [pokemon])[0]
}));
const groupedCharizardThreat = analyze(iceWeakTeam, charizardForms)[0];
const highestCharizardScore = Math.max(
  ...charizardFormScores.map(({ result }) => result?.score ?? -1)
);
assert(
  charizardFormScores.length === 3 &&
    charizardFormScores.every(({ result }) => result) &&
    groupedCharizardThreat?.score === highestCharizardScore &&
    new Set(
      analyze(iceWeakTeam, [...charizardForms, ...charizardForms]).map(
        (threat) => threat.pokemon.speciesId
      )
    ).size === 1,
  "メガX・メガYを個別評価し、species内の最高スコア1フォームへ集約できません"
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
  Object.values(THREAT_SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0) === 110 &&
    THREAT_SCORE_WEIGHTS.attackCoverage === 45,
  "脅威スコアの重み定義が意図せず変更されました"
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
    panelSource.includes("タイプ相性と種族値をもとにした参考診断です。") &&
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
  `[ok] タイプ・種族値・フォームpolicy・継承メガ${inheritedMegaCandidates.length}件による要警戒ポケモンを検証しました`
);
