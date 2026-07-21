import policyData from "@/data/pokemonFormPolicy.json";
import type {
  PokemonFormKind,
  PokemonFormSelection
} from "@/types/pokemon";

type FormPolicyOverride = {
  formKind?: PokemonFormKind;
  formSelection?: PokemonFormSelection;
  labelJa?: string;
};

type PokemonFormPolicy = {
  version: number;
  description: string;
  selectionByKind: Record<PokemonFormKind, PokemonFormSelection>;
  overrides: Record<string, FormPolicyOverride>;
};

export type PokemonFormSource = {
  slug: string;
  isDefaultForm: boolean;
  isBattleOnly: boolean;
  isMega: boolean;
};

export const pokemonFormPolicy = policyData as PokemonFormPolicy;

const regionalSuffixes = ["-alola", "-galar", "-hisui", "-paldea"];

export function inferPokemonFormKind(source: PokemonFormSource): PokemonFormKind {
  if (source.isMega) return "mega";
  if (source.slug.endsWith("-gmax")) return "gmax";
  if (source.isBattleOnly) return "battle-only";
  if (source.slug.endsWith("-female")) return "gender";
  if (regionalSuffixes.some((suffix) => source.slug.includes(suffix))) return "regional";
  if (source.isDefaultForm) return "base";
  return "standard";
}

export function resolvePokemonFormPolicy(source: PokemonFormSource): {
  formKind: PokemonFormKind;
  formSelection: PokemonFormSelection;
} {
  const override = pokemonFormPolicy.overrides[source.slug];
  const formKind = override?.formKind ?? inferPokemonFormKind(source);
  return {
    formKind,
    formSelection: override?.formSelection ?? pokemonFormPolicy.selectionByKind[formKind]
  };
}

export function getPokemonFormLabel(slug: string, fallback: string): string {
  return pokemonFormPolicy.overrides[slug]?.labelJa ?? fallback;
}
