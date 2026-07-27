'use strict';

if (typeof importScripts === 'function') {
  importScripts('vendor/ort/ort.wasm.min.js');
}

const POINTS = 24;
const ACTION_SIZE = 624;
const MOVEMENT_BASE = 24;
const CAPTURE_BASE = 600;
const MAX_NO_CAPTURE_TURNS = 100;
const ADJ = [[1,9],[0,2,4],[1,14],[4,10],[1,3,5,7],[4,13],[7,11],[4,6,8],[7,12],[0,10,21],[3,9,11,18],[6,10,15],[8,13,17],[5,12,14,20],[2,13,23],[11,16],[15,17,19],[12,16],[10,19],[16,18,20,22],[13,19],[9,22],[19,21,23],[14,22]];
const MILLS = [[0,1,2],[3,4,5],[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23],[0,9,21],[3,10,18],[6,11,15],[1,4,7],[16,19,22],[8,12,17],[5,13,20],[2,14,23]];
const MILL_OF = Array.from({length: POINTS}, (_, point) =>
  MILLS.filter(mill => mill.includes(point))
);
const DEGREE = ADJ.map(neighbours => neighbours.length / 4);

let sessionPromise = null;
let deadline = Infinity;
let evaluatedNodes = 0;

function playerIndex(player) {
  return player === 1 ? 0 : 1;
}

function pieces(state, player) {
  const result = [];
  for (let point = 0; point < POINTS; point++) {
    if (state.board[point] === player) result.push(point);
  }
  return result;
}

function inMill(board, point, player) {
  return MILL_OF[point].some(mill =>
    mill.every(index => board[index] === player)
  );
}

function removablePieces(board, player) {
  const all = [];
  for (let point = 0; point < POINTS; point++) {
    if (board[point] === player) all.push(point);
  }
  const outside = all.filter(point => !inMill(board, point, player));
  return outside.length ? outside : all;
}

function movementTargets(state, source, player = state.player) {
  if (state.board[source] !== player) return [];
  const allPieces = pieces(state, player);
  if (state.hand[playerIndex(player)] === 0 && allPieces.length === 3) {
    return state.board
      .map((value, point) => value === 0 ? point : -1)
      .filter(point => point >= 0);
  }
  return ADJ[source].filter(point => state.board[point] === 0);
}

function placementAction(target) {
  return target;
}

function movementAction(source, target) {
  return MOVEMENT_BASE + source * POINTS + target;
}

function captureAction(target) {
  return CAPTURE_BASE + target;
}

function decodeAction(action) {
  if (action < MOVEMENT_BASE) {
    return {kind: 'place', source: null, target: action};
  }
  if (action < CAPTURE_BASE) {
    const offset = action - MOVEMENT_BASE;
    return {
      kind: 'move',
      source: Math.floor(offset / POINTS),
      target: offset % POINTS
    };
  }
  return {kind: 'capture', source: null, target: action - CAPTURE_BASE};
}

function baseActions(state) {
  if (state.hand[playerIndex(state.player)] > 0) {
    return state.board
      .map((value, point) => value === 0 ? placementAction(point) : -1)
      .filter(action => action >= 0);
  }
  const actions = [];
  for (const source of pieces(state, state.player)) {
    for (const target of movementTargets(state, source)) {
      actions.push(movementAction(source, target));
    }
  }
  return actions;
}

function winner(state) {
  if (state.removing || state.hand[0] + state.hand[1] > 0 || isDraw(state)) {
    return 0;
  }
  if (pieces(state, state.player).length < 3 || baseActions(state).length === 0) {
    return -state.player;
  }
  return 0;
}

function isDraw(state) {
  return state.noCaptureTurns >= MAX_NO_CAPTURE_TURNS;
}

function isTerminal(state) {
  return isDraw(state) || winner(state) !== 0;
}

function legalActions(state) {
  if (isTerminal(state)) return [];
  if (state.removing) {
    return removablePieces(state.board, -state.player).map(captureAction);
  }
  return baseActions(state);
}

