// Round 26 harness: break-in log semantics + /wipe argument parsing.
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

// Mirrors breakin.ts push/slice
function pushLog(list, ev, cap = 100) {
  list.push(ev);
  return list.slice(-cap);
}
check("log caps at 100 keeping newest", () => {
  let list = [];
  for (let i = 0; i < 105; i++) list = pushLog(list, { t: i, kind: "pin_fail" });
  assert.strictEqual(list.length, 100);
  assert.strictEqual(list[0].t, 5);
  assert.strictEqual(list[99].t, 104);
});

// Mirrors breakin.ts getBreakInLog validation (try/catch is inside the fn)
function parseLog(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.t === "number" && ["pin_fail", "biometric_fail", "decoy_unlock"].includes(e.kind)
    );
  } catch {
    return [];
  }
}
check("tampered/garbage log parses to empty, not throw", () => {
  assert.deepStrictEqual(parseLog("not json"), []);
  assert.deepStrictEqual(parseLog('{"x":1}'), []);
  assert.deepStrictEqual(parseLog('[{"t":1,"kind":"pin_fail"},{"t":"bad"},{"t":2,"kind":"nope"}]').length, 1);
});
check("empty store → empty log", () => assert.deepStrictEqual(parseLog(null), []));

// Mirrors remote.ts /wipe parsing
function parseCmd(text) {
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  const arg = text.split(/\s+/).slice(1)[0]?.toLowerCase();
  return { cmd, arg };
}
check("/wipe plain arms (no confirm arg)", () => {
  const { cmd, arg } = parseCmd("/wipe");
  assert.strictEqual(cmd, "/wipe");
  assert.notStrictEqual(arg, "confirm");
});
check("/wipe confirm (exact)", () => {
  const { cmd, arg } = parseCmd("/wipe confirm");
  assert.strictEqual(cmd, "/wipe");
  assert.strictEqual(arg, "confirm");
});
check("/wipe@MyBot confirm (addressed form)", () => {
  const { cmd, arg } = parseCmd("/wipe@MyBot confirm");
  assert.strictEqual(cmd, "/wipe");
  assert.strictEqual(arg, "confirm");
});
check("/wipe CONFIRM case-insensitive", () => {
  assert.strictEqual(parseCmd("/wipe CONFIRM").arg, "confirm");
});
check("5-minute arm window math", () => {
  const WINDOW = 5 * 60 * 1000;
  const armedAt = Date.now() - 4 * 60 * 1000;
  assert.ok(Date.now() - armedAt <= WINDOW, "4 min old is still armed");
  const stale = Date.now() - 6 * 60 * 1000;
  assert.ok(Date.now() - stale > WINDOW, "6 min old is expired");
});

console.log(`\n${passed}/8 checks passed`);
