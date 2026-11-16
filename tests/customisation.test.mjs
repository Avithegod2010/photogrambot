// Customisation-round pure logic: schedule resolution, accent math, date
// formats and the caption field editor. Imports the real modules.
import assert from "node:assert";
import {
  ACCENT_PRESETS,
  albumAccent,
  accentHex,
  formatClock,
  hexToRgb,
  isHexColor,
  isWithinWindow,
  luminance,
  mixColors,
  readableOn,
  resolveThemeMode,
  rgbToHex,
} from "../src/lib/appearanceMath.ts";
import { formatDayLabel, formatTimestamp, dateGroupLabel } from "../src/lib/format.ts";
import { buildCaption } from "../src/lib/caption.ts";

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

check("window: normal start inclusive, end exclusive", () => {
  assert.equal(isWithinWindow(600, 600, 720), true);
  assert.equal(isWithinWindow(719, 600, 720), true);
  assert.equal(isWithinWindow(720, 600, 720), false);
  assert.equal(isWithinWindow(599, 600, 720), false);
});

check("window: midnight wrap", () => {
  assert.equal(isWithinWindow(22 * 60, 20 * 60, 7 * 60), true);
  assert.equal(isWithinWindow(6 * 60 + 59, 20 * 60, 7 * 60), true);
  assert.equal(isWithinWindow(7 * 60, 20 * 60, 7 * 60), false);
  assert.equal(isWithinWindow(12 * 60, 20 * 60, 7 * 60), false);
});

check("window: zero-length is never active", () => {
  assert.equal(isWithinWindow(600, 600, 600), false);
});

check("theme: explicit modes win without a schedule", () => {
  const at = new Date(2026, 9, 5, 23, 0);
  assert.equal(resolveThemeMode("dark", false, 1200, 420, "light", at), "dark");
  assert.equal(resolveThemeMode("light", false, 1200, 420, "dark", at), "light");
  assert.equal(resolveThemeMode("amoled", false, 1200, 420, "light", at), "amoled");
});

check("theme: system follows the OS scheme", () => {
  const at = new Date(2026, 9, 5, 12, 0);
  assert.equal(resolveThemeMode("system", false, 1200, 420, "light", at), "light");
  assert.equal(resolveThemeMode("system", false, 1200, 420, "dark", at), "dark");
  assert.equal(resolveThemeMode("system", false, 1200, 420, "unspecified", at), "dark");
});

check("theme: schedule picks dark at night and light by day", () => {
  const night = new Date(2026, 9, 5, 23, 0);
  const day = new Date(2026, 9, 5, 12, 0);
  assert.equal(resolveThemeMode("dark", true, 1200, 420, "light", night), "dark");
  assert.equal(resolveThemeMode("dark", true, 1200, 420, "light", day), "light");
  // AMOLED survives the night half of the schedule.
  assert.equal(resolveThemeMode("amoled", true, 1200, 420, "light", night), "amoled");
  assert.equal(resolveThemeMode("amoled", true, 1200, 420, "light", day), "light");
});

check("theme: schedule boundaries (20:00 / 07:00)", () => {
  assert.equal(resolveThemeMode("light", true, 1200, 420, "light", new Date(2026, 9, 5, 20, 0)), "dark");
  assert.equal(resolveThemeMode("light", true, 1200, 420, "light", new Date(2026, 9, 5, 7, 0)), "light");
});

check("color: hex round-trip", () => {
  assert.deepEqual(hexToRgb("#FF0000"), { r: 255, g: 0, b: 0 });
  assert.equal(rgbToHex(255, 0, 0), "#FF0000");
  assert.equal(hexToRgb("nope"), null);
});

check("color: mixing and readability", () => {
  assert.equal(mixColors("#FFFFFF", "#000000", 0.5), "#808080");
  assert.equal(mixColors("#FFFFFF", "#000000", 1), "#FFFFFF");
  assert.equal(mixColors("#FFFFFF", "#000000", 0), "#000000");
  assert.ok(Math.abs(luminance("#FFFFFF") - 1) < 1e-6);
  assert.ok(luminance("#000000") < 1e-6);
  assert.equal(readableOn("#FFFFFF"), "#0A0A0A");
  assert.equal(readableOn("#000000"), "#FFFFFF");
});

