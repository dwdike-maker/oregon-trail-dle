import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = await readFile(fileURLToPath(new URL("../assets/js/script.js", import.meta.url)), "utf8");

function load(initial) {
  const data = new Map(initial ? [["oregon-trail-dle:v1", initial]] : []);
  const localStorage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value))
  };
  const expose = {};
  const window = { localStorage, crypto: webcrypto, __OTDLE_EXPOSE__: expose };
  const document = { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, body: { dataset: {} } };
  vm.runInNewContext(source, { window, document, Intl, Math, Date, JSON, Number, Set, Map, Uint32Array, Error, Array, Object, String, Boolean, Element: class {} });
  return { api: expose.api, data };
}

test("every 5 miles earns exactly one hunt", () => {
  const { api } = load();
  api.addEntry(4.9, "2026-01-01", "");
  assert.equal(api.buildState().hunt.remaining, 0);
  api.addEntry(0.1, "2026-01-02", "");
  assert.equal(api.buildState().hunt.remaining, 1);
  api.startHunt();
  api.startHunt();
  assert.equal(api.buildState().hunt.active.milestoneMiles, 5);
  api.resolveHunt("bush");
  assert.equal(api.buildState().hunt.remaining, 0);
  assert.throws(() => api.startHunt());
});

test("a hunt is won only when the pick matches and food stays in range", () => {
  const { api } = load();
  api.addEntry(500, "2026-01-01", "");
  let wins = 0;
  const rounds = 60;
  for (let i = 0; i < rounds; i++) {
    api.startHunt();
    api.resolveHunt(["tree", "bush", "log"][i % 3]);
    const { recent } = api.buildState().hunt;
    assert.equal(recent.succeeded, recent.selectedLocation === recent.location);
    assert.equal(recent.succeeded ? recent.foodAwarded > 0 : recent.foodAwarded === 0, true);
    if (recent.succeeded) wins++;
  }
  assert.ok(wins > 5 && wins < 40, `unexpected win count ${wins}`);
  assert.throws(() => api.resolveHunt("tree"));
});

test("damaged saves are sanitized and unreadable ones are preserved", () => {
  const bad = JSON.stringify({
    entries: [{ miles: "x", date: "2026-01-01" }, { id: "a", miles: 3, date: "2026-02-30" }, { id: "b", miles: 2.5, date: "2026-01-05", notes: "ok" }],
    hunts: [{ selected: "nowhere" }]
  });
  const { api } = load(bad);
  const state = api.buildState();
  assert.equal(state.groupMiles, 2.5);
  assert.equal(state.entries.length, 1);

  const garbage = load("{not json");
  assert.equal(garbage.api.buildState().groupMiles, 0);
  assert.equal(garbage.data.get("oregon-trail-dle:v1:unreadable"), "{not json");
});

test("backup import validates and entries can be deleted", () => {
  const { api } = load();
  assert.throws(() => api.importBackup("[]"));
  api.importBackup(JSON.stringify({ entries: [{ id: "q", miles: 7, date: "2026-03-01" }], hunts: [] }));
  assert.equal(api.buildState().groupMiles, 7);
  api.deleteEntry("q");
  assert.equal(api.buildState().groupMiles, 0);
});
