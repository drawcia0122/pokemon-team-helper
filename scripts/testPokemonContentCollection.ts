import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import generatedData from "@/data/pokemonContent.generated.json";
import manualData from "@/data/pokemonContent.manual.json";
import pokemonData from "@/data/pokemon.json";
import { mergePokemonContent } from "@/lib/pokemonContent";
import { validatePokemonContent } from "@/lib/validatePokemonContent";
import {
  collectPokemonContent,
  collectPokemonContentForFixtureTest
} from "./content-collectors/collector";
import {
  SafeContentHttpClient,
  assertAllowedContentUrl,
  isPrivateContentIp
} from "./content-collectors/http";
import {
  canonicalizePokemonGoUrl,
  parsePokemonGoRss
} from "./content-collectors/pokemonGo";
import {
  CONTENT_SOURCE_AUDIT,
  CONTENT_SOURCE_REGISTRY,
  getContentSourceConfigs
} from "./content-collectors/sourceRegistry";
import type {
  ContentFetchClient,
  ContentSourceConfig,
  HttpResult
} from "./content-collectors/types";
import { parseContentCollectionArgs } from "./collectPokemonContent";
import type {
  GeneratedPokemonContentItem,
  PokemonContentItem,
  PokemonContentSource
} from "@/types/pokemonContent";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
const fixtureRoot = path.join(process.cwd(), "scripts/fixtures/content-collection");
const rss = await readFile(path.join(fixtureRoot, "pokemon-go-feed.rss.xml"), "utf8");
const invalidHtml = await readFile(path.join(fixtureRoot, "invalid-feed.html"), "utf8");
const parsed = parsePokemonGoRss(rss, 20);
const fixtureSourceConfig = {
  ...CONTENT_SOURCE_REGISTRY["pokemon-go-official-rss"],
  automationAllowed: true,
  allowedDomains: [
    "pokemongo.com",
    "www.pokemongo.com",
    "pokemongolive.com",
    "www.pokemongolive.com"
  ],
  requestDelayMs: 0
} satisfies ContentSourceConfig;
assert(parsed.candidates.length === 2, "正常なRSSと重複URLを解析できません");
assert(parsed.excludedReasons.includes("duplicate-feed-url"), "重複URLを除外できません");
assert(parsed.candidates[0]?.publishedAt === "2026-07-18", "RSS日付を変換できません");
assert(
  canonicalizePokemonGoUrl("https://pokemongolive.com/post/example/?hl=en&utm_source=test") ===
    "https://pokemongo.com/post/example/?hl=en",
  "Pokémon GO URLを正規化できません"
);

let invalidRejected = false;
try {
  parsePokemonGoRss(invalidHtml, 20);
} catch {
  invalidRejected = true;
}
assert(invalidRejected, "不正HTMLをRSSとして受理しています");

for (const value of [
  "http://pokemongo.com/feed",
  "https://example.com/feed",
  "https://localhost/feed",
  "https://127.0.0.1/feed"
]) {
  let rejected = false;
  try {
    assertAllowedContentUrl(value, fixtureSourceConfig.allowedDomains);
  } catch {
    rejected = true;
  }
  assert(rejected, `危険またはallowlist外URLを拒否できません: ${value}`);
}
assert(isPrivateContentIp("10.0.0.1"), "private IPv4を拒否できません");
assert(isPrivateContentIp("::1"), "loopback IPv6を拒否できません");

const redirectClient = new SafeContentHttpClient(
  fixtureSourceConfig,
  {
    ensurePublicHost: async () => {},
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/feed" }
      })
  }
);
const blockedRedirect = await redirectClient.fetchText("https://pokemongo.com/feed", "xml");
assert(!blockedRedirect.ok && blockedRedirect.reason === "blocked-redirect", "allowlist外redirectを拒否できません");

for (const location of ["https://localhost/feed", "https://127.0.0.1/feed"]) {
  const unsafeRedirectClient = new SafeContentHttpClient(fixtureSourceConfig, {
    ensurePublicHost: async () => {},
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: { location }
      })
  });
  const result = await unsafeRedirectClient.fetchText(
    "https://pokemongo.com/feed",
    "xml"
  );
  assert(
    !result.ok && result.reason === "blocked-redirect",
    `localhost/private IP redirectを拒否できません: ${location}`
  );
}

