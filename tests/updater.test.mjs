// R34 harness: in-app updater pure logic (updaterLogic.ts).
// Node 24 strips types on import, so this exercises the real module.
import assert from "node:assert";
import { createHash } from "node:crypto";
import {
  compareVersions,
  pickApkRelease,
  buildUpdate,
  resolveUpdate,
  apkUrlProblem,
  isAllowedApkUrl,
  normalizeSha256,
  apkDigestProblem,
  bytesToHex,
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
const apk = (name) => ({
  name,
  browser_download_url: `https://github.com/o/r/releases/download/v1/${name}`,
});

// The bytes the manifest's digest describes. The install-time check hashes the
// real download, so the matching case uses a real SHA-256 of these bytes.
const sha256Of = (data) => createHash("sha256").update(data).digest("hex");
const APK_BYTES = Buffer.from("photogrambot test apk bytes");
const APK_SHA = sha256Of(APK_BYTES);
const TAMPERED_SHA = sha256Of(Buffer.from("photogrambot test apk bytes + evil"));

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
  sha256: APK_SHA,
  notes,
});

check("versionCode path: newer code offers update", () => {
  const u = buildUpdate("1.0.0", 1, rel("v1.0.1", [apk("photogrambot.apk")]), withManifest(2, "1.0.1", "fixes"));
  assert.strictEqual(u.status, "available");
  assert.strictEqual(u.latest, "1.0.1");
  assert.strictEqual(u.versionCode, 2);
  assert.strictEqual(
    u.apkUrl,
    "https://github.com/o/r/releases/download/v1/photogrambot.apk"
  );
  assert.strictEqual(u.apkSha256, APK_SHA);
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
  const u = buildUpdate("1.0.0", 1, rel("v1.0.2", [apk("app.apk")]), { sha256: APK_SHA });
  assert.strictEqual(u.status, "available");
  assert.strictEqual(u.latest, "1.0.2");
  assert.strictEqual(u.versionCode, null);
});
check("semver fallback: same version is up to date", () => {
  const u = buildUpdate("1.0.0", 1, rel("v1.0.0", [apk("app.apk")]), { sha256: APK_SHA });
  assert.strictEqual(u, null);
});
check("semver fallback: prerelease tag is not newer than release", () => {
  const u = buildUpdate("1.0.0", 1, rel("v1.0.0-preview.1", [apk("app.apk")]), { sha256: APK_SHA });
  assert.strictEqual(u, null);
});
check("semver fallback: prerelease .2 beats installed prerelease .1", () => {
  const u = buildUpdate("1.0.0-preview.1", 0, rel("v1.0.0-preview.2", [apk("app.apk")]), { sha256: APK_SHA });
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
  const u = buildUpdate("1.0.0", 0, release, { versionCode: 2, versionName: "1.1.0", sha256: APK_SHA });
  assert.strictEqual(u.notes, "release notes");
});
check("no APK asset yields null", () => {
  const u = buildUpdate("1.0.0", 0, rel("v9.0.0", [apk("notes.txt")]), { sha256: APK_SHA });
  assert.strictEqual(u, null);
});
check("zero installed versionCode falls back to semver", () => {
  const u = buildUpdate("1.0.0", 0, rel("v1.0.1", [apk("app.apk")]), withManifest(0, "1.0.1"));
  assert.strictEqual(u.status, "available");
});

// --- H2: download policy (host allow-list + published SHA-256) ---
check("apk URL: github.com release download is allowed", () => {
  assert.strictEqual(
    isAllowedApkUrl("https://github.com/Avithegod2010/photogrambot/releases/download/v1/a.apk"),
    true
  );
});
check("apk URL: objects.githubusercontent.com is allowed", () => {
  assert.strictEqual(isAllowedApkUrl("https://objects.githubusercontent.com/x/a.apk"), true);
});
check("apk URL: an arbitrary host is rejected", () => {
  assert.strictEqual(isAllowedApkUrl("https://evil.example/a.apk"), false);
  assert.match(apkUrlProblem("https://evil.example/a.apk"), /evil\.example/);
});
check("apk URL: a look-alike suffix host is rejected", () => {
  assert.strictEqual(isAllowedApkUrl("https://evilgithubusercontent.com/a.apk"), false);
  assert.strictEqual(isAllowedApkUrl("https://github.com.evil.example/a.apk"), false);
});
check("apk URL: plain http is rejected", () => {
  assert.strictEqual(isAllowedApkUrl("http://github.com/o/r/releases/download/v1/a.apk"), false);
  assert.match(apkUrlProblem("http://github.com/o/r/a.apk"), /not HTTPS/);
});
check("apk URL: credentials in the URL are rejected", () => {
  assert.strictEqual(isAllowedApkUrl("https://user:pass@github.com/a.apk"), false);
});
check("apk URL: a malformed URL is rejected", () => {
  assert.strictEqual(isAllowedApkUrl("not a url"), false);
});

