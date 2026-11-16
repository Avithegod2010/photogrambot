// Passphrase strength heuristic.
import assert from "node:assert";
import { passwordStrength } from "../src/lib/passwordStrength.ts";

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

check("empty/short is very weak or weak", () => {
  assert.equal(passwordStrength("").score, 0);
  assert.ok(passwordStrength("abc").score <= 1);
});

check("a long mixed passphrase is strong", () => {
  const s = passwordStrength("correct-Horse-9-battery!");
  assert.equal(s.score, 4);
  assert.equal(s.label, "Strong");
  assert.deepEqual(s.tips, []);
});

check("long but single-class is not strong", () => {
  const s = passwordStrength("aaaaaaaaaaaaaaaa");
  assert.ok(s.score <= 2);
  assert.ok(s.tips.length > 0);
});

check("labels line up with scores", () => {
  assert.equal(passwordStrength("").label, "Very weak");
  assert.equal(passwordStrength("correct-Horse-9-battery!").label, "Strong");
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
