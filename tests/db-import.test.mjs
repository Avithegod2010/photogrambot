// Verifies the importAllData photo INSERT: column count == placeholder count
// and the statement actually prepares/executes against the full runtime schema.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const src = fs.readFileSync("src/lib/db.ts", "utf8");
const start = src.indexOf("`INSERT OR IGNORE INTO photos");
const end = src.indexOf("`", start + 1);
const sql = src.slice(start + 1, end);

const cols = sql.slice(sql.indexOf("(") + 1, sql.indexOf(")")).split(",").map((s) => s.trim());
const valuesClause = sql.slice(sql.lastIndexOf("VALUES") + 6).trim();
const placeholders = (valuesClause.match(/\?/g) ?? []).length;

let ok = true;
const check = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? ` (${extra})` : ""}`);
  if (!cond) ok = false;
};

check("column count == placeholder count", cols.length === placeholders, `${cols.length} vs ${placeholders}`);
check("no duplicate columns", new Set(cols).size === cols.length);
check("carries ocr_text", cols.includes("ocr_text"));
check("carries motion_checked", cols.includes("motion_checked"));

// Build the runtime schema (base columns + every migration column) and execute.
const DB = new DatabaseSync(":memory:");
DB.exec("CREATE TABLE photos (id TEXT PRIMARY KEY)");
const base = src.slice(src.indexOf("CREATE TABLE IF NOT EXISTS photos"), src.indexOf("CREATE INDEX IF NOT EXISTS idx_photos_taken"));
for (const line of base.split("\n")) {
  const m = line.match(/^\s{6}(\w+) (TEXT|INTEGER|REAL)\b/);
  if (!m || m[1] === "id") continue;
  DB.exec(`ALTER TABLE photos ADD COLUMN ${m[1]} ${m[2]}`);
}
const migBlock = src.slice(src.indexOf('addColumnsIfMissing(db, "photos"'), src.indexOf("await migrateFtsSchema(db);"));
for (const m of migBlock.matchAll(/\["(\w+)", "(TEXT|INTEGER|REAL)"\]/g)) {
  if (m[1] === "id") continue;
  try {
    DB.exec(`ALTER TABLE photos ADD COLUMN ${m[1]} ${m[2]}`);
  } catch (e) {
    if (!String(e).includes("duplicate column")) throw e;
  }
}
const schemaCols = DB.prepare("PRAGMA table_info(photos)").all().map((r) => r.name);
const missing = schemaCols.filter((c) => c !== "id" && !cols.includes(c));
check("every schema column is imported", missing.length === 0, missing.join(",") || "none");

const stmt = DB.prepare(sql);
const args = cols.map((c) => (c === "filename" ? "" : c === "taken_at" || c === "added_at" ? 0 : c === "favorite" ? 0 : c === "status" ? "local" : null));
stmt.run(...args);
const row = DB.prepare("SELECT COUNT(*) n, ocr_text, motion_checked FROM photos").get();
check("insert executes", row.n === 1);
check("ocr_text NULL round-trips as NULL", row.ocr_text === null);

// two rows with the distinct tri-state
const stmt2 = DB.prepare(sql.replace("INSERT OR IGNORE", "INSERT"));
const args2 = cols.map((c) => (c === "id" ? "p2" : c === "filename" ? "" : c === "taken_at" || c === "added_at" ? 0 : c === "favorite" ? 0 : c === "status" ? "local" : c === "ocr_text" ? "" : c === "motion_checked" ? 1 : null));
stmt2.run(...args2);
const r2 = DB.prepare("SELECT ocr_text, motion_checked FROM photos WHERE id='p2'").get();
check("empty ocr_text survives as ''", r2.ocr_text === "");
check("motion_checked survives", r2.motion_checked === 1);

console.log(ok ? "\nALL PASS" : "\nFAILURES");
process.exit(ok ? 0 : 1);
