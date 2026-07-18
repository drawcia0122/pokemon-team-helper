import type {
  BattleFormat,
  BuildArticleSource,
  TeamExtractionMethod
} from "../../types/buildArticle";
import type { AppMeta, PokemonEntry } from "../../types/pokemon";
import { classifyBuildArticle } from "./classify";
import {
  decodeHtml,
  normalizeComparableText,
  normalizeUrl,
  sourceArticleIdFromUrl,
  stripHtml
} from "./normalize";
import { createPokemonAliasMap } from "./pokemonAliases";
import type { ExtractionOutcome } from "./types";

type JsonLdRecord = Record<string, unknown>;

type Heading = {
  level: number;
  label: string;
  index: number;
  end: number;
};

type TeamCandidate = {
  method: TeamExtractionMethod;
  priority: number;
  sectionLabel: string;
  pokemonSlugs: string[] | null;
  rawCount: number;
  issue: string | null;
};

export type TeamExtractionResult =
  | {
      status: "complete";
      pokemonSlugs: string[];
      method: TeamExtractionMethod;
    }
  | {
      status: "metadata-only";
      pokemonSlugs: [];
      method: null;
      reason: string;
    };

const TEAM_SECTION_PATTERN =
  /(?:最終日?構築|大会使用構築|序盤構築|中盤構築|個体紹介|ポケモン紹介|採用個体|採用ポケモン|構築メンバー|パーティメンバー|パーティ紹介|構築紹介|メンバー紹介|使用ポケモン|個別解説|調整・役割|調整と役割|使用構築|構築と配分)/i;

function sectionPriority(label: string): number {
  if (/最終構築/i.test(label)) return 500;
  if (/最終日構築/i.test(label)) return 480;
  if (/大会使用構築/i.test(label)) return 450;
  if (/使用構築/i.test(label)) return 400;
  if (/パーティ紹介/i.test(label)) return 350;
  if (/中盤構築/i.test(label)) return 180;
  if (/序盤構築/i.test(label)) return 150;
  return 300;
}

function findJsonLdObjects(html: string): JsonLdRecord[] {
  const objects: JsonLdRecord[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const parsed: unknown = JSON.parse(decodeHtml(match[1]));
      if (parsed && typeof parsed === "object") {
        objects.push(parsed as JsonLdRecord);
      }
    } catch {
      // 壊れた構造化データは他の抽出方法へフォールバックする。
    }
  }
  return objects;
}

function collectJsonLdRecords(
  value: unknown,
  predicate: (record: JsonLdRecord) => boolean,
  results: JsonLdRecord[] = []
): JsonLdRecord[] {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectJsonLdRecords(entry, predicate, results);
    }
    return results;
  }
  if (!value || typeof value !== "object") {
    return results;
  }

  const record = value as JsonLdRecord;
  if (predicate(record)) results.push(record);
  for (const child of Object.values(record)) {
    collectJsonLdRecords(child, predicate, results);
  }
  return results;
}

function findJsonLdRecord(
  html: string,
  predicate: (record: JsonLdRecord) => boolean
): JsonLdRecord | null {
  for (const root of findJsonLdObjects(html)) {
    const record = collectJsonLdRecords(root, predicate)[0];
    if (record) return record;
  }
  return null;
}

function extractMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]).trim();
  }
  return null;
}