let privateDnsFetchCount = 0;
const privateDnsClient = new SafeContentHttpClient(fixtureSourceConfig, {
  ensurePublicHost: async () => {
    throw new Error("blocked-private-address");
  },
  fetchImpl: async () => {
    privateDnsFetchCount += 1;
    return new Response("", {
      status: 200,
      headers: { "content-type": "application/rss+xml" }
    });
  }
});
const privateDnsResult = await privateDnsClient.fetchText(
  "https://pokemongo.com/feed",
  "xml"
);
assert(
  !privateDnsResult.ok &&
    privateDnsResult.reason === "blocked-private-address" &&
    privateDnsFetchCount === 0,
  "DNS解決先がprivate IPの場合にfetchを停止できません"
);

class FixtureClient implements ContentFetchClient {
  callCount = 0;

  constructor(
    private readonly feedResult: HttpResult,
    private readonly robotsResult: HttpResult = {
      ok: true,
      url: "https://pokemongo.com/robots.txt",
      status: 200,
      contentType: "text/plain",
      text: "User-agent: *\nDisallow: /_api/\n"
    }
  ) {}

  async fetchText(value: string): Promise<HttpResult> {
    this.callCount += 1;
    return value.endsWith("robots.txt") ? this.robotsResult : this.feedResult;
  }
}

class CountingRejectClient implements ContentFetchClient {
  callCount = 0;

  async fetchText(): Promise<HttpResult> {
    this.callCount += 1;
    throw new Error("規約保留ソースへHTTP clientが呼び出されました");
  }
}

async function createTempRoot(generated: GeneratedPokemonContentItem[] = []) {
  const root = await mkdtemp(path.join(tmpdir(), "pokemon-content-test-"));
  await writeFile(path.join(root, "pokemon.json"), `${JSON.stringify(pokemonData)}\n`);
  await writeFile(path.join(root, "manual.json"), `${JSON.stringify(manualData)}\n`);
  await writeFile(path.join(root, "generated.json"), `${JSON.stringify(generated)}\n`);
  await writeFile(
    path.join(root, "status.json"),
    `${JSON.stringify({ version: 1, collectorVersion: "1.0.0", sources: {} })}\n`
  );
  return {
    root,
    paths: {
      pokemon: "pokemon.json",
      manual: "manual.json",
      generated: "generated.json",
      status: "status.json"
    }
  };
}

const successClient = new FixtureClient({
  ok: true,
  url: "https://pokemongo.com/feed",
  status: 200,
  contentType: "application/rss+xml",
  text: rss
});
const disabledTemp = await createTempRoot();
const disabledManualBefore = await readFile(
  path.join(disabledTemp.root, "manual.json"),
  "utf8"
);
const disabledGeneratedBefore = await readFile(
  path.join(disabledTemp.root, "generated.json"),
  "utf8"
);
const disabledStatusBefore = await readFile(
  path.join(disabledTemp.root, "status.json"),
  "utf8"
);
const disabledClient = new CountingRejectClient();
const disabled = await collectPokemonContent({
  rootDir: disabledTemp.root,
  paths: disabledTemp.paths,
  clients: { "pokemon-go-official-rss": disabledClient }
});
assert(
  disabled.sourceStats["pokemon-go-official-rss"]?.status ===
    "disabled-by-policy" &&
    disabled.communicatedDomains.length === 0 &&
    !disabled.failed &&
    !disabled.wroteFiles &&
    disabledClient.callCount === 0,
  "規約保留ソースを無通信で停止できません"
);
assert(
  (await readFile(path.join(disabledTemp.root, "manual.json"), "utf8")) ===
    disabledManualBefore &&
    (await readFile(path.join(disabledTemp.root, "generated.json"), "utf8")) ===
      disabledGeneratedBefore &&
    (await readFile(path.join(disabledTemp.root, "status.json"), "utf8")) ===
      disabledStatusBefore,
  "disabled-by-policy実行がJSONを変更しました"
);

