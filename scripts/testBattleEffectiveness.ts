import {
  describeAbilityAdjustedMoveEffectiveness,
  evaluateMoveAgainstPokemon,
  getAbilityBypassIds,
  getEnvironmentAttackingMoves,
  THREAT_MOVE_THRESHOLDS
} from "@/lib/battleEffectiveness";
import type {
  ThreatEnvironmentAbility,
  ThreatEnvironmentMove
} from "@/types/environmentThreat";
import type { PokemonEntry, TypeName } from "@/types/pokemon";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pokemon(slug: string, types: TypeName[]): PokemonEntry {
  return {
    id: 1,
    slug,
    speciesId: 1,
    isDefaultForm: true,
    formKind: "base",
    formOrder: 1,
    isBattleOnly: false,
    formSelection: "team",
    nameJa: slug,
    nameEn: slug,
    types
  };
}

function move(
  id: string,
  type: TypeName,
  share = 1,
  damageClass: ThreatEnvironmentMove["damageClass"] = "physical"
): ThreatEnvironmentMove {
  return { id, name: id, type, share, damageClass };
}

function ability(
  id: string,
  name: string,
  share = 1
): ThreatEnvironmentAbility {
  return { id, name, share };
}

const attacker = pokemon("attacker", ["ground"]);
const neutralDefender = pokemon("defender", ["normal"]);

const abilityImmunityCases = [
  ["ground", "levitate", "ふゆう"],
  ["fire", "flashfire", "もらいび"],
  ["water", "waterabsorb", "ちょすい"],
  ["water", "stormdrain", "よびみず"],
  ["electric", "lightningrod", "ひらいしん"],
  ["electric", "motordrive", "でんきエンジン"],
  ["grass", "sapsipper", "そうしょく"]
] as const;

for (const [type, abilityId, abilityName] of abilityImmunityCases) {
  const result = evaluateMoveAgainstPokemon({
    move: move(`test-${type}`, type),
    attacker,
    defender: neutralDefender,
    defenderAbilityUsage: [ability(abilityId, abilityName)]
  });
  assert(
    result.expectedMultiplier === 0 && result.immunityProbability === 1,
    `${abilityName}で${type}技を無効化できません`
  );
  assert(
    result.immunityReason?.includes(abilityName),
    `${abilityName}の無効理由が保持されていません`
  );
}

for (const bypass of [
  ["moldbreaker", "かたやぶり"],
  ["teravolt", "テラボルテージ"],
  ["turboblaze", "ターボブレイズ"]
] as const) {
  const result = evaluateMoveAgainstPokemon({
    move: move("earthquake", "ground"),
    attacker,
    defender: neutralDefender,
    attackerAbilityUsage: [ability(bypass[0], bypass[1])],
    defenderAbilityUsage: [ability("levitate", "ふゆう")]
  });
  assert(
    result.expectedMultiplier === 1 && result.immunityProbability === 0,
    `${bypass[1]}でふゆうを無視できません`
  );
  assert(
    result.relevantAbilities.some((entry) => entry.kind === "bypass"),
    `${bypass[1]}の特性無視内訳がありません`
  );
}

const levitateEvaluation = evaluateMoveAgainstPokemon({
  move: move("じしん", "ground"),
  attacker,
  defender: neutralDefender,
  defenderAbilityUsage: [ability("levitate", "ふゆう")]
});
const levitateReason = describeAbilityAdjustedMoveEffectiveness({
  evaluation: levitateEvaluation,
  moveName: "じしん",
  defenderName: "ロトム"
});
assert(
  levitateReason === "ロトムはふゆうでじしんを無効化できます。" &&
    levitateEvaluation.expectedMultiplier === 0,
  `ふゆうの理由文と最終倍率が一致しません: ${levitateReason}`
);

const moldBreakerEvaluation = evaluateMoveAgainstPokemon({
  move: move("じしん", "ground"),
  attacker,
  defender: neutralDefender,
  attackerAbilityUsage: [ability("moldbreaker", "かたやぶり")],
  defenderAbilityUsage: [ability("levitate", "ふゆう")]
});
const moldBreakerReason = describeAbilityAdjustedMoveEffectiveness({
  evaluation: moldBreakerEvaluation,
  moveName: "じしん",
  defenderName: "ロトム"
});
assert(
  moldBreakerReason ===
    "かたやぶりにより、ふゆうを無視してじしんがロトムに有効になります。" &&
    moldBreakerEvaluation.expectedMultiplier === 1 &&
    moldBreakerEvaluation.ignoredDefensiveAbilities.some(
      (entry) =>
        entry.attackerAbilityId === "moldbreaker" &&
        entry.defenderAbilityId === "levitate"
    ),
  `かたやぶりの理由文と最終倍率が一致しません: ${moldBreakerReason}`
);

