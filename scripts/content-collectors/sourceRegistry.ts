import {
  POKEMON_NEWS_SOURCE_REGISTRY,
  listPokemonNewsSources,
  type PokemonNewsSourceDefinition
} from "../../lib/pokemonNewsSources";
import type { PokemonContentSource } from "../../types/pokemonContent";
import type { ContentSourceConfig } from "./types";

export const CONTENT_SOURCE_AUDIT = Object.fromEntries(
  listPokemonNewsSources().map((source) => [
    source.id,
    {
      sourceName: source.name,
      domain: new URL(source.homepageUrl).hostname,
      officialPageUrl: source.homepageUrl,
      feedOrListUrl: source.feedUrl ?? source.adminCheckUrl,
      checkedAt: source.lastCheckedAt,
      rssResult: source.rssAvailable ? "official-feed-found" : "not-found",
      apiResult: source.apiAvailable ? "available-not-approved" : "not-found",
      policyResult: source.policyFinding,
      automationAllowed:
        source.enabled &&
        source.automationStatus === "automatic" &&
        source.policyStatus === "approved",
      automationDecision: source.policyStatus,
      decisionReason: source.policyFinding,
      implemented: source.enabled ? "collector" : source.automationStatus === "manual" ? "manual" : "no"
    }
  ])
);

const pokemonGo: PokemonNewsSourceDefinition =
  POKEMON_NEWS_SOURCE_REGISTRY["pokemon-go-official-rss"];

export const CONTENT_SOURCE_REGISTRY: Record<
  PokemonContentSource,
  ContentSourceConfig
> = {
  "pokemon-go-official-rss": {
    id: "pokemon-go-official-rss",
    label: pokemonGo.name,
    feedUrl: pokemonGo.feedUrl!,
    robotsUrl: "https://pokemongo.com/robots.txt",
    termsUrl: "https://explore.scopely.com/terms",
    allowedDomains: [],
    automationAllowed:
      pokemonGo.enabled &&
      pokemonGo.automationStatus === "automatic" &&
      pokemonGo.policyStatus === "approved",
    policyNote: pokemonGo.policyFinding,
    requestDelayMs: 1_000,
    timeoutMs: 15_000,
    retries: 2,
    maxResponseBytes: 512_000,
    normalItemLimit: 20,
    backfillItemLimit: 50
  }
};

export function getContentSourceConfigs(
  source?: PokemonContentSource
): ContentSourceConfig[] {
  if (!source) return Object.values(CONTENT_SOURCE_REGISTRY);
  const config = CONTENT_SOURCE_REGISTRY[source];
  if (!config) throw new Error(`unknown-content-source: ${String(source)}`);
  return [config];
}