const explicitDisabledClient = new CountingRejectClient();
const explicitDisabled = await collectPokemonContent({
  source: "pokemon-go-official-rss",
  rootDir: disabledTemp.root,
  paths: disabledTemp.paths,
  clients: { "pokemon-go-official-rss": explicitDisabledClient }
});
assert(
  explicitDisabled.sourceStats["pokemon-go-official-rss"]?.status ===
    "disabled-by-policy" &&
    explicitDisabledClient.callCount === 0 &&
    explicitDisabled.communicatedDomains.length === 0 &&
    !explicitDisabled.wroteFiles,
  "disabled sourceを明示指定した際に無通信で停止できません"
);

const unknownClient = new CountingRejectClient();
let unknownSourceRejected = false;
try {
  await collectPokemonContent({
    source: "unknown-source" as PokemonContentSource,
    rootDir: disabledTemp.root,
    paths: disabledTemp.paths,
    clients: { "pokemon-go-official-rss": unknownClient }
  });
} catch (error) {
  unknownSourceRejected =
    error instanceof Error && error.message.includes("unknown-content-source");
}
assert(
  unknownSourceRejected && unknownClient.callCount === 0,
  "unknown sourceを無通信で拒否できません"
);

const environmentClient = new CountingRejectClient();
const previousEnvironmentSource = process.env.CONTENT_SOURCE;
try {
  process.env.CONTENT_SOURCE = "pokemon-go-official-rss";
  await collectPokemonContent({
    rootDir: disabledTemp.root,
    paths: disabledTemp.paths,
    clients: { "pokemon-go-official-rss": environmentClient }
  });
} finally {
  if (previousEnvironmentSource === undefined) delete process.env.CONTENT_SOURCE;
  else process.env.CONTENT_SOURCE = previousEnvironmentSource;
}
assert(
  environmentClient.callCount === 0,
  "環境変数だけでpolicy gateを迂回できてしまいます"
);

const temp = await createTempRoot();
const first = await collectPokemonContentForFixtureTest({
  rootDir: temp.root,
  paths: temp.paths,
  clients: { "pokemon-go-official-rss": successClient },
  now: new Date("2026-07-20T00:00:00.000Z")
}, [fixtureSourceConfig]);
assert(first.generatedItems.length === 2, "fixture RSSから自動コンテンツを生成できません");
assert(first.wroteFiles, "初回収集結果を書き込めません");
assert(first.generatedItems.some((item) => item.pokemonSlugs.includes("pikachu")), "明示されたポケモン名を解決できません");
assert(first.generatedItems.some((item) => item.kind === "game-update"), "ゲーム更新を分類できません");
const expectedFixtureSummary =
  "Pokémon GO公式RSSで案内された情報です。内容と最新の日程は元ページでご確認ください。";
for (const item of first.generatedItems) {
  const serialized = JSON.stringify(item);
  assert(item.summary === expectedFixtureSummary, "summaryが独自の定型短文ではありません");
  assert([...item.summary].length <= 160, "summaryが160文字を超えています");
  assert(item.canonicalUrl.startsWith("https://"), "canonical URLがHTTPSではありません");
  assert(!/[<>]/.test(serialized), "fixture生成物にHTMLが含まれています");
  assert(
    !/(description|articleBody|html|image|thumbnail)/i.test(
      Object.keys(item).join(" ")
    ),
    "fixture生成物に本文・HTML・画像用フィールドがあります"
  );
}
const pikachuFixtureItem = first.generatedItems.find((item) =>
  item.title.startsWith("Pikachu")
);
const lucarioFixtureItem = first.generatedItems.find((item) =>
  item.title.startsWith("Lucario")
);
assert(
  pikachuFixtureItem?.publishedAt === "2026-07-18" &&
    pikachuFixtureItem.pokemonSlugs.includes("pikachu"),
  "Pikachu fixtureの日付または明示pokémon名を正規化できません"
);
assert(
  lucarioFixtureItem?.publishedAt === "2026-07-17" &&
    lucarioFixtureItem.pokemonSlugs.includes("lucario"),
  "Lucario fixtureの日付または明示pokémon名を正規化できません"
);

const second = await collectPokemonContentForFixtureTest({
  rootDir: temp.root,
  paths: temp.paths,
  clients: { "pokemon-go-official-rss": successClient },
  now: new Date("2026-07-21T00:00:00.000Z")
}, [fixtureSourceConfig]);
assert(!second.wroteFiles, "実行日時だけで差分を生成しています");
assert(
  second.generatedItems.every(
    (item) =>
      first.generatedItems.find((firstItem) => firstItem.id === item.id)
        ?.contentFingerprint === item.contentFingerprint
  ),
  "contentFingerprintが同じ入力で安定していません"
);

