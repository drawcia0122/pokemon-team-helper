import {
  buildAbilityDenialProfile,
  type AbilityEnvironmentDemand
} from "@/lib/abilityDenialProfile";
import {
  buildDefensiveResponseProfile,
  evaluateMatchupVerdict,
  type MatchupVerdictContext
} from "@/lib/matchupVerdictEngine";
import { getAllTypes, getMultiplier, getPokemonBySlug } from "@/lib/typeChart";
import type {
  AbilityDenialCategory,
  DefensiveCoreProfile
} from "@/types/matchupCore";
import type { PokemonEntry, TypeName } from "@/types/pokemon";

const PROGRESS = new Set([
  "toxic", "willowisp", "yawn", "knockoff", "saltcure", "leechseed",
  "uturn", "voltswitch", "flipturn", "partingshot"
]);
const REMOVAL = new Set(["rapidspin", "defog", "mortalspin", "tidyup"]);

function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function combinations<T>(values: T[], size: number): T[][] {
  if (size === 0) return [[]];
  return values.flatMap((value, index) =>
    combinations(values.slice(index + 1), size - 1).map((tail) => [value, ...tail])
  );
}

function coverage(
  profiles: Array<ReturnType<typeof buildAbilityDenialProfile>>,
  category: AbilityDenialCategory
): { value: number; redundancy: number } {
  const values = profiles
    .map((profile) => profile.categoryCoverage[category] ?? 0)
    .filter((value) => value > 0)
    .sort((left, right) => right - left);
  if (values.length === 0) return { value: 0, redundancy: 0 };
  const value = Math.min(
    1,
    values[0] + (values[1] ?? 0) * 0.35 + (values[2] ?? 0) * 0.15
  );
  return {
    value,
    redundancy: Math.min(1, (values[1] ?? 0) * 0.4 + (values[2] ?? 0) * 0.2)
  };
}

function memberEnvironmentMoves(
  member: PokemonEntry,
  context: MatchupVerdictContext
) {
  return context.environmentBySlug.get(member.slug)?.moves ?? [];
}

