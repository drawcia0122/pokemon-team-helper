import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNextConfig } from "../next.config";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..");
const outDir = path.join(rootDir, "out");
const basePath = "/pokemon-team-helper";

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readOutput(relativePath: string): string {
  const outputPath = path.join(outDir, relativePath);
  assert(existsSync(outputPath), `静的成果物がありません: out/${relativePath}`);
  return readFileSync(outputPath, "utf8");
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath];
  });
}

const indexHtml = readOutput("index.html");
const buildsHtml = readOutput("builds/index.html");
const newsHtml = readOutput("news/index.html");
const environmentHtml = readOutput("environment/index.html");
const allHtml = [indexHtml, buildsHtml, newsHtml, environmentHtml].join("\n");
const normalNextConfig = createNextConfig(false);
const pagesNextConfig = createNextConfig(true);

for (const route of ["", "builds/", "news/", "environment/"]) {
  assert(
    allHtml.includes(`href="${basePath}/${route}"`),
    `内部ナビゲーションへbasePathを付与できません: ${route || "/"}`
  );
}

assert(
  allHtml.includes(`"${basePath}/_next/`) ||
    allHtml.includes(`href="${basePath}/_next/`) ||
    allHtml.includes(`src="${basePath}/_next/`),
  "_next参照へGitHub PagesのbasePathが付きません"
);
assert(
  indexHtml.includes(`href="${basePath}/icon.svg?`),
  "favicon参照へGitHub PagesのbasePathが付きません"
);
assert(
  buildsHtml.includes(`${basePath}/?importArticle=`),
  "構築記事取り込みURLへbasePathまたはimportArticle queryを維持できません"
);
assert(
  buildsHtml.includes("2026年7月19日"),
  "構築記事の公開日をUTC環境でも日本時間の日付として出力できません"
);
assert(
  newsHtml.includes("2026年7月10日") &&
    newsHtml.includes("2026年7月23日") &&
    newsHtml.includes("2026年7月18日") &&
    newsHtml.includes("2026年8月31日"),
  "ニュースの公開日・発売日・開催期間を日本時間の日付として出力できません"
);
assert(
  /href="https:\/\/[^"]+"/.test(buildsHtml) &&
    !allHtml.includes(`${basePath}/https://`),
  "外部URLへbasePathを誤って付与しました"
);

assert(
  environmentHtml.includes("公式Pokemon HOMEの統計ではありません") &&
    environmentHtml.includes("環境使用率ランキング") &&
    !environmentHtml.includes("rawWeight"),
  "環境ページの非公式表記または軽量化が不正です"
);
const environmentManifest = JSON.parse(readOutput("environment-data/_manifest.json")) as {
  detailFileCount: number;
  detailBytes: number;
};
assert(
  environmentManifest.detailFileCount === 100 &&
    environmentManifest.detailBytes < 2_000_000,
  "環境詳細JSONの件数またはサイズが不正です"
);
const environmentDetailFiles = walkFiles(path.join(outDir, "environment-data")).filter(
  (file) => file.endsWith(".json") && path.basename(file) !== "_manifest.json"
);
assert(environmentDetailFiles.length === 100, "環境詳細JSONが100件ではありません");
let environmentDetailSource = "";
for (const file of environmentDetailFiles) {
  const source = readFileSync(file, "utf8");
  environmentDetailSource += source;
  assert(!source.includes("rawWeight"), `環境詳細JSONにrawWeightが混入しています: ${file}`);
  assert(statSync(file).size < 40_000, `環境詳細JSONが大きすぎます: ${file}`);
}
assert(
  environmentDetailSource.includes('"name":"じしん"') &&
    environmentDetailSource.includes('"name":"きあいのタスキ"') &&
    environmentDetailSource.includes('"name":"さめはだ"') &&
    environmentDetailSource.includes('"natureName":"ようき"') &&
    !environmentDetailSource.includes('"name":"earthquake"') &&
    !environmentDetailSource.includes('"name":"focussash"') &&
    !environmentDetailSource.includes('"name":"roughskin"') &&
    !environmentDetailSource.includes('"natureName":"Jolly"'),
  "Pages用環境詳細を日本語化できません"
);

assert(
  normalNextConfig.output === undefined &&
    normalNextConfig.basePath === undefined &&
    normalNextConfig.assetPrefix === undefined &&
    normalNextConfig.trailingSlash === undefined,
  "通常production設定へPages用の静的export設定が混入しています"
);
assert(
  pagesNextConfig.output === "export" &&
    pagesNextConfig.basePath === basePath &&
    pagesNextConfig.assetPrefix === undefined &&
    pagesNextConfig.trailingSlash === true,
  "GitHub Pages設定のoutput、basePath、trailingSlashが不正です"
);
const nextConfig = read("next.config.ts");
assert(!nextConfig.includes("headers()"), "静的export非対応のheaders()が残っています");
assert(
  !nextConfig.includes("assetPrefix"),
  "サブパス公開に不要なassetPrefixを追加しています"
);

