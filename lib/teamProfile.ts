export type TeamProfile = "standard" | "trick-room";

export const TEAM_PROFILE_STORAGE_KEY = "pokemon-helper:teamProfile";

export const TEAM_SPEED_THRESHOLDS = {
  fastMinimum: 100,
  mediumMinimum: 70,
  slowMaximum: 69
} as const;

export const TRICK_ROOM_RECOMMENDATION_CONFIG = {
  lowSpeedThreshold: TEAM_SPEED_THRESHOLDS.slowMaximum,
  fullBonusUntil: 0,
  reducedBonusUntil: 2,
  noBonusFrom: 4,
  lowSpeedBonusMultipliers: [1, 0.65, 0.3, 0.1, 0] as const,
  maxSlowRoleRecommendations: 2,
  maxSlowOutsideTrickRoomCategory: 3,
  adoptedMoveMinimumShare: 0.1,
  priorityMoveIds: [
    "suckerpunch",
    "extremespeed",
    "bulletpunch",
    "aquajet",
    "machpunch",
    "iceshard",
    "shadowsneak"
  ] as const
} as const;

export function getTrickRoomLowSpeedBonusMultiplier(
  currentSlowCount: number
): number {
  const index = Math.max(
    0,
    Math.min(
      Math.floor(currentSlowCount),
      TRICK_ROOM_RECOMMENDATION_CONFIG.lowSpeedBonusMultipliers.length - 1
    )
  );
  return TRICK_ROOM_RECOMMENDATION_CONFIG.lowSpeedBonusMultipliers[index];
}

export const TEAM_PROFILE_CONFIG: Record<
  TeamProfile,
  {
    label: string;
    speedCategoryLabel: string;
    activeSpeedRole: "fast" | "slow";
    speedRoleLabel: string;
    speedSummaryLabel: string;
  }
> = {
  standard: {
    label: "通常",
    speedCategoryLabel: "素早さ重視",
    activeSpeedRole: "fast",
    speedRoleLabel: "高速枠",
    speedSummaryLabel: "先手を取りやすい"
  },
  "trick-room": {
    label: "トリックルーム",
    speedCategoryLabel: "トリル適性",
    activeSpeedRole: "slow",
    speedRoleLabel: "トリル向け低速枠",
    speedSummaryLabel: "トリル下で先に動きやすい"
  }
};

export const PROFILE_SPEED_WEIGHTS = {
  standard: {
    fasterThanTeam: 1,
    slowerThanTeam: 0,
    fastRoleGain: 1,
    fastRoleLoss: 1,
    slowRoleGain: 0,
    slowRoleLoss: 0
  },
  "trick-room": {
    fasterThanTeam: 0,
    slowerThanTeam: 1,
    fastRoleGain: 0,
    fastRoleLoss: 0,
    slowRoleGain: 1,
    slowRoleLoss: 1
  }
} as const satisfies Record<
  TeamProfile,
  {
    fasterThanTeam: number;
    slowerThanTeam: number;
    fastRoleGain: number;
    fastRoleLoss: number;
    slowRoleGain: number;
    slowRoleLoss: number;
  }
>;

export function resolveStoredTeamProfile(value: string | null): TeamProfile {
  return value === "trick-room" || value === "standard" ? value : "standard";
}

export function isProfileSpeedAdvantage(
  subjectSpeed: number,
  targetSpeed: number,
  profile: TeamProfile
): boolean {
  return profile === "trick-room"
    ? subjectSpeed < targetSpeed
    : subjectSpeed > targetSpeed;
}

export function countProfileSpeedAdvantages(
  subjectSpeed: number,
  targetSpeeds: number[],
  profile: TeamProfile
): number {
  return targetSpeeds.filter((targetSpeed) =>
    isProfileSpeedAdvantage(subjectSpeed, targetSpeed, profile)
  ).length;
}

export function getProfileSpeedRoleCount(
  roles: { fast: number; slow: number },
  profile: TeamProfile
): number {
  return profile === "trick-room" ? roles.slow : roles.fast;
}

export function formatThreatSpeedReason({
  advantageCount,
  memberCount,
  profile
}: {
  advantageCount: number;
  memberCount: number;
  profile: TeamProfile;
}): string | null {
  if (memberCount < 2 || advantageCount <= 0) return null;
  return profile === "trick-room"
    ? `${memberCount}体中${advantageCount}体より遅く、トリックルーム下で先に動かれやすい相手です。`
    : `${memberCount}体中${advantageCount}体より速く、先に動かれやすい相手です。`;
}
