// Backup schema guard + queue sanitizer fuzzing.
//
// The R37 restore bugs came from columns silently missing in importAllData.
// This test compares the import column list against the CREATE TABLE and
// migration column lists, and fuzzes the queue sanitizer.
import assert from "node:assert";
import fs from "node:fs";
import { sanitizeQueueBackupRows } from "../src/lib/backupQueue.ts";

const src = fs.readFileSync("src/lib/db.ts", "utf8");

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

function importColumns() {
  const start = src.indexOf("INSERT OR IGNORE INTO photos");
  const values = src.indexOf("VALUES (", start);
  const block = src.slice(start, values);
  const open = block.indexOf("(", block.indexOf("photos"));
  const close = block.lastIndexOf(")");
  return block
    .slice(open + 1, close)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function schemaColumns() {
  const createStart = src.indexOf("CREATE TABLE IF NOT EXISTS photos (");
  const createEnd = src.indexOf(");", createStart);
  const create = src.slice(createStart, createEnd);
  const cols = new Set();
  for (const line of create.split("\n").slice(1)) {
    const m = line.trim().match(/^([a-z_]+)\s+/);
    if (m) cols.add(m[1]);
  }
  const migStart = src.indexOf('addColumnsIfMissing(db, "photos", [');
  if (migStart !== -1) {
    const migEnd = src.indexOf("]);", migStart);
    const mig = src.slice(migStart, migEnd);
    for (const m of mig.matchAll(/\[\s*"([a-z_]+)"/g)) cols.add(m[1]);
  }
  return cols;
}

check("import column count matches placeholder count", () => {
  const cols = importColumns();
  const start = src.indexOf("INSERT OR IGNORE INTO photos");
  const values = src.indexOf("VALUES (", start);
  const line = src.slice(values, src.indexOf("`", values));
  const placeholders = (line.match(/\?/g) || []).length;
  assert.equal(cols.length, placeholders, `columns=${cols.length} placeholders=${placeholders}`);
});

check("every imported photos column exists in the schema", () => {
  const schema = schemaColumns();
  const missing = importColumns().filter((c) => !schema.has(c));
  assert.deepEqual(missing, [], `missing from schema: ${missing.join(", ")}`);
});

check("exportAllData still uses SELECT * for photos", () => {
  assert.ok(src.includes('SELECT * FROM photos'), "photos export must use SELECT *");
});

check("queue sanitizer fuzz never emits duplicates or running rows", () => {
  const states = ["pending", "running", "failed", "bogus", undefined];
  for (let round = 0; round < 20; round++) {
    const input = Array.from({ length: 80 }, (_, i) => ({
      local_id: `id_${i % 40}`,
      local_uri: `file:///x/${i}`,
      filename: `f${i}.jpg`,
      folder: null,
      size: i,
      taken_at: Date.now(),
      added_at: Date.now(),
      content_hash: null,
      upload_type: "sync",
      priority: 1,
      state: states[Math.floor(Math.random() * states.length)],
      retries: 0,
      error: null,
      created_at: Date.now(),
      profile_id: null,
      reply_to_message_id: null,
    }));
    const out = sanitizeQueueBackupRows(input);
    const ids = new Set(out.map((r) => r.local_id));
    assert.equal(ids.size, out.length, "duplicate local_id survived");
    assert.ok(out.every((r) => r.state !== "running"), "running row survived");
  }
});

check("queue sanitizer caps at 5000 rows", () => {
  const input = Array.from({ length: 6000 }, (_, i) => ({
    local_id: `id_${i}`,
    local_uri: `file:///x/${i}`,
    filename: `f${i}.jpg`,
    state: "pending",
  }));
  const out = sanitizeQueueBackupRows(input);
  assert.ok(out.length <= 5000, `got ${out.length}`);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
