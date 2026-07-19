import pokemonData from "@/data/pokemon.json";
import {
  canAnalyzeBuildArticle,
  compareArticleRegulation,
  mergeImportedPokemonOptions,
  resolveArticleImport,
  selectSeasonForArticleImport,
  selectTeamForImportAction,
  selectTeamForRestoreAction
} from "@/lib/articleImport";
import { getBuildArticles } from "@/lib/buildArticles";
import { parseTeamBackup, serializeTeam } from "@/lib/teamStorage";
import type { BuildArticle } from "@/types/buildArticle";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const articles = getBuildArticles();
const pokemon = pokemonData as PokemonEntry[];
const validArticle = articles.find(canAnalyzeBuildArticle);
assert(validArticle, "テスト用の記事がありません");

const validResult = resolveArticleImport(validArticle.id);
assert(validResult.status === "ready", "正常な記事IDから構築を取得できません");
assert(validResult.team.length === 6, "正常な記事から6体を構築できません");
assert(
  compareArticleRegulation(validResult.article, validResult.article.builderSeasonId)
    .articleRegulation?.id === validResult.article.regulation,
  "記事のルール情報を取得できません"
);

assert(resolveArticleImport("missing-article").status === "error", "存在しない記事IDを拒否できません");
assert(resolveArticleImport(null).status === "idle", "importArticleがない通常アクセスを判定できません");

const fivePokemonArticle: BuildArticle = {
  ...validArticle,
  id: "five-pokemon",
  pokemonSlugs: validArticle.pokemonSlugs.slice(0, 5)
};
assert(
  resolveArticleImport(fivePokemonArticle.id, [fivePokemonArticle], pokemon).status === "error",
  "6体でない記事を拒否できません"
);

const invalidSlugArticle: BuildArticle = {
  ...validArticle,
  id: "invalid-slug",
  pokemonSlugs: [...validArticle.pokemonSlugs.slice(0, 5), "not-a-pokemon"]
};
assert(
  resolveArticleImport(invalidSlugArticle.id, [invalidSlugArticle], pokemon).status === "error",
  "不正なslugを拒否できません"
);

const metadataOnlyArticle: BuildArticle = {
  ...validArticle,
  id: "metadata-only",
  pokemonSlugs: [],
  collectionCompleteness: "metadata-only"
};
assert(
  !canAnalyzeBuildArticle(metadataOnlyArticle) &&
  resolveArticleImport(
    metadataOnlyArticle.id,
    [metadataOnlyArticle],
    pokemon
  ).status === "error",
  "採用6体を確認できないmetadata-only記事に分析リンクまたは取り込みを許可しました"
);

const currentTeam: TeamSlot[] = [
  { id: "slot-1", mode: "pokemon", pokemonSlug: "empoleon" },
  { id: "slot-2", mode: "pokemon", pokemonSlug: "landorus-therian" }
];
const backup = serializeTeam(currentTeam);
assert(parseTeamBackup(backup)?.length === 2, "取り込み前のパーティを退避できません");
assert(
  JSON.stringify(parseTeamBackup(backup)) === JSON.stringify(currentTeam),
  "元のパーティを復元できません"
);
assert(parseTeamBackup("{broken") === null, "壊れた退避データを安全に破棄できません");
assert(parseTeamBackup('[{"mode":"pokemon"}]') === null, "不正な退避データを拒否できません");
assert(parseTeamBackup("[]")?.length === 0, "空の編集中パーティを退避できません");

assert(validResult.status === "ready", "正常な取り込み結果がありません");
assert(
  selectTeamForImportAction(currentTeam, validResult.team, "cancel") === currentTeam,
  "キャンセル時に現在のパーティが変更されました"
);
assert(
  selectTeamForImportAction(currentTeam, validResult.team, "confirm") === validResult.team,
  "確定時に記事のパーティを選択できません"
);
assert(
  selectSeasonForArticleImport(validResult.article, "season-m4", "article") ===
    validResult.article.builderSeasonId,
  "記事のルール・シーズンへ切り替えられません"
);
assert(
  selectSeasonForArticleImport(validResult.article, "season-m4", "current") === "season-m4",
  "現在のルール・シーズンを維持できません"
);
assert(
  selectTeamForRestoreAction(validResult.team, currentTeam, "cancel") === validResult.team,
  "復元確認のキャンセル時に現在のパーティが変更されました"
);
assert(
  selectTeamForRestoreAction(validResult.team, currentTeam, "restore") === currentTeam,
  "復元確認後に退避パーティを選択できません"
);

const firstImportedSlot = validResult.team[0];
assert(firstImportedSlot?.mode === "pokemon", "テスト用の取り込み枠がポケモンではありません");
const limitedPokemon = pokemon.filter((entry) => entry.slug !== firstImportedSlot.pokemonSlug);
const mergedOptions = mergeImportedPokemonOptions(limitedPokemon, validResult.team);
assert(
  validResult.team.every(
    (slot) =>
      slot.mode !== "pokemon" || mergedOptions.some((pokemonEntry) => pokemonEntry.slug === slot.pokemonSlug)
  ),
  "現在のシーズンで使用不可の取り込み済みポケモンを入力欄へ表示できません"
);

console.log("[ok] 構築記事の検証・取り込み・退避・復元を検証しました");
