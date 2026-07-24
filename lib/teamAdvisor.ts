import { getTeamTypeGapRows, type TeamDiagnostics } from "@/lib/teamDiagnostics";
import {
  describeAbilityAdjustedMoveEffectiveness,
  evaluateMoveAgainstPokemon,
  getEnvironmentAttackingMoves,
  THREAT_MOVE_THRESHOLDS
} from "@/lib/battleEffectiveness";
import {
  isThreatPokemonCandidate,
  type ThreatPokemonAnalysis
} from "@/lib/teamThreats";
import {
  getAllTypes,
  getMultiplier,
  getPokemonBySlug,
  getTypeLabel
} from "@/lib/typeChart";
import {
  isProfileSpeedAdvantage,
  TEAM_SPEED_THRESHOLDS,
  type TeamProfile
} from "@/lib/teamProfile";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";
import type { ThreatSnapshot } from "@/lib/threatSnapshot";
import type {
  PokemonEntry,
  TeamSlot,
  TeamSummary,
  TypeName
} from "@/types/pokemon";

export const ADVISOR_WEIGHTS = {
  issueTypeImmune: 22,
  issueTypeQuarter: 18,
  issueTypeResist: 14,
  issueTypeWeakPenalty: 10,
  physicalWall: 12,
  specialWall: 12,
  fastAttacker: 12,
  specialAttacker: 10,
  threatMovesResisted: 14,
  threatMovesPartlyResisted: 8,
  threatPopularMove: 12,
  threatStabPressure: 5,
  threatSpeedPressure: 4,
  threatMoveWeakPenalty: 6,
  offenseGapPerType: 2,
  offenseGapMaximum: 8,
  environmentUsageMaximum: 5,
  newWeaknessPenalty: 4,
  newQuadWeaknessPenalty: 4,
  newWeaknessPenaltyMaximum: 20
} as const;

export type TeamAdvisorIssueKind =
  | "type-gap"
  | "physical-wall"
  | "special-wall"
  | "speed"
  | "special-offense"
  | "unavailable";

export type TeamAdvisorIssue = {
  id: string;
  kind: TeamAdvisorIssueKind;
  title: string;
  reason: string;
  priority: number;
  type?: TypeName;
};

export type TeamAdvisorCandidateMetrics = {
  issueResolutionPoints: number;
  threatResponsePoints: number;
  rolePoints: number;
  offensePoints: number;
  environmentUsagePoints: number;
  newWeaknessPenalty: number;
};

export type TeamAdvisorCandidate = {
  pokemon: PokemonEntry;
  score: number;
  rating: 1 | 2 | 3 | 4 | 5;
  reasons: string[];
  addressedIssueIds: string[];
  environmentUsageRate: number | null;
  metrics: TeamAdvisorCandidateMetrics;
};

export type TeamAdvisorAnalysis = {
  overallLabel: "分析待ち" | "良好" | "要調整" | "改善余地あり";
  issues: TeamAdvisorIssue[];
  candidates: TeamAdvisorCandidate[];
  candidatePool: TeamAdvisorCandidate[];
  threatSnapshot: ThreatSnapshot;
};

export type TeamAdvisorInput = {
  team: TeamSlot[];
  summary: TeamSummary;
  diagnostics: TeamDiagnostics;
  threatSnapshot: ThreatSnapshot;
  availablePokemon: PokemonEntry[];
  environmentDataset: ThreatEnvironmentDataset | null;
  profile?: TeamProfile;
};

type RankedReason = {
  id: string;
  text: string;
  points: number;
  order: number;
};

const PHYSICAL_BULK_TOTAL = 180;
const SPECIAL_BULK_TOTAL = 180;
const BULK_STAT_MINIMUM = 80;
const HIGH_STAT_THRESHOLD = 100;
const MAX_ADVISOR_ITEMS = 3;
const MAX_ADVISOR_PREVIEW_CANDIDATES = 5;

