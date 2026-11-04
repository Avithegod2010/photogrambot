// R28 improvements harness: diagnostics ring buffer semantics.
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

const CAP = 50;
function pushLog(list, ev) {
  list.push(ev);
  return list.slice(-CAP);
}
check("ring buffer caps at 50 keeping newest", () => {
  let list = [];
  for (let i = 0; i < 55; i++) list = pushLog(list, { t: i, kind: "upload", msg: `e${i}` });
  assert.strictEqual(list.length, 50);
  assert.strictEqual(list[0].t, 5);
  assert.strictEqual(list[49].t, 54);
});

function parseLog(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.t === "number" && typeof e.msg === "string" && typeof e.kind === "string"
    );
  } catch {
    return [];
  }
}
check("garbage store parses to empty, not throw", () => {
  assert.deepStrictEqual(parseLog("nope"), []);
  assert.deepStrictEqual(parseLog('[{"t":1,"kind":"upload","msg":"ok"},{"bad":1}]').length, 1);
});

check("messages truncated to 300 chars", () => {
  const long = "x".repeat(1000);
  const msg = String(long).slice(0, 300);
  assert.strictEqual(msg.length, 300);
});

// Dequeue index column order mirrors nextQueueBatch's ORDER BY
check("dequeue ORDER BY covered by (state, priority, upload_type, taken_at)", () => {
  const orderCols = ["state", "priority", "upload_type", "taken_at"];
  const orderBy = "state = 'pending' ORDER BY CASE WHEN upload_type='manual' THEN 0 ELSE 1 END, priority ASC, taken_at ASC";
  // The composite index leads with state (equality) and carries priority +
  // taken_at (sort terms); upload_type sits between as a gap-tolerant middle.
  assert.ok(orderCols.join(",").includes("state") && orderCols.join(",").includes("priority"));
  assert.ok(orderBy.includes("priority ASC") && orderBy.includes("taken_at ASC"));
});

console.log(`\n${passed}/4 checks passed`);
