// R34 harness: in-app updater pure logic (updaterLogic.ts).
// Node 24 strips types on import, so this exercises the real module.
import assert from "node:assert";
import {
  compareVersions,
  pickApkRelease,
  buildUpdate,
} from "../src/lib/updaterLogic.ts";

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

// --- compareVersions ---
check("higher patch wins", () => assert.ok(compareVersions("1.0.1", "1.0.0") > 0));
check("higher minor wins over higher patch", () => assert.ok(compareVersions("1.1.0", "1.0.9") > 0));
check("higher major wins", () => assert.ok(compareVersions("2.0.0", "1.9.9") > 0));
check("equal versions are 0", () => assert.strictEqual(compareVersions("1.0.0", "1.0.0"), 0));
check("leading v is stripped", () => assert.strictEqual(compareVersions("v1.2.3", "1.2.3"), 0));
check("release beats its own prerelease", () => assert.ok(compareVersions("1.0.0", "1.0.0-preview.1") > 0));
check("prerelease loses to release", () => assert.ok(compareVersions("1.0.0-preview.1", "1.0.0") < 0));
check("prerelease numbering orders", () => assert.ok(compareVersions("1.0.0-preview.2", "1.0.0-preview.1") > 0));
check("missing segments count as zero", () => assert.strictEqual(compareVersions("1.0", "1.0.0"), 0));
check("garbage becomes zero, not NaN", () => assert.strictEqual(compareVersions("x.y", "0.0"), 0));

// --- pickApkRelease ---
const rel = (tag, assets, extra = {}) => ({
  tag_name: tag,
  name: tag,
  html_url: `https://github.com/o/r/releases/tag/${tag}`,
  body: null,
  draft: false,
  prerelease: false,
  published_at: "2026-01-01T00:00:00Z",
  assets,
  ...extra,
});
const apk = (name) => ({ name, browser_download_url: `https://dl/${name}` });

check("picks first release carrying an APK", () => {
  const r = pickApkRelease([rel("v2", [apk("a.apk")]), rel("v1", [apk("b.apk")])]);
  assert.strictEqual(r.tag_name, "v2");
});
check("skips draft releases", () => {
  const r = pickApkRelease([rel("v3", [apk("a.apk")], { draft: true }), rel("v2", [apk("b.apk")])]);
  assert.strictEqual(r.tag_name, "v2");
});
check("skips releases without an APK", () => {
  const r = pickApkRelease([rel("v3", [apk("notes.txt")]), rel("v2", [apk("b.apk")])]);
  assert.strictEqual(r.tag_name, "v2");
});
check("null when nothing carries an APK", () => {
  assert.strictEqual(pickApkRelease([rel("v1", [apk("x.zip")])]), null);
});
check("APK match is case-insensitive", () => {
  const r = pickApkRelease([rel("v1", [apk("App.APK")])]);
  assert.strictEqual(r.tag_name, "v1");
});

// --- buildUpdate ---
const withManifest = (code, name, notes) => ({
  versionCode: code,
  versionName: name,
  apk: "photogrambot.apk",
  notes,
});

check("versionCode path: newer code offers update", () => {
  const u = buildUpdate("1.0.0", 1, rel("v1.0.1", [apk("photogrambot.apk")]), withManifest(2, "1.0.1", "fixes"));
  assert.strictEqual(u.status, "available");
  assert.strictEqual(u.latest, "1.0.1");
  assert.strictEqual(u.versionCode, 2);
  assert.strictEqual(u.apkUrl, "https://dl/photogrambot.apk");
  assert.strictEqual(u.notes, "fixes");
});
check("versionCode path: equal code is up to date", () => {
  const u = buildUpdate("1.0.0", 5, rel("v1.0.0", [apk("photogrambot.apk")]), withManifest(5, "1.0.0"));
  assert.strictEqual(u, null);
});
check("versionCode path: older code never downgrades", () => {
  const u = buildUpdate("1.0.0", 5, rel("v0.9.0", [apk("photogrambot.apk")]), withManifest(4, "0.9.0"));
  assert.strictEqual(u, null);
});
check("semver fallback: newer tag offers update", () => {
  const u = buildUpdate("1.0.0", 1, rel("v1.0.2", [apk("app.apk")]), null);
  assert.strictEqual(u.status, "available");
  assert.strictEqual(u.latest, "1.0.2");
  assert.strictEqual(u.versionCode, null);
});
check("semver fallback: same version is up to date", () => {
  const u = buildUpdate("1.0.0", 1, rel("v1.0.0", [apk("app.apk")]), null);
  assert.strictEqual(u, null);
});
check("semver fallback: prerelease tag is not newer than release", () => {
  const u = buildUpdate("1.0.0", 1, rel("v1.0.0-preview.1", [apk("app.apk")]), null);
  assert.strictEqual(u, null);
});
check("semver fallback: prerelease .2 beats installed prerelease .1", () => {
  const u = buildUpdate("1.0.0-preview.1", 0, rel("v1.0.0-preview.2", [apk("app.apk")]), null);
  assert.strictEqual(u.status, "available");
});
check("manifest.apk selects the named asset", () => {
  const release = rel("v1.1.0", [apk("other.apk"), apk("photogrambot.apk")]);
  const u = buildUpdate("1.0.0", 1, release, withManifest(2, "1.1.0"));
  assert.strictEqual(u.apkName, "photogrambot.apk");
});
check("notes fall back to the release body", () => {
  const release = rel("v1.1.0", [apk("app.apk")]);
  release.body = "release notes";
  const u = buildUpdate("1.0.0", 0, release, { versionCode: 2, versionName: "1.1.0" });
  assert.strictEqual(u.notes, "release notes");
});
check("no APK asset yields null", () => {
  const u = buildUpdate("1.0.0", 0, rel("v9.0.0", [apk("notes.txt")]), null);
  assert.strictEqual(u, null);
});
check("zero installed versionCode falls back to semver", () => {
  const u = buildUpdate("1.0.0", 0, rel("v1.0.1", [apk("app.apk")]), withManifest(0, "1.0.1"));
  assert.strictEqual(u.status, "available");
});

console.log(`\n${passed} checks passed`);
