import {
  evaluateMoveAgainstPokemon,
  getEnvironmentAttackingMoves,
  THREAT_MOVE_THRESHOLDS
} from "@/lib/battleEffectiveness";
import {
  compareAdvisorSpeedRanges,
  evaluateAdvisorAttackPressure,
  getAdvisorMoveQuality,
  getAdvisorSpeedRange
} from "@/lib/advisorMoveQuality";
import {
  buildAbilityDenialProfile,
  buildAbilityEnvironmentDemand,
  type AbilityEnvironmentDemand
} from "@/lib/abilityDenialProfile";
import { BoundedCache } from "@/lib/boundedCache";
import { getSemanticClassification } from "@/lib/semanticCombatRegistry";
import { getAllTypes, getMultiplier, getPokemonBySlug } from "@/lib/typeChart";
import type { TeamProfile } from "@/lib/teamProfile";
import type {
  DefensiveResponseProfile,
  MatchupEvidence,
  MatchupVerdict,
  OffensiveProfile
} from "@/types/matchupCore";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentMove,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";
import type { PokemonEntry } from "@/types/pokemon";

const RECOVERY = new Set([
  "recover", "roost", "slackoff", "softboiled", "morningsun", "wish",
  "synthesis", "moonlight", "shoreup", "milkdrink", "strengthsap", "rest"
]);
const PIVOT = new Set(["uturn", "voltswitch", "flipturn", "partingshot", "teleport"]);
const UTILITY = new Set([
  "yawn", "toxic", "willowisp", "thunderwave", "glare", "encore", "taunt",
  "trick", "switcheroo", "haze", "clearsmog", "roar", "whirlwind", "perishsong"
]);
const TRADE = new Set(["destinybond", "finalgambit", "counter", "mirrorcoat", "metalburst"]);
const WEATHER_ABILITIES: Record<string, "sun" | "rain" | "sand" | "snow"> = {
  drought: "sun",
  drizzle: "rain",
  sandstream: "sand",
  snowwarning: "snow"
};
const OFFENSIVE_MULTIPLIER = new Set([
  "hugepower", "purepower", "adaptability", "toughclaws", "sheerforce",
  "ironfist", "strongjaw", "technician", "gorillatactics", "solarpower"
]);
const NORMAL_TYPE_CONVERSION = {
  pixilate: "fairy",
  refrigerate: "ice",
  aerilate: "flying",
  galvanize: "electric"
} as const;

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function confidence(
  environment: ThreatEnvironmentPokemon | undefined,
  unknownMoveCount: number
): "high" | "medium" | "low" {
  if (!environment || environment.moves.length === 0) return "low";
  const unknownRate = unknownMoveCount / environment.moves.length;
  if (unknownRate > 0.35) return "low";
  return unknownRate === 0 && environment.moves.length >= 4 ? "high" : "medium";
}

export type MatchupVerdictContext = {
  dataset: ThreatEnvironmentDataset;
  profile: TeamProfile;
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>;
  demand: AbilityEnvironmentDemand;
  offensiveProfiles: BoundedCache<string, OffensiveProfile>;
  defensiveProfiles: BoundedCache<string, DefensiveResponseProfile>;
  matchupCache: BoundedCache<string, MatchupEvidence>;
  metrics: {
    offensiveProfileBuilds: number;
    defensiveProfileBuilds: number;
    matchupBuilds: number;
    cacheHits: number;
  };
};

const CONTEXT_CACHE_SIZE = 4;
const PROFILE_CACHE_SIZE = 512;
const MATCHUP_CACHE_SIZE = 4096;
const contextCache = new BoundedCache<string, MatchupVerdictContext>(
  CONTEXT_CACHE_SIZE
);

export function createMatchupVerdictContext(
  dataset: ThreatEnvironmentDataset,
  profile: TeamProfile
): MatchupVerdictContext {
  return {
    dataset,
    profile,
    environmentBySlug: new Map(dataset.pokemon.map((entry) => [entry.slug, entry])),
    demand: buildAbilityEnvironmentDemand(dataset),
    offensiveProfiles: new BoundedCache(PROFILE_CACHE_SIZE),
    defensiveProfiles: new BoundedCache(PROFILE_CACHE_SIZE),
    matchupCache: new BoundedCache(MATCHUP_CACHE_SIZE),
    metrics: {
      offensiveProfileBuilds: 0,
      defensiveProfileBuilds: 0,
      matchupBuilds: 0,
      cacheHits: 0
    }
  };
}

