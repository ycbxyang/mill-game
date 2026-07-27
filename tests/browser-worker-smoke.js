'use strict';

const debugPort = Number(process.argv[2] || 9222);
const pageUrl = process.argv[3] ||
  'http://127.0.0.1:8765/tests/expert-worker-harness.html';
const deadline = Date.now() + 40000;

async function waitForDebugger() {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Chrome debugging endpoint did not start.');
}

async function openTarget() {
  const response = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(pageUrl)}`,
    {method: 'PUT'}
  );
  if (!response.ok) throw new Error(`Could not open test page: ${response.status}`);
  return response.json();
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error('Could not connect to Chrome target.'));
  });
}

async function run() {
  await waitForDebugger();
  const target = await openTarget();
  const socket = await connect(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const {resolve, reject} = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  };
  socket.onclose = () => {
    for (const {reject} of pending.values()) {
      reject(new Error('Chrome target closed before the test completed.'));
    }
    pending.clear();
  };

  function command(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      socket.send(JSON.stringify({id, method, params}));
    });
  }

  await command('Runtime.enable');
  while (Date.now() < deadline) {
    const response = await command('Runtime.evaluate', {
      expression: `JSON.stringify({
        status: document.body?.dataset.status || 'loading',
        result: document.querySelector('#result')?.textContent || ''
      })`,
      returnByValue: true
    });
    const report = JSON.parse(response.result.value);
    if (report.status === 'passed') {
      console.log(`browser expert worker passed: ${report.result}`);
      socket.close();
      return;
    }
    if (report.status === 'failed') {
      throw new Error(`Browser worker failed: ${report.result}`);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for browser worker result.');
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
