import { getAdvisorMegaRecommendationDecision } from "@/lib/advisorMegaRecommendation";
import type { AdvisorSwapPlan } from "@/lib/advisorSwapSimulator";
import { buildCandidateIdentity } from "@/lib/candidateIdentity";
import {
  CANDIDATE_IDENTITY_GOAL_COMPATIBILITY,
  CANDIDATE_IDENTITY_LABELS,
  GOAL_ORIENTED_TEAM_BUILDER_CONFIG,
  TEAM_BUILDER_GOAL_AXIS_WEIGHTS,
  TEAM_BUILDER_GOAL_LABELS
} from "@/lib/goalOrientedTeamBuilderConfig";
import { getSemanticClassification } from "@/lib/semanticCombatRegistry";
import { getAllTypes, getMultiplier, getPokemonBySlug } from "@/lib/typeChart";
import type { BattleValueCandidate } from "@/types/battleValue";
import type {
  CandidateIdentity,
  CandidateIdentityProfile,
  GoalOrientedCandidatePlan,
  GoalOrientedTeamBuilderResult,
  TeamBuilderChainStep,
  TeamBuilderCoreAxis,
  TeamBuilderCoreQuality,
  TeamBuilderGoal,
  TeamBuilderGoalInference,
  TeamBuilderGoalRole
} from "@/types/goalOrientedTeamBuilder";
import type {
  SemanticCandidateProfile
} from "@/types/semanticRecommendationGap";
import type { BattleTag } from "@/types/semanticCombat";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";
import type { PokemonEntry } from "@/types/pokemon";

type CandidateSignals = {
  slug: string;
  pokemon: PokemonEntry;
  plan: AdvisorSwapPlan | null;
  battle: BattleValueCandidate | null;
  semantic: SemanticCandidateProfile | null;
  identity: CandidateIdentityProfile;
  core: Record<TeamBuilderCoreAxis, number>;
  rain: number;
  sand: number;
  sun: number;
  trickRoom: number;
  hazard: number;
  reliability: number;
  usageRate: number;
  unclassifiedRate: number;
};

type RawSignals = Omit<CandidateSignals, "core"> & {
  rawCore: Record<TeamBuilderCoreAxis, number>;
};

type PlannerPairCache = {
  typeComplement: Map<string, number>;
  teammateNaturalness: Map<string, number>;
};

const CORE_AXES: TeamBuilderCoreAxis[] = [
  "offensiveCore",
  "defensiveCore",
  "abilityCore",
  "pivotCore",
  "setupCore",
  "cleanupCore",
  "winCondition",
  "cycleViability"
];

const GOALS = Object.keys(
  TEAM_BUILDER_GOAL_LABELS
) as TeamBuilderGoal[];

