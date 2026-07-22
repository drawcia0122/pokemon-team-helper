import {
  getTeamAdvisorIssues,
  type TeamAdvisorAnalysis,
  type TeamAdvisorCandidate,
  type TeamAdvisorIssue
} from "@/lib/teamAdvisor";
import {
  getTeamDiagnostics,
  getTeamTypeGapRows
} from "@/lib/teamDiagnostics";
import {
  getThreatPokemonAnalysis,
  type ThreatPokemonAnalysis
} from "@/lib/teamThreats";
import {
  getAllTypes,
  getMultiplier,
  getPokemonBySlug,
  getTypeLabel,
  resolveTeamSlot,
  summarizeTeam
} from "@/lib/typeChart";
import type { ThreatEnvironmentDataset } from "@/types/environmentThreat";
import type {
  PokemonEntry,
  TeamSlot,
  TeamSummary,
  TypeName
} from "@/types/pokemon";

export const ADVISOR_SWAP_WEIGHTS = {
  threatReduction: 2,
  issueReduction: 16,
  consistencyReduction: 12,
  defensiveImprovement: 3,
  offensiveImprovement: 4,
  speedRoleImprovement: 6,
  roleLossPenalty: 12,
  uniqueImmunityLossPenalty: 14,
  uniqueResistanceLossPenalty: 8,
  uniqueThreatAnswerLossPenalty: 12,
  newWeaknessPenalty: 14,
  threatIncreasePenalty: 3,
  usageTieBreaker: 1
} as const;

const ATTACKER_STAT_THRESHOLD = 100;
const FAST_SPEED_THRESHOLD = 100;
const MID_SPEED_THRESHOLD = 70;
const BULK_TOTAL_THRESHOLD = 180;
const BULK_STAT_THRESHOLD = 80;
const MAX_TEAM_SIZE = 6;
const MAX_NOTES = 3;

export type AdvisorRoleCounts = {
  physicalAttacker: number;
  specialAttacker: number;
  mixedAttacker: number;
  physicalWall: number;
  specialWall: number;
  fast: number;
  mediumSpeed: number;
  slow: number;
};

export type AdvisorTeamMetrics = {
  memberCount: number;
  issueIds: string[];
  consistencyTypes: TypeName[];
  weakCounts: Record<TypeName, number>;
  coverCounts: Record<TypeName, number>;
  immunityCounts: Record<TypeName, number>;
  offenseCoverageCount: number;
  missingOffenseCount: number;
  threatAnswerSlotCount: number;
  roles: AdvisorRoleCounts;
};

export type AdvisorSwapAction =
  | { kind: "add"; removedSlotId: null; removedLabel: null }
  | { kind: "replace"; removedSlotId: string; removedLabel: string };

export type AdvisorSwapPlanMetrics = {
  threatReduction: number;
  issueReduction: number;
  consistencyReduction: number;
  defensiveImprovement: number;
  offensiveImprovement: number;
  speedRoleImprovement: number;
  roleLossCount: number;
  uniqueImmunityLossCount: number;
  uniqueResistanceLossCount: number;
  uniqueThreatAnswerLossCount: number;
  newMajorWeaknessCount: number;
  usageTieBreaker: number;
};

export type AdvisorSwapPlan = {
  candidate: TeamAdvisorCandidate;
  action: AdvisorSwapAction;
  beforeTeam: TeamSlot[];
  afterTeam: TeamSlot[];
  beforeIssues: TeamAdvisorIssue[];
  afterIssues: TeamAdvisorIssue[];
  beforeThreats: ThreatPokemonAnalysis[];
  afterThreats: ThreatPokemonAnalysis[];
  beforeThreatAverage: number | null;
  afterThreatAverage: number | null;
  threatAverageDelta: number | null;
  improvementScore: number;
  improvements: string[];
  cautions: string[];
  lostRoles: string[];
  metrics: AdvisorSwapPlanMetrics;
  isRecommendation: boolean;
};

