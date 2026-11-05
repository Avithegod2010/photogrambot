// Face-embedding clustering semantics.
import assert from "node:assert";
import {
  clusterFaces,
  cosineSimilarity,
  normalizeVector,
} from "../src/lib/peopleCluster.ts";

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

const face = (id, photoId, embedding) => ({ id, photoId, embedding });

check("normalizeVector rejects zero and non-finite vectors", () => {
  assert.equal(normalizeVector([0, 0, 0]), null);
  assert.equal(normalizeVector([1, NaN]), null);
  assert.equal(normalizeVector([]), null);
  assert.deepEqual(normalizeVector([3, 4]), [0.6, 0.8]);
});

check("cosine similarity: identical / orthogonal / opposite", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [-1, 0]) + 1) < 1e-9);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

check("two similar faces cluster together", () => {
  const clusters = clusterFaces([
    face("a", "p1", [1, 0, 0]),
    face("b", "p2", [0.99, 0.01, 0]),
  ]);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].photoIds.sort(), ["p1", "p2"]);
});

check("unrelated faces stay separate", () => {
  const clusters = clusterFaces([
    face("a", "p1", [1, 0, 0]),
    face("b", "p2", [0, 1, 0]),
  ]);
  assert.equal(clusters.length, 2);
});

check("transitive links merge into one cluster", () => {
  // a~b and b~c, but a!~c: union-find must merge all three.
  const clusters = clusterFaces(
    [
      face("a", "p1", [1, 0]),
      face("b", "p2", [0.8, 0.6]),
      face("c", "p3", [0.28, 0.96]),
    ],
    0.7
  );
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].photoIds.length, 3);
});

check("same photo contributes one photoId per cluster", () => {
  const clusters = clusterFaces([
    face("a", "p1", [1, 0]),
    face("b", "p1", [0.99, 0.01]),
  ]);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].photoIds, ["p1"]);
});

check("clusters are ordered by photo count", () => {
  const clusters = clusterFaces([
    face("a", "p1", [1, 0]),
    face("b", "p2", [0, 1]),
    face("c", "p3", [0, 1]),
  ]);
  assert.equal(clusters[0].photoIds.length, 2);
  assert.equal(clusters[1].photoIds.length, 1);
});

check("invalid/zero samples are ignored", () => {
  const clusters = clusterFaces([
    face("a", "p1", [0, 0]),
    face("b", "p2", [1, 0]),
  ]);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].faceIds, ["b"]);
});

check("empty input yields no clusters", () => {
  assert.deepEqual(clusterFaces([]), []);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