export function evaluateDefensiveCore(
  members: PokemonEntry[],
  context: MatchupVerdictContext,
  demand: AbilityEnvironmentDemand = context.demand,
  includeCommonBreakers = true
): DefensiveCoreProfile {
  const uniqueMembers = members.filter(
    (member, index) =>
      members.findIndex((candidate) => candidate.slug === member.slug) === index
  ).slice(0, 3);
  const abilityProfiles = uniqueMembers.map((member) =>
    buildAbilityDenialProfile({
      pokemonSlug: member.slug,
      environment: context.environmentBySlug.get(member.slug),
      demand
    })
  );
  const responses = uniqueMembers.map((member) =>
    buildDefensiveResponseProfile(member, context)
  );
  const setup = coverage(abilityProfiles, "SetupDenial");
  const residual = coverage(abilityProfiles, "ResidualDamageDenial");
  const status = coverage(abilityProfiles, "StatusDenial");
  const hazard = coverage(abilityProfiles, "HazardDenial");
  const statDrop = coverage(abilityProfiles, "StatDropDenial");
  const categorySet = new Set(
    abilityProfiles.flatMap((profile) =>
      Object.entries(profile.categoryCoverage)
        .filter(([, value]) => (value ?? 0) >= 0.1)
        .map(([category]) => category)
    )
  );
  const recoveryCoverage = clamp(
    average(responses.map((response) => response.recoveryAdoptionRate * 100))
  );
  const pivotCoverage = clamp(
    Math.max(0, ...responses.map((response) => response.pivotCapability))
  );
  const immunityCoverage = clamp(
    new Set(
      responses.flatMap((response) => [
        ...response.typeImmunities,
        ...response.abilityImmunities
      ])
    ).size * 13
  );
  const sharedVulnerabilities = getAllTypes()
    .map((entry) => entry.nameEn)
    .filter(
      (type) =>
        uniqueMembers.length > 1 &&
        uniqueMembers.every((member) => getMultiplier(type, member.types) > 1)
    );
  const removal = Math.max(
    0,
    ...uniqueMembers.flatMap((member) =>
      memberEnvironmentMoves(member, context)
        .filter((move) => REMOVAL.has(move.id))
        .map((move) => move.share)
    )
  );
  const hazardSensitivity = average(
    responses.map((response) => response.hazardSensitivity)
  );
  const passiveProgress = clamp(
    Math.max(
      0,
      ...uniqueMembers.flatMap((member) =>
        memberEnvironmentMoves(member, context)
          .filter((move) => PROGRESS.has(move.id))
          .map((move) => move.share * 100)
      )
    )
  );
  const commonBreakers = includeCommonBreakers
    ? context.dataset.pokemon
        .filter(
          (entry) =>
            entry.usageRate >= context.dataset.metadata.minimumUsageRate
        )
        .sort((left, right) => left.usageRank - right.usageRank)
        .slice(0, 20)
        .flatMap((entry) => {
          const threat = getPokemonBySlug(entry.slug);
          if (!threat) return [];
          const allLose = uniqueMembers.every((member) => {
            const verdict = evaluateMatchupVerdict({
              candidate: member,
              threat,
              context
            }).verdict;
            return verdict === "unfavorable" || verdict === "hard-lost";
          });
          return allLose ? [entry.slug] : [];
        })
        .slice(0, 8)
    : [];
  const redundancy = average([
    setup.redundancy,
    residual.redundancy,
    status.redundancy,
    hazard.redundancy,
    statDrop.redundancy
  ]) * 100;
  const diversity = clamp(categorySet.size * 8.5);
  const physicalResponse = clamp(average(responses.map((response) => response.physicalBulk)));
  const specialResponse = clamp(average(responses.map((response) => response.specialBulk)));
  const roleOverlapPenalty = clamp(
    Math.max(0, 18 - Math.abs(physicalResponse - specialResponse) * 0.25) *
      (redundancy / 100)
  );
  const redundancyBonus = clamp(redundancy * 0.35);
  const cycleViability = clamp(
    recoveryCoverage * 0.38 +
      pivotCoverage * 0.18 +
      passiveProgress * 0.15 +
      (100 - hazardSensitivity) * 0.14 +
      removal * 100 * 0.15 -
      sharedVulnerabilities.length * 5
  );
  const coreReliability = clamp(
    average(abilityProfiles.map((profile) =>
      profile.confidence === "high" ? 90 : profile.confidence === "medium" ? 65 : 35
    ))
  );
  const coreSynergy = clamp(
    physicalResponse * 0.12 +
      specialResponse * 0.12 +
      setup.value * 100 * 0.13 +
      residual.value * 100 * 0.1 +
      statDrop.value * 100 * 0.08 +
      diversity * 0.13 +
      cycleViability * 0.17 +
      immunityCoverage * 0.07 +
      passiveProgress * 0.08 +
      redundancyBonus * 0.04 -
      roleOverlapPenalty * 0.06 -
      sharedVulnerabilities.length * 2.5 -
      commonBreakers.length * 1.2
  );
  const explanations = [
    setup.value >= 0.35 ? "特性によって相手の能力上昇を止める手段があります。" : "",
    residual.value >= 0.35 ? "定数ダメージを利用した崩しへ回答があります。" : "",
    statDrop.value >= 0.35 ? "能力下降を利用した崩しを抑えられます。" : "",
    cycleViability >= 50
      ? "回復・交代手段・相手への負荷を組み合わせてサイクルを続けやすいです。"
      : "一度耐えるだけでなく繰り返し受けるには、回復や交代手段が不足します。",
    diversity >= 35 ? "異なる種類の崩し筋を特性で拒否できます。" : ""
  ].filter(Boolean);
  return {
    members: uniqueMembers.map((member) => member.slug),
    physicalResponse: round(physicalResponse),
    specialResponse: round(specialResponse),
    setupDenial: round(setup.value * 100),
    residualDamageDenial: round(residual.value * 100),
    statusResponse: round(status.value * 100),
    hazardResponse: round(Math.max(hazard.value * 100, removal * 100)),
    statDropDenial: round(statDrop.value * 100),
    recoveryCoverage: round(recoveryCoverage),
    pivotCoverage: round(pivotCoverage),
    immunityCoverage: round(immunityCoverage),
    emergencyCheckCoverage: round(average(responses.map((response) => response.emergencyTradeCapability))),
    passiveProgress: round(passiveProgress),
    winConditionPotential: round(setup.value * 45 + passiveProgress * 0.25),
    sharedVulnerabilities,
    commonBreakers,
    denialRedundancy: round(redundancy),
    denialDiversity: round(diversity),
    redundancyBonus: round(redundancyBonus),
    roleOverlapPenalty: round(roleOverlapPenalty),
    cycleViability: round(cycleViability),
    coreSynergy: round(coreSynergy),
    coreReliability: round(coreReliability),
    coreConfidence:
      coreReliability >= 80 ? "high" : coreReliability >= 50 ? "medium" : "low",
    explanations,
    unclassified: [...new Set(abilityProfiles.flatMap((profile) => profile.unclassified))].sort()
  };
}

export function findBestDefensiveCore(
  candidate: PokemonEntry,
  currentMembers: PokemonEntry[],
  context: MatchupVerdictContext
): DefensiveCoreProfile {
  const partners = currentMembers.filter((member) => member.slug !== candidate.slug);
  const groups = [
    ...combinations(partners, Math.min(2, partners.length)).map((pair) => [
      candidate,
      ...pair
    ]),
    ...partners.map((partner) => [candidate, partner])
  ];
  const evaluated = (groups.length ? groups : [[candidate]])
    .map((members) => evaluateDefensiveCore(members, context, context.demand, false))
    .sort(
      (left, right) =>
        right.coreSynergy - left.coreSynergy ||
        left.members.join(",").localeCompare(right.members.join(","))
    );
  return evaluated[0];
}

export function resolveCoreMembers(slugs: string[]): PokemonEntry[] {
  return slugs.map((slug) => {
    const member = getPokemonBySlug(slug);
    if (!member) throw new Error(`コアメンバーを解決できません: ${slug}`);
    return member;
  });
}
