import { getSiteNavigationState, siteNavigationItems } from "@/lib/siteNavigation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(siteNavigationItems.length === 4, "ナビゲーションリンクが4件ではありません");
assert(
  JSON.stringify(siteNavigationItems.map((item) => item.href)) ===
    JSON.stringify(["/", "/builds", "/news", "/environment"]),
  "ナビゲーションのリンク先が不正です"
);

for (const active of ["team", "builds", "news", "environment"]) {
  const state = getSiteNavigationState(active);
  assert(state.filter((item) => item.isCurrent).length === 1, `${active}だけをactiveにできません`);
  assert(state.find((item) => item.isCurrent)?.key === active, `${active}へaria-currentを付けられません`);
}

assert(
  getSiteNavigationState("unknown").every((item) => !item.isCurrent),
  "未知のactive値で誤った項目がactiveになります"
);

console.log("[ok] 共通ナビゲーションのリンクとactive状態を検証しました");