export type AdvisorSwapSimulation = {
  plans: AdvisorSwapPlan[];
  evaluatedPatternCount: number;
  recomputedThreatAnalysisCount: number;
  rejectedPlanCount: number;
};

export type AdvisorSwapSimulationInput = {
  team: TeamSlot[];
  advisor: TeamAdvisorAnalysis;
  availablePokemon: PokemonEntry[];
  environmentDataset: ThreatEnvironmentDataset | null;
};

type Note = { id: string; text: string; priority: number };

function cloneTeam(team: TeamSlot[]): TeamSlot[] {
  return team.map((slot) => ({ ...slot }));
}

function getPokemonMembers(team: TeamSlot[]): PokemonEntry[] {
  return team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    return pokemon ? [pokemon] : [];
  });
}

export function getAdvisorRoleCounts(team: TeamSlot[]): AdvisorRoleCounts {
  const members = getPokemonMembers(team).filter(
    (pokemon) => pokemon.baseStats
  );
  const roles: AdvisorRoleCounts = {
    physicalAttacker: 0,
    specialAttacker: 0,
    mixedAttacker: 0,
    physicalWall: 0,
    specialWall: 0,
    fast: 0,
    mediumSpeed: 0,
    slow: 0
  };

  for (const pokemon of members) {
    const stats = pokemon.baseStats!;
    const physical = stats.attack >= ATTACKER_STAT_THRESHOLD;
    const special = stats.specialAttack >= ATTACKER_STAT_THRESHOLD;
    if (physical) roles.physicalAttacker += 1;
    if (special) roles.specialAttacker += 1;
    if (physical && special) roles.mixedAttacker += 1;
    if (
      stats.hp + stats.defense >= BULK_TOTAL_THRESHOLD &&
      stats.defense >= BULK_STAT_THRESHOLD
    ) {
      roles.physicalWall += 1;
    }
    if (
      stats.hp + stats.specialDefense >= BULK_TOTAL_THRESHOLD &&
      stats.specialDefense >= BULK_STAT_THRESHOLD
    ) {
      roles.specialWall += 1;
    }
    if (stats.speed >= FAST_SPEED_THRESHOLD) roles.fast += 1;
    else if (stats.speed >= MID_SPEED_THRESHOLD) roles.mediumSpeed += 1;
    else roles.slow += 1;
  }

  return roles;
}

function getThreatAnswerSlotCount(
  summary: TeamSummary,
  threats: ThreatPokemonAnalysis[]
): number {
  return summary.members.filter((member) =>
    threats.some((threat) =>
      member.types.some(
        (type) => getMultiplier(type, threat.pokemon.types) > 1
      )
    )
  ).length;
}

export function getAdvisorTeamMetrics(
  team: TeamSlot[],
  summary: TeamSummary,
  issues: TeamAdvisorIssue[],
  threats: ThreatPokemonAnalysis[]
): AdvisorTeamMetrics {
  const weakCounts = {} as Record<TypeName, number>;
  const coverCounts = {} as Record<TypeName, number>;
  const immunityCounts = {} as Record<TypeName, number>;
  const rowsByType = new Map(
    summary.rows.map((row) => [row.attackType, row])
  );

  for (const type of getAllTypes()) {
    const row = rowsByType.get(type.nameEn);
    weakCounts[type.nameEn] = row
      ? row.multiplierMap.weak + row.multiplierMap.quadWeak
      : 0;
    coverCounts[type.nameEn] = row
      ? row.multiplierMap.resist +
        row.multiplierMap.doubleResist +
        row.multiplierMap.immune
      : 0;
    immunityCounts[type.nameEn] = row?.multiplierMap.immune ?? 0;
  }

  return {
    memberCount: summary.members.length,
    issueIds: issues.map((issue) => issue.id),
    consistencyTypes: getTeamTypeGapRows(summary).map(
      (row) => row.attackType
    ),
    weakCounts,
    coverCounts,
    immunityCounts,
    offenseCoverageCount: summary.offensiveCoverage.filter(
      (row) => row.superEffectiveCount > 0
    ).length,
    missingOffenseCount: summary.missingOffense.length,
    threatAnswerSlotCount: getThreatAnswerSlotCount(summary, threats),
    roles: getAdvisorRoleCounts(team)
  };
}

