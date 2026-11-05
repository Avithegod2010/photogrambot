// Offline gazetteer lookup: nearest city, cutoff and formatting.
import assert from "node:assert";
import { CITIES, haversineKm, nearestCity, placeLabel } from "../src/lib/places.ts";

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

check("haversine sanity: one degree of longitude at the equator", () => {
  const km = haversineKm(0, 0, 0, 1);
  assert.ok(Math.abs(km - 111.19) < 0.2, `got ${km}`);
});

check("nearest city: Kochi", () => {
  const hit = nearestCity(9.9312, 76.2673);
  assert.equal(hit?.city.name, "Kochi");
  assert.ok(hit && hit.km < 1);
});

check("nearest city: Mumbai", () => {
  assert.equal(nearestCity(19.076, 72.8777)?.city.name, "Mumbai");
});

check("nearest city: Delhi", () => {
  assert.equal(nearestCity(28.6139, 77.209)?.city.name, "Delhi");
});

check("open ocean returns null", () => {
  assert.equal(nearestCity(0, -140), null);
  assert.equal(placeLabel(0, -140), null);
});

check("cutoff is enforced", () => {
  // (12, 77) is ~51 km from Mysuru; a 10 km cutoff must reject it, a 60 km
  // cutoff must accept it.
  assert.equal(nearestCity(12.0, 77.0, 10), null);
  assert.equal(nearestCity(12.0, 77.0, 60)?.city.name, "Mysuru");
});

check("placeLabel includes country", () => {
  assert.equal(placeLabel(9.9312, 76.2673), "Kochi, India");
});

check("gazetteer has no duplicate city names", () => {
  const names = CITIES.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