export function getMatchupVerdictContext(
  dataset: ThreatEnvironmentDataset,
  profile: TeamProfile
): MatchupVerdictContext {
  const key = `${dataset.snapshotId}:${dataset.metadata.checksum}:${dataset.regulationId}:${profile}`;
  const cached = contextCache.get(key);
  if (cached) return cached;
  const context = createMatchupVerdictContext(dataset, profile);
  contextCache.set(key, context);
  return context;
}

function semanticMoves(
  environment: ThreatEnvironmentPokemon | undefined,
  category: string
): ThreatEnvironmentMove[] {
  return (environment?.moves ?? []).filter((move) => {
    const classification = getSemanticClassification("move", move.id);
    return (
      classification.status === "classified" &&
      classification.semantics.some((semantic) => semantic.category === category)
    );
  });
}

export function buildOffensiveProfile(
  pokemon: PokemonEntry,
  context: MatchupVerdictContext
): OffensiveProfile {
  const cached = context.offensiveProfiles.get(pokemon.slug);
  if (cached) {
    context.metrics.cacheHits += 1;
    return cached;
  }
  context.metrics.offensiveProfileBuilds += 1;
  const environment = context.environmentBySlug.get(pokemon.slug);
  const attacks = getEnvironmentAttackingMoves(environment?.moves);
  const physical = attacks
    .filter((move) => move.damageClass === "physical")
    .reduce((sum, move) => sum + move.share, 0);
  const special = attacks
    .filter((move) => move.damageClass === "special")
    .reduce((sum, move) => sum + move.share, 0);
  const total = Math.max(0.001, physical + special);
  const stab = attacks.filter((move) => pokemon.types.includes(move.type));
  const primaryType = pokemon.types[0];
  const unknownMoveCount = (environment?.moves ?? []).filter(
    (move) =>
      move.damageClass !== "status" &&
      getAdvisorMoveQuality({ move, attacker: pokemon }).power === null
  ).length;
  const abilities = environment?.abilities ?? [];
  const items = environment?.items ?? [];
  const profile: OffensiveProfile = {
    pokemonSlug: pokemon.slug,
    physicalUsageProbability: round(physical / total),
    specialUsageProbability: round(special / total),
    mixedUsageProbability: round(Math.min(physical, special) / total),
    primaryStabMoves: stab.filter((move) => move.type === primaryType),
    secondaryStabMoves: stab.filter((move) => move.type !== primaryType),
    commonCoverageMoves: attacks.filter((move) => !pokemon.types.includes(move.type)),
    priorityMoves: semanticMoves(environment, "Priority"),
    setupMoves: semanticMoves(environment, "Setup"),
    statusUtilityMoves: (environment?.moves ?? []).filter(
      (move) => move.damageClass === "status" && (UTILITY.has(move.id) || PIVOT.has(move.id))
    ),
    effectiveSpeedProfile: getAdvisorSpeedRange(pokemon, environment),
    offensiveAbilityModifiers: abilities
      .filter((ability) => OFFENSIVE_MULTIPLIER.has(ability.id))
      .map((ability) => ({
        id: ability.id,
        adoptionRate: ability.share,
        multiplier: 1 + 0.35 * ability.share
      })),
    offensiveItemModifiers: items
      .filter((item) => ["choiceband", "choicespecs", "lifeorb"].includes(item.id))
      .map((item) => ({
        id: item.id,
        adoptionRate: item.share,
        multiplier: 1 + 0.3 * item.share
      })),
    weatherModifiers: abilities.flatMap((ability) => {
      const weather = WEATHER_ABILITIES[ability.id];
      return weather ? [{ weather, adoptionRate: ability.share }] : [];
    }),
    fieldModifiers: [],
    moveAdoptionRate: round(
      (environment?.moves ?? []).reduce((sum, move) => sum + move.share, 0) /
        Math.max(1, environment?.moves.length ?? 0)
    ),
    evidenceConfidence: confidence(environment, unknownMoveCount),
    unclassifiedRate: round(
      unknownMoveCount / Math.max(1, environment?.moves.length ?? 0)
    )
  };
  context.offensiveProfiles.set(pokemon.slug, profile);
  return profile;
}