const WEATHER_EVIDENCE = {
  rain: {
    moves: new Set(["raindance"]),
    abilities: new Set([
      "drizzle",
      "swiftswim",
      "raindish",
      "hydration",
      "dryskin"
    ])
  },
  sand: {
    moves: new Set(["sandstorm"]),
    abilities: new Set([
      "sandstream",
      "sandrush",
      "sandforce",
      "sandveil"
    ])
  },
  sun: {
    moves: new Set(["sunnyday"]),
    abilities: new Set([
      "drought",
      "chlorophyll",
      "solarpower",
      "protosynthesis"
    ])
  }
} as const;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function average(values: number[]): number {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function diminishing(left: number, right: number): number {
  return clamp(Math.max(left, right) + Math.min(left, right) * 0.35);
}

function normalizePercentiles(
  entries: Array<{ key: string; value: number }>
): Map<string, number> {
  if (entries.length === 0) return new Map();
  if (entries.length === 1) return new Map([[entries[0].key, 100]]);
  const sorted = [...entries].sort(
    (left, right) =>
      left.value - right.value || left.key.localeCompare(right.key)
  );
  const normalized = new Map<string, number>();
  for (let index = 0; index < sorted.length; ) {
    let end = index + 1;
    while (
      end < sorted.length &&
      sorted[end].value === sorted[index].value
    ) {
      end += 1;
    }
    const percentile =
      (((index + end - 1) / 2) / Math.max(1, sorted.length - 1)) * 100;
    for (let cursor = index; cursor < end; cursor += 1) {
      normalized.set(sorted[cursor].key, round(percentile));
    }
    index = end;
  }
  return normalized;
}

function evidenceShare(
  environment: ThreatEnvironmentPokemon | undefined,
  ids: ReadonlySet<string>,
  kind: "moves" | "abilities"
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

function tagPresence(
  profile: SemanticCandidateProfile | null,
  tag: keyof SemanticCandidateProfile["tagProfiles"]
): number {
  return (profile?.tagProfiles[tag].semanticPresence ?? 0) * 100;
}

function rawSignalsFor(
  pokemon: PokemonEntry,
  plan: AdvisorSwapPlan | null,
  battle: BattleValueCandidate | null,
  semantic: SemanticCandidateProfile | null,
  environment: ThreatEnvironmentPokemon | undefined
): RawSignals | null {
  const axis = battle?.axisBreakdown;
  const defensiveCore = plan?.defensiveCoreProfile;
  const setupPresence = tagPresence(semantic, "Setup");
  const cleanupPresence = tagPresence(semantic, "Cleanup");
  const winPresence = tagPresence(semantic, "WinCondition");
  const pivotPresence = tagPresence(semantic, "Pivot");
  const tempoPresence = tagPresence(semantic, "Tempo");
  const hazardPresence = tagPresence(semantic, "HazardSetter");
  const recoveryPresence = tagPresence(semantic, "DefensiveAnchor");
  const rawCore: Record<TeamBuilderCoreAxis, number> = {
    offensiveCore:
      (axis?.immediateBreak ?? 0) +
      (axis?.cleanup ?? 0) +
      (axis?.setupWinCondition ?? 0) +
      tagPresence(semantic, "WallBreak") * 0.08,
    defensiveCore:
      (defensiveCore?.coreSynergy ?? 0) * 0.7 +
      recoveryPresence * 0.3,
    abilityCore:
      (plan?.abilityMatchupValue ??
        tagPresence(semantic, "Utility") * 0.45) *
        0.75 +
      (defensiveCore?.denialDiversity ?? 0) * 0.25,
    pivotCore:
      pivotPresence * 0.65 +
      tempoPresence * 0.15 +
      (defensiveCore?.cycleViability ?? 0) * 0.2,
    setupCore:
      setupPresence * 0.55 +
      winPresence * 0.2 +
      (axis?.setupWinCondition ?? 0) * 4,
    cleanupCore:
      cleanupPresence * 0.5 +
      tagPresence(semantic, "PriorityFinish") * 0.2 +
      (axis?.cleanup ?? 0) * 4 +
      (axis?.priorityRevenge ?? 0) * 2,
    winCondition:
      winPresence * 0.45 +
      setupPresence * 0.2 +
      (axis?.setupWinCondition ?? 0) * 3 +
      (axis?.snowball ?? 0) * 3 +
      (axis?.trapTargetRemoval ?? 0) * 2,
    cycleViability:
      (defensiveCore?.cycleViability ?? 0) * 0.7 +
      pivotPresence * 0.2 +
      recoveryPresence * 0.1
  };
  const trickRoomMove = evidenceShare(
    environment,
    new Set(["trickroom"]),
    "moves"
  );
  const contestability =
    plan?.contestability?.score ?? (battle?.reliability ?? 0) * 100;
  const identity = buildCandidateIdentity({
    pokemon,
    semantic,
    battle,
    environment,
    contestability
  });
  const slowFit = pokemon.baseStats
    ? clamp(((90 - pokemon.baseStats.speed) / 70) * 100)
    : 0;
  return {
    slug: pokemon.slug,
    pokemon,
    plan,
    battle,
    semantic,
    identity,
    rawCore,
    rain: diminishing(
      evidenceShare(environment, WEATHER_EVIDENCE.rain.moves, "moves"),
      evidenceShare(
        environment,
        WEATHER_EVIDENCE.rain.abilities,
        "abilities"
      )
    ),
    sand: diminishing(
      evidenceShare(environment, WEATHER_EVIDENCE.sand.moves, "moves"),
      evidenceShare(
        environment,
        WEATHER_EVIDENCE.sand.abilities,
        "abilities"
      )
    ),
    sun: diminishing(
      evidenceShare(environment, WEATHER_EVIDENCE.sun.moves, "moves"),
      evidenceShare(
        environment,
        WEATHER_EVIDENCE.sun.abilities,
        "abilities"
      )
    ),
    trickRoom: diminishing(trickRoomMove, slowFit * 0.55),
    hazard: hazardPresence,
    reliability:
      (battle?.reliability ?? 0) * 70 +
      (plan?.contestability?.axes.reliability ?? contestability) *
        0.3,
    usageRate: environment?.usageRate ?? 0,
    unclassifiedRate: semantic?.unclassifiedRate ?? 1
  };
}

function normalizeSignals(raw: RawSignals[]): CandidateSignals[] {
  const relativeAxes = Object.fromEntries(
    CORE_AXES.map((axis) => [
      axis,
      normalizePercentiles(
        raw.map((entry) => ({
          key: entry.slug,
          value: entry.rawCore[axis]
        }))
      )
    ])
  ) as Record<TeamBuilderCoreAxis, Map<string, number>>;
  return raw.map(({ rawCore, ...entry }) => ({
    ...entry,
    core: Object.fromEntries(
      CORE_AXES.map((axis) => {
        if (
          axis === "defensiveCore" ||
          axis === "abilityCore" ||
          axis === "pivotCore" ||
          axis === "cycleViability"
        ) {
          return [axis, round(clamp(rawCore[axis]))];
        }
        return [axis, relativeAxes[axis].get(entry.slug) ?? 0];
      })
    ) as Record<TeamBuilderCoreAxis, number>
  }));
}

function aggregateAffinity(
  team: string[],
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>,
  affinity: "rain" | "sand" | "sun" | "trickRoom" | "hazard"
): number {
  const values = team
    .flatMap((slug) => {
      const environment = environmentBySlug.get(slug);
      if (!environment) return [];
      if (affinity === "trickRoom") {
        return [
          evidenceShare(environment, new Set(["trickroom"]), "moves")
        ];
      }
      if (affinity === "hazard") {
        const hazardMoves = new Set([
          "stealthrock",
          "spikes",
          "toxicspikes",
          "stickyweb"
        ]);
        return [evidenceShare(environment, hazardMoves, "moves")];
      }
      return [
        diminishing(
          evidenceShare(
            environment,
            WEATHER_EVIDENCE[affinity].moves,
            "moves"
          ),
          evidenceShare(
            environment,
            WEATHER_EVIDENCE[affinity].abilities,
            "abilities"
          )
        )
      ];
    })
    .sort((left, right) => right - left);
  if (!values.length) return 0;
  return clamp(values[0] + (values[1] ?? 0) * 0.35);
}

function environmentTagPresence(
  environment: ThreatEnvironmentPokemon | undefined,
  tag: BattleTag
): number {
  if (!environment) return 0;
  const evidence = [
    ...environment.moves.map((entry) => ({
      kind: "move" as const,
      id: entry.id,
      share: entry.share
    })),
    ...environment.abilities.map((entry) => ({
      kind: "ability" as const,
      id: entry.id,
      share: entry.share
    })),
    ...(environment.items ?? []).map((entry) => ({
      kind: "item" as const,
      id: entry.id,
      share: entry.share
    }))
  ];
  return clamp(
    Math.max(
      0,
      ...evidence.flatMap((entry) => {
        const classification =
          entry.kind === "move"
            ? getSemanticClassification("move", entry.id)
            : entry.kind === "ability"
              ? getSemanticClassification("ability", entry.id)
              : getSemanticClassification("item", entry.id);
        return classification.status === "classified" &&
          classification.battleTags.includes(tag)
          ? [entry.share * 100]
          : [];
      })
    )
  );
}

function buildCurrentTeamCore(
  team: PokemonEntry[],
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>
): Record<TeamBuilderCoreAxis, number> {
  if (!team.length) {
    return Object.fromEntries(
      CORE_AXES.map((axis) => [axis, 0])
    ) as Record<TeamBuilderCoreAxis, number>;
  }
  const tag = (battleTag: BattleTag) => {
    const values = team
      .map((member) =>
        environmentTagPresence(
          environmentBySlug.get(member.slug),
          battleTag
        )
      )
      .sort((left, right) => right - left);
    return clamp(
      (values[0] ?? 0) +
        (values[1] ?? 0) * 0.35 +
        (values[2] ?? 0) * 0.15
    );
  };
  const offensiveStats = clamp(
    average(
      team.map((member) => {
        if (!member.baseStats) return 45;
        return (
          (Math.max(
            member.baseStats.attack,
            member.baseStats.specialAttack
          ) /
            165) *
          100
        );
      })
    )
  );
  const defensiveStats = clamp(
    average(
      team.map((member) => {
        if (!member.baseStats) return 45;
        return (
          ((member.baseStats.hp +
            member.baseStats.defense +
            member.baseStats.specialDefense) /
            390) *
          100
        );
      })
    )
  );
  const setup = tag("Setup");
  const cleanup = tag("Cleanup");
  const pivot = tag("Pivot");
  const anchor = tag("DefensiveAnchor");
  const winCondition = tag("WinCondition");
  return {
    offensiveCore: clamp(
      offensiveStats * 0.45 +
        tag("WallBreak") * 0.25 +
        setup * 0.15 +
        cleanup * 0.15
    ),
    defensiveCore: clamp(defensiveStats * 0.55 + anchor * 0.45),
    abilityCore: clamp(
      tag("Utility") * 0.45 +
        anchor * 0.35 +
        tag("Tempo") * 0.2
    ),
    pivotCore: clamp(pivot * 0.75 + tag("Tempo") * 0.25),
    setupCore: clamp(setup * 0.7 + winCondition * 0.3),
    cleanupCore: clamp(
      cleanup * 0.65 +
        tag("PriorityFinish") * 0.2 +
        tag("RevengeKill") * 0.15
    ),
    winCondition: clamp(
      winCondition * 0.55 +
        setup * 0.25 +
        tag("Snowball") * 0.2
    ),
    cycleViability: clamp(
      pivot * 0.45 +
        anchor * 0.4 +
        tag("Utility") * 0.15
    )
  };
}

function weightedCoreScore(
  core: Record<TeamBuilderCoreAxis, number>,
  goal: TeamBuilderGoal
): number {
  return round(
    CORE_AXES.reduce(
      (total, axis) =>
        total + core[axis] * TEAM_BUILDER_GOAL_AXIS_WEIGHTS[goal][axis],
      0
    )
  );
}

function goalAffinity(
  signal: CandidateSignals,
  goal: TeamBuilderGoal
): number {
  if (goal === "rain") return signal.rain;
  if (goal === "sand") return signal.sand;
  if (goal === "sun") return signal.sun;
  if (goal === "trick-room") return signal.trickRoom;
  if (goal === "hazard-stack") return signal.hazard;
  if (goal === "pivot-cycle") return signal.core.pivotCore;
  if (goal === "stall") {
    return average([
      signal.core.defensiveCore,
      signal.core.abilityCore,
      signal.core.cycleViability
    ]);
  }
  if (goal === "balance") {
    return clamp(
      Math.min(
        signal.core.offensiveCore,
        signal.core.defensiveCore,
        signal.core.cycleViability
      ) *
        0.6 +
        (100 -
          Math.abs(
            signal.core.offensiveCore - signal.core.defensiveCore
          )) *
          0.4
    );
  }
  if (goal === "bulky-offense") {
    return average([
      signal.core.offensiveCore,
      signal.core.defensiveCore,
      signal.core.winCondition
    ]);
  }
  return average([
    signal.core.offensiveCore,
    signal.core.setupCore,
    signal.core.cleanupCore,
    signal.core.winCondition
  ]);
}

function usesDirectGoalAffinity(goal: TeamBuilderGoal): boolean {
  return (
    goal === "rain" ||
    goal === "sand" ||
    goal === "sun" ||
    goal === "trick-room" ||
    goal === "hazard-stack" ||
    goal === "pivot-cycle"
  );
}

function directGoalReason(
  goal: TeamBuilderGoal,
  affinity: number
): string {
  if (
    affinity <
    GOAL_ORIENTED_TEAM_BUILDER_CONFIG.minimumDirectGoalAffinity
  ) {
    return "";
  }
  if (goal === "rain" || goal === "sand" || goal === "sun") {
    return `${TEAM_BUILDER_GOAL_LABELS[goal]}を利用する技・特性の採用実績があります。`;
  }
  if (goal === "trick-room") {
    return "トリックルームで動きやすい速度・技構成です。";
  }
  if (goal === "hazard-stack") {
    return "設置技を軸にした展開を補えます。";
  }
  if (goal === "pivot-cycle") {
    return "交代技を使った展開を補えます。";
  }
  return "";
}

function identityGoalEvaluation(
  signal: CandidateSignals,
  goal: TeamBuilderGoal,
  conditionEstablished = false
): {
  compatibility: number;
  conflictPenalty: number;
  role: TeamBuilderGoalRole;
} {
  const primaryLink =
    CANDIDATE_IDENTITY_GOAL_COMPATIBILITY[signal.identity.primary][goal];
  const secondaryLink = signal.identity.secondary
    ? CANDIDATE_IDENTITY_GOAL_COMPATIBILITY[signal.identity.secondary][goal]
    : undefined;
  let compatibility = Math.max(
    (primaryLink?.compatibility ?? 0.16) * 100,
    (secondaryLink?.compatibility ?? 0) * 72
  );
  let role: TeamBuilderGoalRole =
    primaryLink?.role ?? secondaryLink?.role ?? "support";
  let conflictPenalty = 0;
  const directAffinity = goalAffinity(signal, goal);
  const isWeather = goal === "rain" || goal === "sand" || goal === "sun";
  if (isWeather) {
    compatibility = Math.max(
      compatibility,
      Math.min(100, directAffinity * 1.25)
    );
    if (!conditionEstablished) {
      compatibility = Math.max(
        compatibility * Math.min(1, directAffinity / 20),
        Math.min(92, directAffinity * 1.25)
      );
      if (directAffinity < 12) conflictPenalty = 78;
    } else if (
      signal.identity.primary === "weather-enabler" &&
      directAffinity < 12
    ) {
      compatibility = 0;
      conflictPenalty = 78;
    }
  }
  if (goal === "trick-room") {
    compatibility = Math.max(
      compatibility,
      Math.min(100, directAffinity * 1.2)
    );
    if (!conditionEstablished) {
      compatibility = Math.max(
        compatibility * Math.min(1, directAffinity / 20),
        Math.min(92, directAffinity * 1.2)
      );
      if (
        directAffinity < 12 &&
        signal.identity.primary !== "trick-room-enabler"
      ) {
        conflictPenalty = 68;
      }
    }
  }
  if (goal === "hazard-stack") {
    if (signal.hazard >= 18) {
      compatibility = Math.max(compatibility, Math.min(100, signal.hazard));
      if (signal.identity.primary === "hazard-setter") role = "primary";
    } else if (signal.identity.primary === "setup-sweeper") {
      conflictPenalty = 74;
      role = "support";
    } else if (signal.identity.primary !== "hazard-setter") {
      conflictPenalty = Math.max(conflictPenalty, 36);
    }
  }
  if (goal === "pivot-cycle" && signal.core.pivotCore < 18) {
    conflictPenalty = Math.max(conflictPenalty, 62);
  }
  if (
    goal === "hyper-offense" &&
    signal.identity.primary === "defensive-anchor"
  ) {
    conflictPenalty = Math.max(conflictPenalty, 58);
    role = "support";
  }
  if (
    goal === "stall" &&
    (signal.identity.primary === "setup-sweeper" ||
      signal.identity.primary === "cleaner" ||
      signal.identity.primary === "wall-breaker")
  ) {
    conflictPenalty = Math.max(conflictPenalty, 48);
  }
  if (conflictPenalty >= 60) role = "conflict";
  return {
    compatibility: round(clamp(compatibility)),
    conflictPenalty: round(clamp(conflictPenalty)),
    role
  };
}

function goalSupportFeasibility(
  currentCore: Record<TeamBuilderCoreAxis, number>,
  goal: TeamBuilderGoal,
  remainingSlots: number
): number {
  const importantDeficits = CORE_AXES.filter(
    (axis) =>
      TEAM_BUILDER_GOAL_AXIS_WEIGHTS[goal][axis] >= 0.12 &&
      currentCore[axis] < 48
  ).length;
  const capacity = Math.max(0, remainingSlots) * 2;
  return clamp(88 - Math.max(0, importantDeficits - capacity) * 22);
}

function identityAwareGoalLabel(
  goal: TeamBuilderGoal,
  identity: CandidateIdentityProfile
): string {
  const primary = identity.primary;
  if (primary === "setup-sweeper" || primary === "hybrid") {
    if (goal === "hyper-offense") {
      return "起点作成から積みエースを通す構築";
    }
    if (goal === "bulky-offense") {
      return "積みエースを勝ち筋にした耐久寄りの攻撃構築";
    }
    if (goal === "balance") {
      return "積みエースを勝ち筋にしたバランス構築";
    }
    if (goal === "hazard-stack") {
      return "設置ダメージで積みエースを通す構築";
    }
  }
  if (primary === "cleaner" && goal === "hazard-stack") {
    return "設置ダメージから終盤の掃除役を通す構築";
  }
  if (primary === "wall-breaker" && goal === "pivot-cycle") {
    return "対面操作から崩し役を通す構築";
  }
  return TEAM_BUILDER_GOAL_LABELS[goal];
}

function identityGoalReason(
  identity: CandidateIdentityProfile,
  goal: TeamBuilderGoalInference
): string {
  const identityLabel = CANDIDATE_IDENTITY_LABELS[identity.primary];
  if (goal.candidateRole === "primary") {
    return `${identityLabel}としての強みを主軸にできます。`;
  }
  if (goal.candidateRole === "support") {
    return `${identityLabel}として完成形を支えられます。`;
  }
  return `${identityLabel}としての強みと完成形が噛み合いにくいです。`;
}

function goalInference(
  signal: CandidateSignals,
  currentCore: Record<TeamBuilderCoreAxis, number>,
  team: string[],
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>,
  profile: "standard" | "trick-room",
  remainingSlots: number
): TeamBuilderGoalInference[] {
  const teamRain = aggregateAffinity(team, environmentBySlug, "rain");
  const teamSand = aggregateAffinity(team, environmentBySlug, "sand");
  const teamSun = aggregateAffinity(team, environmentBySlug, "sun");
  const rain = diminishing(teamRain, signal.rain);
  const sand = diminishing(teamSand, signal.sand);
  const sun = diminishing(teamSun, signal.sun);
  const trickRoom = diminishing(
    aggregateAffinity(team, environmentBySlug, "trickRoom"),
    signal.trickRoom
  );
  const hazard = diminishing(
    aggregateAffinity(team, environmentBySlug, "hazard"),
    signal.hazard
  );
  const special = { rain, sand, sun, "trick-room": trickRoom, "hazard-stack": hazard };
  const teamWeather = { rain: teamRain, sand: teamSand, sun: teamSun };
  const establishedWeather = Math.max(teamRain, teamSand, teamSun);
  return GOALS.map((goal) => {
    const base = weightedCoreScore(currentCore, goal);
    let connectionScore = base;
    let goalEvidence = 50;
    if (goal === "rain" || goal === "sand" || goal === "sun") {
      goalEvidence = special[goal];
      const continuity = teamWeather[goal];
      const conflictingWeather = Math.max(
        ...(["rain", "sand", "sun"] as const)
          .filter((weather) => weather !== goal)
          .map((weather) => teamWeather[weather])
      );
      connectionScore =
        goalEvidence >=
        GOAL_ORIENTED_TEAM_BUILDER_CONFIG.minimumGoalEvidence * 100
          ? establishedWeather >= 25
            ? base * 0.5 +
              goalEvidence * 0.3 +
              continuity * 0.2 -
              Math.max(0, conflictingWeather - continuity) * 0.2
            : base * 0.58 + goalEvidence * 0.42
          : base * 0.42;
    } else if (goal === "trick-room") {
      goalEvidence =
        profile === "trick-room" ? Math.max(80, trickRoom) : trickRoom;
      connectionScore =
        base * (profile === "trick-room" ? 0.55 : 0.62) +
        goalEvidence * (profile === "trick-room" ? 0.45 : 0.38) +
        (profile === "trick-room" ? 5 : 0);
      if (profile !== "trick-room" && goalEvidence < 12) {
        connectionScore *= 0.55;
      }
    } else if (goal === "hazard-stack") {
      goalEvidence = hazard;
      connectionScore = base * 0.7 + goalEvidence * 0.3;
      if (goalEvidence < 10) connectionScore *= 0.72;
    } else if (goal === "pivot-cycle") {
      goalEvidence = signal.core.pivotCore;
      connectionScore = base * 0.75 + goalEvidence * 0.25;
    } else if (goal === "stall") {
      goalEvidence = average([
        currentCore.defensiveCore,
        currentCore.abilityCore,
        currentCore.cycleViability
      ]);
      connectionScore = base * 0.8 + goalEvidence * 0.2;
    } else if (goal === "balance") {
      goalEvidence =
        Math.min(
          currentCore.offensiveCore,
          currentCore.defensiveCore,
          currentCore.cycleViability
        ) *
          0.65 +
        (100 -
          Math.abs(
            currentCore.offensiveCore - currentCore.defensiveCore
          )) *
          0.35;
      connectionScore = base * 0.72 + goalEvidence * 0.28;
    } else if (goal === "bulky-offense") {
      goalEvidence = average([
        currentCore.offensiveCore,
        currentCore.defensiveCore,
        currentCore.winCondition
      ]);
      connectionScore = base * 0.78 + goalEvidence * 0.22;
    } else if (goal === "hyper-offense") {
      goalEvidence = average([
        currentCore.offensiveCore,
        currentCore.setupCore,
        currentCore.cleanupCore,
        currentCore.winCondition
      ]);
      connectionScore =
        base * 0.82 +
        goalEvidence * 0.18 -
        average([
          currentCore.defensiveCore,
          currentCore.cycleViability
        ]) *
          0.08;
    }
    const conditionEstablished =
      (goal === "rain" || goal === "sand" || goal === "sun")
        ? teamWeather[goal] >= 25
        : goal === "trick-room" && profile === "trick-room";
    let identityEvaluation = identityGoalEvaluation(
      signal,
      goal,
      conditionEstablished
    );
    if (
      (goal === "rain" || goal === "sand" || goal === "sun") &&
      teamWeather[goal] >= 25
    ) {
      const establishedLink =
        CANDIDATE_IDENTITY_GOAL_COMPATIBILITY[signal.identity.primary][goal] ??
        (signal.identity.secondary
          ? CANDIDATE_IDENTITY_GOAL_COMPATIBILITY[
              signal.identity.secondary
            ][goal]
          : undefined);
      if (establishedLink && establishedLink.compatibility >= 0.58) {
        if (
          signal.identity.primary !== "weather-enabler" ||
          goalAffinity(signal, goal) >=
            GOAL_ORIENTED_TEAM_BUILDER_CONFIG.minimumDirectGoalAffinity
        ) {
          identityEvaluation = {
            compatibility: Math.max(
              identityEvaluation.compatibility,
              establishedLink.compatibility * 100
            ),
            conflictPenalty: 0,
            role: establishedLink.role
          };
        }
      }
    }
    if (
      goal === "trick-room" &&
      profile === "trick-room" &&
      signal.trickRoom >=
        GOAL_ORIENTED_TEAM_BUILDER_CONFIG.minimumDirectGoalAffinity
    ) {
      identityEvaluation = {
        compatibility: Math.max(
          identityEvaluation.compatibility,
          signal.identity.primary === "trick-room-enabler" ? 100 : 82
        ),
        conflictPenalty: 0,
        role: "primary"
      };
    }
    const supportFeasibility = goalSupportFeasibility(
      currentCore,
      goal,
      remainingSlots
    );
    const identityFirstScore = clamp(
      identityEvaluation.compatibility * 0.5 +
        clamp(connectionScore) * 0.18 +
        base * 0.12 +
        goalEvidence * 0.12 +
        supportFeasibility * 0.08 -
        identityEvaluation.conflictPenalty * 0.42
    );
    const missingAxes = CORE_AXES.filter(
      (axis) =>
        TEAM_BUILDER_GOAL_AXIS_WEIGHTS[goal][axis] >= 0.12 &&
        currentCore[axis] < 48
    );
    const strongestAxes = [...CORE_AXES]
      .sort(
        (left, right) =>
          currentCore[right] - currentCore[left] ||
          left.localeCompare(right)
      )
      .slice(0, 2);
    const evidence = [
      ...strongestAxes.map(
        (axis) => `${coreAxisLabel(axis)}を形成しやすいです。`
      ),
      goalEvidence >= 40 && (goal === "rain" || goal === "sand" || goal === "sun")
        ? `${TEAM_BUILDER_GOAL_LABELS[goal]}を利用する技・特性の採用実績があります。`
        : "",
      goal === "trick-room" && profile === "trick-room"
        ? "現在の低速重視設定と噛み合います。"
        : "",
      identityEvaluation.role === "primary"
        ? `${CANDIDATE_IDENTITY_LABELS[signal.identity.primary]}として主軸になれます。`
        : identityEvaluation.role === "support"
          ? `${CANDIDATE_IDENTITY_LABELS[signal.identity.primary]}として補助できます。`
          : "候補の主な強みとこの完成形にはずれがあります。"
    ].filter(Boolean);
    const confidence: TeamBuilderGoalInference["confidence"] =
      goalEvidence >= 60 && signal.reliability >= 60
        ? "high"
        : goalEvidence >= 25 || signal.reliability >= 45
          ? "medium"
          : "low";
    return {
      goal,
      label: identityAwareGoalLabel(goal, signal.identity),
      score: round(identityFirstScore),
      confidence,
      missingAxes,
      evidence,
      identityGoalCompatibility: identityEvaluation.compatibility,
      identityConflictPenalty: identityEvaluation.conflictPenalty,
      candidateRole: identityEvaluation.role,
      scoreBreakdown: {
        identityCompatibility: identityEvaluation.compatibility,
        currentTeamConnection: round(clamp(connectionScore)),
        coreFit: round(base),
        goalEvidence: round(clamp(goalEvidence)),
        supportFeasibility: round(supportFeasibility),
        identityConflictPenalty: identityEvaluation.conflictPenalty,
        total: round(identityFirstScore)
      }
    };
  }).sort(
    (left, right) =>
      right.score - left.score || left.goal.localeCompare(right.goal)
  );
}

function coreAxisLabel(axis: TeamBuilderCoreAxis): string {
  const labels: Record<TeamBuilderCoreAxis, string> = {
    offensiveCore: "攻撃のつながり",
    defensiveCore: "守りの分担",
    abilityCore: "特性による補完",
    pivotCore: "交代技による展開",
    setupCore: "積み展開",
    cleanupCore: "終盤の詰め",
    winCondition: "勝ち筋",
    cycleViability: "サイクル継続"
  };
  return labels[axis];
}

function combineCore(
  current: Record<TeamBuilderCoreAxis, number>,
  next: Record<TeamBuilderCoreAxis, number>
): Record<TeamBuilderCoreAxis, number> {
  return Object.fromEntries(
    CORE_AXES.map((axis) => [
      axis,
      round(
        clamp(
          current[axis] +
            Math.max(0, next[axis] - current[axis]) * 0.45
        )
      )
    ])
  ) as Record<TeamBuilderCoreAxis, number>;
}

function addSeedToCurrentCore(
  current: Record<TeamBuilderCoreAxis, number>,
  seed: Record<TeamBuilderCoreAxis, number>,
  currentMemberCount: number
): Record<TeamBuilderCoreAxis, number> {
  const seedWeight = 1 / Math.max(1, currentMemberCount + 1);
  return Object.fromEntries(
    CORE_AXES.map((axis) => [
      axis,
      round(
        clamp(
          current[axis] * (1 - seedWeight) +
            seed[axis] * seedWeight
        )
      )
    ])
  ) as Record<TeamBuilderCoreAxis, number>;
}

function pairKey(leftSlug: string, rightSlug: string): string {
  return leftSlug.localeCompare(rightSlug) <= 0
    ? `${leftSlug}|${rightSlug}`
    : `${rightSlug}|${leftSlug}`;
}

function typeComplement(
  left: PokemonEntry,
  right: PokemonEntry,
  cache: PlannerPairCache
): number {
  const key = pairKey(left.slug, right.slug);
  const cached = cache.typeComplement.get(key);
  if (cached !== undefined) return cached;
  const types = getAllTypes().map((entry) => entry.nameEn);
  const leftWeak = types.filter((type) => getMultiplier(type, left.types) > 1);
  const rightWeak = types.filter((type) => getMultiplier(type, right.types) > 1);
  const covered =
    leftWeak.filter((type) => getMultiplier(type, right.types) < 1).length +
    rightWeak.filter((type) => getMultiplier(type, left.types) < 1).length;
  const possible = leftWeak.length + rightWeak.length;
  const shared = leftWeak.filter((type) => rightWeak.includes(type)).length;
  const value = clamp(
    (possible ? (covered / possible) * 100 : 50) - shared * 8
  );
  cache.typeComplement.set(key, value);
  return value;
}

function teammateNaturalness(
  left: CandidateSignals,
  right: CandidateSignals,
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>,
  cache: PlannerPairCache
): number {
  const key = pairKey(left.slug, right.slug);
  const cached = cache.teammateNaturalness.get(key);
  if (cached !== undefined) return cached;
  const leftEnvironment = environmentBySlug.get(left.slug);
  const rightEnvironment = environmentBySlug.get(right.slug);
  const leftShare =
    leftEnvironment?.teammates.find((entry) => entry.slug === right.slug)
      ?.share ?? 0;
  const rightShare =
    rightEnvironment?.teammates.find((entry) => entry.slug === left.slug)
      ?.share ?? 0;
  const value = clamp(Math.max(leftShare, rightShare) * 100);
  cache.teammateNaturalness.set(key, value);
  return value;
}

function deficitClosure(
  current: Record<TeamBuilderCoreAxis, number>,
  next: Record<TeamBuilderCoreAxis, number>,
  goal: TeamBuilderGoal
): number {
  let possible = 0;
  let closed = 0;
  for (const axis of CORE_AXES) {
    const weight = TEAM_BUILDER_GOAL_AXIS_WEIGHTS[goal][axis];
    const deficit = Math.max(0, 65 - current[axis]) * weight;
    possible += deficit;
    closed += Math.min(deficit, next[axis] * weight);
  }
  return possible === 0 ? 70 : clamp((closed / possible) * 100);
}

function isAllowedFutureCandidate(
  signal: CandidateSignals,
  selected: CandidateSignals[],
  baseTeam: PokemonEntry[]
): boolean {
  const members = [...baseTeam, ...selected.map((entry) => entry.pokemon)];
  if (
    members.some(
      (member) => member.speciesId === signal.pokemon.speciesId
    )
  ) {
    return false;
  }
  const decision = getAdvisorMegaRecommendationDecision({
    currentTeamSize: members.length,
    currentMegaCount: members.filter((member) => member.formKind === "mega").length,
    candidateIsMega: signal.pokemon.formKind === "mega",
    actionKind: "add"
  });
  return decision.allowed && members.length < 6;
}

function identitySupportForSeed(
  seed: CandidateSignals,
  next: CandidateSignals
): { score: number; reason: string } {
  if (
    seed.identity.primary === "setup-sweeper" ||
    seed.identity.secondary === "setup-sweeper"
  ) {
    const hazardRemoval = tagPresence(next.semantic, "HazardRemoval");
    const hazardSetter = tagPresence(next.semantic, "HazardSetter");
    const tempo = tagPresence(next.semantic, "Tempo");
    const pivot = tagPresence(next.semantic, "Pivot");
    const anchor = tagPresence(next.semantic, "DefensiveAnchor");
    const utility = tagPresence(next.semantic, "Utility");
    const supportScore = clamp(
      Math.max(
        hazardRemoval,
        hazardSetter * 0.78,
        tempo,
        pivot * 0.92,
        anchor * 0.86,
        utility * 0.82
      )
    );
    const choices = [
      {
        value: hazardRemoval,
        reason: "設置技を取り除き、積みエースを動かしやすくできます。"
      },
      {
        value: tempo,
        reason: "起点作成や妨害で積みエースが動ける状況を作れます。"
      },
      {
        value: pivot * 0.92,
        reason: "対面操作から積みエースを安全につなぎやすくできます。"
      },
      {
        value: anchor * 0.86,
        reason: "苦手な相手を受け、積みエースの再展開を支えられます。"
      },
      {
        value: hazardSetter * 0.78,
        reason: "設置ダメージで積みエースの攻撃圏内を作れます。"
      },
      {
        value: utility * 0.82,
        reason: "妨害や補助によって積みエースの展開を支えられます。"
      }
    ].sort(
      (left, right) => right.value - left.value || left.reason.localeCompare(right.reason)
    );
    return {
      score: round(supportScore),
      reason: choices[0]?.value >= 12 ? choices[0].reason : ""
    };
  }
  if (seed.identity.primary === "cleaner") {
    const chip = Math.max(
      tagPresence(next.semantic, "HazardSetter"),
      tagPresence(next.semantic, "WallBreak"),
      tagPresence(next.semantic, "Tempo")
    );
    return {
      score: round(clamp(chip)),
      reason:
        chip >= 12
          ? "相手を終盤の処理圏内へ入れる役割を補えます。"
          : ""
    };
  }
  if (
    seed.identity.primary === "wall-breaker" ||
    seed.identity.primary === "trapper"
  ) {
    const support = Math.max(
      next.identity.scores["defensive-anchor"] * 0.82 +
        next.core.cycleViability * 0.18,
      next.identity.scores.pivot * 0.72,
      next.identity.scores["tempo-support"] * 0.62,
      next.identity.scores["utility-support"] * 0.52
    );
    return {
      score: round(clamp(support)),
      reason:
        support >= 12
          ? "崩し役が苦手な相手を受け、再び攻める機会を作れます。"
          : ""
    };
  }
  return {
    score: round(
      average([
        tagPresence(next.semantic, "Utility"),
        tagPresence(next.semantic, "Pivot"),
        tagPresence(next.semantic, "Tempo")
      ])
    ),
    reason: ""
  };
}

function futureStep(
  seed: CandidateSignals,
  next: CandidateSignals,
  currentCore: Record<TeamBuilderCoreAxis, number>,
  goal: TeamBuilderGoal,
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>,
  pairCache: PlannerPairCache,
  existingMembers: PokemonEntry[],
  step: number,
  conditionEstablished = false
): TeamBuilderChainStep {
  const combined = combineCore(currentCore, next.core);
  const directAffinity = goalAffinity(next, goal);
  const nextGoalEvaluation = identityGoalEvaluation(
    next,
    goal,
    conditionEstablished
  );
  const identitySupport = identitySupportForSeed(seed, next);
  const goalFit = clamp(
    weightedCoreScore(next.core, goal) * 0.65 +
      directAffinity * 0.35
  );
  const coreGain = deficitClosure(currentCore, next.core, goal);
  const naturalness = teammateNaturalness(
    seed,
    next,
    environmentBySlug,
    pairCache
  );
  const complement = typeComplement(
    seed.pokemon,
    next.pokemon,
    pairCache
  );
  const combinedQuality = weightedCoreScore(combined, goal);
  const battleReadiness = average([
    next.battle?.finalBattleValue ?? 0,
    next.plan?.contestability?.score ?? next.reliability
  ]);
  const seedOffense = average([
    seed.core.offensiveCore,
    seed.core.setupCore,
    seed.core.cleanupCore,
    seed.core.winCondition
  ]);
  const seedDefense = average([
    seed.core.defensiveCore,
    seed.core.abilityCore,
    seed.core.cycleViability
  ]);
  const nextDefensiveRole = average([
    next.core.defensiveCore,
    next.core.abilityCore,
    next.core.cycleViability,
    tagPresence(next.semantic, "DefensiveAnchor")
  ]);
  const nextOffensiveRole = average([
    next.core.offensiveCore,
    next.core.setupCore,
    next.core.cleanupCore,
    tagPresence(next.semantic, "WallBreak")
  ]);
  const sameArchetypePenalty =
    seed.semantic?.archetype.primary &&
    seed.semantic.archetype.primary === next.semantic?.archetype.primary
      ? 8
      : 0;
  const roleDiversity = clamp(
    seedOffense >= seedDefense
      ? nextDefensiveRole - sameArchetypePenalty
      : nextOffensiveRole - sameArchetypePenalty
  );
  const existingTypes = new Set(
    existingMembers.flatMap((member) => member.types)
  );
  const typeOverlapPenalty =
    next.pokemon.types.filter((type) => existingTypes.has(type)).length * 4;
  const score = clamp(
    (usesDirectGoalAffinity(goal)
      ? goalFit * 0.15 +
        directAffinity * 0.14 +
        coreGain * 0.14 +
        combinedQuality * 0.1 +
        naturalness * 0.08 +
        complement * 0.1 +
        roleDiversity * 0.1 +
        next.reliability * 0.04 +
        battleReadiness * 0.07 +
        nextGoalEvaluation.compatibility * 0.04 +
        identitySupport.score * 0.04
      : goalFit * 0.18 +
        coreGain * 0.17 +
        combinedQuality * 0.12 +
        naturalness * 0.08 +
        complement * 0.12 +
        roleDiversity * 0.11 +
        next.reliability * 0.03 +
        battleReadiness * 0.07 +
        nextGoalEvaluation.compatibility * 0.06 +
        identitySupport.score * 0.06) -
      typeOverlapPenalty -
      nextGoalEvaluation.conflictPenalty * 0.08
  );
  const strongestGain = [...CORE_AXES].sort(
    (left, right) =>
      next.core[right] - currentCore[right] -
        (next.core[left] - currentCore[left]) ||
      left.localeCompare(right)
  )[0];
  return {
    step,
    slug: next.slug,
    name: next.pokemon.nameJa,
    score: round(score),
    goalFit: round(goalFit),
    goalAffinity: round(directAffinity),
    coreGain: round(coreGain),
    naturalness: round(naturalness),
    goal,
    goalLabel: identityAwareGoalLabel(goal, seed.identity),
    goalCompatibility: nextGoalEvaluation.compatibility,
    goalRole: nextGoalEvaluation.role,
    identitySupport: identitySupport.score,
    primaryIdentity: next.identity.primary,
    secondaryIdentity: next.identity.secondary,
    identityConfidence: next.identity.confidence,
    reasons: [
      identitySupport.reason,
      directGoalReason(goal, directAffinity),
      `${coreAxisLabel(strongestGain)}を補えます。`,
      naturalness >= 20
        ? "環境データでも一緒に採用される傾向があります。"
        : "",
      complement >= 55 ? "互いの弱点を補いやすい組み合わせです。" : ""
    ].filter(Boolean)
  };
}

function buildCoreQuality(
  core: Record<TeamBuilderCoreAxis, number>,
  goal: TeamBuilderGoal
): TeamBuilderCoreQuality {
  return {
    ...Object.fromEntries(
      CORE_AXES.map((axis) => [axis, round(core[axis])])
    ) as Record<TeamBuilderCoreAxis, number>,
    overall: weightedCoreScore(core, goal)
  };
}

function uniqueAdditionPlans(plans: AdvisorSwapPlan[]): AdvisorSwapPlan[] {
  const sorted = [...plans]
    .filter((plan) => plan.action.kind === "add")
    .sort(
      (left, right) =>
        right.finalRecommendation - left.finalRecommendation ||
        right.improvementScore - left.improvementScore ||
        left.candidate.pokemon.slug.localeCompare(
          right.candidate.pokemon.slug
        )
  );
  const selected: AdvisorSwapPlan[] = [];
  const slugs = new Set<string>();
  for (const plan of sorted) {
    if (slugs.has(plan.candidate.pokemon.slug)) continue;
    slugs.add(plan.candidate.pokemon.slug);
    selected.push(plan);
  }
  return selected;
}

function selectFuturePool({
  seed,
  signals,
  goal,
  currentCore,
  baseTeam,
  environmentBySlug,
  pairCache,
  conditionEstablished
}: {
  seed: CandidateSignals;
  signals: CandidateSignals[];
  goal: TeamBuilderGoal;
  currentCore: Record<TeamBuilderCoreAxis, number>;
  baseTeam: PokemonEntry[];
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>;
  pairCache: PlannerPairCache;
  conditionEstablished: boolean;
}): CandidateSignals[] {
  const allowed = signals.filter(
    (next) =>
      next.slug !== seed.slug &&
      ![...baseTeam, seed.pokemon].some(
        (member) => member.speciesId === next.pokemon.speciesId
      )
  );
  const poolMetrics = new Map(
    allowed.map((entry) => {
      const recommendation =
        entry.plan?.finalRecommendation ??
        (entry.battle?.finalBattleValue ?? 0) * 0.65;
      const contestability =
        entry.plan?.contestability?.score ?? entry.reliability;
      const affinity = goalAffinity(entry, goal);
      const naturalness = teammateNaturalness(
        seed,
        entry,
        environmentBySlug,
        pairCache
      );
      const complement = typeComplement(
        seed.pokemon,
        entry.pokemon,
        pairCache
      );
      const identityGoal = identityGoalEvaluation(
        entry,
        goal,
        conditionEstablished
      );
      const identitySupport = identitySupportForSeed(seed, entry);
      const score = usesDirectGoalAffinity(goal)
        ? recommendation * 0.16 +
          (entry.battle?.finalBattleValue ?? 0) * 0.13 +
          contestability * 0.1 +
          weightedCoreScore(entry.core, goal) * 0.12 +
          affinity * 0.17 +
          deficitClosure(currentCore, entry.core, goal) * 0.11 +
          naturalness * 0.07 +
          identityGoal.compatibility * 0.08 +
          identitySupport.score * 0.06 -
          identityGoal.conflictPenalty * 0.08
        : recommendation * 0.23 +
          (entry.battle?.finalBattleValue ?? 0) * 0.16 +
          contestability * 0.14 +
          weightedCoreScore(entry.core, goal) * 0.13 +
          deficitClosure(currentCore, entry.core, goal) * 0.09 +
          naturalness * 0.06 +
          identityGoal.compatibility * 0.1 +
          identitySupport.score * 0.09 -
          identityGoal.conflictPenalty * 0.08;
      return [
        entry.slug,
        { affinity, naturalness, complement, score }
      ] as const;
    })
  );
  const universal = [...allowed].sort((left, right) => {
    return (
      (poolMetrics.get(right.slug)?.score ?? 0) -
        (poolMetrics.get(left.slug)?.score ?? 0) ||
      left.slug.localeCompare(right.slug)
    );
  });
  const selected = new Map<string, CandidateSignals>();
  const selectedSpecies = new Set<number>();
  const add = (entry: CandidateSignals) => {
    if (
      selected.size <
      GOAL_ORIENTED_TEAM_BUILDER_CONFIG.futurePoolSize
    ) {
      if (selectedSpecies.has(entry.pokemon.speciesId)) return;
      selected.set(entry.slug, entry);
      selectedSpecies.add(entry.pokemon.speciesId);
    }
  };
  universal.slice(0, 14).forEach(add);
  [...allowed]
    .sort(
      (left, right) =>
        (poolMetrics.get(right.slug)?.naturalness ?? 0) -
          (poolMetrics.get(left.slug)?.naturalness ?? 0) ||
        left.slug.localeCompare(right.slug)
    )
    .slice(0, 8)
    .forEach(add);
  if (usesDirectGoalAffinity(goal)) {
    [...allowed]
      .sort(
        (left, right) =>
          (poolMetrics.get(right.slug)?.affinity ?? 0) -
            (poolMetrics.get(left.slug)?.affinity ?? 0) ||
          left.slug.localeCompare(right.slug)
      )
      .slice(0, 12)
      .forEach(add);
  }
  [...allowed]
    .sort(
      (left, right) =>
        (poolMetrics.get(right.slug)?.complement ?? 0) -
          (poolMetrics.get(left.slug)?.complement ?? 0) ||
        left.slug.localeCompare(right.slug)
    )
    .slice(0, 10)
    .forEach(add);
  [...allowed]
    .sort(
      (left, right) =>
        identitySupportForSeed(seed, right).score -
          identitySupportForSeed(seed, left).score ||
        (poolMetrics.get(right.slug)?.score ?? 0) -
          (poolMetrics.get(left.slug)?.score ?? 0) ||
        left.slug.localeCompare(right.slug)
    )
    .slice(0, 8)
    .forEach(add);
  [...CORE_AXES]
    .sort(
      (left, right) =>
        (65 - currentCore[right]) *
          TEAM_BUILDER_GOAL_AXIS_WEIGHTS[goal][right] -
          (65 - currentCore[left]) *
            TEAM_BUILDER_GOAL_AXIS_WEIGHTS[goal][left] ||
        left.localeCompare(right)
    )
    .slice(0, 5)
    .forEach((axis) => {
      [...allowed]
        .sort(
          (left, right) =>
            right.core[axis] - left.core[axis] ||
            left.slug.localeCompare(right.slug)
        )
        .slice(0, 6)
        .forEach(add);
    });
  universal.forEach(add);
  return [...selected.values()];
}

export function buildGoalOrientedTeamBuilder({
  team,
  plans,
  battleBySlug,
  semanticBySlug,
  environmentDataset,
  profile
}: {
  team: string[];
  plans: AdvisorSwapPlan[];
  battleBySlug: ReadonlyMap<string, BattleValueCandidate>;
  semanticBySlug: ReadonlyMap<string, SemanticCandidateProfile>;
  environmentDataset: ThreatEnvironmentDataset;
  profile: "standard" | "trick-room";
}): GoalOrientedTeamBuilderResult {
  const additionPlans = uniqueAdditionPlans(plans);
  const environmentBySlug = new Map(
    environmentDataset.pokemon.map((entry) => [entry.slug, entry])
  );
  const planBySlug = new Map(
    additionPlans.map((plan) => [plan.candidate.pokemon.slug, plan])
  );
  const rawSignals = environmentDataset.pokemon.flatMap((environment) => {
    if (
      environment.usageRate <
      environmentDataset.metadata.minimumUsageRate
    ) {
      return [];
    }
    const pokemon = getPokemonBySlug(environment.slug);
    if (!pokemon) return [];
    const plan = planBySlug.get(environment.slug) ?? null;
    const signal = rawSignalsFor(
      pokemon,
      plan,
      battleBySlug.get(environment.slug) ?? null,
      semanticBySlug.get(environment.slug) ?? null,
      environment
    );
    return signal ? [signal] : [];
  });
  const signals = normalizeSignals(rawSignals);
  const seedSignals = signals.filter(
    (
      signal
    ): signal is CandidateSignals & { plan: AdvisorSwapPlan } =>
      signal.plan !== null && planBySlug.has(signal.slug)
  );
  const baseTeam = team.flatMap((slug) => {
    const pokemon = getPokemonBySlug(slug);
    return pokemon ? [pokemon] : [];
  });
  const baseTeamCore = buildCurrentTeamCore(
    baseTeam,
    environmentBySlug
  );
  const pairCache: PlannerPairCache = {
    typeComplement: new Map(),
    teammateNaturalness: new Map()
  };
  let futureComparisonCount = 0;
  let chainStepCount = 0;

  const candidates = seedSignals.map((seed) => {
    const remainingSlotsAfterCandidate = Math.max(0, 6 - team.length - 1);
    const currentCore = addSeedToCurrentCore(
      baseTeamCore,
      seed.core,
      baseTeam.length
    );
    const inferredGoals = goalInference(
      seed,
      currentCore,
      team,
      environmentBySlug,
      profile,
      remainingSlotsAfterCandidate
    ).slice(0, 3);
    const selectedGoal = inferredGoals[0];
    const selectedGoalTeamAffinity =
      selectedGoal.goal === "trick-room"
        ? profile === "trick-room"
          ? 100
          : aggregateAffinity(team, environmentBySlug, "trickRoom")
        : selectedGoal.goal === "rain" ||
            selectedGoal.goal === "sand" ||
            selectedGoal.goal === "sun"
          ? aggregateAffinity(team, environmentBySlug, selectedGoal.goal)
          : selectedGoal.goal === "hazard-stack"
            ? aggregateAffinity(team, environmentBySlug, "hazard")
            : selectedGoal.goal === "pivot-cycle"
              ? baseTeamCore.pivotCore
              : 0;
    const conditionEstablished =
      (selectedGoal.goal === "rain" ||
        selectedGoal.goal === "sand" ||
        selectedGoal.goal === "sun" ||
        selectedGoal.goal === "trick-room") &&
      selectedGoalTeamAffinity >=
        GOAL_ORIENTED_TEAM_BUILDER_CONFIG.minimumDirectGoalAffinity;
    const dynamicFuturePool =
      remainingSlotsAfterCandidate > 0
        ? selectFuturePool({
            seed,
            signals,
            goal: selectedGoal.goal,
            currentCore,
            baseTeam,
            environmentBySlug,
            pairCache,
            conditionEstablished
          })
        : [];
    const immediate = dynamicFuturePool
      .filter((next) =>
        isAllowedFutureCandidate(next, [seed], baseTeam)
      )
      .map((next) => {
        futureComparisonCount += 1;
        return futureStep(
          seed,
          next,
          currentCore,
          selectedGoal.goal,
          environmentBySlug,
          pairCache,
          [...baseTeam, seed.pokemon],
          1,
          conditionEstablished
        );
      })
      .sort(
        (left, right) =>
          right.score - left.score || left.slug.localeCompare(right.slug)
      );
    const nextCandidates = immediate.slice(
      0,
      GOAL_ORIENTED_TEAM_BUILDER_CONFIG.maximumImmediatePreviews
    );
    if (
      (seed.identity.primary === "setup-sweeper" ||
        seed.identity.secondary === "setup-sweeper" ||
        seed.identity.primary === "wall-breaker" ||
        seed.identity.primary === "trapper") &&
      nextCandidates.length ===
        GOAL_ORIENTED_TEAM_BUILDER_CONFIG.maximumImmediatePreviews
    ) {
      const strongestSupport = [...immediate].sort(
        (left, right) =>
          right.identitySupport * 0.55 +
            right.score * 0.25 +
            right.coreGain * 0.2 -
            (left.identitySupport * 0.55 +
              left.score * 0.25 +
              left.coreGain * 0.2) ||
          left.slug.localeCompare(right.slug)
      )[0];
      if (
        strongestSupport &&
        strongestSupport.identitySupport >= 18 &&
        !nextCandidates.some(
          (candidate) => candidate.slug === strongestSupport.slug
        )
      ) {
        nextCandidates[nextCandidates.length - 1] = strongestSupport;
      }
    }
    if (
      usesDirectGoalAffinity(selectedGoal.goal) &&
      nextCandidates.length ===
        GOAL_ORIENTED_TEAM_BUILDER_CONFIG.maximumImmediatePreviews
    ) {
      const directGoalSupport = [...immediate].sort(
        (left, right) =>
          right.goalAffinity - left.goalAffinity ||
          right.score - left.score ||
          left.slug.localeCompare(right.slug)
      )[0];
      if (
        directGoalSupport &&
        directGoalSupport.goalAffinity >=
          GOAL_ORIENTED_TEAM_BUILDER_CONFIG.minimumDirectGoalAffinity &&
        !nextCandidates.some(
          (candidate) => candidate.slug === directGoalSupport.slug
        )
      ) {
        nextCandidates[nextCandidates.length - 1] = directGoalSupport;
      }
    }
    const chain: TeamBuilderChainStep[] = [];
    const selectedSignals: CandidateSignals[] = [seed];
    let chainCore = currentCore;
    let activeGoal = selectedGoal;
    const maximumDepth = Math.min(
      GOAL_ORIENTED_TEAM_BUILDER_CONFIG.maximumChainDepth,
      remainingSlotsAfterCandidate
    );
    for (let step = 1; step <= maximumDepth; step += 1) {
      const reassessedGoals = goalInference(
        seed,
        chainCore,
        [
          ...team,
          ...selectedSignals.slice(1).map((entry) => entry.slug)
        ],
        environmentBySlug,
        profile,
        Math.max(0, remainingSlotsAfterCandidate - step + 1)
      );
      const proposedGoal = reassessedGoals[0];
      const retainedGoal =
        reassessedGoals.find((entry) => entry.goal === activeGoal.goal) ??
        activeGoal;
      const switchDelta =
        seed.identity.confidence === "high"
          ? GOAL_ORIENTED_TEAM_BUILDER_CONFIG.highConfidenceGoalSwitchDelta
          : GOAL_ORIENTED_TEAM_BUILDER_CONFIG.normalGoalSwitchDelta;
      if (
        proposedGoal.goal === retainedGoal.goal ||
        proposedGoal.score >= retainedGoal.score + switchDelta
      ) {
        activeGoal = proposedGoal;
      } else {
        activeGoal = retainedGoal;
      }
      const stepFuturePool = selectFuturePool({
        seed,
        signals,
        goal: activeGoal.goal,
        currentCore: chainCore,
          baseTeam,
          environmentBySlug,
          pairCache,
          conditionEstablished
      });
      const options = stepFuturePool
        .filter(
          (next) =>
            !selectedSignals.some((entry) => entry.slug === next.slug) &&
            isAllowedFutureCandidate(next, selectedSignals, baseTeam)
        )
        .map((next) => {
          futureComparisonCount += 1;
          return futureStep(
            seed,
            next,
            chainCore,
            activeGoal.goal,
            environmentBySlug,
            pairCache,
            [
              ...baseTeam,
              ...selectedSignals.map((entry) => entry.pokemon)
            ],
            step,
            conditionEstablished
          );
        })
        .sort(
          (left, right) =>
            right.score - left.score || left.slug.localeCompare(right.slug)
        );
      const chosen = options[0];
      if (!chosen) break;
      chain.push(chosen);
      chainStepCount += 1;
      const chosenSignal = signals.find(
        (entry) => entry.slug === chosen.slug
      );
      if (!chosenSignal) break;
      selectedSignals.push(chosenSignal);
      chainCore = combineCore(chainCore, chosenSignal.core);
    }
    const viableFutureCount = immediate.filter(
      (entry) =>
        entry.score >=
        GOAL_ORIENTED_TEAM_BUILDER_CONFIG.minimumViableFutureScore
    ).length;
    const missingAfterChain = CORE_AXES.filter(
      (axis) =>
        TEAM_BUILDER_GOAL_AXIS_WEIGHTS[selectedGoal.goal][axis] >= 0.12 &&
        chainCore[axis] < 48
    ).length;
    const conditionDependent = usesDirectGoalAffinity(
      selectedGoal.goal
    );
    const conditionSupportCount = dynamicFuturePool.filter(
      (entry) =>
        goalAffinity(entry, selectedGoal.goal) >=
        GOAL_ORIENTED_TEAM_BUILDER_CONFIG.minimumDirectGoalAffinity
    ).length;
    const seedGoalAffinity = goalAffinity(seed, selectedGoal.goal);
    const plannedGoalAffinity = Math.max(
      seedGoalAffinity,
      ...chain.map((entry) => entry.goalAffinity)
    );
    const sharedRisk = chain.reduce((total, entry) => {
      const chained = signals.find((signal) => signal.slug === entry.slug);
      return chained
        ? total +
            Math.max(
              0,
              50 -
                typeComplement(
                  seed.pokemon,
                  chained.pokemon,
                  pairCache
                )
            )
        : total;
    }, 0);
    const rawDeadEndRisk =
      (viableFutureCount >= 6
        ? 0
        : ((6 - viableFutureCount) / 6) * 42) +
        missingAfterChain * (conditionEstablished ? 4 : 8) +
        (remainingSlotsAfterCandidate > 0 && chain.length < maximumDepth
          ? 22
          : 0) +
        (conditionDependent &&
        !conditionEstablished &&
        conditionSupportCount < 2
          ? 18
          : 0) +
        (conditionDependent &&
        remainingSlotsAfterCandidate > 0 &&
        Math.max(plannedGoalAffinity, selectedGoalTeamAffinity) <
          GOAL_ORIENTED_TEAM_BUILDER_CONFIG.minimumDirectGoalAffinity
          ? 16
          : 0) +
        sharedRisk * 0.08 +
        seed.unclassifiedRate * 12;
    const deadEndRisk = clamp(
      rawDeadEndRisk * (conditionEstablished ? 0.35 : 1)
    );
    const futurePotential =
      remainingSlotsAfterCandidate === 0
        ? 0
        : clamp(
            usesDirectGoalAffinity(selectedGoal.goal)
              ? average(nextCandidates.map((entry) => entry.score)) * 0.45 +
                  weightedCoreScore(chainCore, selectedGoal.goal) * 0.25 +
                  average(chain.map((entry) => entry.naturalness)) *
                    0.1 +
                  (conditionEstablished
                    ? average(
                        nextCandidates.map(
                          (entry) => entry.goalCompatibility
                        )
                      )
                    : average(
                        nextCandidates.map(
                          (entry) => entry.goalAffinity
                        )
                      )) *
                    0.2
              : average(nextCandidates.map((entry) => entry.score)) * 0.55 +
                  weightedCoreScore(chainCore, selectedGoal.goal) * 0.3 +
                  average(chain.map((entry) => entry.naturalness)) * 0.15
          );
    const coreQuality = buildCoreQuality(chainCore, selectedGoal.goal);
    const currentCoreQuality = buildCoreQuality(
      currentCore,
      selectedGoal.goal
    );
    const currentFit = clamp(
      usesDirectGoalAffinity(selectedGoal.goal)
        ? selectedGoal.score * 0.65 +
            selectedGoal.identityGoalCompatibility * 0.15 +
            seedGoalAffinity * 0.1 +
            (seed.battle?.finalBattleValue ?? 0) * 0.05 +
            (seed.plan.contestability?.score ?? 0) * 0.05
        : selectedGoal.score * 0.75 +
            (seed.battle?.finalBattleValue ?? 0) * 0.15 +
            (seed.plan.contestability?.score ?? 0) * 0.1
    );
    const weights = GOAL_ORIENTED_TEAM_BUILDER_CONFIG.scoreWeights;
    const goalScore = clamp(
      currentFit * weights.currentFit +
        futurePotential * weights.futurePotential +
        coreQuality.overall * weights.coreQuality -
        deadEndRisk * weights.deadEndRisk +
        selectedGoal.identityGoalCompatibility *
          weights.identityGoalCompatibility -
        selectedGoal.identityConflictPenalty *
          weights.identityConflictPenalty
    );
    const goalScoreBreakdown = {
      currentFit: round(currentFit * weights.currentFit),
      futurePotential: round(
        futurePotential * weights.futurePotential
      ),
      coreQuality: round(coreQuality.overall * weights.coreQuality),
      identityGoalCompatibility: round(
        selectedGoal.identityGoalCompatibility *
          weights.identityGoalCompatibility
      ),
      deadEndRisk: round(-deadEndRisk * weights.deadEndRisk),
      identityConflictPenalty: round(
        -selectedGoal.identityConflictPenalty *
          weights.identityConflictPenalty
      )
    };
    const strongestAxis = [...CORE_AXES].sort(
      (left, right) =>
        coreQuality[right] - coreQuality[left] ||
        left.localeCompare(right)
    )[0];
    const explanations = [
      identityGoalReason(seed.identity, selectedGoal),
      `${selectedGoal.label}の完成形へ向かいやすい候補です。`,
      `${coreAxisLabel(strongestAxis)}を伸ばせます。`,
      nextCandidates[0]
        ? `この後、${nextCandidates[0].name}などへ自然につなげられます。`
        : ""
    ].filter(Boolean);
    const cautions = [
      deadEndRisk >= 55
        ? "この候補の後は不足役割を埋められる選択肢が限られます。"
        : "",
      missingAfterChain >= 3
        ? "完成までに複数の役割を残り枠で補う必要があります。"
        : ""
    ].filter(Boolean);
    return {
      schemaVersion: 2,
      candidateSlug: seed.slug,
      candidateIdentity: seed.identity,
      inferredGoals,
      selectedGoal,
      goalAffinity: round(seedGoalAffinity),
      identityGoalCompatibility:
        selectedGoal.identityGoalCompatibility,
      identityConflictPenalty: selectedGoal.identityConflictPenalty,
      currentFit: round(currentFit),
      futurePotential: round(futurePotential),
      currentCoreQuality,
      coreQuality,
      deadEndRisk: round(deadEndRisk),
      goalScore: round(goalScore),
      goalScoreBreakdown,
      nextCandidates,
      chain,
      explanations,
      cautions,
      remainingSlotsAfterCandidate,
      evaluatedFutureCandidateCount: dynamicFuturePool.length
    } satisfies GoalOrientedCandidatePlan;
  });
  candidates.sort(
    (left, right) =>
      right.goalScore - left.goalScore ||
      left.candidateSlug.localeCompare(right.candidateSlug)
  );
  return {
    metadata: {
      schemaVersion: 2,
      mode: "core-goal-planning",
      planningPriority: "candidate-identity-first",
      deterministic: true,
      maximumChainDepth:
        GOAL_ORIENTED_TEAM_BUILDER_CONFIG.maximumChainDepth,
      beamSearch: false,
      formula: GOAL_ORIENTED_TEAM_BUILDER_CONFIG.formula
    },
    input: {
      team,
      regulation: environmentDataset.regulationId,
      profile,
      datasetId: environmentDataset.snapshotId
    },
    candidates,
    ranking: candidates.map((entry) => entry.candidateSlug),
    computation: {
      candidateCount: candidates.length,
      futureComparisonCount,
      chainStepCount
    }
  };
}
