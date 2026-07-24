import type {
  EnvironmentPokemon,
  EnvironmentSnapshot,
  WeightedEnvironmentValue
} from "@/types/environmentData";
import type {
  ThreatEnvironmentDataset,
  ThreatEnvironmentPokemon
} from "@/types/environmentThreat";

function value(
  entry: { id: string; name?: string; share: number }
): WeightedEnvironmentValue {
  return {
    id: entry.id,
    sourceName: entry.name ?? entry.id,
    share: entry.share,
    rawWeight: entry.share
  };
}

function pokemon(entry: ThreatEnvironmentPokemon): EnvironmentPokemon {
  return {
    slug: entry.slug,
    sourceName: entry.slug,
    usage: {
      rank: entry.usageRank,
      rate: entry.usageRate,
      rawCount: 0,
      rawWeight: entry.usageRate
    },
    moves: entry.moves.map(value),
    items: (entry.items ?? []).map(value),
    abilities: entry.abilities.map(value),
    statSpreads: [],
    teraTypes: [],
    teammates: entry.teammates.map((relation) => ({
      slug: relation.slug,
      sourceName: relation.name,
      share: relation.share,
      rawWeight: relation.share
    })),
    checksAndCounters: entry.checksAndCounters.map((relation) => ({
      slug: relation.slug,
      sourceName: relation.name,
      share: relation.share,
      rawWeight: relation.share,
      sampleCount: 0,
      score: 0,
      uncertainty: 0
    }))
  };
}

export function battleValueEnvironmentSnapshot(
  dataset: ThreatEnvironmentDataset
): EnvironmentSnapshot {
  const periodStart = `${dataset.period}-01T00:00:00.000Z`;
  return {
    schemaVersion: 1,
    snapshotId: dataset.snapshotId,
    source: {
      id: "pokemon-showdown",
      publisher: "Smogon",
      datasetKind: "simulator-aggregate",
      datasetLicense: "not-explicitly-stated",
      softwareLicense: "MIT"
    },
    sourceUrl: dataset.metadata.sourceUrl,
    retrievedAt: dataset.metadata.fetchedAt,
    contentHash: dataset.metadata.checksum,
    period: {
      kind: "month",
      value: dataset.period,
      startAt: periodStart,
      endAt: periodStart
    },
    regulationId: dataset.regulationId,
    battleFormat: dataset.battleFormat,
    sourceFormatId: dataset.metadata.datasetId,
    ratingCutoff: dataset.ratingCutoff,
    battleCount: 0,
    populationNote:
      "Battle Value integration用の公開Threat Dataset projection",
    fieldAvailability: {
      usage: "available",
      moves: "available",
      items: "available",
      abilities: "available",
      statSpreads: "not-provided",
      teraTypes: "not-applicable",
      teammates: "available",
      checksAndCounters: "available"
    },
    pokemon: dataset.pokemon.map(pokemon),
    normalization: {
      normalizerVersion: "1.1.0",
      usageUnit: "ratio",
      distributionUnit: "share-and-source-weight",
      topK: null,
      investmentSystem: dataset.investmentSystem,
      unresolvedPokemonCount: 0,
      unresolvedReferenceCount: 0,
      unresolvedNames: []
    }
  };
}
