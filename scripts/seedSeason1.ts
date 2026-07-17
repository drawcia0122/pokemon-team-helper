import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PokemonEntry, Regulation } from "../types/pokemon";

const pokemonPath = path.resolve(process.cwd(), "data/pokemon.json");
const season1Path = path.resolve(process.cwd(), "data/regulations/season1.json");

async function main() {
  const pokemon = JSON.parse(await readFile(pokemonPath, "utf8")) as PokemonEntry[];
  const season1 = JSON.parse(await readFile(season1Path, "utf8")) as Regulation;

  const nextSeason1: Regulation = {
    ...season1,
    allowedPokemonSlugs: pokemon.map((entry) => entry.slug)
  };

  await writeFile(season1Path, JSON.stringify(nextSeason1, null, 2) + "\n", "utf8");
  console.log(`[done] seeded ${nextSeason1.allowedPokemonSlugs.length} slugs into season1`);
}

main().catch((error) => {
  console.error("[fatal] seedSeason1 failed");
  console.error(error);
  process.exitCode = 1;
});
