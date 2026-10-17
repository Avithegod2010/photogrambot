#!/usr/bin/env node
// Generates latest.json for a GitHub Release so the in-app updater can compare
// version codes exactly (falling back to the tag's semver otherwise).
//
// Usage:
//   node scripts/make-latest-json.mjs --apk photogrambot-1.0.1.apk [--notes "text"]
//
// Attach both the APK and the generated latest.json to the release.

import { readFileSync, writeFileSync } from "node:fs";
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
  console.error("Pass --apk <asset-file-name>, e.g. --apk photogrambot-1.0.1.apk");
  process.exit(1);
}

const manifest = {
  versionCode,
  versionName,
  apk: apkArg.split(/[\\/]/).pop(),
};
const notes = arg("notes");
if (notes) manifest.notes = notes;

const outPath = arg("out") ?? join(root, "latest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath}`);
console.log(JSON.stringify(manifest));
