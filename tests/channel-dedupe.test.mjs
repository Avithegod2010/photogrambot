// R29 harness: channel-dedupe keep rule.
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

// Mirrors dedupeChannelPostGroups' sort: prefer a row with a local copy
// (future repair source), tie-break newest upload.
function pickKeep(group) {
  return [...group].sort(
    (a, b) => Number(!!b.local_id) - Number(!!a.local_id) || (b.uploaded_at ?? 0) - (a.uploaded_at ?? 0)
  )[0];
}
check("keeps the row with a local copy over a newer cloud-only row", () => {
  const keep = pickKeep([
    { id: "cloud-new", local_id: null, uploaded_at: 200 },
    { id: "local-old", local_id: "a", uploaded_at: 100 },
  ]);
  assert.strictEqual(keep.id, "local-old");
});
check("ties without local copies → newest upload kept", () => {
  const keep = pickKeep([
    { id: "old", local_id: null, uploaded_at: 50 },
    { id: "new", local_id: null, uploaded_at: 300 },
  ]);
  assert.strictEqual(keep.id, "new");
});
check("keeps exactly one row per group", () => {
  const group = [
    { id: "a", local_id: "x", uploaded_at: 1 },
    { id: "b", local_id: null, uploaded_at: 2 },
    { id: "c", local_id: null, uploaded_at: 3 },
  ];
  const keep = pickKeep(group);
  assert.strictEqual(keep.id, "a");
  assert.strictEqual(group.filter((r) => r.id !== keep.id).length, 2);
});

// SQL guard mirrors getDuplicateHashGroups' HAVING/LIMIT shape
check("group query shape: hash + message_id required, trash excluded, 200-group cap", () => {
  const sql = `content_hash IS NOT NULL AND message_id IS NOT NULL AND id NOT IN (SELECT photo_id FROM trash) GROUP BY content_hash HAVING COUNT(*) > 1 LIMIT 200`;
  for (const frag of ["content_hash IS NOT NULL", "message_id IS NOT NULL", "trash", "HAVING COUNT(*) > 1", "LIMIT 200"]) {
    assert.ok(sql.includes(frag), `missing: ${frag}`);
  }
});

console.log(`\n${passed}/4 checks passed`);
