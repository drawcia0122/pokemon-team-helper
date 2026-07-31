import { CANDIDATE_IDENTITY_LABELS } from "@/lib/goalOrientedTeamBuilderConfig";
import type { BattleValueCandidate } from "@/types/battleValue";
import type {
  CandidateIdentity,
  CandidateIdentityEvidence,
  CandidateIdentityProfile
} from "@/types/goalOrientedTeamBuilder";
import type { SemanticCandidateProfile } from "@/types/semanticRecommendationGap";
import type { BattleTag } from "@/types/semanticCombat";
import type { ThreatEnvironmentPokemon } from "@/types/environmentThreat";
import type { PokemonEntry } from "@/types/pokemon";

const IDENTITIES: CandidateIdentity[] = [
  "setup-sweeper",
  "cleaner",
  "wall-breaker",
  "trapper",
  "pivot",
  "defensive-anchor",
  "hazard-setter",
  "hazard-remover",
  "tempo-support",
  "weather-enabler",
  "trick-room-enabler",
  "utility-support",
  "hybrid"
];

const IDENTITY_TAGS: Record<CandidateIdentity, BattleTag[]> = {
  "setup-sweeper": ["Setup", "WinCondition", "Snowball"],
  cleaner: ["Cleanup", "PriorityFinish", "RevengeKill"],
  "wall-breaker": ["WallBreak", "Trade", "Tempo"],
  trapper: ["Trade", "Tempo", "Utility"],
  pivot: ["Pivot", "Tempo", "Utility"],
  "defensive-anchor": ["DefensiveAnchor", "Utility"],
  "hazard-setter": ["HazardSetter", "Tempo"],
  "hazard-remover": ["HazardRemoval", "Pivot"],
  "tempo-support": ["Tempo", "Utility", "Pivot"],
  "weather-enabler": ["Tempo", "Utility"],
  "trick-room-enabler": ["Tempo", "Utility"],
  "utility-support": ["Utility", "Tempo", "DefensiveAnchor"],
  hybrid: []
};

const WEATHER_ENABLER = {
  moves: new Set(["raindance", "sandstorm", "sunnyday"]),
  abilities: new Set(["drizzle", "sandstream", "drought"])
};

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function presence(
  semantic: SemanticCandidateProfile | null,
  tag: BattleTag
): number {
  return (semantic?.tagProfiles[tag].semanticPresence ?? 0) * 100;
}

function weightedPresence(
  semantic: SemanticCandidateProfile | null,
  entries: Array<[BattleTag, number]>
): number {
  const totalWeight = entries.reduce((total, [, weight]) => total + weight, 0);
  if (totalWeight === 0) return 0;
  return clamp(
    entries.reduce(
      (total, [tag, weight]) => total + presence(semantic, tag) * weight,
      0
    ) / totalWeight
  );
}

function archetypeScore(
  semantic: SemanticCandidateProfile | null,
  archetype: keyof NonNullable<SemanticCandidateProfile>["archetype"]["scores"]
): number {
  return (semantic?.archetype.scores[archetype] ?? 0) * 100;
}

function maximumEnvironmentShare(
  environment: ThreatEnvironmentPokemon | undefined,
  kind: "moves" | "abilities",
  ids: ReadonlySet<string>
): number {
  if (!environment) return 0;
  return clamp(
    Math.max(
      0,
      ...environment[kind]
        .filter((entry) => ids.has(entry.id))
        .map((entry) => entry.share * 100)
    )
  );
}

function semanticEvidence(
  semantic: SemanticCandidateProfile | null,
  identities: CandidateIdentity[]
): CandidateIdentityEvidence[] {
  if (!semantic) return [];
  const tags = new Set(identities.flatMap((identity) => IDENTITY_TAGS[identity]));
  return [...tags]
    .flatMap((tag) => {
      const profile = semantic.tagProfiles[tag];
      const best = [...profile.evidence].sort(
        (left, right) =>
          right.adoptionRate * right.confidenceWeight -
            left.adoptionRate * left.confidenceWeight ||
          left.entityId.localeCompare(right.entityId)
      )[0];
      return best
        ? [
            {
              source: "semantic" as const,
              key: `${tag}:${best.entityKind}:${best.entityId}`,
              label: `${best.sourceName}が${CANDIDATE_IDENTITY_LABELS[identities[0]]}として機能する根拠です。`,
              strength: round(profile.semanticPresence * 100),
              adoptionRate: round(best.adoptionRate)
            }
          ]
        : [];
    })
    .sort(
      (left, right) =>
        right.strength - left.strength || left.key.localeCompare(right.key)
    );
}