export function buildDefensiveResponseProfile(
  pokemon: PokemonEntry,
  context: MatchupVerdictContext
): DefensiveResponseProfile {
  const cached = context.defensiveProfiles.get(pokemon.slug);
  if (cached) {
    context.metrics.cacheHits += 1;
    return cached;
  }
  context.metrics.defensiveProfileBuilds += 1;
  const environment = context.environmentBySlug.get(pokemon.slug);
  const stats = pokemon.baseStats;
  const ability = buildAbilityDenialProfile({
    pokemonSlug: pokemon.slug,
    environment,
    demand: context.demand
  });
  const recovery = Math.max(
    0,
    ...(environment?.moves.filter((move) => RECOVERY.has(move.id)).map((move) => move.share) ?? [])
  );
  const pivot = Math.max(
    0,
    ...(environment?.moves.filter((move) => PIVOT.has(move.id)).map((move) => move.share) ?? [])
  );
  const speedControl = Math.max(
    0,
    ...semanticMoves(environment, "Tempo").map((move) => move.share)
  );
  const trade = Math.max(
    0,
    ...(environment?.moves.filter((move) => TRADE.has(move.id)).map((move) => move.share) ?? [])
  );
  const resistances = getAllTypes()
    .map((type) => type.nameEn)
    .filter((type) => getMultiplier(type, pokemon.types) > 0 && getMultiplier(type, pokemon.types) < 1);
  const immunities = getAllTypes()
    .map((type) => type.nameEn)
    .filter((type) => getMultiplier(type, pokemon.types) === 0);
  const typeImmunityAbilities = new Set(
    ability.entries
      .filter((entry) => entry.denialCategories.includes("TypeImmunity"))
      .map((entry) => entry.ability)
  );
  const profile: DefensiveResponseProfile = {
    pokemonSlug: pokemon.slug,
    physicalBulk: clamp(((stats?.hp ?? 0) + (stats?.defense ?? 0)) / 3.2),
    specialBulk: clamp(((stats?.hp ?? 0) + (stats?.specialDefense ?? 0)) / 3.2),
    typeResistances: resistances,
    typeImmunities: immunities,
    abilityImmunities: typeImmunityAbilities.size
      ? getAllTypes().map((type) => type.nameEn).filter((type) =>
          (environment?.abilities ?? []).some((entry) => {
            if (!typeImmunityAbilities.has(entry.id)) return false;
            const testMove = { type, damageClass: "special" as const };
            return evaluateMoveAgainstPokemon({
              move: testMove,
              attacker: pokemon,
              defender: pokemon,
              defenderAbilityUsage: [entry]
            }).immunityProbability > 0;
          })
        )
      : [],
    setupDenial: (ability.categoryCoverage.SetupDenial ?? 0) * 100,
    statDropDenial: (ability.categoryCoverage.StatDropDenial ?? 0) * 100,
    residualDamageDenial: (ability.categoryCoverage.ResidualDamageDenial ?? 0) * 100,
    statusDenial: (ability.categoryCoverage.StatusDenial ?? 0) * 100,
    recoveryAvailability: recovery > 0 ? 100 : (ability.categoryCoverage.RecoverySupport ?? 0) * 100,
    recoveryAdoptionRate: recovery,
    pivotCapability: Math.max(pivot, ability.categoryCoverage.PivotSupport ?? 0) * 100,
    speedControl: speedControl * 100,
    revengeCapability: Math.max(0, ...semanticMoves(environment, "Priority").map((move) => move.share)) * 100,
    emergencyTradeCapability: trade * 100,
    hazardSensitivity: clamp(
      (() => {
        const rockMultiplier = getMultiplier("rock", pokemon.types);
        const base =
          rockMultiplier > 1
            ? 80
            : rockMultiplier < 1
              ? 35
              : pokemon.types.includes("flying")
                ? 50
                : 45;
        const bootsShare =
          environment?.items?.find((item) => item.id === "heavydutyboots")
            ?.share ?? 0;
        const hazardDenial = ability.categoryCoverage.HazardDenial ?? 0;
        return base * (1 - bootsShare * 0.8) * (1 - hazardDenial * 0.85);
      })()
    ),
    weatherSensitivity: 35,
    evidenceConfidence: ability.confidence,
    unclassifiedRate: round(
      ability.unclassified.length / Math.max(1, environment?.abilities.length ?? 0)
    )
  };
  context.defensiveProfiles.set(pokemon.slug, profile);
  return profile;
}

