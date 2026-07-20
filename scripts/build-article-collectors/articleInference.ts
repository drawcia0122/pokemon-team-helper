import type { BattleFormat } from "../../types/buildArticle";
import type { AppMeta } from "../../types/pokemon";

export type ScoredInference<T> = {
  value: T | null;
  confidence: number;
  evidence: string[];
  ambiguous: boolean;
};

export type TargetGameValue =
  | "pokemon-champions"
  | "other-pokemon-game"
  | "unknown";

type WeightedScope = {
  label: string;
  text: string;
  weight: number;
};

const SINGLE_PATTERN =
  /シングル(?:バトル|構築|最終|レート)?|シングル最終|シングルレート|1\s*vs\s*1形式|singles?/i;
const DOUBLE_PATTERN =
  /ダブル(?:バトル|構築|最終|レート)?|ダブル最終|ダブルレート|doubles?|\bVGC\b/i;
const CHAMPIONS_PATTERN =
  /pok[eé]mon\s*champions|pokemon\s*champions|ポケモン\s*チャンピオンズ|ポケモンchampions|ポケチャン/i;
const OTHER_GAME_PATTERNS = [
  /ポケモン\s*(?:スカーレット|バイオレット|SV)|スカーレット・バイオレット/i,
  /ポケモン\s*(?:ソード|シールド)|剣盾/i,
  /\bBDSP\b|ブリリアントダイヤモンド|シャイニングパール/i,
  /pok[eé]mon\s*go|ポケモン\s*go/i,
  /pok[eé]mon\s*unite|ポケモン\s*ユナイト/i,
  /ポケモンカード|ポケカ|ポケポケ/i,
  /pok[eé]mon\s*legends|レジェンズ|LEGENDS/i,
  /ポケマス/i
] as const;

function scorePattern(
  scopes: WeightedScope[],
  pattern: RegExp
): { score: number; evidence: string[] } {
  let score = 0;
  const evidence: string[] = [];
  for (const scope of scopes) {
    if (!pattern.test(scope.text)) continue;
    score += scope.weight;
    evidence.push(`${scope.label}:${scope.text.match(pattern)?.[0] ?? "一致"}`);
  }
  return { score, evidence };
}

export function inferBattleFormat(input: {
  title: string;
  tags: string[];
  introduction: string;
  teamContext: string;
  text: string;
}): ScoredInference<BattleFormat> {
  const scopes: WeightedScope[] = [
    { label: "title", text: input.title, weight: 5 },
    { label: "introduction", text: input.introduction, weight: 4 },
    { label: "team-section", text: input.teamContext, weight: 5 },
    { label: "tags", text: input.tags.join(" "), weight: 3 },
    { label: "body", text: input.text.slice(0, 8000), weight: 2 }
  ];
  const single = scorePattern(scopes, SINGLE_PATTERN);
  const double = scorePattern(scopes, DOUBLE_PATTERN);
  const highest = Math.max(single.score, double.score);
  if (highest < 4) {
    return {
      value: null,
      confidence: Math.min(highest / 10, 0.39),
      evidence: [...single.evidence, ...double.evidence],
      ambiguous: false
    };
  }
  if (
    single.score > 0 &&
    double.score > 0 &&
    Math.abs(single.score - double.score) < 3
  ) {
    return {
      value: null,
      confidence: Math.min(highest / 12, 0.79),
      evidence: [...single.evidence, ...double.evidence],
      ambiguous: true
    };
  }
  const selected = single.score > double.score ? single : double;
  return {
    value: single.score > double.score ? "single" : "double",
    confidence: Math.min(1, selected.score / 10),
    evidence: selected.evidence,
    ambiguous: false
  };
}

