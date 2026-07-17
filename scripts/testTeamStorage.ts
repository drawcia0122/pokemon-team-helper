import { parseStoredTeam, serializeTeam } from "@/lib/teamStorage";
import type { TeamSlot } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const team: TeamSlot[] = [
  {
    id: "slot-1",
    mode: "pokemon",
    pokemonSlug: "empoleon"
  },
  {
    id: "slot-2",
    mode: "type",
    primaryType: "ground",
    secondaryType: "flying"
  }
];

const restored = parseStoredTeam(serializeTeam(team));

assert(JSON.stringify(restored) === JSON.stringify(team), "パーティの保存・復元結果が一致しません");
assert(restored[0]?.mode === "pokemon", "ポケモン指定スロットを復元できません");
assert(restored[1]?.mode === "type", "タイプ指定スロットを復元できません");

let malformedJsonWasRejected = false;
try {
  parseStoredTeam("{invalid");
} catch {
  malformedJsonWasRejected = true;
}

assert(malformedJsonWasRejected, "不正な保存データを拒否できません");

console.log("[ok] パーティのJSON保存・復元を検証しました");