function getArticleBodyHtml(html: string): string {
  const bodyMarker = html.search(/data-name=["']body["']/i);
  if (bodyMarker < 0) return html;

  const endMarkers = [
    html.indexOf("o-supportAppealBox", bodyMarker),
    html.indexOf("__NUXT__", bodyMarker),
    html.indexOf("</article>", bodyMarker)
  ].filter((index) => index > bodyMarker);
  const end = endMarkers.length > 0 ? Math.min(...endMarkers) : html.length;
  return html.slice(bodyMarker, end);
}

function extractHeadings(html: string): Heading[] {
  return [
    ...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)
  ].map((match) => ({
    level: Number(match[1].slice(1)),
    label: stripHtml(match[2]),
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
}

function cleanPokemonLabel(value: string): string {
  return stripHtml(value)
    .replace(/^[①②③④⑤⑥]\s*/, "")
    .normalize("NFKC")
    .replace(/^\d{1,2}\s*[.．、:：)\]）]\s*/, "")
    .replace(/^[#・●○◆◇■□\-\s]+/, "")
    .replace(/^【(.+)】$/, "$1")
    .replace(/^\[(.+)\]$/, "$1")
    .replace(/\s*(?:@|＠).+$/, "")
    .replace(
      /\s*(?:の調整|調整|努力値|技構成|持ち物|特性|性格|テラスタイプ).*$/,
      ""
    )
    .trim();
}

export function createPokemonResolver(pokemon: PokemonEntry[]) {
  const aliases = new Map<string, Set<string>>();
  const explicitAliases = createPokemonAliasMap();
  const knownSlugs = new Set(pokemon.map((entry) => entry.slug));

  function register(alias: string, slug: string) {
    const key = normalizeComparableText(cleanPokemonLabel(alias));
    if (!key) return;
    const values = aliases.get(key) ?? new Set<string>();
    values.add(slug);
    aliases.set(key, values);
  }

  for (const entry of pokemon) {
    register(entry.nameJa, entry.slug);
    register(entry.nameEn, entry.slug);
    register(entry.slug, entry.slug);

    const mega = entry.nameJa.match(/^(.+)\(メガ\)$/i);
    if (mega) register(`メガ${mega[1]}`, entry.slug);
    const megaForm = entry.nameJa.match(/^(.+)\(メガ・([xy])\)$/i);
    if (megaForm) register(`メガ${megaForm[1]}${megaForm[2]}`, entry.slug);
  }

  for (const [alias, slug] of explicitAliases) {
    if (knownSlugs.has(slug)) {
      const values = aliases.get(alias) ?? new Set<string>();
      values.add(slug);
      aliases.set(alias, values);
    }
  }

  return (value: string): string | null => {
    const matches = aliases.get(
      normalizeComparableText(cleanPokemonLabel(value))
    );
    return matches?.size === 1 ? [...matches][0] : null;
  };
}

function resolveTeamCandidate(input: {
  names: string[];
  method: TeamExtractionMethod;
  priority: number;
  sectionLabel: string;
  resolvePokemon: (value: string) => string | null;
}): TeamCandidate {
  const resolved = input.names.map(input.resolvePokemon);
  let issue: string | null = null;
  if (input.names.length < 6) issue = `team-too-few-${input.names.length}`;
  if (input.names.length > 6) issue = `team-too-many-${input.names.length}`;
  if (resolved.some((slug) => slug === null)) issue = "team-unresolved-pokemon";
  const slugs = resolved.filter((slug): slug is string => slug !== null);
  if (slugs.length === 6 && new Set(slugs).size !== 6) {
    issue = "team-duplicate-pokemon";
  }

  return {
    method: input.method,
    priority: input.priority,
    sectionLabel: input.sectionLabel,
    pokemonSlugs:
      issue === null && slugs.length === 6 && new Set(slugs).size === 6
        ? slugs
        : null,
    rawCount: input.names.length,
    issue
  };
}

function extractStructuredTeamCandidates(
  html: string,
  resolvePokemon: (value: string) => string | null
): TeamCandidate[] {
  const candidates: TeamCandidate[] = [];
  for (const root of findJsonLdObjects(html)) {
    const itemLists = collectJsonLdRecords(
      root,
      (record) => String(record["@type"] ?? "") === "ItemList"
    );
    for (const itemList of itemLists) {
      const label = String(itemList.name ?? "使用構築");
      if (
        !TEAM_SECTION_PATTERN.test(label) ||
        !Array.isArray(itemList.itemListElement)
      ) {
        continue;
      }
      const names = itemList.itemListElement.map((entry) => {
        if (typeof entry === "string") return entry;
        if (!entry || typeof entry !== "object") return "";
        const record = entry as JsonLdRecord;
        const item =
          record.item && typeof record.item === "object"
            ? (record.item as JsonLdRecord)
            : record;
        return String(item.name ?? "");
      });
      candidates.push(
        resolveTeamCandidate({
          names,
          method: "structured-data",
          priority: sectionPriority(label),
          sectionLabel: label,
          resolvePokemon
        })
      );
    }
  }
  return candidates;
}

function numberedValue(value: string): number | null {
  const raw = stripHtml(value).trim();
  const circled = raw.match(/^([①②③④⑤⑥])/)?.[1];
  if (circled) return "①②③④⑤⑥".indexOf(circled) + 1;
  const normalized = raw.normalize("NFKC");
  const arabic = normalized.match(/^([1-6])\s*[.．、:：)\]）]/)?.[1];
  if (arabic) return Number(arabic);
  return null;
}

function extractTableNames(section: string): string[][] {
  const tables: string[][] = [];
  for (const tableMatch of section.matchAll(
    /<table\b[^>]*>([\s\S]*?)<\/table>/gi
  )) {
    const rows = [
      ...tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)
    ].map((row) =>
      [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(
        (cell) => stripHtml(cell[1])
      )
    );
    const headerIndex = rows.findIndex((row) =>
      row.some((cell) => /ポケモン|採用個体|メンバー/i.test(cell))
    );
    if (headerIndex < 0) continue;
    const pokemonColumn = rows[headerIndex].findIndex((cell) =>
      /ポケモン|採用個体|メンバー/i.test(cell)
    );
    const names = rows
      .slice(headerIndex + 1)
      .map((row) => row[pokemonColumn] ?? "")
      .filter(Boolean);
    if (names.length > 0) tables.push(names);
  }
  return tables;
}

function extractImageNames(section: string): string[] {
  const figureNames: string[] = [];
  for (const figure of section.matchAll(
    /<figure\b[^>]*>([\s\S]*?)<\/figure>/gi
  )) {
    const alt =
      figure[1].match(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
    const caption =
      figure[1].match(
        /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i
      )?.[1] ?? "";
    const candidate = cleanPokemonLabel(caption || decodeHtml(alt));
    if (candidate) figureNames.push(candidate);
  }
  if (figureNames.length > 0) return figureNames;

  return [
    ...section.matchAll(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/gi)
  ]
    .map((match) => cleanPokemonLabel(decodeHtml(match[1])))
    .filter(Boolean);
}

function extractSectionTeamCandidates(
  html: string,
  resolvePokemon: (value: string) => string | null
): {
  candidates: TeamCandidate[];
  sections: Array<{ label: string; priority: number; html: string }>;
} {
  const headings = extractHeadings(html);
  const candidates: TeamCandidate[] = [];
  const sections: Array<{ label: string; priority: number; html: string }> = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!TEAM_SECTION_PATTERN.test(heading.label)) continue;
    const boundary =
      headings
        .slice(index + 1)
        .find((candidate) => candidate.level <= heading.level)?.index ??
      html.length;
    const section = html.slice(heading.end, boundary);
    const priority = sectionPriority(heading.label);
    sections.push({ label: heading.label, priority, html: section });

    const childHeadings = extractHeadings(section);
    const childLevel = Math.min(
      ...childHeadings
        .map((child) => child.level)
        .filter((level) => level > heading.level)
    );
    const headingNames = Number.isFinite(childLevel)
      ? childHeadings
          .filter((child) => child.level === childLevel)
          .map((child) => child.label)
      : [];
    if (headingNames.length > 0) {
      const numbers = headingNames.map(numberedValue);
      const sequential = numbers.every(
        (value, childIndex) => value === childIndex + 1
      );
      candidates.push(
        resolveTeamCandidate({
          names: headingNames,
          method: sequential ? "numbered-items" : "section-headings",
          priority,
          sectionLabel: heading.label,
          resolvePokemon
        })
      );
    }

    const blocks = [
      ...section.matchAll(
        /<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/gi
      )
    ].map((match) => stripHtml(match[1]));
    const numbered = blocks.filter((block) => numberedValue(block) !== null);
    if (
      numbered.length > 0 &&
      numbered.every((value, blockIndex) => numberedValue(value) === blockIndex + 1)
    ) {
      candidates.push(
        resolveTeamCandidate({
          names: numbered,
          method: "numbered-items",
          priority,
          sectionLabel: heading.label,
          resolvePokemon
        })
      );
    }
    const marked = blocks.filter((block) =>
      /^(?:【.+】|■\s*\S+|\[.+\])/.test(block.trim())
    );
    if (marked.length > 0) {
      candidates.push(
        resolveTeamCandidate({
          names: marked,
          method: "numbered-items",
          priority,
          sectionLabel: heading.label,
          resolvePokemon
        })
      );
    }

    for (const tableNames of extractTableNames(section)) {
      candidates.push(
        resolveTeamCandidate({
          names: tableNames,
          method: "table",
          priority,
          sectionLabel: heading.label,
          resolvePokemon
        })
      );
    }

    const imageNames = extractImageNames(section);
    if (imageNames.length > 0) {
      candidates.push(
        resolveTeamCandidate({
          names: imageNames,
          method: "image-metadata",
          priority,
          sectionLabel: heading.label,
          resolvePokemon
        })
      );
    }
  }

  for (const tableNames of extractTableNames(html)) {
    candidates.push(
      resolveTeamCandidate({
        names: tableNames,
        method: "table",
        priority: 250,
        sectionLabel: "ポケモン表",
        resolvePokemon
      })
    );
  }

  return { candidates, sections };
}

function chooseTeamCandidate(candidates: TeamCandidate[]): TeamExtractionResult {
  if (candidates.length === 0) {
    return {
      status: "metadata-only",
      pokemonSlugs: [],
      method: null,
      reason: "team-section-not-found"
    };
  }

  const highestPriority = Math.max(...candidates.map((entry) => entry.priority));
  const highest = candidates.filter(
    (entry) => entry.priority === highestPriority
  );
  const validByTeam = new Map<string, TeamCandidate>();
  for (const candidate of highest) {
    if (candidate.pokemonSlugs) {
      validByTeam.set(candidate.pokemonSlugs.join(","), candidate);
    }
  }

  if (validByTeam.size === 1) {
    const selected = [...validByTeam.values()][0];
    return {
      status: "complete",
      pokemonSlugs: selected.pokemonSlugs!,
      method: selected.method
    };
  }
  if (validByTeam.size > 1) {
    return {
      status: "metadata-only",
      pokemonSlugs: [],
      method: null,
      reason: "multiple-equally-ranked-teams"
    };
  }

  const issues = highest.map((candidate) => candidate.issue).filter(Boolean);
  return {
    status: "metadata-only",
    pokemonSlugs: [],
    method: null,
    reason:
      issues.includes("team-unresolved-pokemon")
        ? "team-unresolved-pokemon"
        : issues.includes("team-duplicate-pokemon")
          ? "team-duplicate-pokemon"
          : (issues[0] ?? "team-not-exactly-six")
  };
}

export function extractPokemonTeamDetailed(
  html: string,
  pokemon: PokemonEntry[]
): TeamExtractionResult {
  const resolver = createPokemonResolver(pokemon);
  const structured = extractStructuredTeamCandidates(html, resolver);
  const sectionResult = extractSectionTeamCandidates(
    getArticleBodyHtml(html),
    resolver
  );
  return chooseTeamCandidate([...structured, ...sectionResult.candidates]);
}

export function extractPokemonTeam(
  html: string,
  pokemon: PokemonEntry[]
): string[] | null {
  const result = extractPokemonTeamDetailed(html, pokemon);
  return result.status === "complete" ? result.pokemonSlugs : null;
}

function extractBlogPosting(html: string): JsonLdRecord | null {
  return findJsonLdRecord(
    html,
    (record) => String(record["@type"] ?? "") === "BlogPosting"
  );
}

function extractTitle(html: string, posting: JsonLdRecord | null): string {
  const jsonLdTitle = String(posting?.headline ?? "").trim();
  if (jsonLdTitle) return jsonLdTitle;
  const ogTitle = extractMetaContent(html, "og:title");
  if (ogTitle) return ogTitle.replace(/\s*[｜|]\s*[^｜|]+$/, "").trim();
  return stripHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
}

function extractAuthor(html: string, posting: JsonLdRecord | null): string {
  const author = posting?.author;
  if (author && typeof author === "object") {
    const name = String((author as JsonLdRecord).name ?? "").trim();
    if (name) return name;
  }
  return (
    extractMetaContent(html, "author") ??
    stripHtml(
      html.match(
        /<(?:a|span)\b[^>]*(?:class=["'][^"']*(?:author|creator)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:a|span)>/i
      )?.[1] ?? ""
    )
  );
}

function extractPublishedAt(
  html: string,
  posting: JsonLdRecord | null
): string {
  const jsonLdDate = String(posting?.datePublished ?? "").trim();
  if (jsonLdDate) return jsonLdDate;
  const iso = html.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[\d.]+[+-]\d{2}:\d{2}/
  )?.[0];
  if (iso) return iso;
  const japanese = stripHtml(html).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  return japanese
    ? `${japanese[1]}-${japanese[2].padStart(2, "0")}-${japanese[3].padStart(2, "0")}T00:00:00+09:00`
    : "";
}

function extractTags(posting: JsonLdRecord | null): string[] {
  const keywords = posting?.keywords;
  const values = Array.isArray(keywords)
    ? keywords.map(String)
    : typeof keywords === "string"
      ? keywords.split(/[,、]/)
      : [];
  return [
    ...new Set(
      values
        .map((tag) => stripHtml(tag).trim())
        .filter((tag) => tag.length > 0 && tag.length <= 40)
    )
  ].slice(0, 8);
}

function formatInScope(scope: string): BattleFormat | "ambiguous" | null {
  const single = /シングル(?:バトル)?|singles?/i.test(scope);
  const double = /ダブル(?:バトル)?|doubles?|\bVGC\b/i.test(scope);
  if (single && double) return "ambiguous";
  if (single) return "single";
  if (double) return "double";
  return null;
}

function extractBattleFormat(
  title: string,
  tags: string[],
  introduction: string,
  teamContext: string,
  text: string
): BattleFormat | null {
  for (const scope of [
    tags.join(" "),
    title,
    introduction,
    teamContext,
    text
  ]) {
    const result = formatInScope(scope);
    if (result === "ambiguous") return null;
    if (result) return result;
  }
  return null;
}

function seasonIdsInScope(scope: string, appMeta: AppMeta): string[] {
  const values = new Set<string>();
  for (const match of scope.normalize("NFKC").matchAll(
    /(?:シーズン|season)?\s*M\s*[-‐‑‒–—ー]?\s*([1-9]\d*)/gi
  )) {
    const id = `season-m${match[1]}`;
    if (appMeta.seasonIds.includes(id)) values.add(id);
  }
  return [...values];
}

function extractSeason(
  title: string,
  introduction: string,
  teamContext: string,
  appMeta: AppMeta
): string | null {
  for (const scope of [title, introduction, teamContext]) {
    const seasons = seasonIdsInScope(scope, appMeta);
    if (seasons.length > 1) return null;
    if (seasons.length === 1) return seasons[0];
  }
  return null;
}

function regulationIdsInScope(scope: string): string[] {
  const values = new Set<string>();
  const normalized = scope.normalize("NFKC");
  for (const match of normalized.matchAll(
    /(?:reg(?:ulation)?\.?|レギュレーション)\s*M\s*[-‐‑‒–—ー]?\s*([A-Z])|\bM\s*[-‐‑‒–—ー]\s*([A-Z])\b/gi
  )) {
    const letter = match[1] ?? match[2];
    if (letter) values.add(`M-${letter.toUpperCase()}`);
  }
  return [...values];
}

function extractRegulation(
  title: string,
  tags: string[],
  introduction: string,
  teamContext: string
): string | null {
  for (const scope of [tags.join(" "), title, introduction, teamContext]) {
    const regulations = regulationIdsInScope(scope);
    if (regulations.length > 1) return null;
    if (regulations.length === 1) return regulations[0];
  }
  return null;
}

function extractResult(title: string, text: string): string | null {
  const scope = `${title}\n${text.slice(0, 5000)}`;
  const patterns = [
    /最終(?:順位)?\s*\d{1,7}\s*位/i,
    /最終(?:レート|R)\s*[:：]?\s*\d{3,5}(?:\.\d+)?/i,
    /最高(?:順位)?\s*\d{1,7}\s*位/i,
    /瞬間(?:順位)?\s*\d{1,7}\s*位/i,
    /最高(?:レート|R)\s*[:：]?\s*\d{3,5}(?:\.\d+)?/i,
    /レート\s*\d{3,5}(?:\.\d+)?\s*到達/i,
    /大会\s*\d{1,7}\s*位/i,
    /予選\s*\d+\s*勝\s*\d+\s*敗/i,
    /(?:マスターボール級|マスター級|チャンピオン級)(?:到達)?/i,
    /(?:優勝|準優勝|TOP\s*\d+)/i
  ];
  for (const pattern of patterns) {
    const value = scope.match(pattern)?.[0]?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return null;
}

function createSummary(fields: {
  seasonLabel: string;
  battleFormat: BattleFormat;
  result: string | null;
  leadPokemonName: string | null;
}): string {
  const format = fields.battleFormat === "single" ? "シングル" : "ダブル";
  const result = fields.result ? `${fields.result}。` : "";
  if (!fields.leadPokemonName) {
    return `${fields.seasonLabel}の${format}構築記事です。${result}採用ポケモンと構築の詳細は元記事で確認できます。`.slice(
      0,
      120
    );
  }
  return `${fields.seasonLabel}の${format}で使用された、${fields.leadPokemonName}入りの構築記事です。${result}採用ポケモン6体と構築経緯を確認できます。`.slice(
    0,
    120
  );
}

function isValidPublishedAt(value: string): boolean {
  return value !== "" && !Number.isNaN(Date.parse(value));
}

function hasPaywallBeforeCompleteBody(html: string): boolean {
  return (
    /購入して全文を読む|ここから先は有料|メンバーシップ限定|フォロワー限定/i.test(
      html
    ) || /"isPaid"\s*:\s*true/i.test(html)
  );
}

export function extractArticleFromHtml(input: {
  source: BuildArticleSource;
  url: string;
  html: string;
  appMeta: AppMeta;
  pokemon: PokemonEntry[];
}): ExtractionOutcome {
  const posting = extractBlogPosting(input.html);
  const bodyHtml = getArticleBodyHtml(input.html);
  const text = stripHtml(bodyHtml);
  const introduction = text.slice(0, 1800);
  const sections = extractSectionTeamCandidates(
    bodyHtml,
    createPokemonResolver(input.pokemon)
  ).sections.sort((a, b) => b.priority - a.priority);
  const teamContext = stripHtml(sections[0]?.html ?? "").slice(0, 2500);
  const title = extractTitle(input.html, posting);
  const authorName = extractAuthor(input.html, posting);
  const publishedAt = extractPublishedAt(input.html, posting);
  const tags = extractTags(posting);
  const canonicalCandidate =
    String(posting?.mainEntityOfPage ?? "").trim() ||
    extractMetaContent(input.html, "og:url") ||
    input.url;

  if (hasPaywallBeforeCompleteBody(input.html)) {
    return { status: "excluded", reason: "paid-or-restricted-content" };
  }
  if (!title) return { status: "excluded", reason: "missing-title" };
  if (!authorName) return { status: "excluded", reason: "missing-author" };
  if (!isValidPublishedAt(publishedAt)) {
    return { status: "excluded", reason: "missing-or-invalid-published-at" };
  }

  let canonicalUrl: string;
  try {
    canonicalUrl = normalizeUrl(canonicalCandidate);
    const canonical = new URL(canonicalUrl);
    const expectedHostname =
      input.source === "note" ? "note.com" : "pokesol.app";
    if (
      canonical.protocol !== "https:" ||
      canonical.hostname !== expectedHostname
    ) {
      return { status: "excluded", reason: "invalid-canonical-url" };
    }
  } catch {
    return { status: "excluded", reason: "invalid-canonical-url" };
  }

  const team = extractPokemonTeamDetailed(bodyHtml, input.pokemon);
  const battleFormat = extractBattleFormat(
    title,
    tags,
    introduction,
    teamContext,
    text
  );
  const builderSeasonId = extractSeason(
    title,
    introduction,
    teamContext,
    input.appMeta
  );
  const explicitRegulation = extractRegulation(
    title,
    tags,
    introduction,
    teamContext
  );
  const season = input.appMeta.seasons.find(
    (definition) => definition.id === builderSeasonId
  );
  const regulationId = explicitRegulation ?? season?.regulationId ?? null;
  if (
    explicitRegulation &&
    season &&
    explicitRegulation !== season.regulationId
  ) {
    return { status: "excluded", reason: "season-regulation-conflict" };
  }

  const classification = classifyBuildArticle({
    title,
    text,
    tags,
    battleFormat,
    builderSeasonId,
    regulationId,
    hasExplicitTeamSection: sections.length > 0,
    hasExactTeam: team.status === "complete"
  });
  if (!classification.accepted) {
    return { status: "excluded", reason: classification.reason };
  }
  if (!season || !regulationId || !battleFormat || !builderSeasonId) {
    return { status: "excluded", reason: "missing-required-metadata" };
  }

  const pokemonMap = new Map(input.pokemon.map((entry) => [entry.slug, entry]));
  const result = extractResult(title, text);
  const complete = team.status === "complete";
  const pokemonSlugs = complete ? team.pokemonSlugs : [];
  return {
    status: "accepted",
    article: {
      canonicalUrl,
      sourceArticleId:
        sourceArticleIdFromUrl(input.source, canonicalUrl) ??
        sourceArticleIdFromUrl(input.source, input.url),
      title,
      authorName,
      publishedAt: new Date(publishedAt).toISOString(),
      battleFormat,
      regulationId,
      builderSeasonId,
      result,
      pokemonSlugs,
      tags: [...new Set([...tags, season.articleLabel, battleFormat])].slice(
        0,
        8
      ),
      summary: createSummary({
        seasonLabel: season.articleLabel,
        battleFormat,
        result,
        leadPokemonName: complete
          ? (pokemonMap.get(pokemonSlugs[0])?.nameJa ?? pokemonSlugs[0])
          : null
      }),
      collectionCompleteness: complete ? "complete" : "metadata-only",
      extractionConfidence: complete ? 1 : 0.9,
      missingFields: complete ? [] : ["pokemonSlugs"],
      teamExtractionMethod: complete ? team.method : null,
      teamExtractionIssue: complete ? null : team.reason
    }
  };
}
