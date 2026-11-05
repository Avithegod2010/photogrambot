// Crash-signature formatting for the on-device diagnostics log.
import assert from "node:assert";
import { formatCrashMessage } from "../src/lib/crashFormat.ts";

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

check("plain error message", () => {
  assert.ok(formatCrashMessage(new Error("boom")).startsWith("boom"));
});

check("fatal prefix", () => {
  assert.ok(formatCrashMessage(new Error("boom"), true).startsWith("FATAL boom"));
});

check("stack keeps the first three frames", () => {
  const err = new Error("boom");
  err.stack = "Error: boom\n    at a (a.js:1)\n    at b (b.js:2)\n    at c (c.js:3)\n    at d (d.js:4)";
  const out = formatCrashMessage(err);
  assert.ok(out.includes("at a"));
  assert.ok(out.includes("at b"));
  assert.ok(out.includes("at c"));
  assert.equal(out.includes("at d"), false);
});

check("non-error values stringify", () => {
  assert.equal(formatCrashMessage("plain string"), "plain string");
  assert.equal(formatCrashMessage(null), "Unknown error");
});

check("caps at 300 characters", () => {
  const out = formatCrashMessage(new Error("x".repeat(1000)));
  assert.equal(out.length, 300);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
