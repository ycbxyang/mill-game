const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("games/morris/script.js", "utf8");
const start = source.indexOf("function encodeOnlineBoard");
const end = source.indexOf("function sendOnlineState");
assert(start >= 0 && end > start, "Online codec functions were not found");

const context = {
  state: {
    board: Array(24).fill(null),
    hand: [9, 9],
    turn: 0,
    winner: null,
    winnerReason: null,
    last: null
  }
};
context.state.board[5] = 0;

vm.runInNewContext(source.slice(start, end), context);

const payload = context.onlineState();
const databaseRoundTrip = JSON.parse(JSON.stringify(payload));
const decoded = context.decodeOnlineBoard(databaseRoundTrip.board);

assert.strictEqual(databaseRoundTrip.board.length, 24);
assert.strictEqual(decoded.length, 24);
assert.strictEqual(decoded[5], 0);
assert.strictEqual(decoded[4], null);
assert.strictEqual(databaseRoundTrip.winner, -1);
assert.strictEqual(databaseRoundTrip.last, -1);

const legacySparse = context.decodeOnlineBoard({ 12: 1 });
assert.strictEqual(legacySparse[12], 1);
assert.strictEqual(legacySparse[11], null);

console.log("Online state codec tests passed.");