function play(state, action) {
  const decoded = decodeAction(action);
  const board = state.board.slice();
  const hand = state.hand.slice();

  if (decoded.kind === 'capture') {
    board[decoded.target] = 0;
    return {
      board,
      hand,
      player: -state.player,
      removing: false,
      noCaptureTurns: 0
    };
  }

  if (decoded.kind === 'place') {
    hand[playerIndex(state.player)]--;
  } else {
    board[decoded.source] = 0;
  }
  board[decoded.target] = state.player;
  if (
    inMill(board, decoded.target, state.player) &&
    removablePieces(board, -state.player).length
  ) {
    return {
      board,
      hand,
      player: state.player,
      removing: true,
      noCaptureTurns: state.noCaptureTurns
    };
  }
  return {
    board,
    hand,
    player: -state.player,
    removing: false,
    noCaptureTurns: hand[0] + hand[1] === 0
      ? state.noCaptureTurns + 1
      : 0
  };
}

function encode(state) {
  const encoded = new Float32Array(13 * POINTS);
  const ownHand = state.hand[playerIndex(state.player)] / 9;
  const opponentHand = state.hand[playerIndex(-state.player)] / 9;
  const ownPieces = pieces(state, state.player);
  const opponentPieces = pieces(state, -state.player);
  const ownFlying = ownHand === 0 && ownPieces.length === 3;
  const opponentFlying = opponentHand === 0 && opponentPieces.length === 3;
  const placing = state.hand[playerIndex(state.player)] > 0;
  const noCapture = Math.min(state.noCaptureTurns / MAX_NO_CAPTURE_TURNS, 1);

  for (let point = 0; point < POINTS; point++) {
    const value = state.board[point];
    encoded[point] = value === state.player ? 1 : 0;
    encoded[POINTS + point] = value === -state.player ? 1 : 0;
    encoded[2 * POINTS + point] = value === 0 ? 1 : 0;
    encoded[3 * POINTS + point] =
      value === state.player && inMill(state.board, point, state.player) ? 1 : 0;
    encoded[4 * POINTS + point] =
      value === -state.player && inMill(state.board, point, -state.player) ? 1 : 0;
    encoded[5 * POINTS + point] = DEGREE[point];
    encoded[6 * POINTS + point] = ownHand;
    encoded[7 * POINTS + point] = opponentHand;
    encoded[8 * POINTS + point] = placing ? 1 : 0;
    encoded[9 * POINTS + point] = state.removing ? 1 : 0;
    encoded[10 * POINTS + point] = ownFlying ? 1 : 0;
    encoded[11 * POINTS + point] = opponentFlying ? 1 : 0;
    encoded[12 * POINTS + point] = noCapture;
  }
  return encoded;
}

function toInternal(webState) {
  return {
    board: webState.board.map(value =>
      value === null ? 0 : (value === 0 ? 1 : -1)
    ),
    hand: webState.hand.slice(),
    player: webState.turn === 0 ? 1 : -1,
    removing: false,
    noCaptureTurns: webState.noCapture || 0
  };
}

function toWebMove(baseAction, capture) {
  const decoded = decodeAction(baseAction);
  return {
    from: decoded.source,
    to: decoded.target,
    remove: capture === null ? null : decodeAction(capture).target
  };
}

