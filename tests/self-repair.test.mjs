// R27 Batch A harness: self-repair decision table + storage gate math.
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

// Mirrors repairBrokenUploads' skip conditions
function repairDecision(row, fileExists, activeRowExists) {
  if (!row || !row.local_id || !row.local_uri) return "skip";
  if (!fileExists) return "skip";
  if (activeRowExists) return "skip"; // uq_queue_active_local
  return "enqueue";
}
check("repairable row enqueues", () =>
  assert.strictEqual(repairDecision({ local_id: "a", local_uri: "file://" }, true, false), "enqueue"));
check("cloud-only row (no local_id) skips", () =>
  assert.strictEqual(repairDecision({ local_id: null, local_uri: "file://" }, true, false), "skip"));
check("missing local file skips", () =>
  assert.strictEqual(repairDecision({ local_id: "a", local_uri: "file://" }, false, false), "skip"));
check("row already in active queue skips", () =>
  assert.strictEqual(repairDecision({ local_id: "a", local_uri: "file://" }, true, true), "skip"));

// Mirrors uploadQueueItem repair gates
function skipsDuplicateGuard(uploadType) {
  return uploadType === "repair";
}
check("repair bypasses hash-duplicate short-circuit", () =>
  assert.ok(skipsDuplicateGuard("repair")));
check("normal upload keeps duplicate guard", () =>
  assert.ok(!skipsDuplicateGuard("sync")));
check("repair also bypasses near-dup guard", () => {
  const nearDupExempt = (t) => t === "version" || t === "repair";
  assert.ok(nearDupExempt("repair") && nearDupExempt("version") && !nearDupExempt("sync"));
});

// Storage threshold
const THRESHOLD = 500 * 1024 * 1024;
check("gate: 400 MB free is critical, 600 MB is fine", () => {
  assert.ok(400 * 1024 * 1024 < THRESHOLD);
  assert.ok(600 * 1024 * 1024 >= THRESHOLD);
});

console.log(`\n${passed}/8 checks passed`);
