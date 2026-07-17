import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function openBrowser(url) {
  const openCommand =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

  if (process.platform === "win32") {
    spawn(openCommand, [url], { cwd: rootDir, stdio: "ignore", shell: true, detached: true }).unref();
    return;
  }

  spawn(openCommand, [url], { cwd: rootDir, stdio: "ignore", detached: true }).unref();
}

async function waitForServer(url, timeoutMs = 60000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  return false;
}

if (!existsSync(path.join(rootDir, "node_modules", "next"))) {
  console.log("[setup] 依存関係がないので npm install を実行します");
  run(npmCommand, ["install"]);
}

console.log("[start] 開発サーバを起動します");
const devProcess = spawn(npmCommand, ["run", "dev"], {
  cwd: rootDir,
  stdio: "inherit"
});

const targetUrl = "http://localhost:3000";

waitForServer(targetUrl).then((isReady) => {
  if (isReady) {
    console.log(`[open] ${targetUrl}`);
    openBrowser(targetUrl);
  } else {
    console.log(`[warn] ${targetUrl} を自動で開けませんでした`);
  }
});

devProcess.on("exit", (code) => {
  process.exit(code ?? 0);
});