check("update from a non-GitHub host is refused", () => {
  const release = rel("v1.0.1", [
    { name: "app.apk", browser_download_url: "https://evil.example/app.apk" },
  ]);
  const r = resolveUpdate("1.0.0", 1, release, withManifest(2, "1.0.1"));
  assert.strictEqual(r.status, "refused");
  assert.match(r.reason, /Refusing to update/);
  assert.match(r.reason, /evil\.example/);
  assert.strictEqual(buildUpdate("1.0.0", 1, release, withManifest(2, "1.0.1")), null);
});
check("update over http is refused", () => {
  const release = rel("v1.0.1", [
    { name: "app.apk", browser_download_url: "http://github.com/o/r/a.apk" },
  ]);
  const r = resolveUpdate("1.0.0", 1, release, withManifest(2, "1.0.1"));
  assert.strictEqual(r.status, "refused");
  assert.match(r.reason, /not HTTPS/);
  assert.strictEqual(buildUpdate("1.0.0", 1, release, withManifest(2, "1.0.1")), null);
});
check("manifest without a sha256 is refused", () => {
  const release = rel("v1.0.1", [apk("app.apk")]);
  const manifest = { versionCode: 2, versionName: "1.0.1", apk: "app.apk" };
  const r = resolveUpdate("1.0.0", 1, release, manifest);
  assert.strictEqual(r.status, "refused");
  assert.match(r.reason, /does not publish a SHA-256/);
  assert.strictEqual(buildUpdate("1.0.0", 1, release, manifest), null);
});
check("manifest with a malformed sha256 is refused", () => {
  const r = resolveUpdate("1.0.0", 1, rel("v1.0.1", [apk("app.apk")]), {
    versionCode: 2,
    versionName: "1.0.1",
    sha256: "abc123",
  });
  assert.strictEqual(r.status, "refused");
  assert.strictEqual(normalizeSha256("abc123"), null);
  assert.strictEqual(normalizeSha256(APK_SHA.toUpperCase()), APK_SHA);
});
check("matching sha256 is accepted", () => {
  const r = resolveUpdate("1.0.0", 1, rel("v1.0.1", [apk("app.apk")]), withManifest(2, "1.0.1"));
  assert.strictEqual(r.status, "available");
  assert.strictEqual(r.update.apkSha256, APK_SHA);
  // The install path hashes the downloaded bytes and compares to this digest.
  const actual = sha256Of(APK_BYTES);
  assert.strictEqual(apkDigestProblem(r.update.apkSha256, actual), null);
});
check("mismatched sha256 is refused", () => {
  const problem = apkDigestProblem(APK_SHA, sha256Of(Buffer.from("some other bytes")));
  assert.ok(problem, "a different file must not satisfy the published digest");
  assert.match(problem, /does not match/);
  assert.notStrictEqual(TAMPERED_SHA, APK_SHA);
});
check("digest check refuses a missing or unhashable value", () => {
  assert.match(apkDigestProblem("", APK_SHA), /did not publish a valid SHA-256/);
  assert.match(apkDigestProblem(APK_SHA, ""), /could not be hashed/);
});
check("digest comparison tolerates case and surrounding whitespace", () => {
  assert.strictEqual(apkDigestProblem(` ${APK_SHA.toUpperCase()} `, APK_SHA), null);
});
check("bytesToHex encodes a SHA-256 digest", () => {
  const digest = createHash("sha256").update(APK_BYTES).digest();
  assert.strictEqual(bytesToHex(new Uint8Array(digest)), APK_SHA);
});
check("an already-current install reports no update, not a refusal", () => {
  const release = rel("v1.0.0", [
    { name: "app.apk", browser_download_url: "https://evil.example/app.apk" },
  ]);
  const r = resolveUpdate("1.0.0", 5, release, { versionCode: 5, versionName: "1.0.0" });
  assert.strictEqual(r.status, "none");
});

console.log(`\n${passed} checks passed`);
