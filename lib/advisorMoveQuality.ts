import type { ThreatEnvironmentMove } from "@/types/environmentThreat";
import type { ThreatEnvironmentPokemon } from "@/types/environmentThreat";
import type { PokemonEntry } from "@/types/pokemon";
import type { AdvisorEvidenceConfidence } from "@/lib/advisorEvidence";

/**
 * Environment snapshots intentionally contain only normalized move ids, type,
 * class and usage.  Keep the battle-oriented metadata separate so the source
 * snapshot schema does not have to change when more move facts are added.
 *
 * Unknown or variable-power moves return null and are never promoted from
 * coverage-only evidence to a reliable matchup answer.
 */
const MOVE_POWER: Record<string, number> = {
  accelerock: 40,
  airslash: 75,
  aquajet: 40,
  aquacutter: 70,
  armorcannon: 120,
  aurasphere: 80,
  avalanche: 60,
  bitterblade: 90,
  blazekick: 85,
  blizzard: 110,
  bodypress: 80,
  bravebird: 120,
  brickbreak: 75,
  bulletpunch: 40,
  bugbuzz: 90,
  ceaselessedge: 65,
  closecombat: 120,
  crabhammer: 100,
  crunch: 80,
  darkpulse: 80,
  dazzlinggleam: 80,
  discharge: 80,
  dracometeor: 130,
  dragonclaw: 80,
  dragonpulse: 85,
  drainingkiss: 50,
  drainpunch: 75,
  dualwingbeat: 40,
  earthquake: 100,
  earthpower: 90,
  electroshot: 130,
  energyball: 90,
  eruption: 150,
  extremespeed: 80,
  fierydance: 80,
  fireblast: 110,
  firefang: 65,
  flamethrower: 90,
  flareblitz: 120,
  flashcannon: 80,
  flipturn: 60,
  flowertrick: 70,
  focusblast: 120,
  foulplay: 95,
  freezedry: 70,
  gigadrain: 75,
  gigatonhammer: 160,
  gunkshot: 120,
  headlongrush: 120,
  headsmash: 150,
  heatwave: 95,
  highhorsepower: 95,
  highjumpkick: 130,
  hornleech: 75,
  hurricane: 110,
  hydropump: 110,
  hypervoice: 90,
  icebeam: 90,
  icehammer: 100,
  icepunch: 75,
  iceshard: 40,
  icespinner: 80,
  iciclecrash: 85,
  ironhead: 80,
  jetpunch: 60,
  knockoff: 65,
  kowtowcleave: 85,
  leafblade: 90,
  leafstorm: 130,
  liquidation: 85,
  lowkick: 80,
  machpunch: 40,
  makeitrain: 120,
  megahorn: 120,
  meteormash: 90,
  moonblast: 95,
  mudshot: 55,
  mysticalfire: 75,
  nightslash: 70,
  outrage: 120,
  overheat: 130,
  paraboliccharge: 65,
  playrough: 90,
  poisonjab: 80,
  poltergeist: 110,
  powergem: 80,
  powerwhip: 120,
  psychic: 90,
  psychicfangs: 85,
  psyshock: 80,
  quickattack: 40,
  razorshell: 75,
  rockslide: 75,
  rocktomb: 60,
  sacredsword: 90,
  scald: 80,
  scorchingsands: 70,
  seedbomb: 80,
  shadowball: 80,
  shadowclaw: 70,
  shadowsneak: 40,
  sludgebomb: 90,
  sludgewave: 95,
  solarbeam: 120,
  spiritbreak: 75,
  sparklingaria: 90,
  stoneedge: 100,
  suckerpunch: 70,
  surf: 90,
  supercellslam: 100,
  superpower: 120,
  thunder: 110,
  thunderbolt: 90,
  thunderpunch: 75,
  torchsong: 80,
  trailblaze: 50,
  tripleaxel: 60,
  uturn: 70,
  vacuumwave: 40,
  voltswitch: 70,
  volttackle: 120,
  waterfall: 80,
  wavecrash: 120,
  wildcharge: 90,
  woodhammer: 120,
  xscissor: 80,
  zenheadbutt: 80
};

const MOVE_ACCURACY: Record<string, number> = {
  blizzard: 0.7,
  fireblast: 0.85,
  focusblast: 0.7,
  gunkshot: 0.8,
  headsmash: 0.8,
  heatwave: 0.9,
  highjumpkick: 0.9,
  hurricane: 0.7,
  hydropump: 0.8,
  iciclecrash: 0.9,
  megahorn: 0.85,
  playrough: 0.9,
  rockslide: 0.9,
  stoneedge: 0.8,
  thunder: 0.7,
  tripleaxel: 0.9,
  wildcharge: 1,
  zapcannon: 0.5
};

export const ADVISOR_MOVE_QUALITY_RULES = {
  minimumReliablePower: 70,
  minimumReliableShare: 0.1,
  minimumAttackingStat: 100,
  minimumStabMultiplier: 1.5,
  highPressureMinimum: 1,
  mediumPressureMinimum: 0.62,
  insufficientPressureMaximum: 0.35
} as const;

export type AdvisorAttackPressureTier =
  | "high"
  | "medium"
  | "low"
  | "insufficient";

