export type TypeName =
  | "normal"
  | "fire"
  | "water"
  | "electric"
  | "grass"
  | "ice"
  | "fighting"
  | "poison"
  | "ground"
  | "flying"
  | "psychic"
  | "bug"
  | "rock"
  | "ghost"
  | "dragon"
  | "dark"
  | "steel"
  | "fairy";

export type TypeEntry = {
  nameEn: TypeName;
  nameJa: string;
  attack: {
    doubleTo: TypeName[];
    halfTo: TypeName[];
    zeroTo: TypeName[];
  };
};

export type PokemonEntry = {
  id: number;
  slug: string;
  speciesId: number;
  isDefaultForm: boolean;
  formKind: PokemonFormKind;
  formOrder: number;
  isBattleOnly: boolean;
  formSelection: PokemonFormSelection;
  nameJa: string;
  nameEn: string;
  types: TypeName[];
  baseStats?: PokemonBaseStats;
};

export type PokemonFormKind =
  | "base"
  | "mega"
  | "regional"
  | "standard"
  | "gender"
  | "gmax"
  | "battle-only"
  | "appearance";

export type PokemonFormSelection = "team" | "excluded";

export type PokemonBaseStats = {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
};

export type Regulation = {
  id: string;
  label: string;
  startAt: string | null;
  endAt: string | null;
  allowedPokemonSlugs: string[];
  bannedPokemonSlugs: string[];
  notes: string[];
  isAvailable: boolean;
  displayOrder: number;
  sourceUrl: string;
};

export type RegulationDefinition = Regulation;

export type SeasonDefinition = {
  id: string;
  label: string;
  articleLabel: string;
  regulationId: string;
  startAt: string | null;
  endAt: string | null;
  displayOrder: number;
};

export type AppMeta = {
  seasonIds: string[];
  regulationIds: string[];
  legacySeasonIdMap: Record<string, string>;
  seasons: SeasonDefinition[];
};

export type TeamSlot =
  | {
      id: string;
      mode: "pokemon";
      pokemonSlug: string;
    }
  | {
      id: string;
      mode: "type";
      primaryType: TypeName;
      secondaryType?: TypeName;
    };

export type ResolvedTeamMember = {
  slotId: string;
  source: "pokemon" | "type";
  label: string;
  slug?: string;
  types: TypeName[];
};

export type DefensiveBucket =
  | "quadWeak"
  | "weak"
  | "neutral"
  | "resist"
  | "doubleResist"
  | "immune";

export type DefensiveSummaryRow = {
  attackType: TypeName;
  attackTypeJa: string;
  multiplierMap: {
    quadWeak: number;
    weak: number;
    neutral: number;
    resist: number;
    doubleResist: number;
    immune: number;
  };
  pressureScore: number;
  coverageScore: number;
};

export type MemberProfile = {
  member: ResolvedTeamMember;
  byMultiplier: Record<DefensiveBucket, TypeName[]>;
};

export type DefensiveGap = {
  type: TypeName;
  typeJa: string;
  weakMembers: number;
  coverMembers: number;
  note: string;
  priorityScore: number;
};

export type OffensiveCoverageRow = {
  defendType: TypeName;
  defendTypeJa: string;
  superEffectiveCount: number;
  neutralOrBetterCount: number;
  zeroDamageCount: number;
};

export type TeamSummary = {
  members: ResolvedTeamMember[];
  rows: DefensiveSummaryRow[];
  sharedWeaknesses: DefensiveSummaryRow[];
  sturdyResistances: DefensiveSummaryRow[];
  memberProfiles: MemberProfile[];
  defensiveGaps: DefensiveGap[];
  offensiveCoverage: OffensiveCoverageRow[];
  missingOffense: OffensiveCoverageRow[];
  thinOffense: OffensiveCoverageRow[];
};

export type CandidateDelta = {
  improvedTypes: TypeName[];
  worsenedTypes: TypeName[];
  immunityIncrease: number;
  resistIncrease: number;
  weakReduction: number;
  severeWeakReduction: number;
  newSevereWeaknessCount: number;
  offenseImprovedTypes: TypeName[];
  offenseWorsenedTypes: TypeName[];
  newSuperEffectiveTargets: number;
};

export type TypeCandidateScore = {
  type: TypeName;
  typeJa: string;
  score: number;
  reasons: string[];
  beforeSummary: TeamSummary;
  afterSummary: TeamSummary;
  delta: CandidateDelta;
};

export type PokemonCandidateScore = {
  pokemon: PokemonEntry;
  score: number;
  reasons: string[];
  beforeSummary: TeamSummary;
  afterSummary: TeamSummary;
  delta: CandidateDelta;
};
