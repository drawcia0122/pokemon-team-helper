import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatJapaneseDate } from "@/lib/dateFormat";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..");
const input = "2026-07-20";
const expected = "2026年7月20日";

if (process.argv.includes("--child")) {
  process.stdout.write(formatJapaneseDate(input));
  process.exit(0);
}

for (const timeZone of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", currentFile, "--child"],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        TZ: timeZone
      }
    }
  );

  assert(
    result.status === 0,
    `${timeZone}で日付formatterを実行できません: ${result.stderr}`
  );
  assert(
    result.stdout === expected,
    `${timeZone}の日付表示が不正です: ${result.stdout}`
  );
}

for (const invalid of [
  "2026-02-30",
  "2026-13-01",
  "2026-7-20",
  "not-a-date"
]) {
  assert(
    (() => {
      try {
        formatJapaneseDate(invalid);
        return false;
      } catch (error) {
        return error instanceof RangeError;
      }
    })(),
    `不正な日付を拒否できません: ${invalid}`
  );
}

const buildsSource = readFileSync(
  path.join(rootDir, "components/builds/BuildArticleExplorer.tsx"),
  "utf8"
);
const newsSource = readFileSync(
  path.join(rootDir, "components/news/PokemonContentExplorer.tsx"),
  "utf8"
);
const clientSources = `${buildsSource}\n${newsSource}`;

assert(
  buildsSource.includes('import { formatJapaneseDate } from "@/lib/dateFormat"') &&
    buildsSource.includes("formatJapaneseDate(article.publishedAt)"),
  "/buildsが共通の日付formatterを使用していません"
);
assert(
  newsSource.includes('import { formatJapaneseDate } from "@/lib/dateFormat"') &&
    newsSource.includes("formatJapaneseDate(item.publishedAt)") &&
    newsSource.includes("formatJapaneseDate(item.releaseDate)") &&
    newsSource.includes("formatJapaneseDate(item.preorderStartDate)") &&
    newsSource.includes("formatJapaneseDate(item.preorderDeadlineDate)") &&
    newsSource.includes("formatJapaneseDate(item.eventStartDate)") &&
    newsSource.includes("formatJapaneseDate(item.eventEndDate)"),
  "/newsの日付表示が共通formatterへ集約されていません"
);
assert(
  !clientSources.includes("T00:00:00+09:00"),
  "Client Componentに旧タイムゾーン依存実装が残っています"
);
assert(
  !clientSources.includes("suppressHydrationWarning"),
  "hydration warningを抑制して問題を隠しています"
);

console.log(
  "[ok] UTC・JST・America/Los_Angelesで日本語の日付表示が一致しました"
);