function averageThreatScore(
  threats: ThreatPokemonAnalysis[]
): number | null {
  if (!threats.length) return null;
  return Math.round(
    threats.reduce((total, threat) => total + threat.score, 0) /
      threats.length
  );
}

function buildAfterTeam(
  team: TeamSlot[],
  candidate: TeamAdvisorCandidate,
  removedSlotId: string | null
): TeamSlot[] {
  if (removedSlotId === null) {
    return [
      ...cloneTeam(team),
      {
        id: `advisor-add-${candidate.pokemon.slug}`,
        mode: "pokemon",
        pokemonSlug: candidate.pokemon.slug
      }
    ];
  }

  return team.map((slot) =>
    slot.id === removedSlotId
      ? {
          id: slot.id,
          mode: "pokemon" as const,
          pokemonSlug: candidate.pokemon.slug
        }
      : { ...slot }
  );
}

function getRemovedLabel(
  team: TeamSlot[],
  removedSlotId: string | null
): string | null {
  if (removedSlotId === null) return null;
  const slot = team.find((entry) => entry.id === removedSlotId);
  return slot ? resolveTeamSlot(slot)?.label ?? "現在のメンバー" : null;
}

function collectLostRoles(
  before: AdvisorRoleCounts,
  after: AdvisorRoleCounts
): string[] {
  const labels: Array<[keyof AdvisorRoleCounts, string]> = [
    ["physicalAttacker", "唯一の物理アタッカー"],
    ["specialAttacker", "唯一の特殊アタッカー"],
    ["fast", "唯一の高速枠"],
    ["physicalWall", "唯一の物理耐久候補"],
    ["specialWall", "唯一の特殊耐久候補"]
  ];
  return labels.flatMap(([key, label]) =>
    before[key] === 1 && after[key] === 0 ? [label] : []
  );
}

function uniqueThreatAnswerLosses(
  beforeSummary: TeamSummary,
  afterSummary: TeamSummary,
  beforeThreats: ThreatPokemonAnalysis[]
): string[] {
  return beforeThreats.flatMap((threat) => {
    const beforeAnswers = beforeSummary.members.filter((member) =>
      member.types.some(
        (type) => getMultiplier(type, threat.pokemon.types) > 1
      )
    ).length;
    const afterAnswers = afterSummary.members.filter((member) =>
      member.types.some(
        (type) => getMultiplier(type, threat.pokemon.types) > 1
      )
    ).length;
    return beforeAnswers === 1 && afterAnswers === 0
      ? [threat.pokemon.nameJa]
      : [];
  });
}

function addNote(notes: Note[], note: Note): void {
  if (!notes.some((entry) => entry.id === note.id)) notes.push(note);
}

function formatCountChange(
  label: string,
  before: number,
  after: number
): string {
  return `${label} ${before}体 → ${after}体`;
}

