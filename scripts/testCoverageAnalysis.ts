import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getCoveredOffenseRows,
  getDefensiveAttentionRows
} from "@/lib/teamUi";
import { summarizeTeam } from "@/lib/typeChart";
import type { TeamSlot, TypeName } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function typeSlot(id: string, primaryType: TypeName): TeamSlot {
  return { id, mode: "type", primaryType };
}

const emptySummary = summarizeTeam([]);
assert(
  getCoveredOffenseRows(emptySummary).length === 0 &&
    getDefensiveAttentionRows(emptySummary).length === 0,
  "空パーティを正常に扱えません"
);

const oneFireSummary = summarizeTeam([typeSlot("slot-1", "fire")]);
const oneFireCovered = getCoveredOffenseRows(oneFireSummary);
assert(
  oneFireCovered.length > 0 &&
    oneFireCovered.every((row) => row.superEffectiveCount === 1),
  "1枠だけ抜群を取れるタイプを統合一覧へ表示できません"
);
assert(
  !oneFireCovered.some((row) => row.superEffectiveCount === 0),
  "0枠のタイプが抜群一覧へ混入しました"
);
assert(
  getDefensiveAttentionRows(oneFireSummary).some(
    (row) => row.attackType === "normal"
  ),
  "1体パーティの全員等倍以上タイプを要注意に表示できません"
);

const twoFireSummary = summarizeTeam([
  typeSlot("slot-1", "fire"),
  typeSlot("slot-2", "fire")
]);
assert(
  getCoveredOffenseRows(twoFireSummary).some(
    (row) => row.defendType === "grass" && row.superEffectiveCount === 2
  ),
  "複数枠で抜群を取れるタイプを同じ一覧へ表示できません"
);

const resistanceSummary = summarizeTeam([
  typeSlot("slot-1", "fire"),
  typeSlot("slot-2", "water")
]);
const resistanceAttention = getDefensiveAttentionRows(resistanceSummary);
assert(
  !resistanceAttention.some((row) => row.attackType === "water"),
  "半減できるメンバーがいるタイプを要注意から除外できません"
);
assert(
  resistanceAttention.some((row) => row.attackType === "electric"),
  "全員が等倍以上のタイプを要注意へ表示できません"
);

const immunitySummary = summarizeTeam([
  typeSlot("slot-1", "ground"),
  typeSlot("slot-2", "fire")
]);
assert(
  !getDefensiveAttentionRows(immunitySummary).some(
    (row) => row.attackType === "electric"
  ),
  "無効にできるメンバーがいるタイプを要注意から除外できません"
);

const sixMemberSummary = summarizeTeam([
  typeSlot("slot-1", "fire"),
  typeSlot("slot-2", "water"),
  typeSlot("slot-3", "grass"),
  typeSlot("slot-4", "electric"),
  typeSlot("slot-5", "ground"),
  typeSlot("slot-6", "steel")
]);
assert(
  getCoveredOffenseRows(sixMemberSummary).every(
    (row) => row.superEffectiveCount >= 1 && row.superEffectiveCount <= 6
  ) &&
    getDefensiveAttentionRows(sixMemberSummary).every((row) =>
      row.multiplierMap.resist +
        row.multiplierMap.doubleResist +
        row.multiplierMap.immune ===
      0
    ),
  "6体パーティの攻撃範囲または要注意条件が不正です"
);

const normalCharizard = summarizeTeam([
  { id: "slot-1", mode: "pokemon", pokemonSlug: "charizard" }
]);
const megaCharizardX = summarizeTeam([
  { id: "slot-1", mode: "pokemon", pokemonSlug: "charizard-mega-x" }
]);
assert(
  getDefensiveAttentionRows(normalCharizard).some(
    (row) => row.attackType === "electric"
  ) &&
    !getDefensiveAttentionRows(megaCharizardX).some(
      (row) => row.attackType === "electric"
    ),
  "フォーム切り替え後の防御相性を即時更新できません"
);

const panelSource = readFileSync(
  path.join(process.cwd(), "components/team/AnalysisPanels.tsx"),
  "utf8"
);
assert(
  panelSource.includes("抜群を取れるタイプ") &&
    panelSource.includes("未対応（0枠）") &&
    !panelSource.includes("十分に狙える") &&
    !panelSource.includes("1枠だけで抜群を取れる相手"),
  "攻撃範囲の重複表示を統合できません"
);
assert(
  panelSource.includes("getDefensiveAttentionRows") &&
    panelSource.includes("半減・無効で受けられるメンバーなし") &&
    panelSource.includes("半減・無効で受けられないタイプはありません。") &&
    panelSource.includes("全タイプに抜群打点があります。"),
  "要注意の表示条件または説明が更新されていません"
);

console.log("[ok] 攻撃範囲の統合表示と半減・無効基準の要注意を検証しました");
