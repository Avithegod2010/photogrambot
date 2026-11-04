// Round 25 harness: screenshot-sunset SQL token match + overnight gates.
import { DatabaseSync } from "node:sqlite";
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

const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE photos (
  id TEXT PRIMARY KEY, status TEXT, local_id TEXT, size INTEGER,
  taken_at INTEGER, tags TEXT);
CREATE TABLE trash (photo_id TEXT);`);

const now = Date.now();
const old = now - 40 * 86400 * 1000; // 40 days ago
const fresh = now - 3 * 86400 * 1000; // 3 days ago
const msDay = 86400 * 1000;
const ins = d.prepare(
  "INSERT INTO photos (id, status, local_id, size, taken_at, tags) VALUES (?, ?, ?, ?, ?, ?)"
);
ins.run("old-shot", "uploaded", "l1", 100, old, "jpeg screenshots 2024_5"); // folder named Screenshots
ins.run("old-shot2", "uploaded", "l2", 100, old, "screenshot"); // filename-classified
ins.run("fresh-shot", "uploaded", "l3", 100, fresh, "jpeg screenshot 2025_1"); // too young
ins.run("old-nottag", "uploaded", "l4", 100, old, "jpeg whatsapp"); // not a screenshot
ins.run("old-nolocal", "uploaded", null, 100, old, "screenshot"); // no local copy
ins.run("old-notuploaded", "local", "l5", 100, old, "screenshot"); // not uploaded
ins.run("old-trashed", "uploaded", "l6", 100, old, "screenshot"); // trashed
ins.run("old-nosize", "uploaded", "l7", 0, old, "screenshot"); // no size
d.prepare("INSERT INTO trash (photo_id) VALUES (?)").run("old-trashed");
ins.run("old-shot3", "uploaded", "l8", 100, old, "screenshots"); // plural only
// mid-token must NOT match: tag like "screenshotedit" or "myscreenshot"
ins.run("old-substr", "uploaded", "l9", 100, old, "myscreenshot extra");

const cutoff = now - 30 * msDay;
const rows = d
  .prepare(
    `SELECT id FROM photos
     WHERE status = 'uploaded'
       AND local_id IS NOT NULL
       AND size IS NOT NULL AND size > 0
       AND taken_at > 0 AND taken_at < ?
       AND ((' ' || COALESCE(tags, '') || ' ') LIKE '% screenshot %'
            OR (' ' || COALESCE(tags, '') || ' ') LIKE '% screenshots %')
       AND id NOT IN (SELECT photo_id FROM trash)
     ORDER BY taken_at ASC`
  )
  .all(cutoff);
const ids = rows.map((r) => r.id);

check("sunset picks old screenshot tag", () => assert.ok(ids.includes("old-shot2")));
check("sunset picks old plural (folder) tag", () => assert.ok(ids.includes("old-shot")));
check("sunset picks plural-only tag", () => assert.ok(ids.includes("old-shot3")));
check("sunset skips fresh screenshot", () => assert.ok(!ids.includes("fresh-shot")));
check("sunset skips non-screenshot", () => assert.ok(!ids.includes("old-nottag")));
check("sunset skips no-local rows", () => assert.ok(!ids.includes("old-nolocal")));
check("sunset skips non-uploaded", () => assert.ok(!ids.includes("old-notuploaded")));
check("sunset skips trashed", () => assert.ok(!ids.includes("old-trashed")));
check("sunset skips zero size", () => assert.ok(!ids.includes("old-nosize")));
check("sunset skips substring false-positives", () => assert.ok(!ids.includes("old-substr")));
check("sunset oldest-first order", () =>
  assert.deepStrictEqual(ids, ["old-shot", "old-shot2", "old-shot3"]));

// --- Overnight gate logic (mirrors background.ts) ---
function inSyncWindow(nowDate, windowStart, windowEnd) {
  const minutes = nowDate.getHours() * 60 + nowDate.getMinutes();
  if (windowStart === windowEnd) return true;
  if (windowStart < windowEnd) return minutes >= windowStart && minutes <= windowEnd;
  return minutes >= windowStart || minutes <= windowEnd;
}
function localDayKey(nowDate) {
  const y = nowDate.getFullYear();
  const m = String(nowDate.getMonth() + 1).padStart(2, "0");
  const d = String(nowDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
const NIGHT_START = 22 * 60, NIGHT_END = 7 * 60;
check("night window accepts 23:00", () =>
  assert.ok(inSyncWindow(new Date(2026, 9, 6, 23, 0), NIGHT_START, NIGHT_END)));
check("night window accepts 03:30", () =>
  assert.ok(inSyncWindow(new Date(2026, 9, 7, 3, 30), NIGHT_START, NIGHT_END)));
check("night window accepts 07:00 boundary", () =>
  assert.ok(inSyncWindow(new Date(2026, 9, 7, 7, 0), NIGHT_START, NIGHT_END)));
check("night window rejects noon", () =>
  assert.ok(!inSyncWindow(new Date(2026, 9, 7, 12, 0), NIGHT_START, NIGHT_END)));
check("night window rejects 21:59", () =>
  assert.ok(!inSyncWindow(new Date(2026, 9, 7, 21, 59), NIGHT_START, NIGHT_END)));
check("local day key not UTC-shifted", () => {
  // 2026-10-06 23:30 local must key as that same local day even if UTC differs.
  const dt = new Date(2026, 9, 6, 23, 30);
  assert.strictEqual(localDayKey(dt), "2026-10-06");
});

console.log(`\n${passed}/17 checks passed`);
