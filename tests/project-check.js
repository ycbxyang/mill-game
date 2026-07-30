const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");

const root = path.join(__dirname, "..");
const htmlFiles = [
  "index.html",
  "games/morris/index.html",
  "games/connect-four/index.html",
  "games/othello/index.html"
];
const requiredRuntimeFiles = [
  "online.js",
  "firebase-config.js",
  "games/morris/ai-worker.js",
  "games/morris/expert-worker.js",
  "games/morris/models/morris-expert.onnx",
  "games/morris/vendor/ort/ort.wasm.min.js",
  "games/morris/vendor/ort/ort-wasm-simd-threaded.mjs",
  "games/morris/vendor/ort/ort-wasm-simd-threaded.wasm"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const git = process.env.GIT_EXE || "git";
const trackedResult = spawnSync(git, ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024
});
assert(!trackedResult.error && trackedResult.status === 0,
  `Could not list Git-tracked files with "${git}": ${trackedResult.error?.message || trackedResult.stderr}`);
const tracked = new Set(trackedResult.stdout.split("\0").filter(Boolean)
  .map(value => value.replaceAll("\\", "/")));

function projectRelative(absolute) {
  return path.relative(root, absolute).replaceAll("\\", "/");
}

function assertRuntimeFile(relative, source) {
  const clean = relative.split(/[?#]/)[0];
  const absolute = path.resolve(root, clean);
  assert(fs.existsSync(absolute), `${source} references missing file: ${relative}`);
  const normalized = projectRelative(absolute);
  assert(!normalized.startsWith("../") && tracked.has(normalized),
    `${source} depends on a file that is not tracked by Git: ${normalized}`);
}

for (const relative of htmlFiles) {
  const absolute = path.join(root, relative);
  const html = fs.readFileSync(absolute, "utf8");
  const base = path.dirname(absolute);
  const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
    .map(match => match[1])
    .filter(value => !/^(?:https?:|data:|#)/.test(value));

  for (const reference of references) {
    const clean = reference.split(/[?#]/)[0];
    const target = path.resolve(base, clean);
    const normalized = projectRelative(target);
    assert(fs.existsSync(target), `${relative} references missing file: ${reference}`);
    assert(!normalized.startsWith("../") && tracked.has(normalized),
      `${relative} depends on a file that is not tracked by Git: ${normalized}`);
  }
}

for (const relative of requiredRuntimeFiles) {
  assertRuntimeFile(relative, "runtime");
}

for (const [htmlRelative, scriptRelative] of [
  ["games/morris/index.html", "games/morris/script.js"],
  ["games/connect-four/index.html", "games/connect-four/game.js"],
  ["games/othello/index.html", "games/othello/game.js"]
]) {
  const html = fs.readFileSync(path.join(root, htmlRelative), "utf8");
  const script = fs.readFileSync(path.join(root, scriptRelative), "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const requested = [...script.matchAll(/\$\(['"]#([^'"]+)['"]\)/g)]
    .map(match => match[1]);
  for (const id of requested) {
    assert(ids.has(id), `${scriptRelative} requests missing #${id}`);
  }
}

console.log("Project links, tracked runtime assets, and DOM bindings passed.");
