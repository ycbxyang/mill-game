"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {spawn, spawnSync} = require("child_process");

const root = path.join(__dirname, "..");
const httpPort = Number(process.env.SMOKE_HTTP_PORT || 8765);
const debugPort = Number(process.env.SMOKE_DEBUG_PORT || 9222);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "qiju-chrome-"));

function available(command, args = ["--version"]) {
  const result = spawnSync(command, args, {stdio: "ignore"});
  return !result.error && result.status === 0;
}

function firstAvailable(candidates) {
  return candidates.find(candidate => {
    if (!candidate) return false;
    const hasPath = path.isAbsolute(candidate) ||
      candidate.includes("/") || candidate.includes("\\");
    return hasPath ? fs.existsSync(candidate) : available(candidate);
  });
}

const python = firstAvailable(process.platform === "win32"
  ? [process.env.PYTHON, "py", "python"]
  : [process.env.PYTHON, "python3", "python"]);
const chrome = firstAvailable([
  process.env.CHROME_PATH,
  process.platform === "win32" && "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  process.platform === "win32" && "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.platform === "win32" && "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  process.platform === "win32" && "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser"
]);

if (!python) throw new Error("Python was not found; set PYTHON to its executable path.");
if (!chrome) throw new Error("Chrome/Chromium was not found; set CHROME_PATH to its executable path.");

const pythonArgs = python.toLowerCase().endsWith("py")
  ? ["-3", "-m", "http.server", String(httpPort), "--bind", "127.0.0.1"]
  : ["-m", "http.server", String(httpPort), "--bind", "127.0.0.1"];
const server = spawn(python, pythonArgs, {cwd: root, stdio: "ignore"});
const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--no-sandbox",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], {stdio: "ignore"});

function stop(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {stdio: "ignore"});
  } else {
    child.kill();
  }
}

let result;
try {
  result = spawnSync(process.execPath, [
    path.join(__dirname, "browser-worker-smoke.js"),
    String(debugPort),
    `http://127.0.0.1:${httpPort}/tests/expert-worker-harness.html`
  ], {cwd: root, stdio: "inherit", timeout: 60000});
} finally {
  stop(browser);
  stop(server);
  fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200});
}

if (result.error) throw result.error;
process.exitCode = result.status || 0;
