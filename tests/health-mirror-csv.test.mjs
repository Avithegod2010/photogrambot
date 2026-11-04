// R31 harness: CSV cell escaping, health counters, mirror gate.
import assert from "node:assert";

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

// Mirrors csvexport.csvCell
function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
check("plain values pass through", () => assert.strictEqual(csvCell("IMG_1.jpg"), "IMG_1.jpg"));
check("null → empty cell", () => assert.strictEqual(csvCell(null), ""));
check("comma/quote/newline quoted, quotes doubled", () => {
  assert.strictEqual(csvCell("a,b"), '"a,b"');
  assert.strictEqual(csvCell('say "hi"'), '"say ""hi"""');
  assert.strictEqual(csvCell("line1\nline2"), '"line1\nline2"');
});
check("round-trip survives quotes-in-quotes", () => {
  const cell = csvCell('he said "ok", then');
  assert.ok(cell.startsWith('"') && cell.endsWith('"'));
  assert.strictEqual(cell.replace(/^"/, "").replace(/"$/, "").replace(/""/g, '"'), 'he said "ok", then');
});

// Mirrors digest health counters (bump + reset)
function makeHealth() {
  const store = {};
  return {
    bump(k, n = 1) { store[k] = (store[k] ?? 0) + n; },
    get(k) { return store[k] ?? 0; },
    resetAll() { for (const k of Object.keys(store)) store[k] = 0; },
  };
}
check("health bumps accumulate then reset", () => {
  const h = makeHealth();
  h.bump("failed_final"); h.bump("failed_final"); h.bump("repairs", 3);
  assert.strictEqual(h.get("failed_final"), 2);
  assert.strictEqual(h.get("repairs"), 3);
  h.resetAll();
  assert.strictEqual(h.get("failed_final"), 0);
  assert.strictEqual(h.get("repairs"), 0);
});

// Mirror gate mirrors uploader.mirrorUpload
async function mirrorGate(prefs, dest) {
  if (!prefs.mirrorEnabled || !prefs.mirrorProfileId) return false;
  if (!dest) return false;
  return true;
}
check("mirror fires only when enabled + profile + destination resolve", async () => {
  assert.strictEqual(await mirrorGate({ mirrorEnabled: true, mirrorProfileId: "p1" }, { token: "t", channelId: "c" }), true);
  assert.strictEqual(await mirrorGate({ mirrorEnabled: false, mirrorProfileId: "p1" }, { token: "t", channelId: "c" }), false);
  assert.strictEqual(await mirrorGate({ mirrorEnabled: true, mirrorProfileId: "" }, { token: "t", channelId: "c" }), false);
  assert.strictEqual(await mirrorGate({ mirrorEnabled: true, mirrorProfileId: "gone" }, null), false);
});

console.log(`\n${passed}/6 checks passed`);