check("color: accent validation and fallback", () => {
  assert.equal(isHexColor("#12AB34"), true);
  assert.equal(isHexColor("#12AB3"), false);
  assert.equal(isHexColor("12AB34"), false);
  assert.equal(accentHex("#123456", "dark"), "#123456");
  assert.equal(accentHex("default", "light"), "#2E5FA3");
  assert.equal(accentHex("default", "dark"), "#A8C7FA");
  assert.equal(ACCENT_PRESETS[0].key, "default");
  assert.ok(ACCENT_PRESETS.every((p) => p.key === "default" || isHexColor(p.color)));
});

check("clock formatting wraps and pads", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(1250), "20:50");
  assert.equal(formatClock(1440), "00:00");
  assert.equal(formatClock(-30), "23:30");
});

check("album accent: stored valid wins, missing/invalid falls back", () => {
  const accents = { "7": "#123456", "8": "bogus" };
  assert.equal(albumAccent(accents, 7, "#FFFFFF"), "#123456");
  assert.equal(albumAccent(accents, 8, "#FFFFFF"), "#FFFFFF");
  assert.equal(albumAccent(accents, 9, "#FFFFFF"), "#FFFFFF");
  assert.equal(albumAccent(null, 7, "#ABCDEF"), "#ABCDEF");
});

check("date formats: dmy / mdy / iso", () => {
  const ts = new Date(2026, 9, 5, 7, 8, 9).getTime();
  assert.equal(formatTimestamp(ts, "dmy"), "05.10.2026 07:08:09");
  assert.equal(formatTimestamp(ts, "mdy"), "10/05/2026 7:08:09 AM");
  assert.equal(formatTimestamp(ts, "iso"), "2026-10-05T07:08:09");
});

check("day labels respect the format and year toggle", () => {
  const d = new Date(2026, 9, 5);
  assert.equal(formatDayLabel(d, "dmy", true), "5 Oct 2026");
  assert.equal(formatDayLabel(d, "dmy", false), "5 Oct");
  assert.equal(formatDayLabel(d, "mdy", true), "Oct 5, 2026");
  assert.equal(formatDayLabel(d, "mdy", false), "Oct 5");
  assert.equal(formatDayLabel(d, "iso", true), "2026-10-05");
});

check("date group labels: today / yesterday / formatted older", () => {
  const now = new Date(2026, 9, 5, 12, 0);
  assert.equal(dateGroupLabel(new Date(2026, 9, 5, 8, 0).getTime(), now, "dmy"), "Today");
  assert.equal(dateGroupLabel(new Date(2026, 9, 4, 8, 0).getTime(), now, "dmy"), "Yesterday");
  assert.equal(dateGroupLabel(new Date(2025, 9, 5, 8, 0).getTime(), now, "dmy"), "5 Oct 2025");
});

const baseMeta = {
  filename: "IMG_0001.jpg",
  path: "/DCIM/Camera",
  size: 2 * 1024 * 1024,
  width: 4000,
  height: 3000,
  dateTaken: new Date(2026, 9, 5, 7, 8, 9).getTime(),
  camera: "Pixel <Pro>",
  tags: ["camera"],
  device: "abc123",
  hash: "abc",
};

check("caption: defaults include every field and escape HTML", () => {
  const caption = buildCaption(baseMeta);
  assert.ok(caption.includes("File:"));
  assert.ok(caption.includes("Date taken:"));
  assert.ok(caption.includes("Camera:"));
  assert.ok(caption.includes("Pixel &lt;Pro&gt;"));
  assert.ok(caption.includes("#hash: abc"));
});

check("caption: field list filters and reorders", () => {
  const caption = buildCaption(baseMeta, { fields: ["tags", "filename"] });
  const lines = caption.split("\n");
  assert.equal(lines[0].includes("#camera"), true);
  assert.equal(lines[1].includes("File:"), true);
  assert.equal(caption.includes("Date taken:"), false);
  // The hash is mandatory even when omitted from the field list.
  assert.ok(caption.includes("#hash: abc"));
});

check("caption: date format reaches the caption", () => {
  const caption = buildCaption(baseMeta, { fields: ["dateTaken"], dateFormat: "iso" });
  assert.ok(caption.includes("2026-10-05T07:08:09"));
});

check("caption: empty field list falls back to defaults", () => {
  const caption = buildCaption(baseMeta, { fields: [] });
  assert.ok(caption.includes("File:"));
  assert.ok(caption.includes("Date taken:"));
});

check("caption: 1024-char budget still respected", () => {
  const long = buildCaption({
    ...baseMeta,
    filename: "x".repeat(2000),
    hash: "h".repeat(64),
  });
  assert.ok(long.length <= 1024);
  assert.ok(long.includes("#hash:"));
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
