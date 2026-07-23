import { getTeamSlotsByPosition } from "@/lib/teamSlotLayout";
import { getPokemonBySlug } from "@/lib/typeChart";
import type { PokemonEntry, TeamSlot } from "@/types/pokemon";

export type AdvisorBuildPhase =
  | "empty"
  | "partner"
  | "coreCompletion"
  | "situationalCoverage"
  | "completeOptimization";

export type AdvisorPhasePresentation = {
  title: string;
  description: string;
  candidateLabel: string;
};

export function getAdvisorBuildPhase(
  team: readonly TeamSlot[]
): AdvisorBuildPhase {
  return getAdvisorBuildPhaseForCount(getAdvisorPokemonCount(team));
}

export function getAdvisorPokemonCount(team: readonly TeamSlot[]): number {
  return team.filter((slot) => slot.mode === "pokemon").length;
}

export function getAdvisorAnchor(
  team: readonly TeamSlot[]
): PokemonEntry | null {
  for (const slot of getTeamSlotsByPosition(team)) {
    if (slot?.mode !== "pokemon") continue;
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    if (pokemon) return pokemon;
  }
  return null;
}
export function getAdvisorBuildPhaseForCount(
  count: number
): AdvisorBuildPhase {
  const memberCount = Math.max(0, Math.min(6, count));
  if (memberCount === 0) return "empty";
  if (memberCount === 1) return "partner";
  if (memberCount === 2) return "coreCompletion";
  if (memberCount < 6) return "situationalCoverage";
  return "completeOptimization";
}

export function getAdvisorPhasePresentation(
  phase: AdvisorBuildPhase,
  memberCount: number
): AdvisorPhasePresentation {
  switch (phase) {
    case "empty":
      return {
        title: "最初の1匹を選ぶ",
        description:
          "まず使いたいポケモンを1匹選んでください。1匹目を選ぶと、そのポケモンと相性の良い相棒候補を表示します。",
        candidateLabel: "最初の1匹を選択"
      };
    case "partner":
      return {
        title: "相棒候補を選ぶ",
        description:
          "選んだ1匹の弱点・攻撃範囲・役割を補い、お互いにカバーしやすい候補です。",
        candidateLabel: "この1匹と相性の良い相棒候補"
      };
    case "coreCompletion":
      return {
        title: "構築の核を完成させる3匹目",
        description:
          "現在の2匹に共通する弱点や不足役割を補い、3匹で安定した構築の核を作る候補です。",
        candidateLabel: "現在の2匹を補う3匹目候補"
      };
    case "situationalCoverage":
      if (memberCount === 3) {
        return {
          title: "4匹目候補 — 構築の核が苦手な状況を補う",
          description:
            "構築の核では対応しにくい具体的な状況へ、複数の回答を追加できる候補を優先します。",
          candidateLabel: "現在の構築が苦手な状況をカバーする4匹目"
        };
      }
      if (memberCount === 4) {
        return {
          title: "5匹目候補 — 残っている弱点を補う",
          description:
            "残っている複数の課題をまとめて改善し、既存4体と役割が重複しすぎない候補です。",
          candidateLabel: "残っている弱点を補う5匹目候補"
        };
      }
      return {
        title: "最後の1枠で最大の穴を埋める",
        description:
          "最重要の未解決脅威へ回答し、既存5体では代替しにくい役割を加える候補を優先します。",
        candidateLabel: "最後の1枠 — 最も大きな穴を埋める"
      };
    case "completeOptimization":
      return {
        title: "完成したパーティを改善",
        description:
          "6体完成後は、役割損失を含むTASK037の入れ替えシミュレーションで改善案を比較します。",
        candidateLabel: "完成したパーティの入れ替え改善案"
      };
  }
}

export function getAdvisorNextPhaseAnnouncement(
  memberCount: number
): string {
  return getAdvisorPhasePresentation(
    getAdvisorBuildPhaseForCount(memberCount),
    memberCount
  ).title;
}