function getRoleIssue(
  id: string,
  title: string,
  reason: string
): TeamAdvisorIssue | null {
  switch (id) {
    case "physical-wall-shortage":
      return { id, kind: "physical-wall", title, reason, priority: 70 };
    case "special-wall-shortage":
      return { id, kind: "special-wall", title, reason, priority: 69 };
    case "low-speed":
      return {
        id,
        kind: "speed",
        title: "高速アタッカーへの対策が不足しています",
        reason,
        priority: 90
      };
    case "low-trick-room":
      return {
        id,
        kind: "speed",
        title: "トリックルーム向けの低速枠が不足しています",
        reason,
        priority: 90
      };
    case "special-attacker-shortage":
      return { id, kind: "special-offense", title, reason, priority: 89 };
    case "unavailable-pokemon":
      return { id, kind: "unavailable", title, reason, priority: 110 };
    default:
      return null;
  }
}

export function getTeamAdvisorIssues(
  summary: TeamSummary,
  diagnostics: TeamDiagnostics
): TeamAdvisorIssue[] {
  if (summary.members.length < 2) return [];

  const roleIssues = diagnostics.cautions.flatMap((item) => {
    const issue = getRoleIssue(item.id, item.title, item.reason);
    return issue ? [issue] : [];
  });
  const typeIssues = getTeamTypeGapRows(summary).map((row) => {
    const weakCount = row.multiplierMap.weak + row.multiplierMap.quadWeak;
    return {
      id: `type-gap-${row.attackType}`,
      kind: "type-gap" as const,
      title: `${row.attackTypeJa}技が一貫しています`,
      reason: `${weakCount}体が弱点で、半減・無効で受けられるポケモンがいません。`,
      priority: 84 + weakCount + row.multiplierMap.quadWeak,
      type: row.attackType
    };
  });

  return [...roleIssues, ...typeIssues]
    .sort(
      (left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id, "ja")
    )
    .slice(0, MAX_ADVISOR_ITEMS);
}

function addReason(reasons: RankedReason[], reason: RankedReason): void {
  if (!reasons.some((entry) => entry.id === reason.id)) {
    reasons.push(reason);
  }
}

