import pokemonData from "@/data/pokemon.json";
import typeData from "@/data/types.json";
import type {
  DefensiveBucket,
  DefensiveGap,
  DefensiveSummaryRow,
  MemberProfile,
  OffensiveCoverageRow,
  PokemonEntry,
  ResolvedTeamMember,
  TeamSlot,
  TeamSummary,
  TypeEntry,
  TypeName
} from "@/types/pokemon";

const allTypes = typeData as TypeEntry[];
const allPokemon = pokemonData as PokemonEntry[];

const typeMap = new Map(allTypes.map((type) => [type.nameEn, type]));
const pokemonMap = new Map(allPokemon.map((pokemon) => [pokemon.slug, pokemon]));

export const multiplierBuckets: DefensiveBucket[] = [
  "quadWeak",
  "weak",
  "neutral",
  "resist",
  "doubleResist",
  "immune"
];

export const bucketLabels: Record<DefensiveBucket, string> = {
  quadWeak: "4倍",
  weak: "2倍",
  neutral: "等倍",
  resist: "半減",
  doubleResist: "1/4",
  immune: "無効"
};

export function getAllTypes(): TypeEntry[] {
  return allTypes;
}

export function getAllPokemon(): PokemonEntry[] {
  return allPokemon;
}

export function getTypeLabel(typeName: TypeName): string {
  return typeMap.get(typeName)?.nameJa ?? typeName;
}

export function getPokemonBySlug(slug: string): PokemonEntry | undefined {
  return pokemonMap.get(slug);
}

export function getMultiplier(attackType: TypeName, defendTypes: TypeName[]): number {
  const typeEntry = typeMap.get(attackType);

  if (!typeEntry) {
    return 1;
  }

  return defendTypes.reduce((multiplier, defendType) => {
    if (typeEntry.attack.zeroTo.includes(defendType)) {
      return multiplier * 0;
    }

    if (typeEntry.attack.doubleTo.includes(defendType)) {
      return multiplier * 2;
    }

    if (typeEntry.attack.halfTo.includes(defendType)) {
      return multiplier * 0.5;
    }

    return multiplier;
  }, 1);
}

export function classifyMultiplier(multiplier: number): DefensiveBucket {
  if (multiplier === 0) {
    return "immune";
  }

  if (multiplier >= 4) {
    return "quadWeak";
  }

  if (multiplier >= 2) {
    return "weak";
  }

  if (multiplier <= 0.25) {
    return "doubleResist";
  }

  if (multiplier <= 0.5) {
    return "resist";
  }

  return "neutral";
}

export function resolveTeamSlot(slot: TeamSlot): ResolvedTeamMember | null {
  if (slot.mode === "pokemon") {
    const pokemon = getPokemonBySlug(slot.pokemonSlug);
    if (!pokemon) {
      return null;
    }

    return {
      slotId: slot.id,
      source: "pokemon",
      label: pokemon.nameJa || pokemon.nameEn || pokemon.slug,
      slug: pokemon.slug,
      types: pokemon.types
    };
  }

  const types = [slot.primaryType, slot.secondaryType]
    .filter((value): value is TypeName => Boolean(value))
    .filter((value, index, list) => list.indexOf(value) === index);

  if (types.length === 0) {
    return null;
  }

  return {
    slotId: slot.id,
    source: "type",
    label: types.map(getTypeLabel).join(" / "),
    types
  };
}

export function summarizeDefensiveProfile(defendTypes: TypeName[]): MemberProfile["byMultiplier"] {
  const initial: MemberProfile["byMultiplier"] = {
    quadWeak: [],
    weak: [],
    neutral: [],
    resist: [],
    doubleResist: [],
    immune: []
  };

  return allTypes.reduce((profile, attackType) => {
    const multiplier = getMultiplier(attackType.nameEn, defendTypes);
    const bucket = classifyMultiplier(multiplier);
    profile[bucket].push(attackType.nameEn);
    return profile;
  }, initial);
}

