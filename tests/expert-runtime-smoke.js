'use strict';

const fs = require('fs');
const path = require('path');
const {pathToFileURL} = require('url');
const ort = require('../games/morris/vendor/ort/ort.wasm.min.js');
const {encode, toInternal} = require('../games/morris/expert-worker.js');

async function run() {
  const runtimeDirectory = path.resolve(
    __dirname,
    '../games/morris/vendor/ort'
  ) + path.sep;
  const modelPath = path.resolve(
    __dirname,
    '../games/morris/models/morris-expert.onnx'
  );

  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = pathToFileURL(runtimeDirectory).href;
  const session = await ort.InferenceSession.create(
    fs.readFileSync(modelPath),
    {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    }
  );
  const state = toInternal({
    board: Array(24).fill(null),
    hand: [9, 9],
    turn: 0
  });
  const output = await session.run({
    state: new ort.Tensor('float32', encode(state), [1, 13, 24])
  });

  if (output.policy_logits.data.length !== 624) {
    throw new Error('Expected 624 policy logits.');
  }
  if (output.value.data.length !== 1 || !Number.isFinite(output.value.data[0])) {
    throw new Error('Expected one finite value prediction.');
  }
  console.log(
    `expert runtime passed: policy=624 value=${output.value.data[0].toFixed(6)}`
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
