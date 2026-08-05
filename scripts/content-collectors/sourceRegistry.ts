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
const fourGamer = POKEMON_NEWS_SOURCE_REGISTRY["4gamer-rss"];
const inside = POKEMON_NEWS_SOURCE_REGISTRY["inside-rss"];
const gnews = POKEMON_NEWS_SOURCE_REGISTRY["gnews-api"];

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
  },
  "4gamer-rss": {
    id: "4gamer-rss",
    label: fourGamer.name,
    feedUrl: fourGamer.feedUrl!,
    feedUrls: [fourGamer.feedUrl!],
    robotsUrl: "https://www.4gamer.net/robots.txt",
    termsUrl: "https://www.4gamer.net/rss/rss.shtml",
    allowedDomains: ["www.4gamer.net", "4gamer.net"],
    automationAllowed: fourGamer.enabled && fourGamer.policyStatus === "approved",
    policyNote: fourGamer.policyFinding,
    requestDelayMs: 1_000,
    timeoutMs: 15_000,
    retries: 2,
    maxResponseBytes: 2_000_000,
    normalItemLimit: 250,
    backfillItemLimit: 500
  },
  "inside-rss": {
    id: "inside-rss",
    label: inside.name,
    feedUrl: inside.feedUrl!,
    feedUrls: [
      "https://www.inside-games.jp/rss/index.rdf",
      "https://www.inside-games.jp/rss/nintendo.rdf",
      "https://www.inside-games.jp/rss/mobile.rdf"
    ],
    robotsUrl: "https://www.inside-games.jp/robots.txt",
    termsUrl: "https://www.inside-games.jp/rss/",
    allowedDomains: ["www.inside-games.jp", "inside-games.jp"],
    automationAllowed: inside.enabled && inside.policyStatus === "approved",
    policyNote: inside.policyFinding,
    requestDelayMs: 1_000,
    timeoutMs: 15_000,
    retries: 2,
    maxResponseBytes: 1_000_000,
    normalItemLimit: 100,
    backfillItemLimit: 250
  },
  "gnews-api": {
    id: "gnews-api",
    label: gnews.name,
    feedUrl: gnews.feedUrl!,
    feedUrls: [gnews.feedUrl!],
    robotsUrl: "https://gnews.io/robots.txt",
    termsUrl: "https://gnews.io/legal/terms-of-service",
    allowedDomains: ["gnews.io"],
    automationAllowed: gnews.enabled && gnews.policyStatus === "approved",
    policyNote: gnews.policyFinding,
    requestDelayMs: 1_000,
    timeoutMs: 15_000,
    retries: 1,
    maxResponseBytes: 1_000_000,
    normalItemLimit: 100,
    backfillItemLimit: 100,
    requiresApiKey: true
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
