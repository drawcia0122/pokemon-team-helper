import {
  evaluateMoveAgainstPokemon,
  getEnvironmentAttackingMoves
} from "@/lib/battleEffectiveness";
import {
  getAdvisorMoveQuality
} from "@/lib/advisorMoveQuality";
import type {
  AdvisorEvidence,
  AdvisorEvidenceConfidence
} from "@/lib/advisorEvidence";
import {
  TEAM_PROFILE_CONFIG,
  TEAM_SPEED_THRESHOLDS,
  type TeamProfile
} from "@/lib/teamProfile";
import {
  getAllTypes,
  getMultiplier,
  getTypeLabel
} from "@/lib/typeChart";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";
import type { PokemonEntry, TypeName } from "@/types/pokemon";

export type AdvisorInferredRole = {
  id: string;
  label: string;
  confidence: AdvisorEvidenceConfidence;
};

export type AdvisorPartnerSynergy = {
  anchorWeaknesses: TypeName[];
  coveredAnchorWeaknesses: TypeName[];
  candidateWeaknesses: TypeName[];
  coveredCandidateWeaknesses: TypeName[];
  sharedWeaknesses: TypeName[];
  sharedQuadWeaknesses: TypeName[];
  offensiveCoverageAdded: TypeName[];
  anchorOffensiveCoverage: TypeName[];
  candidateOffensiveCoverage: TypeName[];
  candidateRoles: AdvisorInferredRole[];
  roleAdditions: AdvisorInferredRole[];
  teammateSynergyPoints: number;
  evidence: AdvisorEvidence[];
  reasons: string[];
  cautions: string[];
};

const PIVOT_MOVE_IDS = new Set(["uturn", "voltswitch", "flipturn"]);
const RECOVERY_MOVE_IDS = new Set([
  "recover",
  "roost",
  "slackoff",
  "synthesis",
  "wish",
  "strengthsap",
  "milkdrink",
  "shoreup",
  "softboiled",
  "morningsun"
]);
const SETUP_MOVE_IDS = new Set([
  "swordsdance",
  "nastyplot",
  "dragondance",
  "calmmind",
  "bulkup",
  "shellsmash",
  "quiverdance"
]);
const SPEED_CONTROL_MOVE_IDS = new Set([
  "trickroom",
  "tailwind",
  "icywind",
  "electroweb",
  "thunderwave"
]);
const PRIORITY_MOVE_IDS = new Set([
  "suckerpunch",
  "extremespeed",
  "bulletpunch",
  "aquajet",
  "machpunch",
  "iceshard",
  "shadowsneak"
]);
const ADOPTED_MOVE_SHARE = 0.1;

function environmentFor(
  dataset: ThreatEnvironmentDataset | null,
  pokemon: PokemonEntry
): ThreatEnvironmentPokemon | undefined {
  return dataset?.pokemon.find((entry) => entry.slug === pokemon.slug);
}

function effectiveWeaknesses(
  pokemon: PokemonEntry,
  environment: ThreatEnvironmentPokemon | undefined
): TypeName[] {
  return getAllTypes()
    .map((entry) => entry.nameEn)
    .filter((type) => {
      const evaluation = evaluateMoveAgainstPokemon({
        move: { type, damageClass: "physical" },
        attacker: pokemon,
        defender: pokemon,
        defenderAbilityUsage: environment?.abilities
      });
      return evaluation.weaknessProbability >= 0.5;
    });
}

function effectiveQuadWeaknesses(
  pokemon: PokemonEntry,
  environment: ThreatEnvironmentPokemon | undefined
): TypeName[] {
  return getAllTypes()
    .map((entry) => entry.nameEn)
    .filter((type) => {
      const evaluation = evaluateMoveAgainstPokemon({
        move: { type, damageClass: "physical" },
        attacker: pokemon,
        defender: pokemon,
        defenderAbilityUsage: environment?.abilities
      });
      return evaluation.quadWeaknessProbability >= 0.5;
    });
}

