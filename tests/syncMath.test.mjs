// LWW register ordering for multi-device sync.
import assert from "node:assert";
import { lwwWins } from "../src/lib/syncMath.ts";

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

check("no local op means the remote wins", () => {
  assert.equal(lwwWins(1, "a", null, null), true);
});

check("higher Lamport wins regardless of device id", () => {
  assert.equal(lwwWins(5, "a", 4, "z"), true);
  assert.equal(lwwWins(3, "z", 4, "a"), false);
});

check("equal clocks use the device id as a stable tiebreak", () => {
  assert.equal(lwwWins(7, "b", 7, "a"), true);
  assert.equal(lwwWins(7, "a", 7, "b"), false);
  assert.equal(lwwWins(7, "a", 7, "a"), false);
});

check("malformed local clock is treated as absent", () => {
  assert.equal(lwwWins(1, "a", Number.NaN, "b"), true);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
