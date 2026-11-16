// Upload-queue backup sanitizer — the rules that decide what a restore may
// re-enqueue. Pure module, no react-native imports.
import assert from "node:assert";
import { sanitizeQueueBackupRows } from "../src/lib/backupQueue.ts";

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

const base = {
  local_id: "asset-1",
  local_uri: "content://media/external/images/media/1",
  filename: "IMG_0001.jpg",
  folder: "Camera",
  size: 1024,
  taken_at: 100,
  added_at: 100,
  content_hash: "abc",
  upload_type: "manual",
  priority: 1,
  state: "pending",
  retries: 0,
  created_at: 100,
};

check("non-array yields no rows", () => {
  assert.deepEqual(sanitizeQueueBackupRows(null), []);
  assert.deepEqual(sanitizeQueueBackupRows({}), []);
});

check("terminal states are dropped", () => {
  const rows = ["done", "skipped", "duplicate", "pending"].map((state, i) => ({
    ...base,
    local_id: `a${i}`,
    state,
  }));
  assert.deepEqual(sanitizeQueueBackupRows(rows).map((r) => r.local_id), ["a3"]);
});

check("rows missing required text fields are dropped", () => {
  const rows = [
    { ...base, local_id: "" },
    { ...base, local_id: "b", local_uri: "" },
    { ...base, local_id: "c", filename: "" },
    { ...base, local_id: "d", filename: null },
  ];
  assert.deepEqual(sanitizeQueueBackupRows(rows), []);
});

check("running comes back as pending", () => {
  const [row] = sanitizeQueueBackupRows([{ ...base, state: "running" }]);
  assert.equal(row.state, "pending");
});

check("active beats failed for the same local id", () => {
  const rows = sanitizeQueueBackupRows([
    { ...base, state: "failed", error: "old" },
    { ...base, state: "pending" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "pending");
});

check("priority and retries are clamped", () => {
  const rows = sanitizeQueueBackupRows([
    { ...base, local_id: "p0", priority: 0 },
    { ...base, local_id: "p2", priority: 2 },
    { ...base, local_id: "p9", priority: 9 },
    { ...base, local_id: "r", retries: -5 },
    { ...base, local_id: "r2", retries: 500 },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.local_id, r]));
  assert.equal(by.p0.priority, 0);
  assert.equal(by.p2.priority, 2);
  assert.equal(by.p9.priority, 1);
  assert.equal(by.r.retries, 0);
  assert.equal(by.r2.retries, 100);
});

check("created_at falls back to a finite timestamp", () => {
  const [row] = sanitizeQueueBackupRows([{ ...base, created_at: "nope" }]);
  assert.ok(Number.isFinite(row.created_at));
});

check("next_attempt_at is not carried", () => {
  const [row] = sanitizeQueueBackupRows([{ ...base, next_attempt_at: 999999 }]);
  assert.equal("next_attempt_at" in row, false);
});

check("caps at 5000 rows", () => {
  const rows = Array.from({ length: 6000 }, (_, i) => ({
    ...base,
    local_id: `asset-${i}`,
  }));
  assert.equal(sanitizeQueueBackupRows(rows).length, 5000);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
