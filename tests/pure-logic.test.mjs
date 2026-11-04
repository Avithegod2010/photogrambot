// Pure-logic regression suite. Imports the real src/lib modules (see
// ts-resolve-hook.mjs for the extensionless-import shim), so these assertions
// cover the code that ships in the app rather than mirrored copies.
import assert from "node:assert";
import { pbkdf2Sync } from "node:crypto";
import { EMBEDDING_DIM, quantizeEmbedding, cosineSimilarity } from "../src/lib/vecmath.ts";
import {
  sha256,
  hmacSha256,
  pbkdf2Sha256,
  bytesToHex,
  hexToBytes,
  utf8,
} from "../src/lib/pbkdf2.ts";
import { classifyAutoTags } from "../src/lib/autotags.ts";
import {
  formatBytes,
  formatDuration,
  formatDate,
  dateGroupLabel,
  escapeHtml,
  isVideoMime,
} from "../src/lib/format.ts";
import { buildCaption, buildPreviewCaption, parseCaption } from "../src/lib/caption.ts";
import { clusterTrips } from "../src/lib/trips.ts";
import { dcGridFromJpeg, dHashFromDc, hammingHex, clusterByDistance } from "../src/lib/phash.ts";

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
const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} !≈ ${expected}`);

// ---------------------------------------------------------------- vecmath
check("EMBEDDING_DIM is the Gemini 768-dim shape", () => {
  assert.strictEqual(EMBEDDING_DIM, 768);
});

check("quantizeEmbedding normalizes to the int8 window", () => {
  assert.deepStrictEqual(Array.from(quantizeEmbedding([0, 1, -1, 0.5])), [128, 255, 1, 192]);
  assert.deepStrictEqual(Array.from(quantizeEmbedding([0, 0])), [128, 128]);
  const empty = quantizeEmbedding([]);
  assert.strictEqual(empty.length, 0);
});

check("cosineSimilarity: identity, opposite, ranking, zero and mismatched", () => {
  const q = quantizeEmbedding([1, 0, 0]);
  close(cosineSimilarity(q, q), 1);
  const opposite = quantizeEmbedding([-1, 0, 0]);
  close(cosineSimilarity(q, opposite), -1);
  const near = quantizeEmbedding([0.9, 0.1, 0]);
  const far = quantizeEmbedding([0.1, 0.9, 0]);
  assert.ok(cosineSimilarity(q, near) > cosineSimilarity(q, far));
  assert.strictEqual(cosineSimilarity(quantizeEmbedding([0, 0, 0]), q), 0);
  assert.strictEqual(cosineSimilarity(q, new Uint8Array(2)), 0);
  assert.strictEqual(cosineSimilarity(new Uint8Array(0), new Uint8Array(0)), 0);
});

// ---------------------------------------------------------------- pbkdf2 / hashes
check("sha256 matches FIPS 180-4 ('abc')", () => {
  assert.strictEqual(
    bytesToHex(sha256(utf8("abc"))),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

check("hmacSha256 matches RFC 4231 case 1", () => {
  const key = new Uint8Array(20).fill(0x0b);
  assert.strictEqual(
    bytesToHex(hmacSha256(key, utf8("Hi There"))),
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
  );
});

check("pbkdf2Sha256 matches RFC 4231 case 2", () => {
  assert.strictEqual(
    bytesToHex(pbkdf2Sha256(utf8("password"), utf8("salt"), 1, 32)),
    "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b"
  );
});

check("pbkdf2Sha256 matches node:crypto across blocks (1000 iterations)", () => {
  const password = utf8("correct horse battery staple");
  const salt = utf8("photogrambot-test-salt");
  const expected = pbkdf2Sync(password, salt, 1000, 64, "sha256");
  assert.strictEqual(bytesToHex(pbkdf2Sha256(password, salt, 1000, 64)), expected.toString("hex"));
});

check("pbkdf2Sha256 rejects bad iteration counts / key lengths", () => {
  assert.throws(() => pbkdf2Sha256(utf8("p"), utf8("s"), 0, 32));
  assert.throws(() => pbkdf2Sha256(utf8("p"), utf8("s"), 1, 0));
  assert.throws(() => pbkdf2Sha256(utf8("p"), utf8("s"), 1, 1.5));
});

check("hex helpers round-trip and reject nothing silently", () => {
  const bytes = Uint8Array.from([0, 1, 15, 16, 127, 255]);
  assert.strictEqual(bytesToHex(bytes), "00010f107fff");
  assert.deepStrictEqual(Array.from(hexToBytes("00010f107fff")), Array.from(bytes));
  assert.strictEqual(bytesToHex(utf8("é")), "c3a9");
});

// ---------------------------------------------------------------- autotags
check("classifyAutoTags tags screenshots (including 'Screen Shot')", () => {
  assert.deepStrictEqual(classifyAutoTags("Screenshot_20260101-120000.png", "image/png"), ["screenshot"]);
  assert.deepStrictEqual(classifyAutoTags("Screen Shot 2026-01-01.png", "image/png"), ["screenshot"]);
  assert.deepStrictEqual(classifyAutoTags("Screen-Shot-1.jpg", "image/jpeg"), ["screenshot"]);
});

check("classifyAutoTags tags screen recordings", () => {
  assert.deepStrictEqual(classifyAutoTags("Screen-Recording_123.mp4", "video/mp4"), ["screenrec"]);
  assert.deepStrictEqual(classifyAutoTags("screenrecord_1.mp4", "video/mp4"), ["screenrec"]);
});

check("classifyAutoTags tags WhatsApp media by name and WA-prefix", () => {
  assert.deepStrictEqual(classifyAutoTags("WhatsApp Image 2026-01-01.jpeg", "image/jpeg"), ["whatsapp"]);
  assert.deepStrictEqual(classifyAutoTags("WA0123~.jpg", "image/jpeg"), ["whatsapp"]);
});

check("classifyAutoTags detects documents by extension or mime", () => {
  assert.deepStrictEqual(classifyAutoTags("Report.pdf", "application/octet-stream"), ["document"]);
  assert.deepStrictEqual(classifyAutoTags("scan.jpg", "application/pdf"), ["document"]);
  assert.deepStrictEqual(classifyAutoTags("notes.txt", null), ["document"]);
});

check("classifyAutoTags emits multiple tags in stable order", () => {
  assert.deepStrictEqual(classifyAutoTags("WhatsApp Screenshot 1.jpg", "image/jpeg"), [
    "screenshot",
    "whatsapp",
  ]);
  assert.deepStrictEqual(classifyAutoTags("IMG_0001.jpg", "image/jpeg"), []);
  assert.deepStrictEqual(classifyAutoTags("", "image/jpeg"), []);
});

// ---------------------------------------------------------------- format
check("formatBytes covers the unit ladder", () => {
  assert.strictEqual(formatBytes(0), "0 B");
  assert.strictEqual(formatBytes(null), "0 B");
  assert.strictEqual(formatBytes(1023), "1023 B");
  assert.strictEqual(formatBytes(1024), "1.0 KB");
  assert.strictEqual(formatBytes(1572864), "1.5 MB");
  assert.strictEqual(formatBytes(100 * 1024 * 1024), "100 MB");
});

check("formatDuration renders m:ss and h:mm:ss without unit bugs", () => {
  assert.strictEqual(formatDuration(0), "");
  assert.strictEqual(formatDuration(5000), "0:05");
  assert.strictEqual(formatDuration(65000), "1:05");
  assert.strictEqual(formatDuration(305000), "5:05");
  assert.strictEqual(formatDuration(3600000), "1:00:00");
  assert.strictEqual(formatDuration(3661000), "1:01:01");
});

check("escapeHtml neutralizes Telegram HTML metacharacters", () => {
  assert.strictEqual(escapeHtml("a & <b>"), "a &amp; &lt;b&gt;");
});

check("isVideoMime is prefix-based and null-safe", () => {
  assert.strictEqual(isVideoMime("video/mp4"), true);
  assert.strictEqual(isVideoMime("image/jpeg"), false);
  assert.strictEqual(isVideoMime(null), false);
});

check("dateGroupLabel handles Today / Yesterday / month / cross-year", () => {
  const now = new Date(2026, 10, 4, 12, 0, 0); // 4 Nov 2026, local time
  assert.strictEqual(dateGroupLabel(new Date(2026, 10, 4, 9).getTime(), now), "Today");
  assert.strictEqual(dateGroupLabel(new Date(2026, 10, 3, 23).getTime(), now), "Yesterday");
  assert.strictEqual(dateGroupLabel(new Date(2026, 9, 20, 12).getTime(), now), "October 20");
  assert.strictEqual(dateGroupLabel(new Date(2025, 11, 25, 12).getTime(), now), "25 December 2025");
});

check("formatDate uses the local dd.mm.yyyy hh:mm:ss layout", () => {
  assert.strictEqual(formatDate(new Date(2026, 10, 4, 12, 34, 56).getTime()), "04.11.2026 12:34:56");
  assert.strictEqual(formatDate(null), "—");
});

// ---------------------------------------------------------------- caption
const HASH64 = "a".repeat(64);

check("buildPreviewCaption carries hash and version tag", () => {
  const plain = buildPreviewCaption(HASH64, 1536);
  assert.strictEqual(plain, `<b>[Preview 1.5 KB]</b> #hash: ${HASH64}`);
  const v2 = buildPreviewCaption(HASH64, 1536, 2);
  assert.ok(v2.endsWith("#v2"));
  const noHash = buildPreviewCaption(null, 1536);
  assert.strictEqual(noHash, "<b>[Preview 1.5 KB]</b>");
});