export function summarizeTeamWeakness(team: ResolvedTeamMember[]): DefensiveSummaryRow[] {
  return allTypes.map((attackType) => {
    const multiplierMap = {
      quadWeak: 0,
      weak: 0,
      neutral: 0,
      resist: 0,
      doubleResist: 0,
      immune: 0
    };

    team.forEach((member) => {
      const bucket = classifyMultiplier(getMultiplier(attackType.nameEn, member.types));
      multiplierMap[bucket] += 1;
    });

    return {
      attackType: attackType.nameEn,
      attackTypeJa: attackType.nameJa,
      multiplierMap,
      pressureScore: multiplierMap.quadWeak * 3 + multiplierMap.weak * 2 - multiplierMap.resist - multiplierMap.doubleResist * 2 - multiplierMap.immune * 3,
      coverageScore: multiplierMap.immune * 3 + multiplierMap.doubleResist * 2 + multiplierMap.resist - multiplierMap.weak - multiplierMap.quadWeak * 2
    };
  });
}

export function summarizeDefensiveGaps(rows: DefensiveSummaryRow[]): DefensiveGap[] {
  return rows
    .map((row) => {
      const weakMembers = row.multiplierMap.quadWeak + row.multiplierMap.weak;
      const coverMembers = row.multiplierMap.resist + row.multiplierMap.doubleResist + row.multiplierMap.immune;
      const priorityScore = weakMembers * 3 - coverMembers * 2;

      let note = "バランスは悪くない";

      if (weakMembers >= 2 && coverMembers === 0) {
        note = "受け先がなく一貫しやすい";
      } else if (weakMembers > coverMembers) {
        note = "受けより弱点側が多い";
      } else if (coverMembers >= 2 && weakMembers === 0) {
        note = "受け先が十分ある";
      }

      return {
        type: row.attackType,
        typeJa: row.attackTypeJa,
        weakMembers,
        coverMembers,
        note,
        priorityScore
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || b.weakMembers - a.weakMembers || a.coverMembers - b.coverMembers || a.typeJa.localeCompare(b.typeJa, "ja"));
}

export function summarizeOffenseCoverage(team: ResolvedTeamMember[]): OffensiveCoverageRow[] {
  return allTypes
    .map((defendType) => {
      let superEffectiveCount = 0;
      let neutralOrBetterCount = 0;
      let zeroDamageCount = 0;

      team.forEach((member) => {
        const bestMultiplier = member.types.reduce((best, attackType) => {
          return Math.max(best, getMultiplier(attackType, [defendType.nameEn]));
        }, 0);

        if (bestMultiplier > 1) {
          superEffectiveCount += 1;
        }

        if (bestMultiplier >= 1) {
          neutralOrBetterCount += 1;
        }

        if (bestMultiplier === 0) {
          zeroDamageCount += 1;
        }
      });

      return {
        defendType: defendType.nameEn,
        defendTypeJa: defendType.nameJa,
        superEffectiveCount,
        neutralOrBetterCount,
        zeroDamageCount
      };
    })
    .sort((a, b) => a.superEffectiveCount - b.superEffectiveCount || a.zeroDamageCount - b.zeroDamageCount || a.defendTypeJa.localeCompare(b.defendTypeJa, "ja"));
}

export function buildTeamSummary(teamSlots: TeamSlot[]): TeamSummary {
  const members = teamSlots
    .map(resolveTeamSlot)
    .filter((member): member is ResolvedTeamMember => member !== null);

  const rows = summarizeTeamWeakness(members).sort(
    (a, b) => b.pressureScore - a.pressureScore || a.attackTypeJa.localeCompare(b.attackTypeJa, "ja")
  );

  const memberProfiles: MemberProfile[] = members.map((member) => ({
    member,
    byMultiplier: summarizeDefensiveProfile(member.types)
  }));

  const defensiveGaps = summarizeDefensiveGaps(rows);
  const offensiveCoverage = summarizeOffenseCoverage(members);

  return {
    members,
    rows,
    sharedWeaknesses: rows.filter(
      (row) => row.multiplierMap.quadWeak + row.multiplierMap.weak >= 2 && row.multiplierMap.immune + row.multiplierMap.doubleResist + row.multiplierMap.resist === 0
    ),
    sturdyResistances: rows.filter(
      (row) => row.multiplierMap.immune + row.multiplierMap.doubleResist + row.multiplierMap.resist >= 2 && row.multiplierMap.quadWeak + row.multiplierMap.weak === 0
    ),
    memberProfiles,
    defensiveGaps,
    offensiveCoverage,
    missingOffense: offensiveCoverage.filter((row) => row.superEffectiveCount === 0),
    thinOffense: offensiveCoverage.filter((row) => row.superEffectiveCount === 1)
  };
}

export function summarizeTeam(teamSlots: TeamSlot[]): TeamSummary {
  return buildTeamSummary(teamSlots);
}
