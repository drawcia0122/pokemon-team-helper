export type SemanticConfidence = "high" | "medium";

export type SemanticEntityKind =
  | "move"
  | "ability"
  | "item"
  | "stat-change";

export type MoveSemanticCategory =
  | "Damage"
  | "Setup"
  | "Priority"
  | "Pivot"
  | "Recovery"
  | "Trade"
  | "Tempo"
  | "Trap"
  | "Hazard"
  | "HazardRemoval"
  | "Utility";

export type AbilitySemanticCategory =
  | "OffensiveMultiplier"
  | "Speed"
  | "Snowball"
  | "Trap"
  | "Defensive"
  | "Immunity"
  | "Utility"
  | "Weather"
  | "FormChange";

export type ItemSemanticCategory =
  | "ChoiceSpeed"
  | "OffensiveBoost"
  | "Survival"
  | "Recovery"
  | "HazardProtection"
  | "DefensiveBoost"
  | "Snowball"
  | "ContactPunish"
  | "StatusProtection"
  | "ScreenExtension"
  | "WeatherExtension"
  | "MegaEvolution"
  | "Utility";

export type StatChangeSemanticCategory =
  | "OffensiveBoost"
  | "SpeedBoost"
  | "DefensiveBoost"
  | "OffensiveDrop"
  | "SpeedDrop"
  | "DefensiveDrop"
  | "AccuracyControl";

export type SemanticCategory =
  | MoveSemanticCategory
  | AbilitySemanticCategory
  | ItemSemanticCategory
  | StatChangeSemanticCategory;

export type BattleTag =
  | "WallBreak"
  | "Cleanup"
  | "Setup"
  | "WinCondition"
  | "PriorityFinish"
  | "Trade"
  | "Tempo"
  | "Pivot"
  | "RevengeKill"
  | "Snowball"
  | "HazardSetter"
  | "HazardRemoval"
  | "DefensiveAnchor"
  | "Utility";

export type SemanticMetadata<Category extends SemanticCategory> = {
  category: Category;
  confidence: SemanticConfidence;
  source: string;
  description: string;
  battleTags: readonly BattleTag[];
};

export type MoveSemantic = SemanticMetadata<MoveSemanticCategory>;
export type AbilitySemantic = SemanticMetadata<AbilitySemanticCategory>;
export type ItemSemantic = SemanticMetadata<ItemSemanticCategory>;
export type StatChangeSemantic =
  SemanticMetadata<StatChangeSemanticCategory>;

export type SemanticCombatRegistry = {
  schemaVersion: 1;
  moves: Readonly<Record<string, readonly MoveSemantic[]>>;
  abilities: Readonly<Record<string, readonly AbilitySemantic[]>>;
  items: Readonly<Record<string, readonly ItemSemantic[]>>;
  statChanges: Readonly<Record<string, readonly StatChangeSemantic[]>>;
};

export type SemanticClassification<
  Semantic extends SemanticMetadata<SemanticCategory>
> =
  | {
      status: "classified";
      semantics: readonly Semantic[];
      battleTags: readonly BattleTag[];
    }
  | {
      status: "unclassified";
      semantics: readonly [];
      battleTags: readonly [];
    };

export type BattleTagDefinition = {
  tag: BattleTag;
  description: string;
};

export type BattleTagIndexEntry = {
  entityKind: SemanticEntityKind;
  entityId: string;
  semanticCategory: SemanticCategory;
};
