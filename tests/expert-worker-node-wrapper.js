'use strict';

const fs = require('fs');
const path = require('path');
const {fileURLToPath, pathToFileURL} = require('url');
const {parentPort} = require('worker_threads');

const workerPath = path.resolve(
  __dirname,
  '../games/morris/expert-worker.js'
);
const runtimeDirectory = path.resolve(
  __dirname,
  '../games/morris/vendor/ort'
) + path.sep;

global.importScripts = () => {
  global.ort = require('../games/morris/vendor/ort/ort.wasm.min.js');
  ort.env.wasm.wasmPaths = pathToFileURL(runtimeDirectory).href;
  const createSession = ort.InferenceSession.create.bind(ort.InferenceSession);
  ort.InferenceSession.create = (model, options) => {
    if (typeof model === 'string' && model.startsWith('file:')) {
      model = fs.readFileSync(fileURLToPath(model));
    }
    return createSession(model, options);
  };
};
global.self = {
  location: {href: pathToFileURL(workerPath).href},
  postMessage: message => parentPort.postMessage(message)
};

require(workerPath);
parentPort.on('message', data => self.onmessage({data}));
