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
};

const EXCLUDED_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: "pokemon-go", pattern: /pok[eé]mon\s*go|ポケモン\s*go/i },
  { reason: "pokemon-card", pattern: /ポケモンカード|ポケカ|デッキレシピ/i },
  { reason: "pokemon-unite", pattern: /pok[eé]mon\s*unite|ポケモンユナイト/i },
  { reason: "goods-or-news", pattern: /商品紹介|グッズ|ニュースまとめ|発売情報/i },
  { reason: "illustration", pattern: /イラスト|お絵描き|ファンアート/i },
  { reason: "video-only", pattern: /動画のみ|動画で解説|youtubeのみ/i }
];

export function classifyBuildArticle(
  input: ClassificationInput
): { accepted: true } | { accepted: false; reason: string } {
  const combined = [input.title, ...input.tags, input.text.slice(0, 8000)].join(
    "\n"
  );

  for (const exclusion of EXCLUDED_PATTERNS) {
    if (exclusion.pattern.test(combined)) {
      return { accepted: false, reason: exclusion.reason };
    }
  }

  const championsRelated =
    /pok[eé]mon\s*champions|ポケモンチャンピオンズ|ポケモンchampions|ポケチャン/i.test(
      combined
    );
  if (!championsRelated) {
    if (/スカーレット|バイオレット|ポケモンsv|\bsv\b/i.test(combined)) {
      return { accepted: false, reason: "other-game-sv" };
    }
    return { accepted: false, reason: "not-pokemon-champions" };
  }
  if (!/構築|パーティ|使用構築|個体紹介|採用/i.test(combined)) {
    return { accepted: false, reason: "not-a-build-article" };
  }
  if (
    !input.hasExactTeam &&
    !input.hasExplicitTeamSection &&
    /初心者講座|環境考察|対戦日記|構築まとめ|構築\d+選|これを読め|ランキング/i.test(
      input.title
    )
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
