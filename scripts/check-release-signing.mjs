#!/usr/bin/env node
// Preflight for the stable release keystore.
//
// EAS builds generate their own keystore unless the owner uploads
// pb-release.keystore. This script checks the local files and prints the exact
// upload command. It does not contact Expo and never reads the key material.

import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const keystore = join(root, "android", "app", "pb-release.keystore");
const props = join(root, "android", "app", "pb-release-signing.properties");
const eas = join(root, "eas.json");
const appConfig = join(root, "app.config.ts");

const checks = [
  ["release keystore", keystore],
  ["signing properties", props],
  ["eas.json", eas],
  ["app.config.ts", appConfig],
];

let ok = true;
for (const [label, path] of checks) {
  const exists = existsSync(path);
  console.log(`${exists ? "OK  " : "MISS"} ${label}: ${path}`);
  if (!exists) ok = false;
}

console.log("");
if (!ok) {
  console.log("Create the missing files first (see docs/RELEASE.md).");
  process.exit(1);
}

console.log("Next (owner action, interactive):");
console.log("  eas credentials --platform android");
console.log("  → Keystore: Upload an existing keystore");
console.log("  → upload android/app/pb-release.keystore");
console.log("  → alias/passwords from android/app/pb-release-signing.properties");
console.log("");
console.log("After the upload, every EAS build uses the same signer and installs");
console.log("over the previous APK without re-signing or uninstalling.");
