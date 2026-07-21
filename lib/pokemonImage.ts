const POKEAPI_SPRITE_ORIGIN = "https://raw.githubusercontent.com";
const POKEAPI_SPRITE_PATH_PREFIX =
  "/PokeAPI/sprites/master/sprites/pokemon/";
const POKEAPI_SPRITE_PATH_PATTERN =
  /^\/PokeAPI\/sprites\/master\/sprites\/pokemon\/([1-9]\d*)\.png$/;

const NATIONAL_DEX_ID_RANGE = {
  min: 1,
  max: 1025
} as const;
const FORM_ID_RANGE = {
  min: 10001,
  max: 10325
} as const;

export const POKEMON_SPRITE_IMAGE_ORIGIN = POKEAPI_SPRITE_ORIGIN;

export const UNSUPPORTED_POKEMON_SPRITE_IDS = [
  10158,
  10159,
  10264,
  10265,
  10266,
  10267,
  10268,
  10269,
  10270,
  10271,
  10301
] as const;

const unsupportedPokemonSpriteIds = new Set<number>(
  UNSUPPORTED_POKEMON_SPRITE_IDS
);

function isKnownPokemonId(value: unknown): value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    return false;
  }

  return (
    (value >= NATIONAL_DEX_ID_RANGE.min &&
      value <= NATIONAL_DEX_ID_RANGE.max) ||
    (value >= FORM_ID_RANGE.min && value <= FORM_ID_RANGE.max)
  );
}

export function isAllowedPokemonSpriteUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    const match = POKEAPI_SPRITE_PATH_PATTERN.exec(url.pathname);
    return (
      url.protocol === "https:" &&
      url.origin === POKEAPI_SPRITE_ORIGIN &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === "" &&
      match !== null &&
      isKnownPokemonId(Number(match[1])) &&
      !unsupportedPokemonSpriteIds.has(Number(match[1]))
    );
  } catch {
    return false;
  }
}

export function resolvePokemonSpriteUrl(
  pokemon: { id?: unknown } | null | undefined
): string | null {
  const id = pokemon?.id;
  if (!isKnownPokemonId(id) || unsupportedPokemonSpriteIds.has(id)) {
    return null;
  }

  const url = `${POKEAPI_SPRITE_ORIGIN}${POKEAPI_SPRITE_PATH_PREFIX}${id}.png`;
  return isAllowedPokemonSpriteUrl(url) ? url : null;
}

export type PokemonImageState = "loading" | "image" | "fallback";

export function resolvePokemonImageState(input: {
  spriteUrl: string | null;
  loadedImageUrl: string | null;
  failedImageUrl: string | null;
}): PokemonImageState {
  if (
    input.spriteUrl === null ||
    input.failedImageUrl === input.spriteUrl
  ) {
    return "fallback";
  }

  return input.loadedImageUrl === input.spriteUrl ? "image" : "loading";
}
