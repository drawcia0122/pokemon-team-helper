import contentData from "@/data/pokemonContent.json";
import pokemonData from "@/data/pokemon.json";
import { getContentStatuses } from "@/lib/contentStatus";
import { validatePokemonContent } from "@/lib/validatePokemonContent";
import type { PokemonContentItem } from "@/types/pokemonContent";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const known = new Set(pokemonData.map((entry) => entry.slug));
const valid = contentData as PokemonContentItem[];
assert(validatePokemonContent(valid, known).length === 0, "正常なコンテンツを読み取れません");

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