export function inferTargetGame(input: {
  title: string;
  tags: string[];
  introduction: string;
  teamContext: string;
  text: string;
}): ScoredInference<TargetGameValue> {
  const scopes: WeightedScope[] = [
    { label: "title", text: input.title, weight: 6 },
    { label: "introduction", text: input.introduction, weight: 5 },
    { label: "team-section", text: input.teamContext, weight: 5 },
    { label: "tags", text: input.tags.join(" "), weight: 4 },
    { label: "body", text: input.text.slice(0, 8000), weight: 2 }
  ];
  const champions = scorePattern(scopes, CHAMPIONS_PATTERN);
  const otherEvidence: string[] = [];
  let otherScore = 0;
  for (const pattern of OTHER_GAME_PATTERNS) {
    const result = scorePattern(scopes, pattern);
    otherScore += result.score;
    otherEvidence.push(...result.evidence);
  }
  const ambiguous =
    champions.score >= 5 &&
    otherScore >= 5 &&
    Math.abs(champions.score - otherScore) < 4;
  if (ambiguous) {
    return {
      value: "unknown",
      confidence: Math.min(0.79, champions.score / 14),
      evidence: [...champions.evidence, ...otherEvidence],
      ambiguous: true
    };
  }
  if (champions.score >= 5 && champions.score >= otherScore + 2) {
    return {
      value: "pokemon-champions",
      confidence: Math.min(1, champions.score / 10),
      evidence: champions.evidence,
      ambiguous: false
    };
  }
  if (otherScore >= 5 && champions.score < 5) {
    return {
      value: "other-pokemon-game",
      confidence: Math.min(1, otherScore / 10),
      evidence: otherEvidence,
      ambiguous: false
    };
  }
  return {
    value: "unknown",
    confidence: Math.min(0.49, champions.score / 10),
    evidence: [...champions.evidence, ...otherEvidence],
    ambiguous: false
  };
}

function seasonNumbersInScope(
  scope: string,
  appMeta: AppMeta
): number[] {
  const normalized = scope.normalize("NFKC");
  const values = new Set<number>();
  const patterns = [
    /(?:シーズン|season)?\s*M\s*[-‐‑‒–—ー]?\s*([1-4])\b/gi,
    /マスター\s*[-‐‑‒–—ー]?\s*([1-4])\b/gi,
    /マスター\s*(I{1,3}|IV)\b/gi,
    /第\s*([1-4])\s*シーズン/gi,
    /シーズン\s*0?([1-4])\b/gi
  ];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const roman = match[1]?.toUpperCase();
      const number =
        roman === "I"
          ? 1
          : roman === "II"
            ? 2
            : roman === "III"
              ? 3
              : roman === "IV"
                ? 4
                : Number(match[1]);
      if (
        Number.isInteger(number) &&
        appMeta.seasonIds.includes(`season-m${number}`)
      ) {
        values.add(number);
      }
    }
  }
  return [...values];
}

export function inferSeason(input: {
  title: string;
  tags: string[];
  introduction: string;
  teamContext: string;
  appMeta: AppMeta;
}): ScoredInference<string> {
  const scopes: WeightedScope[] = [
    { label: "title", text: input.title, weight: 6 },
    { label: "introduction", text: input.introduction, weight: 5 },
    { label: "team-section", text: input.teamContext, weight: 5 },
    { label: "tags", text: input.tags.join(" "), weight: 3 }
  ];
  const scores = new Map<number, { score: number; evidence: string[] }>();
  for (const scope of scopes) {
    for (const season of seasonNumbersInScope(scope.text, input.appMeta)) {
      const current = scores.get(season) ?? { score: 0, evidence: [] };
      current.score += scope.weight;
      current.evidence.push(`${scope.label}:M-${season}`);
      scores.set(season, current);
    }
  }
  if (scores.size === 0) {
    return { value: null, confidence: 0, evidence: [], ambiguous: false };
  }
  const ranked = [...scores.entries()].sort(
    (left, right) => right[1].score - left[1].score
  );
  if (
    ranked.length > 1 &&
    Math.abs(ranked[0][1].score - ranked[1][1].score) < 3
  ) {
    return {
      value: null,
      confidence: Math.min(0.79, ranked[0][1].score / 10),
      evidence: ranked.flatMap((entry) => entry[1].evidence),
      ambiguous: true
    };
  }
  return {
    value: `season-m${ranked[0][0]}`,
    confidence: Math.min(1, ranked[0][1].score / 8),
    evidence: ranked[0][1].evidence,
    ambiguous: false
  };
}