function scoreIssueResponses(
  pokemon: PokemonEntry,
  issues: TeamAdvisorIssue[],
  environment: ThreatEnvironmentPokemon | undefined,
  reasons: RankedReason[],
  addressedIssueIds: Set<string>,
  profile: TeamProfile
): { issueResolutionPoints: number; rolePoints: number } {
  let issueResolutionPoints = 0;
  let rolePoints = 0;
  const stats = pokemon.baseStats;

  for (const issue of issues) {
    if (issue.kind === "type-gap" && issue.type) {
      const evaluation = evaluateMoveAgainstPokemon({
        move: { type: issue.type, damageClass: "physical" },
        attacker: { slug: `issue:${issue.type}`, types: [issue.type] },
        defender: pokemon,
        defenderAbilityUsage: environment?.abilities
      });
      let points = 0;
      let text = "";
      points += Math.round(
        evaluation.immunityProbability * ADVISOR_WEIGHTS.issueTypeImmune +
          evaluation.quarterResistanceProbability *
            ADVISOR_WEIGHTS.issueTypeQuarter +
          (evaluation.resistanceProbability -
            evaluation.quarterResistanceProbability) *
            ADVISOR_WEIGHTS.issueTypeResist
      );
      issueResolutionPoints -= Math.round(
        evaluation.weaknessProbability * ADVISOR_WEIGHTS.issueTypeWeakPenalty
      );
      const abilityReason = describeAbilityAdjustedMoveEffectiveness({
        evaluation,
        moveName: `${getTypeLabel(issue.type)}技`,
        defenderName: pokemon.nameJa
      });
      if (evaluation.immunityProbability >= 0.5) {
        text = abilityReason ?? `${getTypeLabel(issue.type)}技を無効化できます。`;
      } else if (evaluation.quarterResistanceProbability >= 0.5) {
        text = abilityReason ?? `${getTypeLabel(issue.type)}技を1/4以下で受けられます。`;
      } else if (evaluation.resistanceProbability >= 0.5) {
        text = abilityReason ?? `${getTypeLabel(issue.type)}技を半減できます。`;
      } else if (evaluation.immunityProbability > 0 && abilityReason) {
        text = abilityReason;
      }
      if (points > 0 && text) {
        issueResolutionPoints += points;
        addressedIssueIds.add(issue.id);
        addReason(reasons, {
          id: `issue-${issue.id}`,
          text,
          points,
          order: 10
        });
      }
      continue;
    }

    if (!stats) continue;
    if (
      issue.kind === "physical-wall" &&
      stats.hp + stats.defense >= PHYSICAL_BULK_TOTAL &&
      stats.defense >= BULK_STAT_MINIMUM
    ) {
      rolePoints += ADVISOR_WEIGHTS.physicalWall;
      addressedIssueIds.add(issue.id);
      addReason(reasons, {
        id: "role-physical-wall",
        text: "物理耐久を補強できます。",
        points: ADVISOR_WEIGHTS.physicalWall,
        order: 30
      });
    }
    if (
      issue.kind === "special-wall" &&
      stats.hp + stats.specialDefense >= SPECIAL_BULK_TOTAL &&
      stats.specialDefense >= BULK_STAT_MINIMUM
    ) {
      rolePoints += ADVISOR_WEIGHTS.specialWall;
      addressedIssueIds.add(issue.id);
      addReason(reasons, {
        id: "role-special-wall",
        text: "特殊耐久を補強できます。",
        points: ADVISOR_WEIGHTS.specialWall,
        order: 31
      });
    }
    if (
      issue.kind === "speed" &&
      (profile === "trick-room"
        ? stats.speed <= TEAM_SPEED_THRESHOLDS.slowMaximum
        : stats.speed >= HIGH_STAT_THRESHOLD) &&
      Math.max(stats.attack, stats.specialAttack) >= HIGH_STAT_THRESHOLD
    ) {
      rolePoints += ADVISOR_WEIGHTS.fastAttacker;
      addressedIssueIds.add(issue.id);
      addReason(reasons, {
        id: "role-fast-attacker",
        text:
          profile === "trick-room"
            ? "トリックルーム向けの低速攻撃役を追加できます。"
            : "高速アタッカーを追加できます。",
        points: ADVISOR_WEIGHTS.fastAttacker,
        order: 32
      });
    }
    if (
      issue.kind === "special-offense" &&
      stats.specialAttack >= HIGH_STAT_THRESHOLD
    ) {
      rolePoints += ADVISOR_WEIGHTS.specialAttacker;
      addressedIssueIds.add(issue.id);
      addReason(reasons, {
        id: "role-special-attacker",
        text: "特殊攻撃の選択肢を補えます。",
        points: ADVISOR_WEIGHTS.specialAttacker,
        order: 33
      });
    }
  }

  return { issueResolutionPoints, rolePoints };
}

