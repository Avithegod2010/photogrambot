// Search "did you mean" helper.
import assert from "node:assert";
import { levenshtein, suggestTerm } from "../src/lib/suggest.ts";

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

check("levenshtein basics", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("same", "same"), 0);
  assert.equal(levenshtein("", "abc"), 3);
});

check("suggests a close tag", () => {
  assert.equal(suggestTerm("screnshot", ["screenshot", "document"]), "screenshot");
  assert.equal(suggestTerm("whatsap", ["whatsapp", "screenshot"]), "whatsapp");
});

check("returns null for short or exact queries", () => {
  assert.equal(suggestTerm("do", ["document"]), null);
  assert.equal(suggestTerm("document", ["document"]), null);
});

check("returns null when nothing is close", () => {
  assert.equal(suggestTerm("elephant", ["screenshot", "whatsapp"]), null);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