const compactFeedClient = new FixtureClient({
  ok: true,
  url: "https://pokemongo.com/feed",
  status: 200,
  contentType: "application/rss+xml",
  text: rss.replace(/>\s+</g, "><")
});
const compactFeedResult = await collectPokemonContentForFixtureTest({
  rootDir: temp.root,
  paths: temp.paths,
  clients: { "pokemon-go-official-rss": compactFeedClient },
  now: new Date("2026-07-21T12:00:00.000Z")
}, [fixtureSourceConfig]);
assert(!compactFeedResult.wroteFiles, "RSSの空白差だけで状態差分を生成しています");

const singleItemFeed = rss.replace(
  /<item>\s*<title>Lucario battle update<\/title>[\s\S]*?<\/item>/,
  ""
).replace(
  /<item>\s*<title>Duplicate Pikachu event<\/title>[\s\S]*?<\/item>/,
  ""
);
const partialFeedResult = await collectPokemonContentForFixtureTest({
  rootDir: temp.root,
  paths: temp.paths,
  clients: {
    "pokemon-go-official-rss": new FixtureClient({
      ok: true,
      url: "https://pokemongo.com/feed",
      status: 200,
      contentType: "application/rss+xml",
      text: singleItemFeed
    })
  },
  writeFiles: false
}, [fixtureSourceConfig]);
assert(
  partialFeedResult.generatedItems.length === 2 &&
    partialFeedResult.sourceStats["pokemon-go-official-rss"]?.preservedCount === 1,
  "feedから外れた既存情報を保持できません"
);

const generatedBeforeDryRun = await readFile(path.join(temp.root, "generated.json"), "utf8");
const statusBeforeDryRun = await readFile(path.join(temp.root, "status.json"), "utf8");
const manualBeforeDryRun = await readFile(path.join(temp.root, "manual.json"), "utf8");
await collectPokemonContentForFixtureTest({
  rootDir: temp.root,
  paths: temp.paths,
  clients: { "pokemon-go-official-rss": successClient },
  dryRun: true,
  now: new Date("2026-07-22T00:00:00.000Z")
}, [fixtureSourceConfig]);
assert(
  (await readFile(path.join(temp.root, "generated.json"), "utf8")) === generatedBeforeDryRun &&
    (await readFile(path.join(temp.root, "status.json"), "utf8")) === statusBeforeDryRun &&
    (await readFile(path.join(temp.root, "manual.json"), "utf8")) === manualBeforeDryRun,
  "dry-runがデータファイルを変更しました"
);

const failureClient = new FixtureClient({
  ok: false,
  url: "https://pokemongo.com/feed",
  status: 503,
  reason: "http-503",
  permanent: false
});
const failed = await collectPokemonContentForFixtureTest({
  rootDir: temp.root,
  paths: temp.paths,
  clients: { "pokemon-go-official-rss": failureClient },
  writeFiles: false
}, [fixtureSourceConfig]);
assert(failed.generatedItems.length === 2, "1ソース失敗時に既存generatedを失いました");

const emptyClient = new FixtureClient({
  ok: true,
  url: "https://pokemongo.com/feed",
  status: 200,
  contentType: "application/rss+xml",
  text: "<?xml version=\"1.0\"?><rss><channel></channel></rss>"
});
const empty = await collectPokemonContentForFixtureTest({
  rootDir: temp.root,
  paths: temp.paths,
  clients: { "pokemon-go-official-rss": emptyClient },
  writeFiles: false
}, [fixtureSourceConfig]);
assert(empty.generatedItems.length === 2, "全ソース0件時に既存generatedを削除しました");

const allExcludedClient = new FixtureClient({
  ok: true,
  url: "https://pokemongo.com/feed",
  status: 200,
  contentType: "application/rss+xml",
  text: `<?xml version="1.0"?><rss><channel><item><title>Invalid article</title><guid>http://pokemongo.com/post/invalid/</guid><pubDate>Sat, 18 Jul 2026 08:00:00 +0000</pubDate></item></channel></rss>`
});
const allExcluded = await collectPokemonContentForFixtureTest({
  rootDir: temp.root,
  paths: temp.paths,
  clients: { "pokemon-go-official-rss": allExcludedClient },
  writeFiles: false
}, [fixtureSourceConfig]);
assert(
  allExcluded.generatedItems.length === 2 &&
    allExcluded.sourceStats["pokemon-go-official-rss"]?.exclusionReasons[
      "invalid-article-url"
    ] === 1,
  "全件除外時に既存generatedを削除しました"
);

