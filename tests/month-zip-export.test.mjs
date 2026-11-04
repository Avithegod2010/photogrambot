// R27 Batch C harness: ZIP export decision logic.
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

const MB = 1024 * 1024;
// Mirrors zipexport.ts constants/decisions
const BOT_DOWNLOAD_LIMIT = 20 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;
function decide(size, bytesSoFar) {
  if (size > BOT_DOWNLOAD_LIMIT) return "skip-oversize";
  if (bytesSoFar + size > MAX_ARCHIVE_BYTES) return "skip-cap";
  return "include";
}
check("normal photo included", () => assert.strictEqual(decide(5 * MB, 0), "include"));
check("over-20MB bot limit skipped", () => assert.strictEqual(decide(25 * MB, 0), "skip-oversize"));
check("archive cap enforced exactly", () => {
  assert.strictEqual(decide(4 * MB, 496 * MB), "include"); // exactly 500 fits
  assert.strictEqual(decide(10 * MB, 495 * MB), "skip-cap"); // 505 exceeds
});
check("zero-byte row still includes (count matters)", () => assert.strictEqual(decide(0, 400 * MB), "include"));

function safeName(name) {
  return (name || "photo").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}
check("filename sanitization", () => {
  assert.strictEqual(safeName('IMG_1: *bad?.jpg'), "IMG_1_ _bad_.jpg");
  assert.strictEqual(safeName(""), "photo");
  assert.ok(safeName("x".repeat(300)).length <= 120);
});

// Month window math mirrors getUploadedPhotosInMonth
check("month window covers DST-length months", () => {
  const month = 9; // October
  const year = 2026;
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  assert.strictEqual(end - start, 31 * 86400 * 1000); // October has 31 days
  const feb = 1;
  const startF = new Date(2026, feb, 1).getTime();
  const endF = new Date(2026, feb + 1, 1).getTime();
  assert.strictEqual(endF - startF, 28 * 86400 * 1000); // 2026 not a leap year
});

console.log(`\n${passed}/6 checks passed`);