const flashFireEvaluation = evaluateMoveAgainstPokemon({
  move: move("かえんほうしゃ", "fire"),
  attacker,
  defender: neutralDefender,
  defenderAbilityUsage: [ability("flashfire", "もらいび")]
});
const flashFireReason = describeAbilityAdjustedMoveEffectiveness({
  evaluation: flashFireEvaluation,
  moveName: "かえんほうしゃ",
  defenderName: "ヒードラン"
});
assert(
  flashFireReason ===
    "ヒードランはもらいびでかえんほうしゃを無効化できます。" &&
    flashFireEvaluation.expectedMultiplier === 0,
  `もらいびの理由文と最終倍率が一致しません: ${flashFireReason}`
);

const moldBreakerFlashFireEvaluation = evaluateMoveAgainstPokemon({
  move: move("かえんほうしゃ", "fire"),
  attacker,
  defender: neutralDefender,
  attackerAbilityUsage: [ability("moldbreaker", "かたやぶり")],
  defenderAbilityUsage: [ability("flashfire", "もらいび")]
});
const moldBreakerFlashFireReason = describeAbilityAdjustedMoveEffectiveness({
  evaluation: moldBreakerFlashFireEvaluation,
  moveName: "かえんほうしゃ",
  defenderName: "ヒードラン"
});
assert(
  moldBreakerFlashFireReason ===
    "かたやぶりにより、もらいびを無視してかえんほうしゃがヒードランに有効になります。" &&
    moldBreakerFlashFireEvaluation.expectedMultiplier === 1,
  `かたやぶり+もらいびの理由文が逆です: ${moldBreakerFlashFireReason}`
);

const partialLevitate = evaluateMoveAgainstPokemon({
  move: move("earthquake", "ground"),
  attacker,
  defender: pokemon("electric-defender", ["electric"]),
  defenderAbilityUsage: [ability("levitate", "ふゆう", 0.4)]
});
assert(
  Math.abs(partialLevitate.immunityProbability - 0.4) < 1e-9 &&
    Math.abs(partialLevitate.expectedMultiplier - 1.2) < 1e-9,
  "複数特性のふゆう採用率40%が期待倍率へ反映されていません"
);

const partialMoldBreaker = evaluateMoveAgainstPokemon({
  move: move("earthquake", "ground"),
  attacker,
  defender: pokemon("electric-defender", ["electric"]),
  attackerAbilityUsage: [ability("moldbreaker", "かたやぶり", 0.25)],
  defenderAbilityUsage: [ability("levitate", "ふゆう")]
});
assert(
  Math.abs(partialMoldBreaker.immunityProbability - 0.75) < 1e-9 &&
    Math.abs(partialMoldBreaker.expectedMultiplier - 0.5) < 1e-9,
  "かたやぶり採用率25%とふゆうの期待倍率が不正です"
);

const moves = [
  move("primary", "ice", 0.2),
  move("secondary", "rock", 0.1),
  move("too-low", "water", 0.099),
  move("status", "normal", 0.9, "status"),
  { ...move("unresolved", "fire", 0.8), name: "???" }
];
assert(
  getEnvironmentAttackingMoves(moves).map((entry) => entry.id).join(",") ===
    "primary,secondary",
  "採用率閾値または攻撃技フィルターが不正です"
);
assert(
  THREAT_MOVE_THRESHOLDS.primary === 0.2 &&
    THREAT_MOVE_THRESHOLDS.secondary === 0.1,
  "主要技・補助警戒技の閾値が不正です"
);
assert(
  getAbilityBypassIds().join(",") === "moldbreaker,teravolt,turboblaze",
  "攻撃側の特性無視一覧が不正です"
);

console.log(
  `battle effectiveness tests passed: immunities=${abilityImmunityCases.length}, bypasses=3, thresholds=${THREAT_MOVE_THRESHOLDS.primary}/${THREAT_MOVE_THRESHOLDS.secondary}`
);
