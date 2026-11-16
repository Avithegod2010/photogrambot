// Album auto-add rule matching.
import assert from "node:assert";
import {
  hasRuleConditions,
  matchesAlbumRule,
  ruleSummary,
} from "../src/lib/albumRules.ts";

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

const photo = (over = {}) => ({
  id: "p",
  folder: "DCIM/Camera",
  tags: "camera screenshot",
  favorite: 0,
  ...over,
});

check("empty rules never match", () => {
  assert.equal(hasRuleConditions(null), false);
  assert.equal(hasRuleConditions({}), false);
  assert.equal(matchesAlbumRule(photo(), {}), false);
});

check("folder substring is case-insensitive", () => {
  assert.equal(matchesAlbumRule(photo(), { folder: "camera" }), true);
  assert.equal(matchesAlbumRule(photo(), { folder: "WhatsApp" }), false);
});

check("tag substring matches", () => {
  assert.equal(matchesAlbumRule(photo(), { tag: "screen" }), true);
  assert.equal(matchesAlbumRule(photo(), { tag: "document" }), false);
});

check("all conditions must match", () => {
  assert.equal(matchesAlbumRule(photo({ favorite: 1 }), { folder: "camera", favorite: true }), true);
  assert.equal(matchesAlbumRule(photo({ favorite: 0 }), { folder: "camera", favorite: true }), false);
  assert.equal(
    matchesAlbumRule(photo(), { folder: "camera", tag: "document" }),
    false
  );
});

check("ruleSummary is human readable", () => {
  assert.equal(ruleSummary(null), "No auto-add rule");
  assert.equal(
    ruleSummary({ folder: "Camera", tag: "receipt", favorite: true }),
    'folder contains "Camera" · tag contains "receipt" · favorites only'
  );
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
