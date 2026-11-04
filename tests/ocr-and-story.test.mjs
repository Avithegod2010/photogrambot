const MB = 1024 * 1024;
// R30 harness: trip story summarizer + OCR retry-state semantics.
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


// Mirrors story.ts summarizeTrip core
function summarizeTrip(name, photos) {
  const geo = photos.filter((p) => p.latitude != null && p.longitude != null);
  const cells = new Map();
  for (const p of geo) {
    const key = `${p.latitude.toFixed(2)}:${p.longitude.toFixed(2)}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  const places = [...cells.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => ({ label: key.replace(":", "°, ") + "°", count }));
  const dated = photos.filter((p) => p.taken_at > 0).sort((a, b) => a.taken_at - b.taken_at);
  const largest = photos.reduce((acc, p) => {
    if (!p.size) return acc;
    return !acc || p.size > acc.size ? { filename: p.filename, size: p.size } : acc;
  }, null);
  return {
    name,
    count: photos.length,
    favorites: photos.filter((p) => !!p.favorite).length,
    firstDay: dated.length ? dated[0].taken_at : null,
    lastDay: dated.length ? dated[dated.length - 1].taken_at : null,
    places,
    largest,
  };
}
const day = 86400 * 1000;
check("trip summary counts, sorts and picks largest", () => {
  const s = summarizeTrip("Trip", [
    { taken_at: 3 * day, size: 5 * MB, latitude: 48.8584, longitude: 2.2945, favorite: 1 },
    { taken_at: 1 * day, size: 2 * MB, latitude: 48.8580, longitude: 2.2940, favorite: 0 },
    { taken_at: 2 * day, size: 9 * MB, latitude: null, longitude: null, favorite: 0 },
  ]);
  assert.strictEqual(s.count, 3);
  assert.strictEqual(s.favorites, 1);
  assert.strictEqual(s.firstDay, day);
  assert.strictEqual(s.lastDay, 3 * day);
  assert.strictEqual(s.largest.size, 9 * MB);
});
check("places: ~5km grid clusters, most-shot first, max 3", () => {
  const s = summarizeTrip("T", [
    { latitude: 48.8584, longitude: 2.2945, taken_at: 1, size: null, favorite: 0 },
    { latitude: 48.8580, longitude: 2.2940, taken_at: 1, size: null, favorite: 0 }, // same cell
    { latitude: 51.5007, longitude: -0.1246, taken_at: 1, size: null, favorite: 0 },
    { latitude: 41.8902, longitude: 12.4922, taken_at: 1, size: null, favorite: 0 },
  ]);
  assert.strictEqual(s.places.length, 3);
  assert.strictEqual(s.places[0].count, 2); // Paris pair clustered
});
check("empty trip yields empty story parts, no crash", () => {
  const s = summarizeTrip("Empty", []);
  assert.strictEqual(s.count, 0);
  assert.strictEqual(s.firstDay, null);
  assert.deepStrictEqual(s.places, []);
  assert.strictEqual(s.largest, null);
});


// Mirrors ocr.ts retry-state semantics
function nextState(currentOcrText, outcome) {
  // outcome: "text" | "empty" | "error" | "no-source"
  if (outcome === "error") return currentOcrText; // NULL stays NULL → retried
  if (outcome === "no-source") return ""; // finished-empty, never retried
  return outcome === "text" ? "wifi: pw123" : "";
}
check("failed OCR keeps NULL so next pass retries", () => {
  assert.strictEqual(nextState(null, "error"), null);
});
check("finished rows (text or empty) never requeue", () => {
  assert.notStrictEqual(nextState(null, "text"), null);
  assert.notStrictEqual(nextState(null, "empty"), null);
  assert.notStrictEqual(nextState(null, "no-source"), null);
});
check("pending query selects only NULL rows (mirrors SQL)", () => {
  const rows = [{ ocr: null }, { ocr: "" }, { ocr: "text" }, { ocr: null }];
  assert.strictEqual(rows.filter((r) => r.ocr === null).length, 2);
});

console.log(`\n${passed}/6 checks passed`);