const manual = manualData as PokemonContentItem[];
const generated = generatedData as GeneratedPokemonContentItem[];
assert(manual.length === 7, "既存手動コンテンツ7件が維持されていません");
assert(
  mergePokemonContent(manual, generated).length === manual.length + generated.length,
  "/news統合データに重複があります"
);
assert(
  validatePokemonContent([...manual, ...generated], new Set(pokemonData.map((entry) => entry.slug))).length === 0,
  "現在の手動・自動データが不正です"
);

assert(parseContentCollectionArgs(["--dry-run"]).dryRun, "dry-run引数を解析できません");
assert(parseContentCollectionArgs(["--backfill"]).backfill, "backfill引数を解析できません");
assert(
  parseContentCollectionArgs(["--source", "pokemon-go-official-rss"]).source ===
    "pokemon-go-official-rss",
  "source選択を解析できません"
);
let unknownArgumentRejected = false;
try {
  parseContentCollectionArgs(["--source", "https://example.com/feed"]);
} catch {
  unknownArgumentRejected = true;
}
assert(
  unknownArgumentRejected,
  "source入力から任意URLまたは未知sourceを受理しています"
);

const configuredDomains = getContentSourceConfigs().flatMap((source) => source.allowedDomains);
assert(
  getContentSourceConfigs().every((source) => !source.automationAllowed),
  "規約確認が完了していないソースが有効化されています"
);
assert(configuredDomains.length === 0, "ライブallowlistが空ではありません");
assert(
  Object.values(CONTENT_SOURCE_AUDIT).length === 6 &&
    Object.values(CONTENT_SOURCE_AUDIT).every(
      (source) =>
        /^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt) &&
        !source.automationAllowed &&
        source.automationDecision !== ("allowed" as string)
    ),
  "規約監査レコードが不足しているか、allowedソースが混入しています"
);
for (const forbidden of ["pokesol.app", "game8.jp", "gamewith.jp", "x.com", "youtube.com"]) {
  assert(!configuredDomains.includes(forbidden), `通信禁止ドメインが登録されています: ${forbidden}`);
}

const workflow = await readFile(
  path.join(process.cwd(), ".github/workflows/refresh-pokemon-content.yml"),
  "utf8"
);
assert(!/^\s*schedule:/m.test(workflow), "workflowにscheduleが残っています");
assert(/^\s*workflow_dispatch:/m.test(workflow), "workflow_dispatchがありません");
assert(
  /source:\s*\n(?:\s+.*\n)*?\s+type: choice/.test(workflow) &&
    workflow.includes("- pokemon-go-official-rss") &&
    !workflow.includes("type: string"),
  "workflowのsource入力が登録済みIDのchoiceに限定されていません"
);
const permissionsBlock = workflow.match(
  /permissions:\n([\s\S]*?)\n\nconcurrency:/
)?.[1].trim();
assert(
  permissionsBlock === "contents: write",
  "workflowにcontents: write以外のpermissionがあります"
);
assert(
  workflow.includes("concurrency:") &&
    workflow.includes("timeout-minutes:") &&
    workflow.includes("actions/checkout@v6") &&
    workflow.includes("actions/setup-node@v6") &&
    workflow.includes("node-version-file: .nvmrc"),
  "workflowのconcurrency・timeout・Node.js設定が不足しています"
);
const commitStep = workflow.slice(
  workflow.indexOf("- name: Commit meaningful generated changes")
);
assert(
  commitStep.includes("No generated Pokémon content changes.") &&
    commitStep.includes("data/pokemonContent.generated.json") &&
    commitStep.includes("data/pokemonContentCollectionStatus.json") &&
    !commitStep.includes("data/pokemonContent.manual.json"),
  "workflowのno-op判定またはcommit対象が不正です"
);

console.log("[ok] RSS fixture解析・規約停止・安全制御・保持・dry-runを検証しました");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
