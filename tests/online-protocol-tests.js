"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("online.js", "utf8");
const classStart = source.indexOf("class Room");
const classEnd = source.indexOf("function watch");
assert(classStart >= 0 && classEnd > classStart, "Room implementation was not found");

let room = {revision: 0, state: {turn: 0}, lastWriter: "host"};
let childKey = null;
const received = [];
const statuses = [];
const context = {
  child(parent, key) {
    childKey = key;
    return {parent, key};
  },
  onDisconnect() {
    return {remove: async () => {}, cancel: async () => {}};
  },
  async runTransaction(target, update) {
    if (target.key === "restart") {
      const next = update(room.restart);
      if (next !== undefined) room.restart = next;
      return {committed: next !== undefined, snapshot: {val: () => room.restart}};
    }
    const next = update(room);
    const committed = next !== undefined;
    if (committed) room = next;
    return {committed, snapshot: {val: () => room}};
  },
  async update() {},
  async remove() {}
};
vm.createContext(context);
vm.runInContext(`${source.slice(classStart, classEnd)};globalThis.Room=Room`, context);

const session = new context.Room({key: "room"}, "guest", "guest", {
  onState: state => received.push(state),
  onStatus: status => statuses.push(status)
});

(async () => {
  assert.strictEqual(await session.sendState({turn: 1}), true);
  assert.strictEqual(room.revision, 1);
  assert.strictEqual(session.revision, 1);

  room = {...room, revision: 3, state: {turn: 0}, lastWriter: "host"};
  assert.strictEqual(await session.sendState({turn: 1}), false);
  assert.strictEqual(session.revision, 3);
  assert.deepStrictEqual(received.at(-1), {turn: 0});
  assert.match(statuses.at(-1), /最新棋局/);

  room.restart = {id: "request-1", status: "pending", requestedBy: "host"};
  await session.respondRestart("request-1", true);
  assert.strictEqual(childKey, "restart");
  assert.strictEqual(room.restart.status, "accepted");

  assert.match(source, /let started=!host;/,
    "Guest sessions must report room deletion as a disconnect");
  console.log("Online revision and restart protocol tests passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