function buildPlanNotes(
  before: AdvisorTeamMetrics,
  after: AdvisorTeamMetrics,
  beforeThreatAverage: number | null,
  afterThreatAverage: number | null,
  lostRoles: string[],
  uniqueImmunityLosses: TypeName[],
  uniqueResistanceLosses: TypeName[],
  threatAnswerLosses: string[],
  newMajorWeaknesses: TypeName[]
): { improvements: string[]; cautions: string[] } {
  const improvements: Note[] = [];
  const cautions: Note[] = [];
  const threatDelta =
    beforeThreatAverage !== null && afterThreatAverage !== null
      ? beforeThreatAverage - afterThreatAverage
      : 0;

  if (threatDelta > 0) {
    addNote(improvements, {
      id: "threat-average",
      text: `要警戒TOP5平均 ${beforeThreatAverage} → ${afterThreatAverage}（-${threatDelta}）`,
      priority: 120
    });
  } else if (threatDelta < 0) {
    addNote(cautions, {
      id: "threat-average",
      text: `要警戒TOP5平均 ${beforeThreatAverage} → ${afterThreatAverage}（+${Math.abs(threatDelta)}）`,
      priority: 120
    });
  }

  for (const type of getAllTypes().map((entry) => entry.nameEn)) {
    const weakDelta = before.weakCounts[type] - after.weakCounts[type];
    const coverDelta = after.coverCounts[type] - before.coverCounts[type];
    if (weakDelta > 0) {
      addNote(improvements, {
        id: `weak-${type}`,
        text: formatCountChange(
          `${getTypeLabel(type)}弱点`,
          before.weakCounts[type],
          after.weakCounts[type]
        ),
        priority: 100 + before.weakCounts[type] * 2
      });
    } else if (weakDelta < 0) {
      addNote(cautions, {
        id: `weak-${type}`,
        text: formatCountChange(
          `${getTypeLabel(type)}弱点`,
          before.weakCounts[type],
          after.weakCounts[type]
        ),
        priority: 90 + after.weakCounts[type] * 2
      });
    }
    if (
      coverDelta > 0 &&
      (before.consistencyTypes.includes(type) || before.weakCounts[type] > 0)
    ) {
      addNote(improvements, {
        id: `cover-${type}`,
        text: formatCountChange(
          `${getTypeLabel(type)}半減・無効`,
          before.coverCounts[type],
          after.coverCounts[type]
        ),
        priority: 95 + before.weakCounts[type]
      });
    }
  }

  const issueReduction = before.issueIds.length - after.issueIds.length;
  if (issueReduction > 0) {
    addNote(improvements, {
      id: "issues",
      text: `現在の課題 ${before.issueIds.length}件 → ${after.issueIds.length}件`,
      priority: 105
    });
  }
  if (after.roles.fast > before.roles.fast) {
    addNote(improvements, {
      id: "fast-role",
      text: formatCountChange("高速枠", before.roles.fast, after.roles.fast),
      priority: 88
    });
  }
  if (after.roles.specialAttacker > before.roles.specialAttacker) {
    addNote(improvements, {
      id: "special-role",
      text: formatCountChange(
        "特殊アタッカー",
        before.roles.specialAttacker,
        after.roles.specialAttacker
      ),
      priority: 86
    });
  }
  if (after.roles.physicalAttacker > before.roles.physicalAttacker) {
    addNote(improvements, {
      id: "physical-role",
      text: formatCountChange(
        "物理アタッカー",
        before.roles.physicalAttacker,
        after.roles.physicalAttacker
      ),
      priority: 85
    });
  }
  if (after.offenseCoverageCount > before.offenseCoverageCount) {
    addNote(improvements, {
      id: "offense-coverage",
      text: `一致技で抜群を取れるタイプ ${before.offenseCoverageCount}種類 → ${after.offenseCoverageCount}種類`,
      priority: 82
    });
  }
  if (after.threatAnswerSlotCount > before.threatAnswerSlotCount) {
    addNote(improvements, {
      id: "threat-answer-slots",
      text: formatCountChange(
        "要警戒TOP5へ抜群を取れる枠",
        before.threatAnswerSlotCount,
        after.threatAnswerSlotCount
      ),
      priority: 92
    });
  }

  for (const label of lostRoles) {
    addNote(cautions, {
      id: `lost-role-${label}`,
      text: `${label}を失います。`,
      priority: 110
    });
  }
  for (const type of uniqueImmunityLosses) {
    addNote(cautions, {
      id: `lost-immunity-${type}`,
      text: `${getTypeLabel(type)}無効枠が1体 → 0体になります。`,
      priority: 115
    });
  }
  for (const type of uniqueResistanceLosses) {
    addNote(cautions, {
      id: `lost-resistance-${type}`,
      text: `${getTypeLabel(type)}の唯一の半減・無効枠を失います。`,
      priority: 108
    });
  }
  for (const name of threatAnswerLosses) {
    addNote(cautions, {
      id: `lost-threat-answer-${name}`,
      text: `${name}へ抜群を取れる唯一の枠を失います。`,
      priority: 112
    });
  }
  for (const type of newMajorWeaknesses) {
    addNote(cautions, {
      id: `new-consistency-${type}`,
      text: `${getTypeLabel(type)}技の新しい一貫が生まれます。`,
      priority: 118
    });
  }
  if (after.offenseCoverageCount < before.offenseCoverageCount) {
    addNote(cautions, {
      id: "offense-coverage",
      text: `一致技の攻撃範囲 ${before.offenseCoverageCount}種類 → ${after.offenseCoverageCount}種類`,
      priority: 84
    });
  }

  return {
    improvements: improvements
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .slice(0, MAX_NOTES)
      .map((note) => note.text),
    cautions: cautions
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .slice(0, MAX_NOTES)
      .map((note) => note.text)
  };
}

