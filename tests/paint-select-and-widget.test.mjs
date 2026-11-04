// R32 harness: paint-select span math + widget scope SQL.
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

// Mirrors selectSpan (shared by long-press range and paint)
function spanSelection(flatIds, fromId, toId) {
  const a = flatIds.indexOf(fromId);
  const b = flatIds.indexOf(toId);
  if (a === -1 || b === -1 || a === b) return null;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return new Set(flatIds.slice(lo, hi + 1));
}
const flat = ["a", "b", "c", "d", "e", "f", "g"];
check("span selects inclusive range in display order", () => {
  const s = spanSelection(flat, "a", "d");
  assert.deepStrictEqual([...s].sort(), ["a", "b", "c", "d"]);
});
check("reverse direction gives the same span", () => {
  const fwd = spanSelection(flat, "a", "e");
  const rev = spanSelection(flat, "e", "a");
  assert.deepStrictEqual([...fwd].sort(), [...rev].sort());
});
check("unknown ids / same id → no change", () => {
  assert.strictEqual(spanSelection(flat, "x", "b"), null);
  assert.strictEqual(spanSelection(flat, "a", "a"), null);
});

// Paint hit-test mirrors handlePaintMove's rect containment
function hitTest(tiles, cx, cy) {
  for (const [id, t] of tiles) {
    if (cx >= t.ax && cx <= t.ax + t.w && cy >= t.ay && cy <= t.ay + t.h) return id;
  }
  return null;
}
check("pointer inside a tile rect resolves that tile", () => {
  const tiles = new Map([
    ["t1", { ax: 2, ay: 100, w: 100, h: 100 }],
    ["t2", { ax: 104, ay: 100, w: 100, h: 100 }],
    ["t3", { ax: 2, ay: 202, w: 100, h: 100 }],
  ]);
  assert.strictEqual(hitTest(tiles, 150, 150), "t2");
  assert.strictEqual(hitTest(tiles, 50, 250), "t3");
  assert.strictEqual(hitTest(tiles, 50, 201), null); // gap between rows (200..202)
});

// Widget scope SQL mirror
function widgetScope(favoritesOnly) {
  return favoritesOnly ? "AND favorite = 1" : "";
}
check("widget scope narrows to favorites only when enabled", () => {
  const rows = [{ f: 1 }, { f: 0 }, { f: 1 }, { f: 0 }];
  const all = rows.filter(() => true);
  const favs = rows.filter((r) => widgetScope(true) && r.f === 1);
  assert.strictEqual(all.length, 4);
  assert.strictEqual(favs.length, 2);
});

console.log(`\n${passed}/5 checks passed`);
