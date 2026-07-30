const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("games/morris/script.js", "utf8");
const end = source.indexOf("function hideWinner");
assert(end > 0, "Morris rule functions were not found");

const context = {
  clearTimeout() {},
  render() {},
  showDraw() {},
  queueAI() {},
  sendOnlineState() {}
};
vm.createContext(context);
vm.runInContext(source.slice(0, end), context);
vm.runInContext("render=()=>{};showDraw=()=>{}", context);

const board = Array(24).fill(null);
for (const point of [0, 3, 6]) board[point] = 0;
for (const point of [2, 5, 8]) board[point] = 1;

function setState(overrides = {}) {
  const value = {
    board,
    hand: [0, 0],
    turn: 0,
    selected: null,
    removing: false,
    winner: null,
    draw: false,
    winnerReason: null,
    noCaptureTurns: 0,
    positionCounts: {},
    last: null,
    history: [],
    ...overrides
  };
  vm.runInContext(`state=${JSON.stringify(value)}`, context);
}

setState({noCaptureTurns: 100});
vm.runInContext("checkWinner()", context);
assert.strictEqual(vm.runInContext("state.draw", context), true);
assert.match(vm.runInContext("state.winnerReason", context), /100/);

setState();
vm.runInContext("checkWinner();checkWinner();checkWinner()", context);
assert.strictEqual(vm.runInContext("state.draw", context), true);
assert.match(vm.runInContext("state.winnerReason", context), /三次/);

console.log("Morris draw-rule tests passed.");
