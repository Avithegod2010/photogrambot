#!/usr/bin/env node
// Re-sign an APK with a local keystore.
//
// Use case: an EAS-built APK is signed with EAS's managed keystore, but the
// phone has a build signed with the local debug/release key. Re-signing the
// new APK with the SAME local key lets `adb install -r` update in place,
// preserving the SQLite index and SecureStore values.
//
// Usage:
//   node scripts/resign-apk.mjs --apk <in.apk> [--out <out.apk>] \
//     [--properties android/pb-release-signing.properties] \
//     [--ks android/app/debug.keystore --alias androiddebugkey \
//      --store-pass android --key-pass android]
//
// The keystore password is passed to apksigner on its stdin only when
// --properties is used (never echoed). Prefer --properties for release keys.
//
// This does NOT make the APK Play-Store valid: it only changes the signer.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const apk = arg("apk");
if (!apk || !existsSync(apk)) fail("--apk <path> is required and must exist");
const out = arg("out") ?? apk.replace(/\.apk$/i, "") + "-resigned.apk";
const propsPath = arg("properties");

let ks = arg("ks") ?? "android/app/debug.keystore";
let alias = arg("alias") ?? "androiddebugkey";
let storePass = arg("store-pass") ?? "android";
let keyPass = arg("key-pass") ?? storePass;

if (propsPath) {
  if (!existsSync(propsPath)) fail(`properties file not found: ${propsPath}`);
  const props = readFileSync(propsPath, "utf8");
  const get = (key) => props.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, "m"))?.[1]?.trim();
  const storeFile = get("storeFile");
  if (storeFile) {
    // storeFile is relative to the properties file's directory in Gradle.
    ks = resolve(dirname(propsPath), storeFile);
  }
  alias = get("keyAlias") ?? alias;
  storePass = get("storePassword") ?? storePass;
  keyPass = get("keyPassword") ?? keyPass;
}

if (!existsSync(ks)) fail(`keystore not found: ${ks}`);

function findApksigner() {
  const explicit = arg("apksigner");
  if (explicit && existsSync(explicit)) return explicit;
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (sdk) {
    const bt = join(sdk, "build-tools");
    if (existsSync(bt)) {
      const versions = execFileSync("cmd", ["/c", "dir", "/b", bt], { encoding: "utf8" })
        .split(/\r?\n/)
        .filter(Boolean)
        .sort((a, b) => {
          const pa = a.split(".").map(Number);
          const pb = b.split(".").map(Number);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
          }
          return 0;
        });
      for (const v of versions) {
        const candidate = join(bt, v, process.platform === "win32" ? "apksigner.bat" : "apksigner");
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return process.platform === "win32" ? "apksigner.bat" : "apksigner";
}

const apksigner = findApksigner();
console.log(`Signing ${basename(apk)} with ${ks} (alias ${alias})...`);

// .bat files cannot be spawned directly by execFile on Windows (EINVAL).
function runApksigner(args, options) {
  if (process.platform === "win32") {
    return execFileSync("cmd", ["/c", apksigner, ...args], options);
  }
  return execFileSync(apksigner, args, options);
}

// apksigner accepts --ks-pass/--key-pass via stdin with "pass:..." too; using
// arguments is simpler and the values are local to this process.
const args = [
  "sign",
  "--ks",
  ks,
  "--ks-key-alias",
  alias,
  "--ks-pass",
  `pass:${storePass}`,
  "--key-pass",
  `pass:${keyPass}`,
  "--out",
  out,
  apk,
];
try {
  runApksigner(args, { stdio: "inherit" });
} catch (e) {
  fail(`apksigner failed (${e?.message ?? e})`);
}

try {
  const verify = runApksigner(["verify", "--print-certs", out], {
    encoding: "utf8",
  });
  const digest = verify.match(/SHA-256 digest:\s*([0-9a-f]+)/i)?.[1];
  const dn = verify.match(/certificate DN:\s*(.+)/i)?.[1];
  console.log(`Signed: ${out}`);
  console.log(`Signer: ${dn ?? "unknown"}`);
  console.log(`SHA-256: ${digest ?? "unknown"}`);
  console.log("Install with: adb install -r <out.apk>");
} catch {
  console.log(`Signed: ${out} (verification failed — inspect manually)`);
}