const layout = read("app/layout.tsx");
const headHtml = indexHtml.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "";
const bodyHtml = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? "";
assert(
  layout.includes('httpEquiv="Content-Security-Policy"') &&
    layout.includes("STATIC_CONTENT_SECURITY_POLICY"),
  "静的HTMLへCSP metaを設定していません"
);
assert(
  headHtml.includes('http-equiv="Content-Security-Policy"') &&
    headHtml.includes("assets.st-note.com") &&
    headHtml.includes("cdn-ak.f.st-hatena.com") &&
    headHtml.includes("cdn-ak2.f.st-hatena.com") &&
    headHtml.includes("nonbirimaru.net") &&
    headHtml.includes("liberty-note.com") &&
    headHtml.includes("raw.githubusercontent.com") &&
    !bodyHtml.includes('http-equiv="Content-Security-Policy"'),
  "CSP metaがhead内にないか、許可済み画像ホストを維持できません"
);
assert(
  !headHtml.includes("https://*") &&
    !headHtml.includes("unsafe-eval") &&
    !headHtml.includes("unsafe-inline"),
  "CSPを過度に拡張しています"
);

const appFiles = walkFiles(path.join(rootDir, "app"));
assert(
  !appFiles.some((file) => /^route\.[cm]?[jt]sx?$/.test(path.basename(file))),
  "Route Handlerが残っています"
);
assert(
  !appFiles.some((file) => file.split(path.sep).some((segment) => segment.startsWith("["))),
  "generateStaticParamsのない動的routeが残っています"
);
for (const file of appFiles.filter((entry) => /\.[jt]sx?$/.test(entry))) {
  const source = readFileSync(file, "utf8");
  assert(!source.includes('"use server"'), `Server Actionが残っています: ${file}`);
  assert(!source.includes("next/headers"), `Request依存APIが残っています: ${file}`);
  assert(!source.includes("next/server"), `Next.js server APIが残っています: ${file}`);
  assert(!source.includes("next/image"), `next/imageが残っています: ${file}`);
}
assert(
  !["middleware.ts", "middleware.js", "proxy.ts", "proxy.js"].some((file) =>
    existsSync(path.join(rootDir, file))
  ),
  "middlewareまたはproxyが残っています"
);

const workflow = read(".github/workflows/deploy-pages.yml");
for (const action of [
  "actions/checkout@v6",
  "actions/setup-node@v6",
  "actions/configure-pages@v6",
  "actions/upload-pages-artifact@v5",
  "actions/deploy-pages@v5"
]) {
  assert(workflow.includes(action), `Pages workflowのActionが不正です: ${action}`);
}
for (const command of [
  "npm ci",
  "npm run check",
  "npm run build:pages",
  "npm run test:pages"
]) {
  assert(workflow.includes(command), `Pages workflowに必要な処理がありません: ${command}`);
}
assert(
  workflow.includes(
    '- name: Validate application\n        run: npm run check'
  ) &&
    workflow.includes(
      '- name: Build GitHub Pages export\n        env:\n          GITHUB_PAGES: "true"\n        run: npm run build:pages'
    ),
  "通常checkとPages buildの環境変数を分離できていません"
);
assert(
  workflow.includes("contents: read") &&
    workflow.includes("pages: write") &&
    workflow.includes("id-token: write") &&
    !workflow.includes("contents: write"),
  "Pages workflowのpermissionsが必要最小限ではありません"
);
assert(
  workflow.includes("needs: build") &&
    workflow.includes("name: github-pages") &&
    workflow.includes("steps.deployment.outputs.page_url"),
  "build成功後だけgithub-pages environmentへdeployする構成ではありません"
);
assert(
  workflow.includes("path: out"),
  "GitHub Pages artifact pathがoutではありません"
);
assert(
  workflow.includes("push:") &&
    workflow.includes("- main") &&
    workflow.includes("workflow_dispatch:"),
  "Pages workflowのtriggerが不正です"
);

const gitignore = read(".gitignore");
assert(
  gitignore.split(/\r?\n/).includes("out/"),
  "out/がGit管理対象外ではありません"
);

const outputFiles = walkFiles(outDir);
const artifactBytes = outputFiles.reduce(
  (total, file) => total + statSync(file).size,
  0
);

console.log(
  `[ok] GitHub Pages静的成果物 ${outputFiles.length}ファイル / ${artifactBytes} bytes を検証しました`
);
