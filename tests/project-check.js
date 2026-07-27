const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const htmlFiles = [
  "index.html",
  "games/morris/index.html",
  "games/connect-four/index.html",
  "games/othello/index.html"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    assert(fs.existsSync(path.resolve(base, clean)),
      `${relative} references missing file: ${reference}`);
  }
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

console.log("Project links and DOM bindings passed.");