function scoreThreatResponses(
  pokemon: PokemonEntry,
  threats: ThreatPokemonAnalysis[],
  environment: ThreatEnvironmentPokemon | undefined,
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>,
  reasons: RankedReason[],
  profile: TeamProfile
): number {
  let points = 0;
  const stats = pokemon.baseStats;

  for (const threat of threats.slice(0, 5)) {
    const threatEnvironment = environmentBySlug.get(threat.pokemon.slug);
    const incomingMoves = getEnvironmentAttackingMoves(
      threatEnvironment?.moves
    );
    if (incomingMoves.length > 0) {
      const incomingEvaluations = incomingMoves.map((move) => ({
        move,
        evaluation: evaluateMoveAgainstPokemon({
          move,
          attacker: threat.pokemon,
          defender: pokemon,
          attackerAbilityUsage: threatEnvironment?.abilities,
          defenderAbilityUsage: environment?.abilities
        })
      }));
      const weightedResponse = incomingEvaluations.reduce(
        (total, { move, evaluation }) => {
          const tier =
            move.share >= THREAT_MOVE_THRESHOLDS.primary ? 1 : 0.5;
          return (
            total +
            tier *
              move.share *
              (evaluation.immunityProbability +
                evaluation.resistanceProbability)
          );
        },
        0
      );
      const responsePoints = Math.min(
        ADVISOR_WEIGHTS.threatMovesResisted,
        Math.round(weightedResponse * ADVISOR_WEIGHTS.threatMovesResisted)
      );
      points += responsePoints;
      const weakPressure = incomingEvaluations.reduce(
        (total, { move, evaluation }) =>
          total + move.share * evaluation.weaknessProbability,
        0
      );
      if (weakPressure >= THREAT_MOVE_THRESHOLDS.primary) {
        points -= Math.min(
          ADVISOR_WEIGHTS.threatMoveWeakPenalty,
          Math.round(weakPressure * ADVISOR_WEIGHTS.threatMoveWeakPenalty)
        );
      }

      const bestDefensiveAnswer = incomingEvaluations
        .filter(
          ({ evaluation }) =>
            evaluation.stableResistanceProbability >= 0.5
        )
        .sort(
          (left, right) =>
            right.move.share - left.move.share ||
            right.evaluation.immunityProbability -
              left.evaluation.immunityProbability
        )[0];
      if (bestDefensiveAnswer) {
        const { move, evaluation } = bestDefensiveAnswer;
        const text =
          describeAbilityAdjustedMoveEffectiveness({
            evaluation,
            moveName: `${threat.pokemon.nameJa}の${move.name}（採用率${Math.round(move.share * 100)}%）`,
            defenderName: pokemon.nameJa
          }) ??
          `${threat.pokemon.nameJa}の${move.name}（採用率${Math.round(move.share * 100)}%）を半減以下で受けられます。`;
        addReason(reasons, {
          id: `threat-defense-${threat.pokemon.speciesId}-${move.id}`,
          text,
          points: responsePoints,
          order: 20
        });
      }
    }

    const candidateMoves = getEnvironmentAttackingMoves(environment?.moves);
    const popularEffectiveMove = candidateMoves
      .map((move) => ({
        move,
        evaluation: evaluateMoveAgainstPokemon({
          move,
          attacker: pokemon,
          defender: threat.pokemon,
          attackerAbilityUsage: environment?.abilities,
          defenderAbilityUsage: threatEnvironment?.abilities
        })
      }))
      .filter(({ evaluation }) => evaluation.weaknessProbability >= 0.5)
      .sort(
        (left, right) =>
          right.move.share - left.move.share ||
          right.evaluation.weaknessProbability -
            left.evaluation.weaknessProbability
      )[0];
    const bestStabMultiplier = pokemon.types.reduce(
      (best, type) =>
        Math.max(best, getMultiplier(type, threat.pokemon.types)),
      0
    );
    let appliesPressure = false;
    if (popularEffectiveMove) {
      const movePoints = Math.min(
        ADVISOR_WEIGHTS.threatPopularMove,
        8 + Math.round(popularEffectiveMove.move.share * 4)
      );
      points += movePoints;
      appliesPressure = true;
      const abilityReason = describeAbilityAdjustedMoveEffectiveness({
        evaluation: popularEffectiveMove.evaluation,
        moveName: `採用率${Math.round(popularEffectiveMove.move.share * 100)}%の${popularEffectiveMove.move.name}`,
        defenderName: threat.pokemon.nameJa
      });
      addReason(reasons, {
        id: `threat-offense-${threat.pokemon.speciesId}`,
        text:
          abilityReason ??
          `採用率${Math.round(popularEffectiveMove.move.share * 100)}%の${popularEffectiveMove.move.name}で${threat.pokemon.nameJa}へ抜群を狙えます。`,
        points: movePoints,
        order: 22
      });
    } else if (candidateMoves.length === 0 && bestStabMultiplier > 1) {
      points += ADVISOR_WEIGHTS.threatStabPressure;
      appliesPressure = true;
      addReason(reasons, {
        id: `threat-offense-${threat.pokemon.speciesId}`,
        text: `${threat.pokemon.nameJa}へタイプ一致で抜群を狙えます。`,
        points: ADVISOR_WEIGHTS.threatStabPressure,
        order: 23
      });
    }

    if (
      appliesPressure &&
      stats &&
      threat.pokemon.baseStats &&
      isProfileSpeedAdvantage(
        stats.speed,
        threat.pokemon.baseStats.speed,
        profile
      ) &&
      Math.max(stats.attack, stats.specialAttack) >= HIGH_STAT_THRESHOLD
    ) {
      points += ADVISOR_WEIGHTS.threatSpeedPressure;
      addReason(reasons, {
        id: `threat-speed-${threat.pokemon.speciesId}`,
        text:
          profile === "trick-room"
            ? `${threat.pokemon.nameJa}より遅く、トリックルーム下で先に圧力をかけやすいです。`
            : `${threat.pokemon.nameJa}より素早く、先に圧力をかけやすいです。`,
        points: ADVISOR_WEIGHTS.threatSpeedPressure,
        order: 24
      });
    }
  }

  return points;
}

