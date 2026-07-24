import environmentIndexData from "@/data/environment/index.json";
import localizationData from "@/data/environment/localization/ja.json";
import { readEnvironmentSnapshot } from "@/lib/environmentData.server";
import { localizeEnvironmentValue } from "@/lib/environmentLocalization";
import {
  BATTLE_TAG_DEFINITIONS,
  getBattleTagIndex,
  SEMANTIC_COMBAT_REGISTRY
} from "@/lib/semanticCombatRegistry";
import {
  analyzeSemanticCoverage,
  type SemanticCoverageKind,
  type SemanticCoverageReport
} from "@/lib/semanticCombatCoverage";
import type {
  EnvironmentSnapshotIndex,
  EnvironmentSnapshotIndexEntry
} from "@/types/environmentData";
import type {
  EnvironmentLocalizationCategory,
  EnvironmentLocalizationDictionary
} from "@/types/environmentLocalization";
import type {
  SemanticCategory,
  SemanticCombatRegistry,
  SemanticMetadata
} from "@/types/semanticCombat";

const index = environmentIndexData as EnvironmentSnapshotIndex;
const localization =
  localizationData as EnvironmentLocalizationDictionary;

export type SemanticRegistryStats = {
  moveIds: number;
  moveSemantics: number;
  abilityIds: number;
  abilitySemantics: number;
  itemIds: number;
  itemSemantics: number;
  statChangeIds: number;
  statChangeSemantics: number;
  battleTags: number;
};

export type SemanticCombatInspection = {
  registry: SemanticCombatRegistry;
  stats: SemanticRegistryStats;
  coverage: SemanticCoverageReport;
};

function semanticCount(
  registry: Readonly<
    Record<string, readonly SemanticMetadata<SemanticCategory>[]>
  >
): number {
  return Object.values(registry).reduce(
    (total, semantics) => total + semantics.length,
    0
  );
}

function preferredSnapshot(): EnvironmentSnapshotIndexEntry {
  const reference = index.snapshots.find(
    (entry) =>
      entry.regulationId === "M-B" &&
      entry.battleFormat === "single" &&
      entry.ratingCutoff === 1760 &&
      entry.status === "available"
  );
  if (!reference) {
    throw new Error("Semantic Coverage用のM-B/1760 snapshotがありません。");
  }
  return reference;
}

export function inspectSemanticCombatRegistry(): SemanticCombatInspection {
  const registry = SEMANTIC_COMBAT_REGISTRY;
  return {
    registry,
    stats: {
      moveIds: Object.keys(registry.moves).length,
      moveSemantics: semanticCount(registry.moves),
      abilityIds: Object.keys(registry.abilities).length,
      abilitySemantics: semanticCount(registry.abilities),
      itemIds: Object.keys(registry.items).length,
      itemSemantics: semanticCount(registry.items),
      statChangeIds: Object.keys(registry.statChanges).length,
      statChangeSemantics: semanticCount(registry.statChanges),
      battleTags: BATTLE_TAG_DEFINITIONS.length
    },
    coverage: analyzeSemanticCoverage(
      readEnvironmentSnapshot(preferredSnapshot())
    )
  };
}

function label(
  category: EnvironmentLocalizationCategory,
  id: string
): string {
  return localizeEnvironmentValue(localization, category, id).name;
}

function formatRegistry(
  title: string,
  registry: Readonly<
    Record<string, readonly SemanticMetadata<SemanticCategory>[]>
  >,
  localizationCategory?: EnvironmentLocalizationCategory
): string[] {
  const lines = [title];
  for (const [id, semantics] of Object.entries(registry)) {
    const localized = localizationCategory
      ? ` / ${label(localizationCategory, id)}`
      : "";
    lines.push(`${id}${localized}`);
    for (const entry of semantics) {
      lines.push(
        `  - ${entry.category} confidence=${entry.confidence} source=${entry.source}`
      );
      lines.push(`    ${entry.description}`);
      lines.push(
        `    Battle Tags=${entry.battleTags.join(",") || "なし"}`
      );
    }
  }
  lines.push("");
  return lines;
}

function coverageLabel(kind: SemanticCoverageKind): string {
  switch (kind) {
    case "moves":
      return "Moves";
    case "abilities":
      return "Abilities";
    case "items":
      return "Items";
  }
}

function localizationCategory(
  kind: SemanticCoverageKind
): EnvironmentLocalizationCategory {
  return kind;
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

export function formatSemanticCombatInspection(
  inspection: SemanticCombatInspection
): string {
  const { registry, stats, coverage } = inspection;
  const lines: string[] = [
    "Semantic Combat Registry",
    `schemaVersion=${registry.schemaVersion}`,
    `Dataset=${coverage.datasetId}`,
    `Coverage対象: Pokemon usage >= ${percent(coverage.minimumPokemonUsageRate)}, adoption share >= ${percent(coverage.minimumAdoptionShare)}`,
    `Pokemon=${coverage.eligiblePokemonCount}`,
    "",
    "Registry Summary",
    `Moves: ids=${stats.moveIds} semantics=${stats.moveSemantics}`,
    `Abilities: ids=${stats.abilityIds} semantics=${stats.abilitySemantics}`,
    `Items: ids=${stats.itemIds} semantics=${stats.itemSemantics}`,
    `Stat Changes: ids=${stats.statChangeIds} semantics=${stats.statChangeSemantics}`,
    `Battle Tags: ${stats.battleTags}`,
    "",
    "Semantic Coverage"
  ];
  for (const kind of [
    "moves",
    "abilities",
    "items"
  ] as const) {
    const result = coverage.coverage[kind];
    lines.push(
      `${coverageLabel(kind)}: ${percent(result.occurrenceCoverageRate)} occurrences=${result.classifiedOccurrences}/${result.totalOccurrences} distinct=${result.classifiedDistinct}/${result.totalDistinct} (${percent(result.distinctCoverageRate)})`
    );
  }
  lines.push("");
  lines.push("Battle Tags一覧");
  const tagIndex = getBattleTagIndex();
  for (const definition of BATTLE_TAG_DEFINITIONS) {
    lines.push(
      `${definition.tag}: ${definition.description} sources=${tagIndex[definition.tag].length}`
    );
  }
  lines.push("");
  lines.push(
    ...formatRegistry(
      "技Semantic一覧",
      registry.moves,
      "moves"
    ),
    ...formatRegistry(
      "特性Semantic一覧",
      registry.abilities,
      "abilities"
    ),
    ...formatRegistry(
      "道具Semantic一覧",
      registry.items,
      "items"
    ),
    ...formatRegistry(
      "能力変化Semantic一覧",
      registry.statChanges
    )
  );

  lines.push("未分類一覧");
  for (const kind of [
    "moves",
    "abilities",
    "items"
  ] as const) {
    const unclassified = coverage.coverage[kind].unclassified;
    lines.push(
      `Unclassified ${coverageLabel(kind)}: ${unclassified.length}`
    );
    for (const entry of unclassified) {
      lines.push(
        `  - ${entry.id} / ${label(localizationCategory(kind), entry.id)} occurrences=${entry.occurrenceCount} aggregateShare=${percent(entry.aggregateShare)} pokemon=${entry.pokemonSlugs.length}`
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
