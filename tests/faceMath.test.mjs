// BlazeFace anchor/decode/NMS geometry.
import assert from "node:assert";
import {
  blazeAnchors,
  decodeBlazeFace,
  nms,
  toPixelCrop,
} from "../src/lib/faceMath.ts";

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

check("short-range anchor count is 896", () => {
  assert.equal(blazeAnchors().length, 896);
});

check("anchors are normalized and inside the image", () => {
  for (const a of blazeAnchors()) {
    assert.ok(a.x > 0 && a.x < 1, `x ${a.x}`);
    assert.ok(a.y > 0 && a.y < 1, `y ${a.y}`);
    assert.ok(a.w > 0 && a.w <= 1, `w ${a.w}`);
    assert.ok(a.h > 0 && a.h <= 1, `h ${a.h}`);
  }
});

check("first anchor is the top-left cell center", () => {
  const a = blazeAnchors()[0];
  assert.ok(Math.abs(a.x - 0.5 / 16) < 1e-9);
  assert.ok(Math.abs(a.y - 0.5 / 16) < 1e-9);
});

check("zero regression decodes to the anchor center", () => {
  const anchors = blazeAnchors();
  const reg = new Float32Array(anchors.length * 16);
  const scores = new Float32Array(anchors.length).fill(-20);
  scores[0] = 20; // ~1.0 after sigmoid
  const boxes = decodeBlazeFace(reg, scores, anchors, { minScore: 0.5 });
  assert.equal(boxes.length, 1);
  assert.ok(Math.abs(boxes[0].x - anchors[0].x) < 1e-9);
  assert.ok(Math.abs(boxes[0].y - anchors[0].y) < 1e-9);
  assert.ok(boxes[0].score > 0.99);
});

check("low scores are filtered", () => {
  const anchors = blazeAnchors();
  const reg = new Float32Array(anchors.length * 16);
  const scores = new Float32Array(anchors.length).fill(-20);
  assert.equal(decodeBlazeFace(reg, scores, anchors).length, 0);
});

check("NMS keeps the highest-scoring overlapping box", () => {
  const boxes = [
    { x: 0.5, y: 0.5, w: 0.2, h: 0.2, score: 0.9 },
    { x: 0.51, y: 0.5, w: 0.2, h: 0.2, score: 0.8 },
    { x: 0.1, y: 0.1, w: 0.1, h: 0.1, score: 0.7 },
  ];
  const kept = nms(boxes, 0.3);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].score, 0.9);
  assert.equal(kept[1].score, 0.7);
});

check("pixel crop clamps to the image with padding", () => {
  const crop = toPixelCrop({ x: 0.5, y: 0.5, w: 0.2, h: 0.2, score: 1 }, 1000, 800, 0.2);
  assert.ok(crop.originX >= 0 && crop.originY >= 0);
  assert.ok(crop.originX + crop.width <= 1000);
  assert.ok(crop.originY + crop.height <= 800);
  assert.ok(crop.width > 200 && crop.height > 160);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