function scoreOffenseGaps(
  pokemon: PokemonEntry,
  summary: TeamSummary,
  reasons: RankedReason[]
): number {
  const improved = summary.missingOffense.filter((row) =>
    pokemon.types.some(
      (attackType) => getMultiplier(attackType, [row.defendType]) > 1
    )
  );
  if (improved.length === 0) return 0;
  const points = Math.min(
    ADVISOR_WEIGHTS.offenseGapMaximum,
    improved.length * ADVISOR_WEIGHTS.offenseGapPerType
  );
  addReason(reasons, {
    id: "offense-gaps",
    text: `未対応の攻撃範囲を${improved.length}タイプ補えます。`,
    points,
    order: 40
  });
  return points;
}

function getNewWeaknessPenalty(
  pokemon: PokemonEntry,
  summary: TeamSummary
): number {
  let penalty = 0;
  for (const row of summary.rows) {
    const coverCount =
      row.multiplierMap.resist +
      row.multiplierMap.doubleResist +
      row.multiplierMap.immune;
    if (coverCount > 0) continue;
    const multiplier = getMultiplier(row.attackType, pokemon.types);
    if (multiplier > 1) {
      penalty += ADVISOR_WEIGHTS.newWeaknessPenalty;
      if (multiplier >= 4) {
        penalty += ADVISOR_WEIGHTS.newQuadWeaknessPenalty;
      }
    }
  }
  return Math.min(penalty, ADVISOR_WEIGHTS.newWeaknessPenaltyMaximum);
}

function scoreEnvironmentUsage(usageRate: number | undefined): number {
  if (!usageRate || usageRate <= 0) return 0;
  return Math.min(
    ADVISOR_WEIGHTS.environmentUsageMaximum,
    Math.round(
      Math.sqrt(Math.min(usageRate, 0.2) / 0.2) *
        ADVISOR_WEIGHTS.environmentUsageMaximum
    )
  );
}

function toRating(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 55) return 5;
  if (score >= 42) return 4;
  if (score >= 30) return 3;
  if (score >= 18) return 2;
  return 1;
}