export function evaluateAdvisorSwapPlan(
  input: AdvisorSwapSimulationInput,
  candidate: TeamAdvisorCandidate,
  removedSlotId: string | null
): AdvisorSwapPlan {
  const beforeTeam = cloneTeam(input.team);
  const afterTeam = buildAfterTeam(input.team, candidate, removedSlotId);
  const beforeSummary = summarizeTeam(beforeTeam);
  const afterSummary = summarizeTeam(afterTeam);
  const beforeDiagnostics = getTeamDiagnostics(
    beforeTeam,
    beforeSummary,
    input.availablePokemon
  );
  const afterDiagnostics = getTeamDiagnostics(
    afterTeam,
    afterSummary,
    input.availablePokemon
  );
  const beforeIssues = getTeamAdvisorIssues(
    beforeSummary,
    beforeDiagnostics
  );
  const afterIssues = getTeamAdvisorIssues(afterSummary, afterDiagnostics);
  const beforeThreats = getThreatPokemonAnalysis(
    beforeTeam,
    beforeSummary,
    input.availablePokemon,
    input.environmentDataset
  );
  const afterThreats = getThreatPokemonAnalysis(
    afterTeam,
    afterSummary,
    input.availablePokemon,
    input.environmentDataset
  );
  const beforeMetrics = getAdvisorTeamMetrics(
    beforeTeam,
    beforeSummary,
    beforeIssues,
    beforeThreats
  );
  const afterMetrics = getAdvisorTeamMetrics(
    afterTeam,
    afterSummary,
    afterIssues,
    afterThreats
  );
  const beforeThreatAverage = averageThreatScore(beforeThreats);
  const afterThreatAverage = averageThreatScore(afterThreats);
  const threatReduction =
    beforeThreatAverage !== null && afterThreatAverage !== null
      ? beforeThreatAverage - afterThreatAverage
      : 0;
  const issueReduction =
    beforeMetrics.issueIds.length - afterMetrics.issueIds.length;
  const consistencyReduction =
    beforeMetrics.consistencyTypes.length -
    afterMetrics.consistencyTypes.length;
  const importantTypes = getAllTypes()
    .map((type) => type.nameEn)
    .filter(
      (type) =>
        beforeMetrics.consistencyTypes.includes(type) ||
        beforeMetrics.weakCounts[type] >= 2
    );
  const defensiveImprovement = importantTypes.reduce((total, type) => {
    const weakReduction = Math.max(
      0,
      beforeMetrics.weakCounts[type] - afterMetrics.weakCounts[type]
    );
    const coverIncrease = Math.max(
      0,
      afterMetrics.coverCounts[type] - beforeMetrics.coverCounts[type]
    );
    return total + weakReduction + coverIncrease;
  }, 0);
  const offensiveImprovement =
    afterMetrics.offenseCoverageCount - beforeMetrics.offenseCoverageCount +
    (afterMetrics.threatAnswerSlotCount -
      beforeMetrics.threatAnswerSlotCount);
  const speedRoleImprovement =
    afterMetrics.roles.fast - beforeMetrics.roles.fast;
  const lostRoles = collectLostRoles(
    beforeMetrics.roles,
    afterMetrics.roles
  );
  const uniqueImmunityLosses = getAllTypes()
    .map((type) => type.nameEn)
    .filter(
      (type) =>
        beforeMetrics.immunityCounts[type] === 1 &&
        afterMetrics.immunityCounts[type] === 0
    );
  const uniqueResistanceLosses = getAllTypes()
    .map((type) => type.nameEn)
    .filter(
      (type) =>
        !uniqueImmunityLosses.includes(type) &&
        beforeMetrics.coverCounts[type] === 1 &&
        afterMetrics.coverCounts[type] === 0 &&
        beforeMetrics.weakCounts[type] > 0
    );
  const threatAnswerLosses = uniqueThreatAnswerLosses(
    beforeSummary,
    afterSummary,
    beforeThreats
  );
  const newMajorWeaknesses = afterMetrics.consistencyTypes.filter(
    (type) => !beforeMetrics.consistencyTypes.includes(type)
  );
  const environmentUsageRate = candidate.environmentUsageRate ?? 0;
  const usageTieBreaker = Math.min(
    ADVISOR_SWAP_WEIGHTS.usageTieBreaker,
    environmentUsageRate * ADVISOR_SWAP_WEIGHTS.usageTieBreaker
  );
  const improvementScore = Math.round(
    threatReduction * ADVISOR_SWAP_WEIGHTS.threatReduction +
      issueReduction * ADVISOR_SWAP_WEIGHTS.issueReduction +
      consistencyReduction * ADVISOR_SWAP_WEIGHTS.consistencyReduction +
      defensiveImprovement * ADVISOR_SWAP_WEIGHTS.defensiveImprovement +
      offensiveImprovement * ADVISOR_SWAP_WEIGHTS.offensiveImprovement +
      speedRoleImprovement * ADVISOR_SWAP_WEIGHTS.speedRoleImprovement -
      lostRoles.length * ADVISOR_SWAP_WEIGHTS.roleLossPenalty -
      uniqueImmunityLosses.length *
        ADVISOR_SWAP_WEIGHTS.uniqueImmunityLossPenalty -
      uniqueResistanceLosses.length *
        ADVISOR_SWAP_WEIGHTS.uniqueResistanceLossPenalty -
      threatAnswerLosses.length *
        ADVISOR_SWAP_WEIGHTS.uniqueThreatAnswerLossPenalty -
      newMajorWeaknesses.length * ADVISOR_SWAP_WEIGHTS.newWeaknessPenalty -
      Math.max(0, -threatReduction) *
        ADVISOR_SWAP_WEIGHTS.threatIncreasePenalty
  );
  const notes = buildPlanNotes(
    beforeMetrics,
    afterMetrics,
    beforeThreatAverage,
    afterThreatAverage,
    lostRoles,
    uniqueImmunityLosses,
    uniqueResistanceLosses,
    threatAnswerLosses,
    newMajorWeaknesses
  );
  const meaningfulImprovement =
    issueReduction > 0 ||
    threatReduction >= 2 ||
    defensiveImprovement >= 2 ||
    offensiveImprovement >= 2 ||
    speedRoleImprovement > 0;
  const isRecommendation =
    improvementScore > 0 &&
    newMajorWeaknesses.length === 0 &&
    !(threatReduction < 0 && improvementScore < 20) &&
    !(lostRoles.length >= 2 && improvementScore < 30) &&
    meaningfulImprovement &&
    notes.improvements.length > 0;

  return {
    candidate,
    action:
      removedSlotId === null
        ? { kind: "add", removedSlotId: null, removedLabel: null }
        : {
            kind: "replace",
            removedSlotId,
            removedLabel:
              getRemovedLabel(input.team, removedSlotId) ?? "現在のメンバー"
          },
    beforeTeam,
    afterTeam,
    beforeIssues,
    afterIssues,
    beforeThreats,
    afterThreats,
    beforeThreatAverage,
    afterThreatAverage,
    threatAverageDelta:
      beforeThreatAverage !== null && afterThreatAverage !== null
        ? afterThreatAverage - beforeThreatAverage
        : null,
    improvementScore,
    improvements: notes.improvements,
    cautions: notes.cautions,
    lostRoles,
    metrics: {
      threatReduction,
      issueReduction,
      consistencyReduction,
      defensiveImprovement,
      offensiveImprovement,
      speedRoleImprovement,
      roleLossCount: lostRoles.length,
      uniqueImmunityLossCount: uniqueImmunityLosses.length,
      uniqueResistanceLossCount: uniqueResistanceLosses.length,
      uniqueThreatAnswerLossCount: threatAnswerLosses.length,
      newMajorWeaknessCount: newMajorWeaknesses.length,
      usageTieBreaker
    },
    isRecommendation
  };
}

