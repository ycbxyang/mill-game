'use strict';

const assert = require('assert');
const {
  ACTION_SIZE,
  legalActions,
  play,
  encode,
  toInternal,
  toWebMove
} = require('../games/morris/expert-worker.js');

function blankWebState() {
  return {
    board: Array(24).fill(null),
    hand: [9, 9],
    turn: 0
  };
}

function initialState() {
  return toInternal(blankWebState());
}

function testInitialPosition() {
  const state = initialState();
  const legal = legalActions(state);
  const encoded = encode(state);

  assert.strictEqual(ACTION_SIZE, 624);
  assert.deepStrictEqual(legal, Array.from({length: 24}, (_, point) => point));
  assert.strictEqual(encoded.length, 13 * 24);
  for (let point = 0; point < 24; point++) {
    assert.strictEqual(encoded[point], 0, '己方棋子平面应为空');
    assert.strictEqual(encoded[24 + point], 0, '对方棋子平面应为空');
    assert.strictEqual(encoded[2 * 24 + point], 1, '空位平面应全为 1');
    assert.strictEqual(encoded[6 * 24 + point], 1, '己方手牌应归一化为 1');
    assert.strictEqual(encoded[7 * 24 + point], 1, '对方手牌应归一化为 1');
    assert.strictEqual(encoded[8 * 24 + point], 1, '初始局面应处于布子阶段');
  }
}

function testMillAndCaptureSubturn() {
  let state = initialState();
  for (const action of [0, 4, 1, 5, 2]) state = play(state, action);

  assert.strictEqual(state.player, 1, '成磨后应由同一方继续执行吃子');
  assert.strictEqual(state.removing, true);
  assert.deepStrictEqual(legalActions(state), [604, 605]);

  state = play(state, 604);
  assert.strictEqual(state.board[4], 0);
  assert.strictEqual(state.player, -1, '吃子完成后才应交换行棋方');
  assert.strictEqual(state.removing, false);
  assert.strictEqual(state.noCaptureTurns, 0);
}

function testFlyingPhase() {
  const board = Array(24).fill(0);
  for (const point of [0, 4, 8]) board[point] = 1;
  for (const point of [2, 14, 23]) board[point] = -1;
  const state = {
    board,
    hand: [0, 0],
    player: 1,
    removing: false,
    noCaptureTurns: 0
  };
  const legal = legalActions(state);

  assert.strictEqual(legal.length, 54, '三枚棋子应能飞向全部 18 个空位');
  assert(legal.includes(24 + 0 * 24 + 1));
  assert(legal.includes(24 + 8 * 24 + 22));
}

function testWebMapping() {
  const webState = blankWebState();
  webState.board[3] = 0;
  webState.board[5] = 1;
  webState.hand = [8, 8];
  webState.turn = 1;
  const state = toInternal(webState);

  assert.strictEqual(state.board[3], 1);
  assert.strictEqual(state.board[5], -1);
  assert.strictEqual(state.player, -1);
  assert.deepStrictEqual(
    toWebMove(24 + 3 * 24 + 10, 605),
    {from: 3, to: 10, remove: 5}
  );
}

testInitialPosition();
testMillAndCaptureSubturn();
testFlyingPhase();
testWebMapping();

console.log('expert worker tests passed');