check("parseCaption round-trips a full caption", () => {
  const caption = buildCaption({
    filename: "holiday<1>.jpg",
    size: 2048,
    width: 4000,
    height: 3000,
    dateTaken: new Date(2026, 6, 1, 10, 30).getTime(),
    camera: "Pixel <8>",
    technical: { aperture: "1.8", shutter: "1/120", iso: 100, focalLength: "6.9", lens: "Main" },
    gps: { lat: 12.345678, lon: 77.123456 },
    tags: ["screenshot"],
    device: "phone_1",
    hash: HASH64,
    aiDescription: "A cat & a <dog>",
  });
  assert.ok(caption.includes("holiday&lt;1&gt;.jpg"));
  assert.ok(caption.includes("Pixel &lt;8&gt;"));
  assert.ok(caption.length <= 1024);

  const parsed = parseCaption(caption);
  assert.strictEqual(parsed.hash, HASH64);
  assert.strictEqual(parsed.device, "phone_1");
  assert.ok(parsed.tags.includes("screenshot"));
  assert.deepStrictEqual(parsed.coords, { lat: 12.345678, lon: 77.123456 });
  assert.strictEqual(parsed.technical.aperture, "1.8");
  assert.strictEqual(parsed.technical.shutter, "1/120");
  assert.strictEqual(parsed.technical.iso, 100);
  assert.strictEqual(parsed.technical.lens, "Main");
  assert.strictEqual(parsed.isPreview, false);
  assert.strictEqual(parsed.isDbBackup, false);
});

