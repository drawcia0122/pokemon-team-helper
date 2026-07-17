import { buildTeamSummary, getAllPokemon, getAllTypes, getMultiplier, getTypeLabel } from "@/lib/typeChart";
import type {
  CandidateDelta,
  DefensiveSummaryRow,
  PokemonCandidateScore,
  PokemonEntry,
  TeamSlot,
  TeamSummary,
  TypeCandidateScore,
  TypeName
} from "@/types/pokemon";

function toRowMap(summary: TeamSummary): Map<TypeName, DefensiveSummaryRow> {
  return new Map(summary.rows.map((row) => [row.attackType, row]));
}

function calculateDelta(beforeSummary: TeamSummary, afterSummary: TeamSummary): CandidateDelta {
  const beforeMap = toRowMap(beforeSummary);
  const afterMap = toRowMap(afterSummary);

  const improvedTypes: TypeName[] = [];
  const worsenedTypes: TypeName[] = [];
  const offenseImprovedTypes: TypeName[] = [];
  const offenseWorsenedTypes: TypeName[] = [];

  let immunityIncrease = 0;
  let resistIncrease = 0;
  let weakReduction = 0;
  let severeWeakReduction = 0;
  let newSevereWeaknessCount = 0;
  let newSuperEffectiveTargets = 0;

  beforeSummary.rows.forEach((beforeRow) => {
    const afterRow = afterMap.get(beforeRow.attackType);
    if (!afterRow) {
      return;
    }

    const beforeWeak = beforeRow.multiplierMap.quadWeak + beforeRow.multiplierMap.weak;
    const afterWeak = afterRow.multiplierMap.quadWeak + afterRow.multiplierMap.weak;
    const beforeSevere = beforeRow.multiplierMap.quadWeak;
    const afterSevere = afterRow.multiplierMap.quadWeak;
    const beforeCover = beforeRow.multiplierMap.resist + beforeRow.multiplierMap.doubleResist + beforeRow.multiplierMap.immune;
    const afterCover = afterRow.multiplierMap.resist + afterRow.multiplierMap.doubleResist + afterRow.multiplierMap.immune;

    if (afterWeak < beforeWeak || afterCover > beforeCover) {
      improvedTypes.push(beforeRow.attackType);
    }

    if (afterWeak > beforeWeak || afterSevere > beforeSevere) {
      worsenedTypes.push(beforeRow.attackType);
    }

    immunityIncrease += afterRow.multiplierMap.immune - beforeRow.multiplierMap.immune;
    resistIncrease +=
      afterRow.multiplierMap.resist +
      afterRow.multiplierMap.doubleResist -
      beforeRow.multiplierMap.resist -
      beforeRow.multiplierMap.doubleResist;
    weakReduction += beforeWeak - afterWeak;
    severeWeakReduction += beforeSevere - afterSevere;
    newSevereWeaknessCount += Math.max(0, afterSevere - beforeSevere);
  });

  const afterOffenseMap = new Map(afterSummary.offensiveCoverage.map((row) => [row.defendType, row]));

  beforeSummary.offensiveCoverage.forEach((beforeRow) => {
    const afterRow = afterOffenseMap.get(beforeRow.defendType);
    if (!afterRow) {
      return;
    }

    if (afterRow.superEffectiveCount > beforeRow.superEffectiveCount) {
      offenseImprovedTypes.push(beforeRow.defendType);
      newSuperEffectiveTargets += afterRow.superEffectiveCount - beforeRow.superEffectiveCount;
    }

    if (afterRow.zeroDamageCount > beforeRow.zeroDamageCount) {
      offenseWorsenedTypes.push(beforeRow.defendType);
    }
  });

  return {
    improvedTypes,
    worsenedTypes,
    immunityIncrease,
    resistIncrease,
    weakReduction,
    severeWeakReduction,
    newSevereWeaknessCount,
    offenseImprovedTypes,
    offenseWorsenedTypes,
    newSuperEffectiveTargets
  };
}