function scoreCandidate(
  pokemon: PokemonEntry,
  issues: TeamAdvisorIssue[],
  threats: ThreatPokemonAnalysis[],
  summary: TeamSummary,
  environment: ThreatEnvironmentPokemon | undefined,
  environmentBySlug: Map<string, ThreatEnvironmentPokemon>,
  profile: TeamProfile
): TeamAdvisorCandidate | null {
  const reasons: RankedReason[] = [];
  const addressedIssueIds = new Set<string>();
  const issueScore = scoreIssueResponses(
    pokemon,
    issues,
    environment,
    reasons,
    addressedIssueIds,
    profile
  );
  const threatResponsePoints = scoreThreatResponses(
    pokemon,
    threats,
    environment,
    environmentBySlug,
    reasons,
    profile
  );
  const offensePoints = scoreOffenseGaps(pokemon, summary, reasons);
  const environmentUsagePoints = scoreEnvironmentUsage(environment?.usageRate);
  const newWeaknessPenalty = getNewWeaknessPenalty(pokemon, summary);
  const improvementPoints =
    Math.max(0, issueScore.issueResolutionPoints) +
    issueScore.rolePoints +
    Math.max(0, threatResponsePoints) +
    offensePoints;
  if (improvementPoints === 0) return null;

  const score = Math.max(
    0,
    improvementPoints + environmentUsagePoints - newWeaknessPenalty
  );
  const orderedReasons = reasons
    .filter((reason) => reason.points > 0)
    .sort(
      (left, right) =>
        left.order - right.order || right.points - left.points
    )
    .slice(0, MAX_ADVISOR_ITEMS)
    .map((reason) => reason.text);
  if (orderedReasons.length === 0) return null;

  return {
    pokemon,
    score,
    rating: toRating(score),
    reasons: orderedReasons,
    addressedIssueIds: [...addressedIssueIds],
    environmentUsageRate: environment?.usageRate ?? null,
    metrics: {
      issueResolutionPoints: issueScore.issueResolutionPoints,
      threatResponsePoints,
      rolePoints: issueScore.rolePoints,
      offensePoints,
      environmentUsagePoints,
      newWeaknessPenalty
    }
  };
}

function compareCandidates(
  left: TeamAdvisorCandidate,
  right: TeamAdvisorCandidate
): number {
  return (
    right.score - left.score ||
    right.addressedIssueIds.length - left.addressedIssueIds.length ||
    (right.environmentUsageRate ?? 0) - (left.environmentUsageRate ?? 0) ||
    Number(right.pokemon.isDefaultForm) - Number(left.pokemon.isDefaultForm) ||
    left.pokemon.formOrder - right.pokemon.formOrder ||
    left.pokemon.id - right.pokemon.id
  );
}

export function getTeamAdvisorAnalysis({
  team,
  summary,
  diagnostics,
  threatSnapshot,
  availablePokemon,
  environmentDataset,
  profile = "standard"
}: TeamAdvisorInput): TeamAdvisorAnalysis {
  if (summary.members.length < 2) {
    return {
      overallLabel: "分析待ち",
      issues: [],
      candidates: [],
      candidatePool: [],
      threatSnapshot
    };
  }

  const issues = getTeamAdvisorIssues(summary, diagnostics);
  const teamSpeciesIds = new Set(
    team.flatMap((slot) => {
      if (slot.mode !== "pokemon") return [];
      const pokemon = getPokemonBySlug(slot.pokemonSlug);
      return pokemon ? [pokemon.speciesId] : [];
    })
  );
  const environmentBySlug = new Map(
    environmentDataset?.pokemon.map((entry) => [entry.slug, entry]) ?? []
  );
  const candidatePool: TeamAdvisorCandidate[] = [];

  for (const pokemon of availablePokemon) {
    if (
      !isThreatPokemonCandidate(pokemon) ||
      teamSpeciesIds.has(pokemon.speciesId)
    ) {
      continue;
    }
    const candidate = scoreCandidate(
      pokemon,
      issues,
      threatSnapshot.trackedThreats,
      summary,
      environmentBySlug.get(pokemon.slug),
      environmentBySlug,
      profile
    );
    if (!candidate) continue;
    candidatePool.push(candidate);
  }

  candidatePool.sort(compareCandidates);
  const bestBySpecies = new Map<number, TeamAdvisorCandidate>();
  for (const candidate of candidatePool) {
    const current = bestBySpecies.get(candidate.pokemon.speciesId);
    if (!current || compareCandidates(candidate, current) < 0) {
      bestBySpecies.set(candidate.pokemon.speciesId, candidate);
    }
  }

  const candidates = [...bestBySpecies.values()]
    .sort(compareCandidates)
    .slice(0, MAX_ADVISOR_PREVIEW_CANDIDATES);
  const overallLabel =
    issues.length === 0
      ? "良好"
      : issues.length === 1
        ? "要調整"
        : "改善余地あり";

  return {
    overallLabel,
    issues,
    candidates,
    candidatePool,
    threatSnapshot
  };
}

export const TEAM_ADVISOR_EVALUATED_TYPE_COUNT = getAllTypes().length;