function offensiveModifier(profile: OffensiveProfile, move: ThreatEnvironmentMove): number {
  const abilityMultiplier =
    1 +
    profile.offensiveAbilityModifiers.reduce(
      (sum, entry) => sum + (entry.multiplier - 1),
      0
    );
  const itemMultiplier =
    1 +
    profile.offensiveItemModifiers.reduce(
      (sum, entry) => sum + (entry.multiplier - 1),
      0
    );
  const weatherMultiplier =
    1 +
    profile.weatherModifiers.reduce((sum, weather) => {
      if (
        (weather.weather === "sun" && move.type === "fire") ||
        (weather.weather === "rain" && move.type === "water")
      ) {
        return sum + 0.5 * weather.adoptionRate;
      }
      if (
        (weather.weather === "sun" && move.type === "water") ||
        (weather.weather === "rain" && move.type === "fire")
      ) {
        return sum - 0.5 * weather.adoptionRate;
      }
      return sum;
    }, 0);
  return abilityMultiplier * itemMultiplier * weatherMultiplier;
}

function resolvedMoveType(
  move: ThreatEnvironmentMove,
  environment: ThreatEnvironmentPokemon | undefined
): ThreatEnvironmentMove {
  if (move.type !== "normal") return move;
  const conversion = (environment?.abilities ?? [])
    .filter((ability) => ability.share >= 0.5)
    .map((ability) => NORMAL_TYPE_CONVERSION[
      ability.id as keyof typeof NORMAL_TYPE_CONVERSION
    ])
    .find(Boolean);
  return conversion ? { ...move, type: conversion } : move;
}

function verdictFor({
  survival,
  pressure,
  utility,
  recovery,
  speed,
  emergency,
  confidence: evidenceConfidence
}: {
  survival: number;
  pressure: number;
  utility: number;
  recovery: number;
  speed: "favored" | "variable" | "unfavored" | "unknown";
  emergency: number;
  confidence: "high" | "medium" | "low";
}): MatchupVerdict {
  if (evidenceConfidence === "low" && survival === 50 && pressure === 0) return "unknown";
  if (survival >= 75 && pressure >= 55 && (recovery >= 0.1 || utility >= 0.35)) return "hard-answer";
  if (survival >= 70 && pressure >= 55 && speed !== "unfavored") return "favorable";
  if (pressure >= 58 && speed === "favored") return "soft-check";
  if (survival >= 48 && pressure >= 38) return "soft-check";
  if (emergency >= 0.25 && (pressure >= 30 || utility >= 0.3)) return "emergency-check";
  if (utility >= 0.25 && pressure < 38) return "utility-only";
  if ((survival >= 45 || pressure >= 42) && evidenceConfidence !== "high") return "volatile";
  if (survival < 25 && pressure < 25) return "hard-lost";
  return "unfavorable";
}

