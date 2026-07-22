import { getMultiplier } from "@/lib/typeChart";
import type {
  ThreatEnvironmentAbility,
  ThreatEnvironmentMove
} from "@/types/environmentThreat";
import type { PokemonEntry, TypeName } from "@/types/pokemon";

export const THREAT_MOVE_THRESHOLDS = {
  primary: 0.2,
  secondary: 0.1
} as const;

const ATTACKER_ABILITY_BYPASSES = new Set([
  "moldbreaker",
  "teravolt",
  "turboblaze"
]);

const DEFENSIVE_IMMUNITIES: Partial<Record<string, TypeName[]>> = {
  levitate: ["ground"],
  flashfire: ["fire"],
  waterabsorb: ["water"],
  stormdrain: ["water"],
  dryskin: ["water"],
  lightningrod: ["electric"],
  motordrive: ["electric"],
  sapsipper: ["grass"]
};

type BattlePokemon = Pick<PokemonEntry, "slug" | "types">;

type AbilityScenario = {
  ability: ThreatEnvironmentAbility | null;
  probability: number;
};

export type BattleAbilityEffect = {
  abilityId: string;
  abilityName: string;
  kind: "immunity" | "resistance" | "bypass";
  probability: number;
};

export type MoveEffectivenessEvaluation = {
  baseMultiplier: number;
  adjustedMultiplier: number;
  expectedMultiplier: number;
  immunityProbability: number;
  resistanceProbability: number;
  quarterResistanceProbability: number;
  stableResistanceProbability: number;
  neutralProbability: number;
  weaknessProbability: number;
  quadWeaknessProbability: number;
  immunityReason: string | null;
  resistanceReason: string | null;
  relevantAbilities: BattleAbilityEffect[];
};

export type EvaluateMoveAgainstPokemonInput = {
  move: Pick<ThreatEnvironmentMove, "type" | "damageClass">;
  attacker: BattlePokemon;
  defender: BattlePokemon;
  attackerAbilityUsage?: ThreatEnvironmentAbility[];
  defenderAbilityUsage?: ThreatEnvironmentAbility[];
};

type DefensiveAbilityAdjustment = {
  multiplier: number;
  kind: "immunity" | "resistance" | null;
};