function comparePlans(left: AdvisorSwapPlan, right: AdvisorSwapPlan): number {
  return (
    right.improvementScore - left.improvementScore ||
    right.metrics.threatReduction - left.metrics.threatReduction ||
    right.metrics.issueReduction - left.metrics.issueReduction ||
    right.metrics.usageTieBreaker - left.metrics.usageTieBreaker ||
    left.candidate.pokemon.speciesId - right.candidate.pokemon.speciesId
  );
}

export function getAdvisorSwapSimulation(
  input: AdvisorSwapSimulationInput
): AdvisorSwapSimulation {
  const summary = summarizeTeam(input.team);
  if (summary.members.length < 2 || input.advisor.candidates.length === 0) {
    return {
      plans: [],
      evaluatedPatternCount: 0,
      recomputedThreatAnalysisCount: 0,
      rejectedPlanCount: 0
    };
  }

  const memberSlotIds = summary.members.map((member) => member.slotId);
  const patternSlotIds: Array<string | null> =
    summary.members.length < MAX_TEAM_SIZE
      ? [null, ...memberSlotIds]
      : memberSlotIds;
  const teamSpeciesIds = new Set(
    getPokemonMembers(input.team).map((pokemon) => pokemon.speciesId)
  );
  const seenCandidateSpecies = new Set<number>();
  const eligibleCandidates = input.advisor.candidates.filter((candidate) => {
    const speciesId = candidate.pokemon.speciesId;
    if (teamSpeciesIds.has(speciesId) || seenCandidateSpecies.has(speciesId)) {
      return false;
    }
    seenCandidateSpecies.add(speciesId);
    return true;
  });
  const allPlans = eligibleCandidates.flatMap((candidate) =>
    patternSlotIds.map((removedSlotId) =>
      evaluateAdvisorSwapPlan(input, candidate, removedSlotId)
    )
  );
  const bestBySpecies = new Map<number, AdvisorSwapPlan>();

  for (const plan of allPlans.filter((entry) => entry.isRecommendation)) {
    const current = bestBySpecies.get(plan.candidate.pokemon.speciesId);
    if (!current || comparePlans(plan, current) < 0) {
      bestBySpecies.set(plan.candidate.pokemon.speciesId, plan);
    }
  }

  const plans = [...bestBySpecies.values()].sort(comparePlans).slice(0, 3);
  return {
    plans,
    evaluatedPatternCount: allPlans.length,
    recomputedThreatAnalysisCount: allPlans.length,
    rejectedPlanCount: allPlans.length - plans.length
  };
}
