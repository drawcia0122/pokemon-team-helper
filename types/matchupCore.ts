import type { AdvisorEvidenceConfidence } from "@/lib/advisorEvidence";
import type { AdvisorSpeedMatchup } from "@/lib/advisorMoveQuality";
import type { ThreatEnvironmentAbility, ThreatEnvironmentMove } from "@/types/environmentThreat";
import type { TypeName } from "@/types/pokemon";

export type MatchupVerdict =
  | "hard-answer"
  | "favorable"
  | "soft-check"
  | "emergency-check"
  | "utility-only"
  | "volatile"
  | "unfavorable"
  | "hard-lost"
  | "unknown";

export type AbilityDenialCategory =
  | "SetupDenial"
  | "StatDropDenial"
  | "ResidualDamageDenial"
  | "StatusDenial"
  | "HazardDenial"
  | "TypeImmunity"
  | "DamageReduction"
  | "RecoverySupport"
  | "ContactPunish"
  | "EntryPunish"
  | "TrapDenial"
  | "WeatherDenial"
  | "PrioritySupport"
  | "SpeedControl"
  | "PivotSupport"
  | "Reflection"
  | "AbilitySuppression"
  | "PassiveProgress"
  | "DefensiveSnowballControl";

export type AbilityDenialSemantic = {
  category: AbilityDenialCategory;
  confidence: AdvisorEvidenceConfidence;
  source: "Semantic Combat Registry" | "TASK031 immunity registry";
  description: string;
};

export type AbilityDenialEntry = {
  ability: string;
  abilityName: string;
  adoptionRate: number;
  denialCategories: AbilityDenialCategory[];
  matchupValue: number;
  confidence: AdvisorEvidenceConfidence;
  explanations: string[];
};

export type AbilityDenialProfile = {
  pokemonSlug: string;
  entries: AbilityDenialEntry[];
  categoryCoverage: Partial<Record<AbilityDenialCategory, number>>;
  expectedValue: number;
  confidence: AdvisorEvidenceConfidence;
  unclassified: string[];
};

export type OffensiveProfile = {
  pokemonSlug: string;
  physicalUsageProbability: number;
  specialUsageProbability: number;
  mixedUsageProbability: number;
  primaryStabMoves: ThreatEnvironmentMove[];
  secondaryStabMoves: ThreatEnvironmentMove[];
  commonCoverageMoves: ThreatEnvironmentMove[];
  priorityMoves: ThreatEnvironmentMove[];
  setupMoves: ThreatEnvironmentMove[];
  statusUtilityMoves: ThreatEnvironmentMove[];
  effectiveSpeedProfile: { minimum: number; typical: number; maximum: number } | null;
  offensiveAbilityModifiers: Array<{ id: string; adoptionRate: number; multiplier: number }>;
  offensiveItemModifiers: Array<{ id: string; adoptionRate: number; multiplier: number }>;
  weatherModifiers: Array<{ weather: "sun" | "rain" | "sand" | "snow"; adoptionRate: number }>;
  fieldModifiers: string[];
  moveAdoptionRate: number;
  evidenceConfidence: AdvisorEvidenceConfidence;
  unclassifiedRate: number;
};

export type DefensiveResponseProfile = {
  pokemonSlug: string;
  physicalBulk: number;
  specialBulk: number;
  typeResistances: TypeName[];
  typeImmunities: TypeName[];
  abilityImmunities: TypeName[];
  setupDenial: number;
  statDropDenial: number;
  residualDamageDenial: number;
  statusDenial: number;
  recoveryAvailability: number;
  recoveryAdoptionRate: number;
  pivotCapability: number;
  speedControl: number;
  revengeCapability: number;
  emergencyTradeCapability: number;
  hazardSensitivity: number;
  weatherSensitivity: number;
  evidenceConfidence: AdvisorEvidenceConfidence;
  unclassifiedRate: number;
};

export type MatchupEvidence = {
  candidate: string;
  threat: string;
  verdict: MatchupVerdict;
  confidence: AdvisorEvidenceConfidence;
  survivalScore: number;
  returnPressure: number;
  favorableProbability: number;
  speedRelation: AdvisorSpeedMatchup["relation"];
  candidateCommonMoves: ThreatEnvironmentMove[];
  threatCommonMoves: ThreatEnvironmentMove[];
  candidateAbilities: ThreatEnvironmentAbility[];
  threatAbilities: ThreatEnvironmentAbility[];
  itemEvidence: string[];
  weatherEvidence: string[];
  recoveryEvidence: string[];
  denialEvidence: string[];
  utilityEvidence: string[];
  adoptionRates: Array<{ id: string; rate: number }>;
  unclassifiedEvidence: string[];
  explanation: string[];
};

export type DefensiveCoreProfile = {
  members: string[];
  physicalResponse: number;
  specialResponse: number;
  setupDenial: number;
  residualDamageDenial: number;
  statusResponse: number;
  hazardResponse: number;
  statDropDenial: number;
  recoveryCoverage: number;
  pivotCoverage: number;
  immunityCoverage: number;
  emergencyCheckCoverage: number;
  passiveProgress: number;
  winConditionPotential: number;
  sharedVulnerabilities: TypeName[];
  commonBreakers: string[];
  denialRedundancy: number;
  denialDiversity: number;
  redundancyBonus: number;
  roleOverlapPenalty: number;
  cycleViability: number;
  coreSynergy: number;
  coreReliability: number;
  coreConfidence: AdvisorEvidenceConfidence;
  explanations: string[];
  unclassified: string[];
};
