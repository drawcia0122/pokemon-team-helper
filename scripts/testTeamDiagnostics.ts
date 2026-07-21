import { readFileSync } from "node:fs";
import path from "node:path";
import { getAvailablePokemonBySeason } from "@/lib/regulations";
import { getTeamDiagnostics } from "@/lib/teamDiagnostics";
import { summarizeTeam } from "@/lib/typeChart";
import type { TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const available = getAvailablePokemonBySeason("season-m4");

function diagnose(team: TeamSlot[]) {
  return getTeamDiagnostics(team, summarizeTeam(team), available);
}

function pokemonSlot(id: string, pokemonSlug: string): TeamSlot {
  return { id, mode: "pokemon", pokemonSlug };
}

const empty = diagnose([]);
assert(
  empty.strengths.length === 0 && empty.cautions.length === 0,
  "空パーティを偏りなしと判定できません"
);

const one = diagnose([pokemonSlot("slot-1", "charizard")]);
assert(
  one.strengths.length <= 3 &&
    one.cautions.length <= 3 &&
    [...one.strengths, ...one.cautions].every(
      (item) => item.title.length > 0 && item.reason.length > 0
    ),
  "1体パーティの診断件数または理由が不正です"
);

const threeTeam = [
  pokemonSlot("slot-1", "charizard"),
  pokemonSlot("slot-2", "rotom-wash"),
  pokemonSlot("slot-3", "garchomp")
];
const three = diagnose(threeTeam);
assert(
  three.strengths.length <= 3 && three.cautions.length <= 3,
  "3体パーティの診断が最大3件を超えました"
);

const sixTeam = [
  ...threeTeam,
  pokemonSlot("slot-4", "empoleon"),
  pokemonSlot("slot-5", "gardevoir"),
  pokemonSlot("slot-6", "corviknight")
];
const six = diagnose(sixTeam);
assert(
  six.strengths.length <= 3 &&
    six.cautions.length <= 3 &&
    six.strengths.some((item) => item.id === "wide-offense"),
  "6体パーティの最大件数または攻撃範囲判定が不正です"
);

const slowPhysicalTeam = [
  pokemonSlot("slot-1", "snorlax"),
  pokemonSlot("slot-2", "steelix"),
  pokemonSlot("slot-3", "donphan"),
  pokemonSlot("slot-4", "hippowdon")
];
const slowPhysical = diagnose(slowPhysicalTeam);
assert(
  slowPhysical.cautions.some((item) => item.id === "low-speed") &&
    slowPhysical.cautions.some(
      (item) => item.id === "special-attacker-shortage"
    ),
  "素早さまたは特殊アタッカー不足を判定できません"
);

const typeGapTeam: TeamSlot[] = [
  { id: "slot-1", mode: "type", primaryType: "fire" },
  { id: "slot-2", mode: "type", primaryType: "fire" },
  { id: "slot-3", mode: "type", primaryType: "fire" }
];
const typeGap = diagnose(typeGapTeam);
assert(
  typeGap.cautions.some(
    (item) =>
      item.id.startsWith("type-gap-") && item.reason.includes("3体が弱点")
  ),
  "半減・無効がなく半数以上が弱点のタイプを一貫と判定できません"
);

const normalForm = diagnose([pokemonSlot("slot-1", "charizard")]);
const megaForm = diagnose([pokemonSlot("slot-1", "charizard-mega-x")]);
assert(
  JSON.stringify(normalForm) !== JSON.stringify(megaForm),
  "フォーム変更後のタイプ・種族値で診断を更新できません"
);

const unavailable = diagnose([
  pokemonSlot("slot-1", "mewtwo-mega-x")
]);
assert(
  unavailable.cautions[0]?.id === "unavailable-pokemon",
  "現在ルールの使用不可判定を診断に反映できません"
);

const panelSource = readFileSync(
  path.join(process.cwd(), "components/team/AnalysisPanels.tsx"),
  "utf8"
);
const workspaceStyles = readFileSync(
  path.join(process.cwd(), "components/team/TeamWorkspace.module.css"),
  "utf8"
);
assert(
  panelSource.includes("パーティ診断") &&
    panelSource.includes("強み") &&
    panelSource.includes("注意点") &&
    panelSource.includes("大きな偏りは見つかりませんでした。") &&
    panelSource.includes("item.reason"),
  "診断UIの分類・理由・空状態が不足しています"
);
assert(
  workspaceStyles.includes(
    ".diagnosticsGrid { display: grid; grid-template-columns: 1fr 1fr;"
  ) &&
    workspaceStyles.includes(
      ".diagnosticsGrid { grid-template-columns: 1fr; gap: 7px; }"
    ) &&
    workspaceStyles.includes(".diagnosticsGrid > div { min-width: 0;"),
  "診断UIをモバイルで1列化、または横はみ出し防止できていません"
);

console.log(
  "[ok] 種族値・タイプ相性・攻撃範囲・使用可能判定によるパーティ診断を検証しました"
);