function coversAttackType(
  attackType: TypeName,
  defender: PokemonEntry,
  defenderEnvironment: ThreatEnvironmentPokemon | undefined,
  evidenceAttacker: PokemonEntry
): boolean {
  const result = evaluateMoveAgainstPokemon({
    move: { type: attackType, damageClass: "physical" },
    attacker: evidenceAttacker,
    defender,
    defenderAbilityUsage: defenderEnvironment?.abilities
  });
  return result.stableResistanceProbability >= 0.5;
}

function getReliableOffensiveCoverage(
  pokemon: PokemonEntry,
  environment: ThreatEnvironmentPokemon | undefined
): TypeName[] {
  const moveTypes = new Set(
    getEnvironmentAttackingMoves(environment?.moves)
      .filter((move) => getAdvisorMoveQuality({ move, attacker: pokemon }).reliable)
      .map((move) => move.type)
  );
  return getAllTypes()
    .map((entry) => entry.nameEn)
    .filter((defenderType) =>
      [...moveTypes].some(
        (moveType) => getMultiplier(moveType, [defenderType]) > 1
      )
    );
}

function addRole(
  roles: AdvisorInferredRole[],
  role: AdvisorInferredRole,
  condition: boolean
): void {
  if (condition && !roles.some((entry) => entry.id === role.id)) {
    roles.push(role);
  }
}

export function inferAdvisorPokemonRoles(
  pokemon: PokemonEntry,
  environment: ThreatEnvironmentPokemon | undefined,
  profile: TeamProfile
): AdvisorInferredRole[] {
  const roles: AdvisorInferredRole[] = [];
  const stats = pokemon.baseStats;
  const adoptedMoves =
    environment?.moves.filter((move) => move.share >= ADOPTED_MOVE_SHARE) ?? [];
  const physicalShare = environment?.offenseProfile.physicalShare ?? 0;
  const specialShare = environment?.offenseProfile.specialShare ?? 0;

  addRole(
    roles,
    { id: "physical-attacker", label: "物理アタッカー", confidence: environment ? "high" : "medium" },
    Boolean(stats && (physicalShare >= 0.55 || stats.attack >= 110))
  );
  addRole(
    roles,
    { id: "special-attacker", label: "特殊アタッカー", confidence: environment ? "high" : "medium" },
    Boolean(stats && (specialShare >= 0.55 || stats.specialAttack >= 110))
  );
  addRole(
    roles,
    {
      id: "profile-speed",
      label: TEAM_PROFILE_CONFIG[profile].speedRoleLabel,
      confidence: "medium"
    },
    Boolean(
      stats &&
        (profile === "trick-room"
          ? stats.speed <= TEAM_SPEED_THRESHOLDS.slowMaximum
          : stats.speed >= TEAM_SPEED_THRESHOLDS.fastMinimum)
    )
  );
  addRole(
    roles,
    { id: "physical-wall", label: "物理耐久", confidence: "medium" },
    Boolean(stats && stats.hp + stats.defense >= 180 && stats.defense >= 80)
  );
  addRole(
    roles,
    { id: "special-wall", label: "特殊耐久", confidence: "medium" },
    Boolean(
      stats &&
        stats.hp + stats.specialDefense >= 180 &&
        stats.specialDefense >= 80
    )
  );
  addRole(
    roles,
    { id: "priority", label: "先制技", confidence: "high" },
    adoptedMoves.some(
      (move) => move.damageClass !== "status" && PRIORITY_MOVE_IDS.has(move.id)
    )
  );
  addRole(
    roles,
    { id: "pivot", label: "対面操作", confidence: "high" },
    adoptedMoves.some((move) => PIVOT_MOVE_IDS.has(move.id))
  );
  addRole(
    roles,
    { id: "recovery", label: "回復", confidence: "high" },
    adoptedMoves.some(
      (move) => move.damageClass === "status" && RECOVERY_MOVE_IDS.has(move.id)
    )
  );
  addRole(
    roles,
    { id: "speed-control", label: "速度操作", confidence: "high" },
    adoptedMoves.some(
      (move) =>
        move.damageClass === "status" && SPEED_CONTROL_MOVE_IDS.has(move.id)
    )
  );
  addRole(
    roles,
    { id: "setup-breaker", label: "積み・崩し", confidence: "high" },
    adoptedMoves.some(
      (move) => move.damageClass === "status" && SETUP_MOVE_IDS.has(move.id)
    )
  );
  return roles;
}

