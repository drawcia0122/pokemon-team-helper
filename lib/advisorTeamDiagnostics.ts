import {
  getAdvisorRoleCounts,
  type AdvisorRoleCounts
} from "@/lib/advisorSwapSimulator";
import { getTypeCandidateScores } from "@/lib/scoring";
import { getTeamTypeGapRows } from "@/lib/teamDiagnostics";
import type { ThreatPokemonAnalysis } from "@/lib/teamThreats";
import {
  getMultiplier,
  getPokemonBySlug,
  getTypeLabel
} from "@/lib/typeChart";
import type { TeamSlot, TeamSummary, TypeName } from "@/types/pokemon";
import {
  isProfileSpeedAdvantage,
  TEAM_PROFILE_CONFIG,
  type TeamProfile
} from "@/lib/teamProfile";

export type AdvisorDiagnosticItem = {
  id: string;
  label: string;
  value: string;
  tone: "attention" | "positive" | "neutral";
};

export type AdvisorDiagnosticCategory = {
  id: "defense" | "offense" | "speed" | "types";
  title: string;
  summary: string;
  items: AdvisorDiagnosticItem[];
};

export type AdvisorTeamDiagnostics = {
  profile: TeamProfile;
  categories: AdvisorDiagnosticCategory[];
};

type AdvisorTeamDiagnosticsInput = {
  team: TeamSlot[];
  summary: TeamSummary;
  threats: ThreatPokemonAnalysis[];
  profile?: TeamProfile;
};

function getStatMembers(team: TeamSlot[]) {
  return team.flatMap((slot) => {
    if (slot.mode !== "pokemon") return [];
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    return pokemon?.baseStats ? [pokemon] : [];
  });
}

function getDefenseCategory(
  summary: TeamSummary,
  roles: AdvisorRoleCounts
): AdvisorDiagnosticCategory {
  const importantRows = [...summary.rows]
    .filter((row) => {
      const weak = row.multiplierMap.weak + row.multiplierMap.quadWeak;
      const cover =
        row.multiplierMap.resist +
        row.multiplierMap.doubleResist +
        row.multiplierMap.immune;
      return weak >= 2 || (weak > 0 && cover === 0);
    })
    .sort((left, right) => {
      const leftWeak =
        left.multiplierMap.weak + left.multiplierMap.quadWeak;
      const rightWeak =
        right.multiplierMap.weak + right.multiplierMap.quadWeak;
      const leftCover =
        left.multiplierMap.resist +
        left.multiplierMap.doubleResist +
        left.multiplierMap.immune;
      const rightCover =
        right.multiplierMap.resist +
        right.multiplierMap.doubleResist +
        right.multiplierMap.immune;
      return (
        rightWeak - leftWeak ||
        leftCover - rightCover ||
        left.attackTypeJa.localeCompare(right.attackTypeJa, "ja")
      );
    })
    .slice(0, 3);
  const items: AdvisorDiagnosticItem[] = importantRows.map((row) => {
    const weak = row.multiplierMap.weak + row.multiplierMap.quadWeak;
    const cover =
      row.multiplierMap.resist +
      row.multiplierMap.doubleResist +
      row.multiplierMap.immune;
    return {
      id: `defense-${row.attackType}`,
      label: `${row.attackTypeJa}弱点`,
      value: `${weak}体・半減/無効 ${cover}体`,
      tone: cover === 0 ? "attention" : "neutral"
    };
  });
  const immunityRows = summary.rows
    .filter((row) => row.multiplierMap.immune > 0)
    .sort(
      (left, right) =>
        right.multiplierMap.immune - left.multiplierMap.immune ||
        left.attackTypeJa.localeCompare(right.attackTypeJa, "ja")
    )
    .slice(0, 2);
  immunityRows.forEach((row) => {
    items.push({
      id: `immunity-${row.attackType}`,
      label: `${row.attackTypeJa}無効`,
      value: `${row.multiplierMap.immune}体`,
      tone: "positive"
    });
  });
  items.push(
    {
      id: "physical-wall",
      label: "物理耐久候補",
      value: `${roles.physicalWall}体`,
      tone: roles.physicalWall ? "positive" : "attention"
    },
    {
      id: "special-wall",
      label: "特殊耐久候補",
      value: `${roles.specialWall}体`,
      tone: roles.specialWall ? "positive" : "attention"
    }
  );

  return {
    id: "defense",
    title: "防御面",
    summary: importantRows.length
      ? `優先確認が必要な弱点は${importantRows.length}タイプです。`
      : "大きく一貫する弱点は見つかりません。",
    items
  };
}

