// Local natural-language date parsing.
import assert from "node:assert";
import { parseDateQuery } from "../src/lib/nlDate.ts";

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

const now = new Date(2026, 10, 5, 12, 0); // 5 Nov 2026
const ts = (y, m, d) => new Date(y, m, d).getTime();

check("bare year and remaining text", () => {
  const p = parseDateQuery("beach 2023", now);
  assert.ok(p);
  assert.equal(p.startMs, ts(2023, 0, 1));
  assert.equal(p.endMs, ts(2024, 0, 1));
  assert.equal(p.rest, "beach");
});

check("in/from year forms", () => {
  assert.equal(parseDateQuery("photos from 2023", now)?.rest, "photos");
  assert.equal(parseDateQuery("in 2024", now)?.startMs, ts(2024, 0, 1));
});

check("from X to Y", () => {
  const p = parseDateQuery("from 2022 to 2023", now);
  assert.ok(p);
  assert.equal(p.startMs, ts(2022, 0, 1));
  assert.equal(p.endMs, ts(2024, 0, 1));
});

check("before / after", () => {
  assert.equal(parseDateQuery("before 2024", now)?.endMs, ts(2024, 0, 1));
  assert.equal(parseDateQuery("after 2023", now)?.startMs, ts(2024, 0, 1));
});

check("month + year", () => {
  const p = parseDateQuery("march 2023", now);
  assert.equal(p?.startMs, ts(2023, 2, 1));
  assert.equal(p?.endMs, ts(2023, 3, 1));
});

check("today / yesterday", () => {
  const today = parseDateQuery("today", now);
  assert.equal(today?.startMs, ts(2026, 10, 5));
  assert.equal(today?.endMs, ts(2026, 10, 6));
  const y = parseDateQuery("yesterday", now);
  assert.equal(y?.startMs, ts(2026, 10, 4));
});

check("this/last week (Monday start)", () => {
  const thisWeek = parseDateQuery("this week", now);
  assert.equal(thisWeek?.startMs, ts(2026, 10, 2)); // Monday 2 Nov
  const lastWeek = parseDateQuery("last week", now);
  assert.equal(lastWeek?.startMs, ts(2026, 9, 26));
});

check("this/last month and year", () => {
  assert.equal(parseDateQuery("last month", now)?.startMs, ts(2026, 9, 1));
  assert.equal(parseDateQuery("last year", now)?.startMs, ts(2025, 0, 1));
});

check("last summer uses the most recent March–May", () => {
  const p = parseDateQuery("last summer", now);
  assert.equal(p?.startMs, ts(2026, 2, 1));
  assert.equal(p?.endMs, ts(2026, 5, 1));
});

check("last N days/weeks", () => {
  const p = parseDateQuery("last 7 days", now);
  assert.ok(p);
  assert.equal(p.endMs, now.getTime() + 1);
  assert.ok(p.startMs < p.endMs);
});

check("no date phrase returns null", () => {
  assert.equal(parseDateQuery("sunset at the beach", now), null);
  assert.equal(parseDateQuery("", now), null);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