async function ensureSession() {
  if (!sessionPromise) {
    const root = new URL('.', self.location.href);
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL('vendor/ort/', root).href;
    const model = new URL('models/morris-expert.onnx?v=iteration-15', root).href;
    sessionPromise = ort.InferenceSession.create(model, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    }).catch(error => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function evaluate(state) {
  const session = await ensureSession();
  const feeds = {state: new ort.Tensor('float32', encode(state), [1, 13, 24])};
  const output = await session.run(feeds);
  const logits = output.policy_logits.data;
  const value = Number(output.value.data[0]);
  const legal = legalActions(state);
  const prior = new Float32Array(ACTION_SIZE);
  let maximum = -Infinity;
  for (const action of legal) maximum = Math.max(maximum, logits[action]);
  let total = 0;
  for (const action of legal) {
    prior[action] = Math.exp(logits[action] - maximum);
    total += prior[action];
  }
  if (total > 0) {
    for (const action of legal) prior[action] /= total;
  } else {
    for (const action of legal) prior[action] = 1 / legal.length;
  }
  evaluatedNodes++;
  return {prior, value};
}

function createNode() {
  return {
    prior: new Float32Array(ACTION_SIZE),
    visits: new Int32Array(ACTION_SIZE),
    valueSum: new Float32Array(ACTION_SIZE),
    children: new Map(),
    expanded: false
  };
}

function backpropagate(path, leafValue) {
  let value = leafValue;
  for (let index = path.length - 1; index >= 0; index--) {
    const edge = path[index];
    if (edge.switchedPlayer) value = -value;
    edge.node.visits[edge.action]++;
    edge.node.valueSum[edge.action] += value;
  }
}

function terminalValue(state) {
  const result = winner(state);
  if (result === 0) return 0;
  return result === state.player ? 1 : -1;
}

async function search(rootState, requestedSimulations) {
  const root = createNode();
  const rootEvaluation = await evaluate(rootState);
  root.prior = rootEvaluation.prior;
  root.expanded = true;
  let completed = 0;

  for (let simulation = 0; simulation < requestedSimulations; simulation++) {
    if (performance.now() >= deadline && completed >= 4) break;
    let node = root;
    let state = rootState;
    const path = [];

    while (node.expanded && !isTerminal(state)) {
      const legal = legalActions(state);
      let totalVisits = 0;
      for (const action of legal) totalVisits += node.visits[action];
      const rootVisits = Math.max(1, totalVisits);
      let bestAction = legal[0];
      let bestScore = -Infinity;
      for (const action of legal) {
        const q = node.visits[action]
          ? node.valueSum[action] / node.visits[action]
          : 0;
        const exploration =
          1.5 * node.prior[action] * Math.sqrt(rootVisits) /
          (1 + node.visits[action]);
        const score = q + exploration;
        if (score > bestScore) {
          bestScore = score;
          bestAction = action;
        }
      }
      const childState = play(state, bestAction);
      path.push({
        node,
        action: bestAction,
        switchedPlayer: childState.player !== state.player
      });
      state = childState;
      if (!node.children.has(bestAction)) {
        node.children.set(bestAction, createNode());
      }
      node = node.children.get(bestAction);
    }

    let value;
    if (isTerminal(state)) {
      value = terminalValue(state);
    } else {
      const evaluation = await evaluate(state);
      node.prior = evaluation.prior;
      node.expanded = true;
      value = evaluation.value;
    }
    backpropagate(path, value);
    completed++;
  }

  const legal = legalActions(rootState);
  let bestAction = legal[0];
  let bestVisits = -1;
  for (const action of legal) {
    if (root.visits[action] > bestVisits) {
      bestVisits = root.visits[action];
      bestAction = action;
    }
  }
  return {action: bestAction, simulations: completed};
}

async function chooseMove(webState, timeLimit = 7000) {
  const started = performance.now();
  deadline = started + timeLimit;
  evaluatedNodes = 0;
  const state = toInternal(webState);
  const base = await search(state, 32);
  const afterBase = play(state, base.action);
  let capture = null;
  let captureSimulations = 0;
  if (afterBase.removing) {
    const removal = await search(afterBase, 16);
    capture = removal.action;
    captureSimulations = removal.simulations;
  }
  return {
    move: toWebMove(base.action, capture),
    nodes: evaluatedNodes,
    simulations: base.simulations + captureSimulations,
    elapsed: Math.round(performance.now() - started)
  };
}

if (typeof self !== 'undefined') {
  self.onmessage = async event => {
    const {id, state, time} = event.data;
    try {
      const result = await chooseMove(state, time || 7000);
      self.postMessage({id, ...result, engine: 'neural-mcts'});
    } catch (error) {
      self.postMessage({
        id,
        move: null,
        error: error instanceof Error ? error.message : String(error),
        engine: 'fallback'
      });
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ACTION_SIZE,
    legalActions,
    play,
    encode,
    toInternal,
    toWebMove,
    decodeAction
  };
}