export function evaluateMatchupVerdict({
  candidate,
  threat,
  context
}: {
  candidate: PokemonEntry;
  threat: PokemonEntry;
  context: MatchupVerdictContext;
}): MatchupEvidence {
  const key = `${candidate.slug}>${threat.slug}:${context.profile}`;
  const cached = context.matchupCache.get(key);
  if (cached) {
    context.metrics.cacheHits += 1;
    return cached;
  }
  context.metrics.matchupBuilds += 1;
  const candidateEnvironment = context.environmentBySlug.get(candidate.slug);
  const threatEnvironment = context.environmentBySlug.get(threat.slug);
  const candidateOffense = buildOffensiveProfile(candidate, context);
  const threatOffense = buildOffensiveProfile(threat, context);
  const candidateDefense = buildDefensiveResponseProfile(candidate, context);
  const incomingMoves = getEnvironmentAttackingMoves(threatEnvironment?.moves);
  const outgoingMoves = getEnvironmentAttackingMoves(candidateEnvironment?.moves);
  const incoming = incomingMoves.map((move) => {
    const effectiveMove = resolvedMoveType(move, threatEnvironment);
    const effectiveness = evaluateMoveAgainstPokemon({
      move: effectiveMove,
      attacker: threat,
      defender: candidate,
      attackerAbilityUsage: threatEnvironment?.abilities,
      defenderAbilityUsage: candidateEnvironment?.abilities
    });
    const pressure = evaluateAdvisorAttackPressure({
      move,
      attacker: threat,
      defender: candidate,
      typeMultiplier: effectiveness.expectedMultiplier
    });
    return {
      move,
      effectiveness,
      pressure: pressure.normalizedPressure * offensiveModifier(threatOffense, move)
    };
  });
  const outgoing = outgoingMoves.map((move) => {
    const effectiveMove = resolvedMoveType(move, candidateEnvironment);
    const effectiveness = evaluateMoveAgainstPokemon({
      move: effectiveMove,
      attacker: candidate,
      defender: threat,
      attackerAbilityUsage: candidateEnvironment?.abilities,
      defenderAbilityUsage: threatEnvironment?.abilities
    });
    const pressure = evaluateAdvisorAttackPressure({
      move: effectiveMove,
      attacker: candidate,
      defender: threat,
      typeMultiplier: effectiveness.expectedMultiplier
    });
    return {
      move,
      effectiveMove,
      effectiveness,
      pressure: pressure.normalizedPressure * offensiveModifier(candidateOffense, move)
    };
  });
  const incomingWeight = incoming.reduce((sum, entry) => sum + entry.move.share, 0);
  const incomingPressure =
    incoming.length === 0
      ? 0.5
      : incoming.reduce(
          (sum, entry) =>
            sum + Math.min(1.6, entry.pressure) * entry.move.share,
          0
        ) / Math.max(0.001, incomingWeight);
  const bulk =
    (threatOffense.physicalUsageProbability * candidateDefense.physicalBulk +
      threatOffense.specialUsageProbability * candidateDefense.specialBulk) /
    Math.max(
      0.001,
      threatOffense.physicalUsageProbability + threatOffense.specialUsageProbability
    );
  const weaknessPenalty = Math.min(
    35,
    incoming.reduce(
      (sum, entry) =>
        sum +
        Math.max(0, entry.effectiveness.expectedMultiplier - 1) *
          entry.move.share *
          18,
      0
    )
  );
  const survival = clamp(
    78 - incomingPressure * 45 + (bulk - 50) * 0.28 - weaknessPenalty
  );
  const credibleOutgoing = outgoing.filter(
    (entry) => entry.move.share >= THREAT_MOVE_THRESHOLDS.secondary
  );
  const returnPressure = clamp(
    Math.max(
      0,
      ...credibleOutgoing.map(
        (entry) =>
          Math.min(1.5, entry.pressure) *
          Math.min(1, entry.move.share / THREAT_MOVE_THRESHOLDS.primary) *
          70
      )
    )
  );
  const speed = compareAdvisorSpeedRanges({
    candidate: getAdvisorSpeedRange(candidate, candidateEnvironment),
    threat: getAdvisorSpeedRange(threat, threatEnvironment),
    profile: context.profile
  });
  const utilityMoves = (candidateEnvironment?.moves ?? []).filter(
    (move) => move.damageClass === "status" && UTILITY.has(move.id)
  );
  const utility = Math.max(0, ...utilityMoves.map((move) => move.share));
  const recovery = candidateDefense.recoveryAdoptionRate;
  const emergency = Math.max(
    candidateDefense.emergencyTradeCapability / 100,
    (candidateEnvironment?.items ?? []).find((item) => item.id === "focussash")?.share ?? 0,
    candidateDefense.revengeCapability / 100
  );
  const evidenceConfidence =
    !candidateEnvironment || !threatEnvironment
      ? "low"
      : candidateOffense.evidenceConfidence === "low" ||
          threatOffense.evidenceConfidence === "low"
        ? "low"
        : "medium";
  const verdict = verdictFor({
    survival,
    pressure: returnPressure,
    utility,
    recovery,
    speed: speed.relation,
    emergency,
    confidence: evidenceConfidence
  });
  const weatherEvidence = threatOffense.weatherModifiers.map(
    (entry) =>
      `${entry.weather === "sun" ? "晴れ" : entry.weather === "rain" ? "雨" : "天候"}を利用する特性が採用率${Math.round(entry.adoptionRate * 100)}%です。`
  );
  const resistedStab = outgoing
    .filter(
      (entry) =>
        candidate.types.includes(entry.effectiveMove.type) &&
        entry.effectiveness.expectedMultiplier < 1
    )
    .sort((left, right) => right.move.share - left.move.share)[0];
  const dangerousIncoming = incoming
    .filter(
      (entry) =>
        entry.effectiveness.expectedMultiplier > 1 ||
        entry.pressure >= 0.8
    )
    .sort(
      (left, right) =>
        right.pressure - left.pressure ||
        right.move.share - left.move.share
    )[0];
  const explanation = [
    dangerousIncoming
      ? `${threat.nameJa}の${dangerousIncoming.move.name}（採用率${Math.round(dangerousIncoming.move.share * 100)}%）を安定して受けることはできません。`
      : "",
    speed.relation === "unfavored"
      ? `${candidate.nameJa}は一般的な素早さ関係で${threat.nameJa}より先に動きにくいです。`
      : speed.relation === "favored"
        ? `${candidate.nameJa}は一般的な素早さ関係で先に動きやすいです。`
        : "素早さ関係は型によって変わります。",
    resistedStab
      ? `${threat.nameJa}は${resistedStab.move.name}を半減以下に抑えます。`
      : returnPressure >= 50
        ? "実際によく使われる技で反撃する圧力があります。"
        : "実際によく使われる技だけでは十分な反撃圧力を確認できません。",
    verdict === "utility-only"
      ? "妨害はできますが、安定した対策とは扱いません。"
      : verdict === "soft-check"
        ? "対面からなら対応できる可能性がありますが、継続的な受け先ではありません。"
        : verdict === "hard-answer"
          ? "主要な攻めを継続して拒否し、反撃または機能停止を狙えます。"
          : verdict === "favorable"
            ? "一般的な採用構成には対応しやすい対面です。"
            : "一般的な採用構成への安定した対策とは扱いません。"
  ].filter(Boolean);
  const result: MatchupEvidence = {
    candidate: candidate.slug,
    threat: threat.slug,
    verdict,
    confidence: evidenceConfidence,
    survivalScore: round(survival),
    returnPressure: round(returnPressure),
    favorableProbability: round((survival * 0.52 + returnPressure * 0.48) / 100),
    speedRelation: speed.relation,
    candidateCommonMoves: outgoingMoves,
    threatCommonMoves: incomingMoves,
    candidateAbilities: candidateEnvironment?.abilities ?? [],
    threatAbilities: threatEnvironment?.abilities ?? [],
    itemEvidence: (candidateEnvironment?.items ?? []).map(
      (item) => `${item.id}:${Math.round(item.share * 100)}%`
    ),
    weatherEvidence,
    recoveryEvidence:
      recovery > 0
        ? [`回復技の採用率は最大${Math.round(recovery * 100)}%です。`]
        : [],
    denialEvidence: buildAbilityDenialProfile({
      pokemonSlug: candidate.slug,
      environment: candidateEnvironment,
      demand: context.demand
    }).entries.flatMap((entry) => entry.explanations),
    utilityEvidence: utilityMoves.map(
      (move) => `${move.name}（採用率${Math.round(move.share * 100)}%）`
    ),
    adoptionRates: [
      ...outgoingMoves.map((move) => ({ id: move.id, rate: move.share })),
      ...(candidateEnvironment?.abilities ?? []).map((ability) => ({
        id: ability.id,
        rate: ability.share
      }))
    ],
    unclassifiedEvidence: [
      ...candidateOffense.commonCoverageMoves
        .filter((move) => getAdvisorMoveQuality({ move, attacker: candidate }).power === null)
        .map((move) => move.id)
    ],
    explanation: [...explanation, ...weatherEvidence]
  };
  context.matchupCache.set(key, result);
  return result;
}

export function resolveMatchupPokemon(slug: string): PokemonEntry {
  const pokemon = getPokemonBySlug(slug);
  if (!pokemon) throw new Error(`ポケモンを解決できません: ${slug}`);
  return pokemon;
}