function typeList(types: TypeName[]): string {
  return types.map(getTypeLabel).join("・");
}

function weaknessWeight(
  weakness: TypeName,
  quadWeaknesses: readonly TypeName[]
): number {
  return quadWeaknesses.includes(weakness) ? 2 : 1;
}

function coverageEvidencePoints(
  weaknesses: readonly TypeName[],
  coveredWeaknesses: readonly TypeName[],
  quadWeaknesses: readonly TypeName[]
): number {
  const total = weaknesses.reduce(
    (sum, weakness) => sum + weaknessWeight(weakness, quadWeaknesses),
    0
  );
  if (total === 0) return 0;
  const covered = coveredWeaknesses.reduce(
    (sum, weakness) => sum + weaknessWeight(weakness, quadWeaknesses),
    0
  );
  return Math.min(8, Math.round((covered / total) * 8));
}

export function evaluateAdvisorPartnerSynergy({
  anchor,
  candidate,
  environmentDataset,
  profile
}: {
  anchor: PokemonEntry;
  candidate: PokemonEntry;
  environmentDataset: ThreatEnvironmentDataset | null;
  profile: TeamProfile;
}): AdvisorPartnerSynergy {
  const anchorEnvironment = environmentFor(environmentDataset, anchor);
  const candidateEnvironment = environmentFor(environmentDataset, candidate);
  const anchorWeaknesses = effectiveWeaknesses(anchor, anchorEnvironment);
  const candidateWeaknesses = effectiveWeaknesses(
    candidate,
    candidateEnvironment
  );
  const coveredAnchorWeaknesses = anchorWeaknesses.filter((type) =>
    coversAttackType(type, candidate, candidateEnvironment, anchor)
  );
  const coveredCandidateWeaknesses = candidateWeaknesses.filter((type) =>
    coversAttackType(type, anchor, anchorEnvironment, candidate)
  );
  const sharedWeaknesses = anchorWeaknesses.filter((type) =>
    candidateWeaknesses.includes(type)
  );
  const anchorQuad = effectiveQuadWeaknesses(anchor, anchorEnvironment);
  const candidateQuad = effectiveQuadWeaknesses(
    candidate,
    candidateEnvironment
  );
  const sharedQuadWeaknesses = anchorQuad.filter((type) =>
    candidateQuad.includes(type)
  );
  const anchorOffensiveCoverage = getReliableOffensiveCoverage(
    anchor,
    anchorEnvironment
  );
  const candidateOffensiveCoverage = getReliableOffensiveCoverage(
    candidate,
    candidateEnvironment
  );
  const offensiveCoverageAdded = candidateOffensiveCoverage.filter(
    (type) => !anchorOffensiveCoverage.includes(type)
  );
  const reciprocalOffense = anchorOffensiveCoverage.filter(
    (type) => !candidateOffensiveCoverage.includes(type)
  );
  const anchorRoles = inferAdvisorPokemonRoles(
    anchor,
    anchorEnvironment,
    profile
  );
  const candidateRoles = inferAdvisorPokemonRoles(
    candidate,
    candidateEnvironment,
    profile
  );
  const anchorRoleIds = new Set(anchorRoles.map((role) => role.id));
  const roleAdditions = candidateRoles.filter(
    (role) => !anchorRoleIds.has(role.id)
  );
  const sharedWeaknessRisk = Math.min(
    20,
    sharedWeaknesses.length * 4 + sharedQuadWeaknesses.length * 8
  );
  const teammateShare = Math.max(
    anchorEnvironment?.teammates.find(
      (entry) => entry.slug === candidate.slug
    )?.share ?? 0,
    candidateEnvironment?.teammates.find(
      (entry) => entry.slug === anchor.slug
    )?.share ?? 0
  );
  const teammateSynergyPoints = Math.min(5, Math.round(teammateShare * 20));
  const evidence: AdvisorEvidence[] = [];

  if (coveredAnchorWeaknesses.length) {
    evidence.push({
      id: "partner:anchor-weakness-covered",
      kind: "type-delta",
      source: "team-delta",
      primaryDimension: "defensiveImprovement",
      points: coverageEvidencePoints(
        anchorWeaknesses,
        coveredAnchorWeaknesses,
        anchorQuad
      ),
      displayText: `${anchor.nameJa}が苦手な${typeList(coveredAnchorWeaknesses)}技を半減・無効にできます。`,
      confidence: candidateEnvironment ? "high" : "medium",
      affectedTeamMembers: [anchor.slug, candidate.slug]
    });
  }
  if (coveredCandidateWeaknesses.length) {
    evidence.push({
      id: "partner:reciprocal-weakness-covered",
      kind: "type-delta",
      source: "team-delta",
      primaryDimension: "defensiveImprovement",
      points: coverageEvidencePoints(
        candidateWeaknesses,
        coveredCandidateWeaknesses,
        candidateQuad
      ),
      displayText: `${candidate.nameJa}が苦手な${typeList(coveredCandidateWeaknesses)}技を${anchor.nameJa}が受けやすく、相互補完になります。`,
      confidence: anchorEnvironment ? "high" : "medium",
      affectedTeamMembers: [anchor.slug, candidate.slug]
    });
  }
  if (offensiveCoverageAdded.length) {
    evidence.push({
      id: "partner:offensive-gap-filled",
      kind: "offense-delta",
      source: "environment",
      primaryDimension: "offensiveImprovement",
      points: Math.min(
        8,
        offensiveCoverageAdded.length + reciprocalOffense.length
      ),
      displayText: `${anchor.nameJa}の実採用技では攻めにくい${typeList(offensiveCoverageAdded)}へ、威力・命中率・STABを満たす実採用技の範囲を追加します。`,
      confidence: "high"
    });
  }
  for (const role of roleAdditions) {
    evidence.push({
      id: `partner:role:${role.id}`,
      kind: role.id === "profile-speed" ? "speed-delta" : "role-delta",
      source: "role-delta",
      primaryDimension:
        role.id === "profile-speed"
          ? "speedImprovement"
          : "roleImprovement",
      points: role.confidence === "high" ? 2 : 1,
      displayText: `${role.label}の役割を追加します（確度${
        role.confidence === "high"
          ? "高"
          : role.confidence === "medium"
            ? "中"
            : "低"
      }）。`,
      confidence: role.confidence
    });
  }
  if (sharedWeaknesses.length) {
    evidence.push({
      id: "partner:shared-weakness",
      kind: "risk",
      source: "team-delta",
      primaryDimension: "riskPenalty",
      points: -sharedWeaknessRisk,
      displayText: `${typeList(sharedWeaknesses)}が2匹の共通弱点になります。`,
      confidence: "high",
      affectedTeamMembers: [anchor.slug, candidate.slug]
    });
  }
  if (teammateSynergyPoints > 0) {
    evidence.push({
      id: "partner:teammate-synergy",
      kind: "environment",
      source: "environment",
      primaryDimension: "environmentValidity",
      points: teammateSynergyPoints,
      displayText: `${anchor.nameJa}との環境上の同時採用実績があります（補助評価）。`,
      confidence: "medium"
    });
  }
  const scopedEvidence = evidence.map((entry) => ({
    ...entry,
    scope: "phase-specific" as const,
    targetThreatId: null,
    beforeRank: null,
    afterRank: null,
    beforeScore: null,
    afterScore: null,
    usageRate: null
  }));

  return {
    anchorWeaknesses,
    coveredAnchorWeaknesses,
    candidateWeaknesses,
    coveredCandidateWeaknesses,
    sharedWeaknesses,
    sharedQuadWeaknesses,
    offensiveCoverageAdded,
    anchorOffensiveCoverage,
    candidateOffensiveCoverage,
    candidateRoles,
    roleAdditions,
    teammateSynergyPoints,
    evidence: scopedEvidence,
    reasons: scopedEvidence
      .filter((entry) => entry.points > 0)
      .sort((left, right) => right.points - left.points)
      .map((entry) => entry.displayText)
      .slice(0, 4),
    cautions: scopedEvidence
      .filter((entry) => entry.points < 0)
      .map((entry) => entry.displayText)
      .slice(0, 2)
  };
}