function buildReasons(delta: CandidateDelta, candidateTypes: TypeName[]): string[] {
  const reasons: string[] = [];

  delta.improvedTypes.slice(0, 3).forEach((typeName) => {
    reasons.push(`${getTypeLabel(typeName)}の一貫を切りやすい`);
  });

  if (delta.immunityIncrease > 0) {
    reasons.push(`無効を${delta.immunityIncrease}つ増やせる`);
  }

  if (delta.resistIncrease > 0) {
    reasons.push(`半減以下の受け先を${delta.resistIncrease}つ増やせる`);
  }

  if (delta.offenseImprovedTypes.length > 0) {
    const labels = delta.offenseImprovedTypes.slice(0, 2).map((typeName) => getTypeLabel(typeName));
    reasons.push(`${labels.join("・")} への打点を足せる`);
  }

  if (delta.newSuperEffectiveTargets >= 2) {
    reasons.push(`攻撃範囲の抜群先を${delta.newSuperEffectiveTargets}枠ぶん広げられる`);
  }

  if (candidateTypes.includes("ground")) {
    reasons.push("でんき無効を追加できる");
  }

  if (candidateTypes.includes("water")) {
    reasons.push("みず受けを増やしやすい");
  }

  if (candidateTypes.includes("steel")) {
    reasons.push("フェアリー耐性を厚くできる");
  }

  if (delta.improvedTypes.length > 0 && delta.offenseImprovedTypes.length > 0) {
    reasons.push("防御と攻撃の両方で補完しやすい");
  }

  if (delta.worsenedTypes.length === 0) {
    reasons.push("既存メンバーと弱点が被りにくい");
  } else if (delta.worsenedTypes.length <= 2) {
    const labels = delta.worsenedTypes.slice(0, 2).map((typeName) => getTypeLabel(typeName));
    reasons.push(`${labels.join("・")} は少し重くなる`);
  }

  return reasons.filter((reason, index, list) => list.indexOf(reason) === index).slice(0, 5);
}

function getOffenseCoverageBonus(candidateTypes: TypeName[]): number {
  const attackBonus = new Set<TypeName>();

  getAllTypes().forEach((attackType) => {
    candidateTypes.forEach((candidateType) => {
      const multiplier = getMultiplier(candidateType, [attackType.nameEn]);
      if (multiplier > 1) {
        attackBonus.add(attackType.nameEn);
      }
    });
  });

  return attackBonus.size;
}

function calculateCandidateScore(delta: CandidateDelta, candidateTypes: TypeName[]): number {
  return (
    delta.weakReduction * 10 +
    delta.severeWeakReduction * 14 +
    delta.immunityIncrease * 9 +
    delta.resistIncrease * 5 -
    delta.worsenedTypes.length * 5 -
    delta.newSevereWeaknessCount * 12 +
    getOffenseCoverageBonus(candidateTypes) +
    delta.newSuperEffectiveTargets * 2 -
    delta.offenseWorsenedTypes.length * 4
  );
}

export function getTypeCandidateScores(team: TeamSlot[]): TypeCandidateScore[] {
  const beforeSummary = buildTeamSummary(team);

  return getAllTypes()
    .map((typeEntry) => {
      const afterSummary = buildTeamSummary([
        ...team,
        {
          id: `candidate-type-${typeEntry.nameEn}`,
          mode: "type",
          primaryType: typeEntry.nameEn
        }
      ]);

      const delta = calculateDelta(beforeSummary, afterSummary);

      return {
        type: typeEntry.nameEn,
        typeJa: typeEntry.nameJa,
        score: calculateCandidateScore(delta, [typeEntry.nameEn]),
        reasons: buildReasons(delta, [typeEntry.nameEn]),
        beforeSummary,
        afterSummary,
        delta
      };
    })
    .sort((a, b) => b.score - a.score || a.typeJa.localeCompare(b.typeJa, "ja"));
}

export function getPokemonCandidateScores(team: TeamSlot[], pokemonList: PokemonEntry[]): PokemonCandidateScore[] {
  const currentTeamSlugs = new Set(team.filter((slot) => slot.mode === "pokemon").map((slot) => slot.pokemonSlug));
  const beforeSummary = buildTeamSummary(team);

  return pokemonList
    .filter((pokemon) => !currentTeamSlugs.has(pokemon.slug))
    .map((pokemon) => {
      const afterSummary = buildTeamSummary([
        ...team,
        {
          id: `candidate-pokemon-${pokemon.slug}`,
          mode: "pokemon",
          pokemonSlug: pokemon.slug
        }
      ]);

      const delta = calculateDelta(beforeSummary, afterSummary);

      return {
        pokemon,
        score: calculateCandidateScore(delta, pokemon.types),
        reasons: buildReasons(delta, pokemon.types),
        beforeSummary,
        afterSummary,
        delta
      };
    })
    .sort((a, b) => b.score - a.score || a.pokemon.nameJa.localeCompare(b.pokemon.nameJa, "ja"));
}

export function getDefaultCandidateSelection(team: TeamSlot[], allowedPokemon: PokemonEntry[]) {
  const typeCandidate = getTypeCandidateScores(team)[0] ?? null;
  const pokemonCandidate = getPokemonCandidateScores(team, allowedPokemon)[0] ?? null;

  return {
    typeCandidate,
    pokemonCandidate
  };
}

export function getAllPokemonEntries(): PokemonEntry[] {
  return getAllPokemon();
}