export type AdvisorAttackPressure = {
  power: number | null;
  accuracy: number;
  stabMultiplier: number;
  typeMultiplier: number;
  attackingStat: number | null;
  defensiveStat: number | null;
  adoptionRate: number;
  rawPressure: number;
  normalizedPressure: number;
  tier: AdvisorAttackPressureTier;
  confidence: AdvisorEvidenceConfidence;
};

export type AdvisorSpeedRange = {
  minimum: number;
  typical: number;
  maximum: number;
  confidence: AdvisorEvidenceConfidence;
};

export type AdvisorSpeedMatchup = {
  relation: "favored" | "variable" | "unfavored" | "unknown";
  confidence: AdvisorEvidenceConfidence;
};

export function getAdvisorMovePower(moveId: string): number | null {
  return MOVE_POWER[moveId] ?? null;
}

export function getAdvisorMoveAccuracy(moveId: string): number {
  return MOVE_ACCURACY[moveId] ?? 1;
}

export function evaluateAdvisorAttackPressure({
  move,
  attacker,
  defender,
  typeMultiplier
}: {
  move: ThreatEnvironmentMove;
  attacker: PokemonEntry;
  defender: PokemonEntry;
  typeMultiplier: number;
}): AdvisorAttackPressure {
  const power = getAdvisorMovePower(move.id);
  const accuracy = getAdvisorMoveAccuracy(move.id);
  const stabMultiplier = attacker.types.includes(move.type) ? 1.5 : 1;
  const attackingStat = attacker.baseStats
    ? move.damageClass === "physical"
      ? attacker.baseStats.attack
      : attacker.baseStats.specialAttack
    : null;
  const defensiveStat = defender.baseStats
    ? move.damageClass === "physical"
      ? defender.baseStats.defense
      : defender.baseStats.specialDefense
    : null;
  const rawPressure =
    power !== null && attackingStat !== null && defensiveStat !== null
      ? power *
        accuracy *
        stabMultiplier *
        typeMultiplier *
        (attackingStat / Math.max(1, defensiveStat)) *
        move.share
      : 0;
  const normalizedPressure = rawPressure / 160;
  const tier: AdvisorAttackPressureTier =
    normalizedPressure >= ADVISOR_MOVE_QUALITY_RULES.highPressureMinimum
      ? "high"
      : normalizedPressure >=
          ADVISOR_MOVE_QUALITY_RULES.mediumPressureMinimum
        ? "medium"
        : normalizedPressure <=
            ADVISOR_MOVE_QUALITY_RULES.insufficientPressureMaximum
          ? "insufficient"
          : "low";
  return {
    power,
    accuracy,
    stabMultiplier,
    typeMultiplier,
    attackingStat,
    defensiveStat,
    adoptionRate: move.share,
    rawPressure,
    normalizedPressure,
    tier,
    confidence:
      power === null || attackingStat === null || defensiveStat === null
        ? "low"
        : "medium"
  };
}

export function getAdvisorSpeedRange(
  pokemon: PokemonEntry,
  environment: ThreatEnvironmentPokemon | undefined
): AdvisorSpeedRange | null {
  const speed = pokemon.baseStats?.speed;
  if (typeof speed !== "number") return null;
  const scarfShare = environment?.choiceScarfShare ?? 0;
  return {
    minimum: speed * 0.9,
    typical: speed,
    maximum: speed * 1.1 * (scarfShare >= 0.1 ? 1.5 : 1),
    confidence: environment ? "medium" : "low"
  };
}

export function compareAdvisorSpeedRanges({
  candidate,
  threat,
  profile
}: {
  candidate: AdvisorSpeedRange | null;
  threat: AdvisorSpeedRange | null;
  profile: "standard" | "trick-room";
}): AdvisorSpeedMatchup {
  if (!candidate || !threat) {
    return { relation: "unknown", confidence: "low" };
  }
  const definitelyFavored =
    profile === "standard"
      ? candidate.minimum > threat.maximum
      : candidate.maximum < threat.minimum;
  const typicallyFavored =
    profile === "standard"
      ? candidate.typical > threat.typical
      : candidate.typical < threat.typical;
  const definitelyUnfavored =
    profile === "standard"
      ? candidate.maximum <= threat.minimum
      : candidate.minimum >= threat.maximum;
  if (definitelyFavored) return { relation: "favored", confidence: "high" };
  if (typicallyFavored) return { relation: "favored", confidence: "medium" };
  if (definitelyUnfavored) {
    return { relation: "unfavored", confidence: "medium" };
  }
  return { relation: "variable", confidence: "low" };
}

export function getAdvisorMoveQuality({
  move,
  attacker
}: {
  move: ThreatEnvironmentMove;
  attacker: PokemonEntry;
}): {
  power: number | null;
  stab: boolean;
  attackingStat: number | null;
  reliable: boolean;
} {
  const power = getAdvisorMovePower(move.id);
  const stab = attacker.types.includes(move.type);
  const attackingStat = attacker.baseStats
    ? move.damageClass === "physical"
      ? attacker.baseStats.attack
      : attacker.baseStats.specialAttack
    : null;
  return {
    power,
    stab,
    attackingStat,
    reliable:
      power !== null &&
      power >= ADVISOR_MOVE_QUALITY_RULES.minimumReliablePower &&
      move.share >= ADVISOR_MOVE_QUALITY_RULES.minimumReliableShare &&
      stab &&
      attackingStat !== null &&
      attackingStat >= ADVISOR_MOVE_QUALITY_RULES.minimumAttackingStat
  };
}