check("parseCaption recognizes md5 hashes, previews and db backups", () => {
  const md5 = `md5:${"b".repeat(32)}`;
  const preview = parseCaption(buildPreviewCaption(md5, 5000, 3));
  assert.strictEqual(preview.hash, md5);
  assert.strictEqual(preview.isPreview, true);
  assert.ok(preview.tags.includes("v3"));

  const backup = parseCaption("#db_backup\n#hash: " + HASH64);
  assert.strictEqual(backup.isDbBackup, true);
  assert.strictEqual(backup.hash, HASH64);
  assert.ok(!backup.tags.includes("db_backup"));
});

check("buildCaption never ends on a half-written HTML tag", () => {
  const caption = buildCaption({
    filename: "photo.jpg",
    aiDescription: "x".repeat(5000),
    tags: ["document"],
    hash: HASH64,
  });
  assert.ok(caption.length <= 1024, `caption was ${caption.length} chars`);
  assert.ok(!caption.endsWith("<"));
  assert.ok(caption.includes("#document"));
});

// ---------------------------------------------------------------- trips
const DAY = 86400000;
const BASE = Date.UTC(2026, 2, 10, 12, 0, 0);
const photo = (id, offsetMs, lat = null, lon = null) => ({
  id,
  taken_at: BASE + offsetMs,
  latitude: lat,
  longitude: lon,
});

check("clusterTrips groups a continuous day and omits small clusters", () => {
  const rows = [
    photo("a1", 0),
    photo("a2", 2 * 3600000),
    photo("a3", 5 * 3600000),
    // 10 days later — a separate event.
    photo("b1", 10 * DAY),
    photo("b2", 10 * DAY + 3600000),
    photo("b3", 10 * DAY + 2 * 3600000),
    photo("b4", 10 * DAY + 3 * 3600000),
    // A lone photo must not become an album.
    photo("c1", 20 * DAY),
  ];
  const clusters = clusterTrips(rows);
  assert.strictEqual(clusters.length, 2);
  assert.deepStrictEqual(clusters[0].photoIds, ["a1", "a2", "a3"]);
  assert.deepStrictEqual(clusters[1].photoIds, ["b1", "b2", "b3", "b4"]);
  assert.strictEqual(clusters[0].startAt, BASE);
  assert.strictEqual(clusters[1].endAt, BASE + 10 * DAY + 3 * 3600000);
});

