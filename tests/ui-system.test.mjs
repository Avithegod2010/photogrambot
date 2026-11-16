#!/usr/bin/env node
// Static UI-system guard.
//
// The design system only works if it is enforced. This test fails the build
// when a screen invents its own colour, and reports every remaining system
// alert so the next session can see what is left to migrate.
//
// Run: node tests/ui-system.test.mjs  (part of `npm test`)

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const notes = [];

/** Files allowed to contain literal colours, with the reason. */
const HEX_ALLOWLIST = new Set([
  // The theme itself: palettes, overlays, white/black exceptions, shadows.
  "src/theme.ts",
  // Accent presets are user-chosen hex values by definition.
  "src/lib/appearanceMath.ts",
  // Static-theme fallbacks used when a dynamic colour is not a string.
  "src/lib/appearance.ts",
  // Standalone HTML document exported for the public archive page.
  "src/lib/publicArchive.ts",
  // Home-screen widgets render outside the React tree (remote views).
  "RandomPhotoWidget.tsx",
  "widget-task-handler.tsx",
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = path.relative(root, full).replaceAll("\\", "/");
    if (entry === "node_modules" || entry === ".git" || entry === "android" || entry === "ios") continue;
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out;
}

const files = walk(path.join(root, "src")).concat(["App.tsx"]);

for (const rel of files) {
  if (rel === "App.tsx") continue; // checked separately below (root file lives outside src)
}

// ---- 1. No literal colours outside the theme ------------------------------
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
for (const rel of files) {
  if (HEX_ALLOWLIST.has(rel)) continue;
  const text = readFileSync(path.join(root, rel), "utf8");
  text.split("\n").forEach((line, i) => {
    if (HEX_RE.test(line) && !line.trimStart().startsWith("//")) {
      failures.push(`${rel}:${i + 1} hardcoded colour — use theme tokens (${line.trim()})`);
    }
  });
}

// App.tsx sits at the root and may only use the exported fallbacks.
const appText = readFileSync(path.join(root, "App.tsx"), "utf8");
appText.split("\n").forEach((line, i) => {
  if (HEX_RE.test(line) && !line.trimStart().startsWith("//")) {
    failures.push(`App.tsx:${i + 1} hardcoded colour — use fallback.* from src/theme (${line.trim()})`);
  }
});

// ---- 2. Responsive width, never a frozen one ------------------------------
for (const rel of files) {
  const text = readFileSync(path.join(root, rel), "utf8");
  if (/Dimensions\.get\(/.test(text)) {
    failures.push(`${rel} uses Dimensions.get — use useResponsive()/useWindowDimensions()`);
  }
}

// ---- 3. Token contract ----------------------------------------------------
const theme = readFileSync(path.join(root, "src/theme.ts"), "utf8");
for (const token of [
  "export const spacing",
  "export const radius",
  "export const typography",
  "export const motion",
  "export const touchTarget",
  "export const overlay",
  "export const fallback",
  "export type StatusKind",
]) {
  if (!theme.includes(token)) failures.push(`src/theme.ts is missing ${token}`);
}

// The type scale is a closed set: 10 (photo badge) 11 12 13 15 17 20 24 30.
const allowedSizes = new Set(["10", "11", "12", "13", "15", "17", "20", "24", "30"]);
const typographyBlock = theme.slice(
  theme.indexOf("export const typography"),
  theme.indexOf("} satisfies Record<string, TextStyle>")
);
for (const match of typographyBlock.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) {
  if (!allowedSizes.has(match[1])) {
    failures.push(`src/theme.ts typography uses ${match[1]} — allowed: ${[...allowedSizes].join(", ")}`);
  }
}

// ---- 4. Primitive accessibility contract ---------------------------------
const ui = readFileSync(path.join(root, "src/components/ui.tsx"), "utf8");
for (const contract of [
  'accessibilityRole="button"',
  'accessibilityRole="switch"',
  'accessibilityRole="progressbar"',
  "accessibilityViewIsModal",
  "accessibilityState",
  "minHeight: touchTarget",
]) {
  if (!ui.includes(contract)) failures.push(`src/components/ui.tsx is missing ${contract}`);
}

// ---- 5. System alerts: report, do not fail (destructive ones migrated) ----
const alertCounts = [];
for (const rel of files.filter((f) => f.startsWith("src/screens/"))) {
  const text = readFileSync(path.join(root, rel), "utf8");
  const count = (text.match(/Alert\.alert\(/g) ?? []).length;
  if (count > 0) alertCounts.push(`${path.basename(rel)}: ${count}`);
}
if (alertCounts.length > 0) {
  notes.push(`System alerts remaining (informational / OS-level): ${alertCounts.join(", ")}`);
}

// ---- report ---------------------------------------------------------------
for (const note of notes) console.log(`note: ${note}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} UI-system violation(s):`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}

console.log(`UI guard passed — ${files.length} files checked.`);
