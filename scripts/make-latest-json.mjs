#!/usr/bin/env node
// Generates latest.json for a GitHub Release so the in-app updater can compare
// version codes exactly (falling back to the tag's semver otherwise) and verify
// the APK before installing it.
//
// Usage:
//   node scripts/make-latest-json.mjs --apk photogrambot-1.0.1.apk [--sha256 <hex>] [--notes "text"]
//
// Attach both the APK and the generated latest.json to the release. The
// manifest must carry the APK's SHA-256: the updater refuses a release without
// one. Pass --apk as the APK's path so it can be hashed, or add --sha256 when
// the asset only exists on GitHub.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const propsPath = join(root, "android", "version.properties");
let props;
try {
  props = readFileSync(propsPath, "utf8");
} catch {
  console.error(`Could not read ${propsPath}`);
  process.exit(1);
}

const read = (key) => {
  const m = props.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, "m"));
  return m ? m[1].trim() : undefined;
};

const versionName = read("versionName");
const versionCode = Number(read("versionCode"));

if (!versionName || !Number.isFinite(versionCode)) {
  console.error("version.properties is missing versionName/versionCode");
  process.exit(1);
}

const apkArg = arg("apk");
if (!apkArg) {
  console.error("Pass --apk <file-path-or-asset-name>, e.g. --apk photogrambot-1.0.1.apk");
  process.exit(1);
}

const apkName = apkArg.split(/[\\/]/).pop();
const apkPath = existsSync(apkArg) ? apkArg : null;
const explicit = arg("sha256");
const explicitDigest = explicit ? explicit.trim().toLowerCase() : null;
if (explicitDigest && !/^[0-9a-f]{64}$/.test(explicitDigest)) {
  console.error("--sha256 must be 64 hex characters (the APK's SHA-256)");
  process.exit(1);
}
const computed = apkPath
  ? createHash("sha256").update(readFileSync(apkPath)).digest("hex")
  : null;
if (explicitDigest && computed && explicitDigest !== computed) {
  console.error("--sha256 does not match the SHA-256 of --apk; refusing to write a wrong digest");
  process.exit(1);
}
const sha256 = computed ?? explicitDigest;
if (!sha256) {
  console.error(
    "Cannot publish a manifest without a SHA-256: pass the APK's file path via --apk, or --sha256 <hex>"
  );
  process.exit(1);
}

const manifest = {
  versionCode,
  versionName,
  apk: apkName,
  sha256,
};
const notes = arg("notes");
if (notes) manifest.notes = notes;

const outPath = arg("out") ?? join(root, "latest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath}`);
console.log(JSON.stringify(manifest));
