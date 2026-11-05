// Best-shot ranking.
import assert from "node:assert";
import { photoScore, rankPhotos, sortByBest } from "../src/lib/bestOf.ts";

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

const photo = (over = {}) => ({
  id: "p",
  width: 4000,
  height: 3000,
  size: 2_000_000,
  favorite: 0,
  taken_at: 1000,
  ...over,
});

check("favorites win over resolution", () => {
  const fav = photo({ id: "fav", favorite: 1, width: 100, height: 100 });
  const big = photo({ id: "big", width: 8000, height: 6000 });
  assert.deepEqual(sortByBest([big, fav]).map((p) => p.id), ["fav", "big"]);
});

check("higher resolution wins when neither is favorite", () => {
  const big = photo({ id: "big", width: 8000, height: 6000 });
  const small = photo({ id: "small", width: 1000, height: 1000 });
  assert.deepEqual(sortByBest([small, big]).map((p) => p.id), ["big", "small"]);
});

check("rankPhotos caps the list", () => {
  const photos = Array.from({ length: 50 }, (_, i) => photo({ id: `p${i}` }));
  assert.equal(rankPhotos(photos, 40).length, 40);
});

check("photoScore is numeric and favorite dominates", () => {
  assert.ok(photoScore(photo()) > 0);
  assert.ok(photoScore(photo({ favorite: 1 })) > photoScore(photo(), 1));
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
