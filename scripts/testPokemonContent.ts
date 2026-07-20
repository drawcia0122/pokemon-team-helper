import generatedContentData from "@/data/pokemonContent.generated.json";
import manualContentData from "@/data/pokemonContent.manual.json";
import collectionStatusData from "@/data/pokemonContentCollectionStatus.json";
import pokemonData from "@/data/pokemon.json";
import { getContentStatuses } from "@/lib/contentStatus";
import { mergePokemonContent } from "@/lib/pokemonContent";
import { validatePokemonContentCollectionState } from "@/lib/validatePokemonContentCollection";
import { validatePokemonContent } from "@/lib/validatePokemonContent";
import type { GeneratedPokemonContentItem, PokemonContentItem } from "@/types/pokemonContent";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const known = new Set(pokemonData.map((entry) => entry.slug));
const manual = manualContentData as PokemonContentItem[];
const generated = generatedContentData as GeneratedPokemonContentItem[];
const valid = [...manual, ...generated];
assert(validatePokemonContent(valid, known).length === 0, "正常なコンテンツを読み取れません");
assert(
  validatePokemonContentCollectionState(collectionStatusData, generated).length === 0,
  "正常な収集状態を読み取れません"
);
assert(manual.length === 7, "既存の手動コンテンツ7件が維持されていません");

const generatedDuplicate = {
  ...(generated[0] ?? {
    ...manual[0],
    source: "pokemon-go-official-rss",
    sourceArticleId: "duplicate",
    canonicalUrl: manual[0].url,
    firstCollectedAt: "2026-07-20T00:00:00.000Z",
    lastCollectedAt: "2026-07-20T00:00:00.000Z",
    contentFingerprint: "a".repeat(64),
    collectorVersion: "1.0.0",
    status: "active"
  }),
  id: "generated-duplicate",
  url: manual[0].url,
  canonicalUrl: manual[0].url
} as GeneratedPokemonContentItem;
assert(
  mergePokemonContent(manual, [generatedDuplicate]).length === manual.length,
  "同じURLでは手動コンテンツを優先できません"
);

const base = valid[0];
assert(base, "テスト用コンテンツがありません");
const invalidCases: Array<[string, PokemonContentItem[]]> = [
  ["重複ID", [base, { ...base }]],
  ["不正URL", [{ ...base, url: "http://example.com" }]],
  ["不正日付", [{ ...base, publishedAt: "2026-02-30" }]],
  ["不正slug", [{ ...base, pokemonSlugs: ["missing"] }]],
  ["イベント日順", [{ ...base, eventStartDate: "2026-08-02", eventEndDate: "2026-08-01" }]],
  ["予約日順", [{ ...base, preorderStartDate: "2026-08-02", preorderDeadlineDate: "2026-08-01" }]]
];
for (const [name, items] of invalidCases) {
  assert(validatePokemonContent(items, known).length > 0, `${name}を拒否できません`);
}

const timed = (values: Partial<PokemonContentItem>) => ({ ...base, ...values });
assert(getContentStatuses(timed({ preorderStartDate: "2026-07-10", preorderDeadlineDate: "2026-07-24" }), "2026-07-18").includes("preorder-open"), "予約受付中を判定できません");
assert(getContentStatuses(timed({ preorderStartDate: "2026-07-10", preorderDeadlineDate: "2026-07-24" }), "2026-07-18").includes("deadline-soon"), "締切間近を判定できません");
assert(getContentStatuses(timed({ preorderStartDate: "2026-07-01", preorderDeadlineDate: "2026-07-10" }), "2026-07-18").includes("preorder-ended"), "受付終了を判定できません");
assert(getContentStatuses(timed({ eventStartDate: "2026-07-20", eventEndDate: "2026-07-30" }), "2026-07-18").includes("event-upcoming"), "開催予定を判定できません");
assert(getContentStatuses(timed({ eventStartDate: "2026-07-10", eventEndDate: "2026-07-20" }), "2026-07-18").includes("event-ongoing"), "開催中を判定できません");
assert(getContentStatuses(timed({ eventStartDate: "2026-07-01", eventEndDate: "2026-07-10" }), "2026-07-18").includes("event-ended"), "開催終了を判定できません");

console.log("[ok] コンテンツ検証と日付状態を検証しました");
