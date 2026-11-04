// R27 Batch B harness: motion-clip locator + upload priority lanes.
// Imports the real motionScan/autotags modules so the locator and tag rules
// cannot drift from the app.
import assert from "node:assert";
import { locateMotionClip } from "../src/lib/motionScan.ts";
import { classifyAutoTags } from "../src/lib/autotags.ts";

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
// Synthetic motion photo: 1 MB JPEG body ending in EOI + 1.5 MB MP4-ish tail.
const jpegBody = new Uint8Array(1 * MB);
jpegBody[0] = 0xff; jpegBody[1] = 0xd8; // SOI
const eoiPos = jpegBody.length - 2;
jpegBody[eoiPos] = 0xff; jpegBody[eoiPos + 1] = 0xd9; // EOI
const mp4 = new Uint8Array(1.5 * MB);
const dv = new DataView(mp4.buffer);
dv.setUint32(0, mp4.length); // box size
mp4.set(new TextEncoder().encode("ftyp"), 4);
const motion = new Uint8Array(jpegBody.length + mp4.length);
motion.set(jpegBody, 0);
motion.set(mp4, jpegBody.length);

check("motion clip located right after EOI (box size prefix honored)", () => {
  const start = locateMotionClip(motion);
  assert.strictEqual(start, jpegBody.length);
});
check("plain JPEG (no tail) → null", () => {
  const plain = new Uint8Array(2 * MB);
  plain[0] = 0xff; plain[1] = 0xd8;
  plain[2 * MB - 2] = 0xff; plain[2 * MB - 1] = 0xd9;
  assert.strictEqual(locateMotionClip(plain), null);
});
check("tiny file → null", () => assert.strictEqual(locateMotionClip(new Uint8Array(100)), null));
check("EOI but no ftyp within window → null", () => {
  const noMp4 = new Uint8Array(jpegBody.length + 1 * MB); // tail of zeros
  noMp4.set(jpegBody, 0);
  assert.strictEqual(locateMotionClip(noMp4), null);
});
check("mid-file EOI false positive skipped when ftyp comes later", () => {
  // A compressed-scanner EOI mid-body (entirely possible in entropy data)
  // must not derail detection: the REAL EOI + ftyp pair still wins.
  const tricky = new Uint8Array(motion);
  tricky[512] = 0xff; tricky[513] = 0xd9;
  assert.strictEqual(locateMotionClip(tricky), jpegBody.length);
});

// Mirrors uploader.uploadPriorityFor's folder mapping (the uploader module
// itself pulls in Expo/RN and cannot load under Node). The tag classification
// is the real implementation imported above.
function uploadPriorityFor(filename, folder) {
  const tags = classifyAutoTags(filename, null);
  if (tags.includes("screenshot") || tags.includes("screenrec")) return 2;
  const f = (folder ?? "").trim().toLowerCase();
  if (f === "camera" || f === "dcim" || f.startsWith("dcim")) return 0;
  return 1;
}
check("camera folder → high lane", () => assert.strictEqual(uploadPriorityFor("IMG_001.jpg", "Camera"), 0));
check("DCIM folder → high lane", () => assert.strictEqual(uploadPriorityFor("IMG_001.jpg", "DCIM"), 0));
check("screenshot → last lane regardless of folder", () =>
  assert.strictEqual(uploadPriorityFor("Screenshot_x.png", "Pictures"), 2));
check("ordinary folder → default lane", () => assert.strictEqual(uploadPriorityFor("IMG_001.jpg", "WhatsApp"), 1));

// Dequeue order: manual first, then priority, then time
const rows = [
  { upload_type: "sync", priority: 2, taken_at: 1, created_at: 1, id: "shot" },
  { upload_type: "manual", priority: 2, taken_at: 9, created_at: 9, id: "shared" },
  { upload_type: "sync", priority: 0, taken_at: 8, created_at: 8, id: "camera" },
  { upload_type: "sync", priority: 1, taken_at: 5, created_at: 5, id: "mid" },
];
const order = [...rows].sort(
  (a, b) =>
    (a.upload_type === "manual" ? 0 : 1) - (b.upload_type === "manual" ? 0 : 1) ||
    a.priority - b.priority ||
    a.taken_at - b.taken_at ||
    a.created_at - b.created_at
);
check("dequeue: manual beats lanes; camera beats mid beats screenshots", () =>
  assert.deepStrictEqual(order.map((r) => r.id), ["shared", "camera", "mid", "shot"]));

console.log(`\n${passed}/10 checks passed`);