export function buildCandidateIdentity({
  pokemon,
  semantic,
  battle,
  environment,
  contestability
}: {
  pokemon: PokemonEntry;
  semantic: SemanticCandidateProfile | null;
  battle: BattleValueCandidate | null;
  environment: ThreatEnvironmentPokemon | undefined;
  contestability: number;
}): CandidateIdentityProfile {
  const axis = battle?.axisBreakdown;
  const speed = pokemon.baseStats
    ? clamp(((pokemon.baseStats.speed - 45) / 105) * 100)
    : 0;
  const offense = pokemon.baseStats
    ? clamp(
        ((Math.max(
          pokemon.baseStats.attack,
          pokemon.baseStats.specialAttack
        ) -
          60) /
          105) *
          100
      )
    : 0;
  const bulk = pokemon.baseStats
    ? clamp(
        ((pokemon.baseStats.hp +
          pokemon.baseStats.defense +
          pokemon.baseStats.specialDefense -
          180) /
          230) *
          100
      )
    : 0;
  const weatherEnabler = Math.max(
    maximumEnvironmentShare(environment, "moves", WEATHER_ENABLER.moves),
    maximumEnvironmentShare(
      environment,
      "abilities",
      WEATHER_ENABLER.abilities
    )
  );
  const trickRoomEnabler = maximumEnvironmentShare(
    environment,
    "moves",
    new Set(["trickroom"])
  );
  const scores = Object.fromEntries(
    IDENTITIES.map((identity) => [identity, 0])
  ) as Record<CandidateIdentity, number>;
  scores["setup-sweeper"] = clamp(
    weightedPresence(semantic, [
      ["Setup", 0.46],
      ["WinCondition", 0.36],
      ["Snowball", 0.18]
    ]) *
      0.58 +
      archetypeScore(semantic, "Setup Sweeper") * 0.22 +
      clamp((axis?.setupWinCondition ?? 0) * 8) * 0.16 +
      contestability * 0.04
  );
  scores.cleaner = clamp(
    weightedPresence(semantic, [
      ["Cleanup", 0.5],
      ["PriorityFinish", 0.28],
      ["RevengeKill", 0.22]
    ]) *
      0.55 +
      archetypeScore(semantic, "Cleaner") * 0.2 +
      clamp((axis?.cleanup ?? 0) * 8) * 0.15 +
      speed * 0.1
  );
  scores["wall-breaker"] = clamp(
    weightedPresence(semantic, [
      ["WallBreak", 0.6],
      ["Trade", 0.22],
      ["Tempo", 0.18]
    ]) *
      0.5 +
      archetypeScore(semantic, "Breaker") * 0.2 +
      clamp((axis?.immediateBreak ?? 0) * 8) * 0.2 +
      offense * 0.1
  );
  scores.trapper = clamp(
    archetypeScore(semantic, "Trapper") * 0.52 +
      (semantic?.archetype.hasTrapSemantic ? 100 : 0) * 0.32 +
      clamp((axis?.trapTargetRemoval ?? 0) * 10) * 0.16
  );
  scores.pivot = clamp(
    weightedPresence(semantic, [
      ["Pivot", 0.68],
      ["Tempo", 0.2],
      ["Utility", 0.12]
    ]) *
      0.7 +
      archetypeScore(semantic, "Pivot") * 0.25 +
      contestability * 0.05
  );
  scores["defensive-anchor"] = clamp(
    weightedPresence(semantic, [
      ["DefensiveAnchor", 0.72],
      ["Utility", 0.28]
    ]) *
      0.58 +
      archetypeScore(semantic, "Defensive Anchor") * 0.22 +
      bulk * 0.15 +
      contestability * 0.05
  );
  scores["hazard-setter"] = clamp(
    presence(semantic, "HazardSetter") * 0.76 +
      archetypeScore(semantic, "Hazard Control") * 0.14 +
      presence(semantic, "Tempo") * 0.1
  );
  scores["hazard-remover"] = clamp(
    presence(semantic, "HazardRemoval") * 0.78 +
      archetypeScore(semantic, "Hazard Control") * 0.14 +
      presence(semantic, "Pivot") * 0.08
  );
  scores["tempo-support"] = clamp(
    weightedPresence(semantic, [
      ["Tempo", 0.5],
      ["Utility", 0.3],
      ["Pivot", 0.2]
    ]) *
      0.62 +
      contestability * 0.1
  );
  scores["weather-enabler"] = clamp(
    weatherEnabler * 0.9 + presence(semantic, "Tempo") * 0.1
  );
  scores["trick-room-enabler"] = clamp(
    trickRoomEnabler * 0.9 + presence(semantic, "Tempo") * 0.1
  );
  scores["utility-support"] = clamp(
    weightedPresence(semantic, [
      ["Utility", 0.54],
      ["Tempo", 0.28],
      ["DefensiveAnchor", 0.18]
    ]) *
      0.58 +
      contestability * 0.1
  );

  const concrete = (Object.entries(scores) as Array<[CandidateIdentity, number]>)
    .filter(([identity]) => identity !== "hybrid")
    .sort(
      ([leftIdentity, leftScore], [rightIdentity, rightScore]) =>
        rightScore - leftScore || leftIdentity.localeCompare(rightIdentity)
    );
  const [strongest, runnerUp] = concrete;
  scores.hybrid =
    strongest &&
    runnerUp &&
    strongest[1] >= 45 &&
    runnerUp[1] >= 42 &&
    strongest[1] - runnerUp[1] <= 4
      ? clamp((strongest[1] + runnerUp[1]) / 2 + 5)
      : 0;
  const primary = concrete[0]?.[0] ?? "utility-support";
  const secondaryCandidate = concrete.find(
    ([identity, score]) => identity !== primary && score >= 24
  );
  const secondary = secondaryCandidate?.[0] ?? null;
  const componentIdentities = [primary, ...(secondary ? [secondary] : [])];
  const evidence = semanticEvidence(semantic, componentIdentities).slice(0, 5);
  if (weatherEnabler > 0 && componentIdentities.includes("weather-enabler")) {
    evidence.push({
      source: "environment",
      key: "weather-enabler",
      label: "実際に採用される技・特性で天候を展開できます。",
      strength: round(weatherEnabler),
      adoptionRate: round(weatherEnabler / 100)
    });
  }
  if (
    trickRoomEnabler > 0 &&
    componentIdentities.includes("trick-room-enabler")
  ) {
    evidence.push({
      source: "environment",
      key: "trick-room",
      label: "トリックルームの実採用データがあります。",
      strength: round(trickRoomEnabler),
      adoptionRate: round(trickRoomEnabler / 100)
    });
  }
  const primaryScore = scores[primary];
  const adoptionRate = Math.max(
    0,
    ...evidence.map((entry) => entry.adoptionRate ?? 0)
  );
  const dataReliability = 1 - (semantic?.unclassifiedRate ?? 1);
  const confidence: CandidateIdentityProfile["confidence"] =
    primaryScore >= 62 && adoptionRate >= 0.35 && dataReliability >= 0.7
      ? "high"
      : primaryScore >= 32 && dataReliability >= 0.45
        ? "medium"
        : "low";
  const semanticPresence = Object.fromEntries(
    [...new Set(componentIdentities.flatMap((identity) => IDENTITY_TAGS[identity]))]
      .map((tag) => [tag, round(presence(semantic, tag) / 100)])
  );
  return {
    primary,
    secondary,
    confidence,
    scores: Object.fromEntries(
      IDENTITIES.map((identity) => [identity, round(scores[identity])])
    ) as Record<CandidateIdentity, number>,
    evidence: evidence
      .sort(
        (left, right) =>
          right.strength - left.strength || left.key.localeCompare(right.key)
      )
      .slice(0, 6),
    adoptionRate: round(adoptionRate),
    semanticPresence
  };
}
