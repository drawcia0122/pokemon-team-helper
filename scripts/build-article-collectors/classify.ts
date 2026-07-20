import type { BattleFormat } from "../../types/buildArticle";

export type ClassificationInput = {
  title: string;
  text: string;
  tags: string[];
  battleFormat: BattleFormat | null;
  builderSeasonId: string | null;
  regulationId: string | null;
  hasExplicitTeamSection: boolean;
  hasExactTeam: boolean;
  targetGame?:
    | "pokemon-champions"
    | "other-pokemon-game"
    | "unknown";
};

const EXCLUDED_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: "pokemon-go", pattern: /pok[eé]mon\s*go|ポケモン\s*go/i },
  { reason: "pokemon-card", pattern: /ポケモンカード|ポケカ|デッキレシピ/i },
  { reason: "pokemon-unite", pattern: /pok[eé]mon\s*unite|ポケモンユナイト/i },
  { reason: "goods-or-news", pattern: /商品紹介|グッズ|ニュースまとめ|発売情報/i },
  { reason: "illustration", pattern: /イラスト|お絵描き|ファンアート/i },
  { reason: "video-only", pattern: /動画のみ|動画で解説|youtubeのみ/i }
];

const NON_CONCRETE_BUILD_TITLE_PATTERN =
  /初心者講座|環境考察|環境分析|メタ分析|対戦日記|構築まとめ|構築\d+選|これを読め|ランキング/i;

export function isNonConcreteBuildTitle(title: string): boolean {
  return NON_CONCRETE_BUILD_TITLE_PATTERN.test(title);
}

export function classifyBuildArticle(
  input: ClassificationInput
): { accepted: true } | { accepted: false; reason: string } {
  const combined = [input.title, ...input.tags, input.text.slice(0, 8000)].join(
    "\n"
  );
  const targetGame =
    input.targetGame ??
    (/pok[eé]mon\s*champions|ポケモンチャンピオンズ|ポケモンchampions|ポケチャン/i.test(
      combined
    )
      ? "pokemon-champions"
      : /スカーレット|バイオレット|ポケモンsv|\bsv\b|pok[eé]mon\s*go|ポケモンカード/i.test(
            combined
          )
        ? "other-pokemon-game"
        : "unknown");

  for (const exclusion of EXCLUDED_PATTERNS) {
    if (
      targetGame === "pokemon-champions" &&
      ["pokemon-go", "pokemon-card", "pokemon-unite"].includes(
        exclusion.reason
      )
    ) {
      continue;
    }
    if (exclusion.pattern.test(combined)) {
      return { accepted: false, reason: exclusion.reason };
    }
  }

  if (targetGame !== "pokemon-champions") {
    if (targetGame === "other-pokemon-game") {
      if (/スカーレット|バイオレット|ポケモンsv|\bsv\b/i.test(combined)) {
        return { accepted: false, reason: "other-game-sv" };
      }
      return { accepted: false, reason: "other-pokemon-game" };
    }
    return { accepted: false, reason: "not-pokemon-champions" };
  }
  if (!/構築|パーティ|使用構築|個体紹介|採用/i.test(combined)) {
    return { accepted: false, reason: "not-a-build-article" };
  }
  if (
    !input.hasExactTeam &&
    !input.hasExplicitTeamSection &&
    isNonConcreteBuildTitle(input.title)
  ) {
    return { accepted: false, reason: "not-concrete-build-article" };
  }
  if (!input.builderSeasonId) {
    return { accepted: false, reason: "missing-season" };
  }
  if (!input.regulationId) {
    return { accepted: false, reason: "missing-regulation" };
  }
  if (!input.battleFormat) {
    return { accepted: false, reason: "missing-battle-format" };
  }
  return { accepted: true };
}
