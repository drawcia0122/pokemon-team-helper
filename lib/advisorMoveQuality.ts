import type { ThreatEnvironmentMove } from "@/types/environmentThreat";
import type { PokemonEntry } from "@/types/pokemon";

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

export const ADVISOR_MOVE_QUALITY_RULES = {
  minimumReliablePower: 70,
  minimumReliableShare: 0.1,
  minimumAttackingStat: 100,
  minimumStabMultiplier: 1.5
} as const;

export function getAdvisorMovePower(moveId: string): number | null {
  return MOVE_POWER[moveId] ?? null;
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
