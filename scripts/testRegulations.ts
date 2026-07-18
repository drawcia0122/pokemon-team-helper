import appMetaData from "@/data/appMeta.json";
import pokemonData from "@/data/pokemon.json";
import regulationAData from "@/data/regulations/regulation-m-a.json";
import regulationBData from "@/data/regulations/regulation-m-b.json";
import {
  compareArticleRegulation,
  selectSeasonForArticleImport
} from "@/lib/articleImport";
import { getBuildArticles } from "@/lib/buildArticles";
import {
  getAvailablePokemonBySeason,
  getLatestSeasonId,
  getRegulationForSeason,
  getSeasonDefinitions,
  getSeasonOptions,
  resolveArticleSeasonId,
  resolveStoredSeasonId,
  selectLatestSeasonDefinition
} from "@/lib/regulations";
import { validateRegulationDefinitions } from "@/lib/regulationValidation";
import type { BuildArticle } from "@/types/buildArticle";
import type {
  AppMeta,
  PokemonEntry,
  RegulationDefinition,
  SeasonDefinition,
  TeamSlot
} from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const appMeta = appMetaData as AppMeta;
const articles = getBuildArticles();
const pokemon = pokemonData as PokemonEntry[];
const regulations = [
  regulationAData as RegulationDefinition,
  regulationBData as RegulationDefinition
];
const july18Jst = new Date("2026-07-18T12:00:00+09:00");
const regulationBArticle = articles.find(
  (article) => article.builderSeasonId === "season-m3"
);
assert(regulationBArticle, "M-3の記事がありません");

assert(
  selectLatestSeasonDefinition(appMeta.seasons, july18Jst)?.id === "season-m4",
  "2026-07-18時点の開催中シーズンM-4を取得できません"
);
assert(
  getLatestSeasonId(july18Jst) === "season-m4",
  "最新シーズンIDがM-4ではありません"
);
assert(
  getRegulationForSeason("season-m4")?.id === "M-B" &&
    getRegulationForSeason("season-m3")?.id === "M-B" &&
    getRegulationForSeason("season-m2")?.id === "M-A" &&
    getRegulationForSeason("season-m1")?.id === "M-A",
  "M-1〜M-4とルールの対応が不正です"
);
assert(
  JSON.stringify(getSeasonDefinitions().map((season) => season.id)) ===
    JSON.stringify(["season-m4", "season-m3", "season-m2", "season-m1"]),
  "シーズン一覧が新しい順ではありません"
);

assert(
  resolveStoredSeasonId(null, july18Jst) === "season-m4",
  "初回アクセス時にM-4を選択できません"
);
assert(
  resolveStoredSeasonId("season-m2", july18Jst) === "season-m2",
  "有効な保存済みM-2を復元できません"
);
assert(
  resolveStoredSeasonId("unknown-season", july18Jst) === "season-m4",
  "不正な保存済みシーズンからM-4へフォールバックできません"
);
assert(
  resolveStoredSeasonId("season1", july18Jst) === "season-m1" &&
    resolveStoredSeasonId("season2", july18Jst) === "season-m2" &&
    resolveStoredSeasonId("all", july18Jst) === "season-m3",
  "旧保存値のシーズン移行が不正です"
);
assert(
  resolveStoredSeasonId("all", july18Jst) !== "all" &&
    !appMeta.seasonIds.includes("all") &&
    getSeasonOptions().every((option) => option.id !== "all"),
  "旧互換ID all が新規保存・選択される状態です"
);

const m2Pokemon = getAvailablePokemonBySeason("season-m2");
const m3Pokemon = getAvailablePokemonBySeason("season-m3");
const m4Pokemon = getAvailablePokemonBySeason("season-m4");
assert(m2Pokemon.length === 213, "M-2の使用可能ポケモン数が213体ではありません");
assert(m2Pokemon.length > 0, "M-2の使用可能ポケモンが0体です");
assert(
  m3Pokemon.length === 235 && m4Pokemon.length === 235,
  "M-3とM-4がM-Bの235体を共通参照していません"
);
assert(
  m4Pokemon.length < pokemon.length,
  "M-Bで全ポケモンを無条件に使用可能としています"
);
assert(
  m4Pokemon.some(
    (entry) => !m2Pokemon.some((m2Entry) => m2Entry.slug === entry.slug)
  ),
  "シーズン変更後に使用可能判定が更新されません"
);

const retainedTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "bulbasaur" }
];
const retainedTeamSnapshot = JSON.stringify(retainedTeam);
getAvailablePokemonBySeason("season-m4");
assert(
  JSON.stringify(retainedTeam) === retainedTeamSnapshot,
  "シーズン変更時に現在のパーティが自動削除されました"
);

assert(
  resolveArticleSeasonId(
    regulationBArticle.regulation,
    regulationBArticle.season,
    regulationBArticle.builderSeasonId
  ) === "season-m3",
  "記事の正式シーズンIDを解決できません"
);
const differentSeason = compareArticleRegulation(
  regulationBArticle,
  "season-m4"
);
assert(
  differentSeason.differs &&
    differentSeason.articleRegulation?.id === "M-B" &&
    differentSeason.currentRegulation?.id === "M-B" &&
    differentSeason.articleSeason?.id === "season-m3" &&
    differentSeason.currentSeason?.id === "season-m4",
  "同じM-B内のM-3記事とM-4画面のシーズン差を判定できません"
);
assert(
  selectSeasonForArticleImport(regulationBArticle, "season-m4", "article") ===
    "season-m3",
  "記事のM-3へ切り替えて取り込めません"
);
assert(
  selectSeasonForArticleImport(regulationBArticle, "season-m4", "current") ===
    "season-m4",
  "現在のM-4を維持して取り込めません"
);
assert(
  !compareArticleRegulation(regulationBArticle, "season-m3").differs,
  "同じルール・シーズンを差異ありと判定しました"
);

const unknownRuleArticle: BuildArticle = {
  ...regulationBArticle,
  id: "unknown-rule-runtime",
  regulation: "UNKNOWN"
};
assert(
  !compareArticleRegulation(unknownRuleArticle, "season-m4")
    .canSwitchToArticle,
  "未対応ルールを暗黙に変換しました"
);

const m4WithRegulationA: BuildArticle = {
  ...regulationBArticle,
  id: "m4-with-regulation-a",
  regulation: "M-A",
  season: "M-4",
  builderSeasonId: "season-m4"
};
assert(
  validateRegulationDefinitions(appMeta, regulations, [m4WithRegulationA]).some(
    (error) => error.includes("記事のルールとシーズンが矛盾しています")
  ),
  "M-4 + M-Aの記事を拒否できません"
);
const m2WithRegulationB: BuildArticle = {
  ...regulationBArticle,
  id: "m2-with-regulation-b",
  regulation: "M-B",
  season: "M-2",
  builderSeasonId: "season-m2"
};
assert(
  validateRegulationDefinitions(appMeta, regulations, [m2WithRegulationB]).some(
    (error) => error.includes("記事のルールとシーズンが矛盾しています")
  ),
  "M-2 + M-Bの記事を拒否できません"
);

const noActiveSeasonTime = new Date("2030-01-01T12:00:00+09:00");
assert(
  selectLatestSeasonDefinition(appMeta.seasons, noActiveSeasonTime)?.id ===
    "season-m4",
  "開催中がない場合に開始日が最も新しいシーズンを選択できません"
);
const seasonsWithoutDates: SeasonDefinition[] = appMeta.seasons.map(
  (season, index) => ({
    ...season,
    startAt: null,
    endAt: null,
    displayOrder: index
  })
);
assert(
  selectLatestSeasonDefinition(seasonsWithoutDates, july18Jst)?.displayOrder ===
    3,
  "日付不足時にdisplayOrderが最大のシーズンを選択できません"
);
const equalFallbackSeasons = seasonsWithoutDates.map((season) => ({
  ...season,
  displayOrder: 0
}));
assert(
  selectLatestSeasonDefinition(equalFallbackSeasons, july18Jst) ===
    equalFallbackSeasons[0],
  "最終フォールバックで定義配列の先頭を選択できません"
);

console.log("[ok] 正式シーズン・最新判定・保存移行・記事整合性を検証しました");
