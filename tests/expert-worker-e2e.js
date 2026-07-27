'use strict';

const path = require('path');
const {Worker} = require('worker_threads');

const worker = new Worker(
  path.resolve(__dirname, 'expert-worker-node-wrapper.js')
);
const timeout = setTimeout(() => {
  console.error('expert worker end-to-end test timed out');
  worker.terminate();
  process.exitCode = 1;
}, 20000);

worker.on('error', error => {
  clearTimeout(timeout);
  console.error(error);
  process.exitCode = 1;
});
worker.on('message', message => {
  clearTimeout(timeout);
  const move = message.move;
  const legalOpening = move &&
    move.from === null &&
    Number.isInteger(move.to) &&
    move.to >= 0 &&
    move.to < 24 &&
    move.remove === null;
  if (message.error || message.engine !== 'neural-mcts' || !legalOpening) {
    console.error(message);
    process.exitCode = 1;
  } else {
    console.log(
      `expert worker e2e passed: point=${move.to} ` +
      `simulations=${message.simulations} elapsed=${message.elapsed}ms`
    );
  }
  worker.terminate();
});
worker.postMessage({
  id: 1,
  time: 7000,
  state: {
    board: Array(24).fill(null),
    hand: [9, 9],
    turn: 0
  }
});
