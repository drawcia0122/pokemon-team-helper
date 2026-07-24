import { THREAT_MOVE_THRESHOLDS } from "@/lib/battleEffectiveness";
import { getSemanticClassification } from "@/lib/semanticCombatRegistry";
import { MIN_THREAT_USAGE_RATE } from "@/lib/teamThreats";
import type {
  EnvironmentPokemon,
  EnvironmentSnapshot,
  WeightedEnvironmentValue
} from "@/types/environmentData";
import type { SemanticEntityKind } from "@/types/semanticCombat";

export type SemanticCoverageKind = "moves" | "abilities" | "items";

export type SemanticCoverageEntity = {
  id: string;
  occurrenceCount: number;
  aggregateShare: number;
  pokemonSlugs: string[];
};

export type SemanticCoverageBreakdown = {
  kind: SemanticCoverageKind;
  totalDistinct: number;
  classifiedDistinct: number;
  distinctCoverageRate: number;
  totalOccurrences: number;
  classifiedOccurrences: number;
  occurrenceCoverageRate: number;
  unclassified: SemanticCoverageEntity[];
};

export type SemanticCoverageReport = {
  datasetId: string;
  minimumPokemonUsageRate: number;
  minimumAdoptionShare: number;
  eligiblePokemonCount: number;
  coverage: Record<SemanticCoverageKind, SemanticCoverageBreakdown>;
};

const ENTITY_KIND_BY_COVERAGE_KIND: Record<
  SemanticCoverageKind,
  Exclude<SemanticEntityKind, "stat-change">
> = {
  moves: "move",
  abilities: "ability",
  items: "item"
};

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function entriesFor(
  pokemon: EnvironmentPokemon,
  kind: SemanticCoverageKind
): WeightedEnvironmentValue[] {
  return pokemon[kind];
}

function isClassified(
  entityKind: Exclude<SemanticEntityKind, "stat-change">,
  entityId: string
): boolean {
  switch (entityKind) {
    case "move":
      return getSemanticClassification("move", entityId).status === "classified";
    case "ability":
      return (
        getSemanticClassification("ability", entityId).status === "classified"
      );
    case "item":
      return getSemanticClassification("item", entityId).status === "classified";
  }
}

function analyzeKind(
  pokemon: EnvironmentPokemon[],
  kind: SemanticCoverageKind,
  minimumAdoptionShare: number
): SemanticCoverageBreakdown {
  const entities = new Map<
    string,
    {
      occurrenceCount: number;
      aggregateShare: number;
      pokemonSlugs: Set<string>;
    }
  >();
  for (const entry of pokemon) {
    for (const value of entriesFor(entry, kind)) {
      if (value.share < minimumAdoptionShare) continue;
      const aggregate = entities.get(value.id) ?? {
        occurrenceCount: 0,
        aggregateShare: 0,
        pokemonSlugs: new Set<string>()
      };
      aggregate.occurrenceCount += 1;
      aggregate.aggregateShare += value.share;
      aggregate.pokemonSlugs.add(entry.slug);
      entities.set(value.id, aggregate);
    }
  }

  const entityKind = ENTITY_KIND_BY_COVERAGE_KIND[kind];
  const all = [...entities.entries()].map(([id, aggregate]) => ({
    id,
    occurrenceCount: aggregate.occurrenceCount,
    aggregateShare: round(aggregate.aggregateShare),
    pokemonSlugs: [...aggregate.pokemonSlugs].sort()
  }));
  const classified = all.filter(
    (entry) => isClassified(entityKind, entry.id)
  );
  const totalOccurrences = all.reduce(
    (total, entry) => total + entry.occurrenceCount,
    0
  );
  const classifiedOccurrences = classified.reduce(
    (total, entry) => total + entry.occurrenceCount,
    0
  );
  return {
    kind,
    totalDistinct: all.length,
    classifiedDistinct: classified.length,
    distinctCoverageRate:
      all.length > 0 ? round(classified.length / all.length) : 1,
    totalOccurrences,
    classifiedOccurrences,
    occurrenceCoverageRate:
      totalOccurrences > 0
        ? round(classifiedOccurrences / totalOccurrences)
        : 1,
    unclassified: all
      .filter(
        (entry) => !isClassified(entityKind, entry.id)
      )
      .sort(
        (left, right) =>
          right.occurrenceCount - left.occurrenceCount ||
          right.aggregateShare - left.aggregateShare ||
          left.id.localeCompare(right.id)
      )
  };
}

export function analyzeSemanticCoverage(
  snapshot: EnvironmentSnapshot,
  {
    minimumPokemonUsageRate = MIN_THREAT_USAGE_RATE,
    minimumAdoptionShare = THREAT_MOVE_THRESHOLDS.secondary
  }: {
    minimumPokemonUsageRate?: number;
    minimumAdoptionShare?: number;
  } = {}
): SemanticCoverageReport {
  const eligiblePokemon = snapshot.pokemon.filter(
    (pokemon) => pokemon.usage.rate >= minimumPokemonUsageRate
  );
  return {
    datasetId: snapshot.snapshotId,
    minimumPokemonUsageRate,
    minimumAdoptionShare,
    eligiblePokemonCount: eligiblePokemon.length,
    coverage: {
      moves: analyzeKind(eligiblePokemon, "moves", minimumAdoptionShare),
      abilities: analyzeKind(
        eligiblePokemon,
        "abilities",
        minimumAdoptionShare
      ),
      items: analyzeKind(eligiblePokemon, "items", minimumAdoptionShare)
    }
  };
}
