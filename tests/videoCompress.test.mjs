// Video-compression planning rules.
import assert from "node:assert";
import { planVideoCompression } from "../src/lib/videoCompress.ts";

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

const base = { width: 3840, height: 2160, durationMs: 60_000, sizeBytes: 100 * 1024 * 1024 };

check("off never plans", () => {
  assert.equal(planVideoCompression({ ...base, target: "off" }), null);
});

check("4K/60s plans 1080p with real savings", () => {
  const plan = planVideoCompression({ ...base, target: "1080p" });
  assert.ok(plan);
  assert.equal(plan.target, "1080p");
  assert.equal(plan.height, 1080);
  assert.ok(plan.width > 0 && plan.width % 2 === 0);
  assert.ok(plan.estimatedBytes < base.sizeBytes);
  assert.ok(plan.savingsPct > 50);
});

check("4K/60s plans 720p", () => {
  const plan = planVideoCompression({ ...base, target: "720p" });
  assert.ok(plan);
  assert.equal(plan.height, 720);
  assert.ok(plan.width < 1920);
});

check("source already at target height is skipped", () => {
  assert.equal(
    planVideoCompression({ ...base, width: 1280, height: 720, target: "720p" }),
    null
  );
});

check("invalid geometry/duration is skipped", () => {
  assert.equal(planVideoCompression({ ...base, width: 0, target: "1080p" }), null);
  assert.equal(planVideoCompression({ ...base, durationMs: 0, target: "1080p" }), null);
  assert.equal(planVideoCompression({ ...base, sizeBytes: 0, target: "1080p" }), null);
});

check("short low-bitrate clips with no savings are skipped", () => {
  // 2 seconds at 1080p estimate is ~1.3 MB; a 1 MB source has no savings.
  assert.equal(
    planVideoCompression({
      width: 3840,
      height: 2160,
      durationMs: 2000,
      sizeBytes: 1024 * 1024,
      target: "1080p",
    }),
    null
  );
});

check("aspect ratio is preserved within rounding", () => {
  const plan = planVideoCompression({ ...base, width: 1920, height: 1080, target: "720p" });
  // 1920x1080 is already 1080p; a 720p target is not "meaningfully larger"
  // in height terms (1080 > 720*1.05 = 756), so it does plan.
  assert.ok(plan);
  const ratio = plan.width / plan.height;
  assert.ok(Math.abs(ratio - 16 / 9) < 0.02, `ratio ${ratio}`);
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