function clampProbability(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toAbilityScenarios(
  abilities: ThreatEnvironmentAbility[] | undefined
): AbilityScenario[] {
  const valid = (abilities ?? []).filter(
    (ability) =>
      ability.id.trim().length > 0 &&
      Number.isFinite(ability.share) &&
      ability.share > 0
  );
  if (valid.length === 0) return [{ ability: null, probability: 1 }];

  const total = valid.reduce((sum, ability) => sum + ability.share, 0);
  if (total > 1) {
    return valid.map((ability) => ({
      ability,
      probability: ability.share / total
    }));
  }

  const scenarios: AbilityScenario[] = valid.map((ability) => ({
    ability,
    probability: ability.share
  }));
  if (total < 1) {
    scenarios.push({ ability: null, probability: 1 - total });
  }
  return scenarios;
}

function getDefensiveAbilityAdjustment(
  move: Pick<ThreatEnvironmentMove, "type" | "damageClass">,
  baseMultiplier: number,
  abilityId: string | undefined
): DefensiveAbilityAdjustment {
  if (!abilityId || baseMultiplier === 0) {
    return { multiplier: baseMultiplier, kind: null };
  }

  if (DEFENSIVE_IMMUNITIES[abilityId]?.includes(move.type)) {
    return { multiplier: 0, kind: "immunity" };
  }
  if (abilityId === "wonderguard" && baseMultiplier <= 1) {
    return { multiplier: 0, kind: "immunity" };
  }

  let modifier = 1;
  if (
    abilityId === "thickfat" &&
    (move.type === "fire" || move.type === "ice")
  ) {
    modifier *= 0.5;
  }
  if (abilityId === "heatproof" && move.type === "fire") modifier *= 0.5;
  if (abilityId === "waterbubble" && move.type === "fire") modifier *= 0.5;
  if (abilityId === "icescales" && move.damageClass === "special") {
    modifier *= 0.5;
  }

  return {
    multiplier: baseMultiplier * modifier,
    kind: modifier < 1 ? "resistance" : null
  };
}

function addAbilityEffect(
  effects: Map<string, BattleAbilityEffect>,
  ability: ThreatEnvironmentAbility,
  kind: BattleAbilityEffect["kind"],
  probability: number
): void {
  const key = `${kind}:${ability.id}`;
  const current = effects.get(key);
  effects.set(key, {
    abilityId: ability.id,
    abilityName: ability.name,
    kind,
    probability: clampProbability((current?.probability ?? 0) + probability)
  });
}

export function isResolvedDamagingMove(
  move: Pick<ThreatEnvironmentMove, "id" | "name" | "damageClass">
): boolean {
  return (
    move.id.trim().length > 0 &&
    move.name.trim().length > 0 &&
    move.name !== "???" &&
    move.name !== "未対応" &&
    move.damageClass !== "status"
  );
}

export function getEnvironmentAttackingMoves(
  moves: ThreatEnvironmentMove[] | undefined,
  minimumShare = THREAT_MOVE_THRESHOLDS.secondary
): ThreatEnvironmentMove[] {
  return (moves ?? [])
    .filter(
      (move) =>
        isResolvedDamagingMove(move) &&
        Number.isFinite(move.share) &&
        move.share >= minimumShare
    )
    .sort((left, right) => right.share - left.share || left.id.localeCompare(right.id));
}

export function evaluateMoveAgainstPokemon({
  move,
  attacker,
  defender,
  attackerAbilityUsage,
  defenderAbilityUsage
}: EvaluateMoveAgainstPokemonInput): MoveEffectivenessEvaluation {
  void attacker;
  const baseMultiplier = getMultiplier(move.type, defender.types);
  const attackerScenarios = toAbilityScenarios(attackerAbilityUsage);
  const defenderScenarios = toAbilityScenarios(defenderAbilityUsage);
  const effects = new Map<string, BattleAbilityEffect>();
  let expectedMultiplier = 0;
  let immunityProbability = 0;
  let resistanceProbability = 0;
  let quarterResistanceProbability = 0;
  let neutralProbability = 0;
  let weaknessProbability = 0;
  let quadWeaknessProbability = 0;

  for (const attackerScenario of attackerScenarios) {
    const bypassesAbilities = ATTACKER_ABILITY_BYPASSES.has(
      attackerScenario.ability?.id ?? ""
    );
    for (const defenderScenario of defenderScenarios) {
      const probability =
        attackerScenario.probability * defenderScenario.probability;
      const withoutBypass = getDefensiveAbilityAdjustment(
        move,
        baseMultiplier,
        defenderScenario.ability?.id
      );
      const adjustment = bypassesAbilities
        ? { multiplier: baseMultiplier, kind: null }
        : withoutBypass;
      const multiplier = adjustment.multiplier;
      expectedMultiplier += multiplier * probability;

      if (multiplier === 0) immunityProbability += probability;
      else if (multiplier <= 0.5) {
        resistanceProbability += probability;
        if (multiplier <= 0.25) quarterResistanceProbability += probability;
      }
      else if (multiplier > 1) {
        weaknessProbability += probability;
        if (multiplier >= 4) quadWeaknessProbability += probability;
      } else neutralProbability += probability;

      if (defenderScenario.ability && adjustment.kind) {
        addAbilityEffect(
          effects,
          defenderScenario.ability,
          adjustment.kind,
          probability
        );
      }
      if (
        attackerScenario.ability &&
        bypassesAbilities &&
        defenderScenario.ability &&
        withoutBypass.kind
      ) {
        addAbilityEffect(
          effects,
          attackerScenario.ability,
          "bypass",
          probability
        );
      }
    }
  }

  const relevantAbilities = [...effects.values()].sort(
    (left, right) =>
      right.probability - left.probability ||
      left.abilityId.localeCompare(right.abilityId)
  );
  const immunityEffect = relevantAbilities.find(
    (effect) => effect.kind === "immunity"
  );
  const resistanceEffect = relevantAbilities.find(
    (effect) => effect.kind === "resistance"
  );

  return {
    baseMultiplier,
    adjustedMultiplier: expectedMultiplier,
    expectedMultiplier,
    immunityProbability: clampProbability(immunityProbability),
    resistanceProbability: clampProbability(resistanceProbability),
    quarterResistanceProbability: clampProbability(
      quarterResistanceProbability
    ),
    stableResistanceProbability: clampProbability(
      immunityProbability + resistanceProbability
    ),
    neutralProbability: clampProbability(neutralProbability),
    weaknessProbability: clampProbability(weaknessProbability),
    quadWeaknessProbability: clampProbability(quadWeaknessProbability),
    immunityReason: immunityEffect
      ? `${immunityEffect.abilityName}で無効`
      : baseMultiplier === 0
        ? "タイプ相性で無効"
        : null,
    resistanceReason: resistanceEffect
      ? `${resistanceEffect.abilityName}で軽減`
      : expectedMultiplier > 0 && expectedMultiplier <= 0.5
        ? "タイプ相性で半減以下"
        : null,
    relevantAbilities
  };
}

export function getAbilityBypassIds(): readonly string[] {
  return [...ATTACKER_ABILITY_BYPASSES];
}
