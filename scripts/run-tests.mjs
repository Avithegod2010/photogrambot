#!/usr/bin/env node
// Test runner for the committed suite. Every tests/*.test.mjs file is spawned
// in its own process so one crash cannot mask the rest, and the exit code is
// non-zero when any file fails — the contract CI relies on.
//
// Usage:
//   npm test                     run everything
//   node scripts/run-tests.mjs   same
//   node scripts/run-tests.mjs zip motion   run files whose name includes a filter
//
// Tests import the real pure-TS modules from src/lib. Node 24 strips types
// natively; tests/ts-resolve-hook.mjs adds the extensionless-relative-import
// resolution the app's Metro bundler provides but plain Node ESM does not.

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = path.join(root, "tests");
const filters = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));

const files = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .filter((name) => filters.length === 0 || filters.some((f) => name.includes(f)))
  .sort();

if (files.length === 0) {
  console.error(`No tests matched${filters.length ? `: ${filters.join(", ")}` : ""}.`);
  process.exit(1);
}

const nodeFlags = [
  // The app is a CommonJS-ish Expo package; .ts files reparse as ESM when
  // imported directly. Silence the per-file warning so output stays readable.
  "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
  // Register the resolver before the test's static imports are resolved.
  // --import needs a URL on Windows (a bare E:\… path parses as scheme "e:").
  "--import",
  pathToFileURL(path.join(testsDir, "ts-resolve-hook.mjs")).href,
];

let failed = 0;
const started = Date.now();
console.log(`Running ${files.length} test file${files.length === 1 ? "" : "s"}…\n`);

for (const file of files) {
  console.log(`[ RUN  ] ${file}`);
  const result = spawnSync(process.execPath, [...nodeFlags, path.join(testsDir, file)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) {
    failed++;
    console.error(`[ FAIL ] ${file} — could not start: ${result.error.message}`);
  } else if (result.status !== 0) {
    failed++;
    console.error(`[ FAIL ] ${file} (exit ${result.status ?? result.signal})\n`);
  } else {
    console.log(`[  OK  ] ${file}\n`);
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`${files.length - failed}/${files.length} test files passed in ${seconds}s`);
if (failed > 0) {
  console.error(`${failed} test file${failed === 1 ? "" : "s"} failed.`);
  process.exit(1);
}