function countThreatAnswerSlots(
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

function getOffenseCategory(
  summary: TeamSummary,
  roles: AdvisorRoleCounts,
  threats: ThreatPokemonAnalysis[]
): AdvisorDiagnosticCategory {
  const answerSlots = countThreatAnswerSlots(summary, threats);
  const missingCount = summary.missingOffense.length;
  return {
    id: "offense",
    title: "攻撃面",
    summary: missingCount
      ? `一致技で弱点を突けない相手タイプが${missingCount}種類あります。`
      : "18タイプすべてに一致技で弱点を突けます。",
    items: [
      {
        id: "physical-attackers",
        label: "物理アタッカー",
        value: `${roles.physicalAttacker}体`,
        tone: roles.physicalAttacker ? "positive" : "attention"
      },
      {
        id: "special-attackers",
        label: "特殊アタッカー",
        value: `${roles.specialAttacker}体`,
        tone: roles.specialAttacker ? "positive" : "attention"
      },
      {
        id: "mixed-attackers",
        label: "両刀候補",
        value: `${roles.mixedAttacker}体`,
        tone: "neutral"
      },
      {
        id: "missing-offense",
        label: "一致技で抜群なし",
        value: `${missingCount}種類`,
        tone: missingCount ? "attention" : "positive"
      },
      {
        id: "threat-answer-slots",
        label: "要警戒TOP5へ抜群を取れる枠",
        value: `${answerSlots}体`,
        tone: answerSlots ? "positive" : "attention"
      }
    ]
  };
}

function getThreatSpeedCounts(
  team: TeamSlot[],
  threats: ThreatPokemonAnalysis[],
  profile: TeamProfile
): { teamAdvantage: number; threatAdvantage: number } {
  const speeds = getStatMembers(team).map(
    (pokemon) => pokemon.baseStats!.speed
  );
  if (!speeds.length) return { teamAdvantage: 0, threatAdvantage: 0 };
  const teamAdvantage = threats.filter((threat) => {
    const threatSpeed = threat.pokemon.baseStats?.speed;
    return (
      typeof threatSpeed === "number" &&
      speeds.some((speed) =>
        isProfileSpeedAdvantage(speed, threatSpeed, profile)
      )
    );
  }).length;
  const threatAdvantage = threats.filter((threat) => {
    const threatSpeed = threat.pokemon.baseStats?.speed;
    if (typeof threatSpeed !== "number") return false;
    const disadvantagedMembers = speeds.filter((speed) =>
      isProfileSpeedAdvantage(threatSpeed, speed, profile)
    ).length;
    return disadvantagedMembers >= Math.max(1, speeds.length - 1);
  }).length;
  return { teamAdvantage, threatAdvantage };
}

function getSpeedCategory(
  team: TeamSlot[],
  roles: AdvisorRoleCounts,
  threats: ThreatPokemonAnalysis[],
  profile: TeamProfile
): AdvisorDiagnosticCategory {
  const speed = getThreatSpeedCounts(team, threats, profile);
  const memberCount = getStatMembers(team).length;
  const isTrickRoom = profile === "trick-room";
  const roleItems: AdvisorDiagnosticItem[] = isTrickRoom
    ? [
        {
          id: "slow",
          label: "トリル向け低速枠（S69以下）",
          value: `${roles.slow}体`,
          tone: roles.slow ? "positive" : "attention"
        },
        {
          id: "medium-speed",
          label: "中速枠（S70〜99）",
          value: `${roles.mediumSpeed}体`,
          tone: "neutral"
        },
        {
          id: "fast",
          label: "高速枠（S100以上）",
          value: `${roles.fast}体`,
          tone: "neutral"
        }
      ]
    : [
        {
          id: "fast",
          label: "高速枠（S100以上）",
          value: `${roles.fast}体`,
          tone: roles.fast ? "positive" : "attention"
        },
        {
          id: "medium-speed",
          label: "中速枠（S70〜99）",
          value: `${roles.mediumSpeed}体`,
          tone: "neutral"
        },
        {
          id: "slow",
          label: "低速枠（S69以下）",
          value: `${roles.slow}体`,
          tone: "neutral"
        }
      ];
  return {
    id: "speed",
    title: "素早さ",
    summary:
      `${TEAM_PROFILE_CONFIG[profile].speedRoleLabel}が${
        isTrickRoom ? roles.slow : roles.fast
      }体います。`,
    items: [
      ...roleItems,
      {
        id: "move-first-threats",
        label: isTrickRoom
          ? "要警戒TOP5のうち、トリル下で先に動きやすい相手"
          : "要警戒TOP5のうち、先手を取りやすい相手",
        value: `${speed.teamAdvantage}体`,
        tone: speed.teamAdvantage ? "positive" : "attention"
      },
      {
        id: "broadly-outsped",
        label: `${memberCount}体中${Math.max(0, memberCount - 1)}体以上より${isTrickRoom ? "遅い" : "速い"}要警戒相手`,
        value: `${speed.threatAdvantage}体`,
        tone: speed.threatAdvantage ? "attention" : "positive"
      }
    ]
  };
}

function formatTypes(types: TypeName[]): string {
  return types.map(getTypeLabel).join("・");
}

function getTypeCategory(
  team: TeamSlot[],
  summary: TeamSummary
): AdvisorDiagnosticCategory {
  const gaps = getTeamTypeGapRows(summary);
  const duplicateWeaknesses = summary.rows.filter(
    (row) => row.multiplierMap.weak + row.multiplierMap.quadWeak >= 2
  );
  const missingCover = summary.rows.filter(
    (row) =>
      row.multiplierMap.resist +
        row.multiplierMap.doubleResist +
        row.multiplierMap.immune ===
      0
  );
  const candidate = getTypeCandidateScores(team).find(
    (entry) => entry.score > 0 && entry.delta.improvedTypes.length > 0
  );
  const improvedTypes = candidate?.delta.improvedTypes.slice(0, 3) ?? [];
  const suggestion = candidate
    ? `${candidate.typeJa}タイプを加えると、${formatTypes(improvedTypes)}の${improvedTypes.length}課題を改善できます。`
    : "現在のタイプ構成で明確に改善する単一タイプは見つかりません。";
  return {
    id: "types",
    title: "タイプ補完",
    summary: suggestion,
    items: [
      {
        id: "type-gaps",
        label: "主要な一貫タイプ",
        value: gaps.length
          ? gaps
              .slice(0, 3)
              .map((row) => row.attackTypeJa)
              .join("・")
          : "なし",
        tone: gaps.length ? "attention" : "positive"
      },
      {
        id: "duplicate-weaknesses",
        label: "2体以上の重複弱点",
        value: `${duplicateWeaknesses.length}種類`,
        tone: duplicateWeaknesses.length ? "attention" : "positive"
      },
      {
        id: "missing-cover",
        label: "半減・無効枠のないタイプ",
        value: `${missingCover.length}種類`,
        tone: missingCover.length ? "attention" : "positive"
      },
      {
        id: "missing-offense-types",
        label: "一致技で弱点を突けないタイプ",
        value: `${summary.missingOffense.length}種類`,
        tone: summary.missingOffense.length ? "attention" : "positive"
      }
    ]
  };
}

export function getAdvisorTeamDiagnostics({
  team,
  summary,
  threats,
  profile = "standard"
}: AdvisorTeamDiagnosticsInput): AdvisorTeamDiagnostics {
  const roles = getAdvisorRoleCounts(team);
  return {
    profile,
    categories: [
      getDefenseCategory(summary, roles),
      getOffenseCategory(summary, roles, threats),
      getSpeedCategory(team, roles, threats, profile),
      getTypeCategory(team, summary)
    ]
  };
}