check("clusterTrips splits on a >150 km jump only after 6 hours", () => {
  const rows = [
    photo("x1", 0, 0, 0),
    photo("x2", 3600000, 0.1, 0.1),
    // 10 degrees ≈ 1100 km, seven hours later → new trip.
    photo("y1", 8 * 3600000, 10, 10),
    photo("y2", 9 * 3600000, 10.1, 10.1),
  ];
  const split = clusterTrips(rows, { minPhotos: 2 });
  assert.strictEqual(split.length, 2);
  assert.deepStrictEqual(split[0].photoIds, ["x1", "x2"]);
  assert.deepStrictEqual(split[1].photoIds, ["y1", "y2"]);

  // Same distance but under the 6-hour guard → one continuous trip.
  const joined = clusterTrips(
    [photo("x1", 0, 0, 0), photo("x2", 3600000, 0.1, 0.1), photo("y1", 3 * 3600000, 10, 10), photo("y2", 4 * 3600000, 10.1, 10.1)],
    { minPhotos: 2 }
  );
  assert.strictEqual(joined.length, 1);
  assert.strictEqual(joined[0].photoIds.length, 4);
});

check("clusterTrips honors maxGapHours and computes geotag center", () => {
  const rows = [
    photo("a", 0, 10, 20),
    photo("b", 3600000, 12, 22),
    photo("c", 4 * 3600000, 14, 24),
    photo("d", 5 * 3600000, 16, 26),
  ];
  const split = clusterTrips(rows, { maxGapHours: 2, minPhotos: 2 });
  assert.strictEqual(split.length, 2);
  assert.deepStrictEqual(split[0].photoIds, ["a", "b"]);
  assert.deepStrictEqual(split[1].photoIds, ["c", "d"]);
  const merged = clusterTrips(rows, { maxGapHours: 36, minPhotos: 2 });
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].centerLat, 13);
  assert.strictEqual(merged[0].centerLon, 23);
});

check("clusterTrips ignores rows without ids or usable timestamps", () => {
  const clusters = clusterTrips(
    [
      { id: "", taken_at: BASE, latitude: null, longitude: null },
      { id: "bad", taken_at: Number.NaN, latitude: null, longitude: null },
      photo("ok1", 0),
      photo("ok2", 1000),
      photo("ok3", 2000),
    ],
    { minPhotos: 2 }
  );
  assert.strictEqual(clusters.length, 1);
  assert.deepStrictEqual(clusters[0].photoIds, ["ok1", "ok2", "ok3"]);
});

// ---------------------------------------------------------------- phash
function dcGrid(values, w, h) {
  return { grid: Float32Array.from(values), w, h };
}

check("dHashFromDc encodes left<right as 1 for 9×8 blocks", () => {
  const row = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const increasing = [];
  const decreasing = [];
  for (let y = 0; y < 8; y++) {
    increasing.push(...row);
    decreasing.push(...[...row].reverse());
  }
  assert.strictEqual(dHashFromDc(dcGrid(increasing, 9, 8)), "ffffffffffffffff");
  assert.strictEqual(dHashFromDc(dcGrid(decreasing, 9, 8)), "0000000000000000");
  assert.strictEqual(dHashFromDc(dcGrid(new Float32Array(9 * 8).fill(7), 9, 8)), "0000000000000000");
});

check("dHashFromDc downsamples larger grids deterministically", () => {
  const w = 36;
  const h = 32;
  const values = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) values[y * w + x] = x;
  const hash = dHashFromDc(dcGrid(values, w, h));
  assert.strictEqual(hash, "ffffffffffffffff");
  assert.strictEqual(hash.length, 16);
});

check("hammingHex counts bit differences and rejects length mismatch", () => {
  assert.strictEqual(hammingHex("ffffffffffffffff", "0000000000000000"), 64);
  assert.strictEqual(hammingHex("0000000000000000", "0000000000000001"), 1);
  assert.strictEqual(hammingHex("0000000000000003", "0000000000000000"), 2);
  assert.strictEqual(hammingHex("0", "00"), 64);
});

check("clusterByDistance is transitive and drops singletons", () => {
  const hex = (n) => BigInt(n).toString(16).padStart(16, "0");
  const items = [
    { id: "a", hash: hex(0) }, // 0 bits
    { id: "b", hash: hex(3) }, // 2 bits from a
    { id: "c", hash: hex(15) }, // 2 bits from b, 4 from a
    { id: "d", hash: "ffffffffffffffff" }, // unrelated → singleton, dropped
  ];
  const clusters = clusterByDistance(items, 3);
  assert.strictEqual(clusters.length, 1);
  assert.deepStrictEqual(clusters[0].members.map((m) => m.id), ["a", "b", "c"]);
});

check("dcGridFromJpeg returns null on non-JPEG and truncated input", () => {
  assert.strictEqual(dcGridFromJpeg(new Uint8Array(0)), null);
  assert.strictEqual(dcGridFromJpeg(utf8("definitely not a jpeg")), null);
  assert.strictEqual(dcGridFromJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])), null);
});

console.log(`\n${passed} checks passed`);
