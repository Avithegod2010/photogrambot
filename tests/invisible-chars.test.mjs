// Regression test for the Round-34 launch bug: three U+200B zero-width spaces
// inside a getMemories SQL string made the query throw „near "'unixepoch'":
// syntax error" at every launch. Invisible characters in source are never
// intentional here, so fail loudly with file:line:column when one appears.
import assert from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = new Map([
  [0x200b, "U+200B ZERO WIDTH SPACE"],
  [0x200c, "U+200C ZERO WIDTH NON-JOINER"],
  [0x200d, "U+200D ZERO WIDTH JOINER"],
  [0x2060, "U+2060 WORD JOINER"],
  [0xfeff, "U+FEFF ZERO WIDTH NO-BREAK SPACE / BOM"],
  [0x180e, "U+180E MONGOLIAN VOWEL SEPARATOR"],
]);

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SCAN_DIRS = ["src", "scripts", "tests"];
const SCAN_ROOT_FILES = [
  "App.tsx",
  "app.config.ts",
  "index.ts",
  "widgetData.ts",
  "RandomPhotoWidget.tsx",
  "widget-task-handler.tsx",
];

function findInvisible(text) {
  const hits = [];
  let line = 1;
  let column = 1;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (FORBIDDEN.has(code)) {
      hits.push({ index: i, code, line, column });
    }
    if (code === 0x0a) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return hits;
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "android" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

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

check("the scanner itself detects a planted zero-width space", () => {
  const planted = `const a = 1;\nconst b = "${String.fromCharCode(0x200b)}";\n`;
  const hits = findInvisible(planted);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].line, 2);
  assert.strictEqual(hits[0].column, 12);
});

check("no invisible characters in shipped source", () => {
  const files = [];
  for (const dir of SCAN_DIRS) {
    const full = path.join(ROOT, dir);
    try {
      if (statSync(full).isDirectory()) walk(full, files);
    } catch {
      // A missing optional directory is not a failure.
    }
  }
  for (const name of SCAN_ROOT_FILES) {
    const full = path.join(ROOT, name);
    try {
      if (statSync(full).isFile()) files.push(full);
    } catch {
      // Optional root file.
    }
  }

  assert.ok(files.length > 50, `expected a real source tree, scanned ${files.length} files`);

  const problems = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const hit of findInvisible(text)) {
      problems.push(
        `${path.relative(ROOT, file)}:${hit.line}:${hit.column} ${FORBIDDEN.get(hit.code)}`
      );
    }
  }
  assert.deepStrictEqual(problems, [], `invisible characters found:\n${problems.join("\n")}`);
});

console.log(`\n${passed} checks passed`);
