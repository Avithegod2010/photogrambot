// Verifies the checked-in AndroidManifest intent filters match what Expo's
// IntentFilters plugin would generate from app.config.ts.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const { default: renderIntentFilters } = require(
  path.join(root, "node_modules/@expo/config-plugins/build/android/IntentFilters.js")
);

// Same shape as app.config.ts -> android.intentFilters
const filters = [
  {
    action: "SEND",
    category: ["DEFAULT"],
    data: [{ mimeType: "image/*" }, { mimeType: "video/*" }],
  },
  {
    action: "SEND_MULTIPLE",
    category: ["DEFAULT"],
    data: [{ mimeType: "image/*" }, { mimeType: "video/*" }],
  },
];

const rendered = renderIntentFilters(filters);
const expected = [];
for (const f of rendered) {
  const action = f.action[0].$["android:name"];
  const cats = (f.category ?? []).map((c) => c.$["android:name"]);
  const mimes = (f.data ?? []).map((d) => d.$["android:mimeType"] ?? d.$["android:scheme"]);
  expected.push({ action, cats, mimes });
}

const manifest = fs.readFileSync(
  path.join(root, "android/app/src/main/AndroidManifest.xml"),
  "utf8"
);
const generated = [...manifest.matchAll(/<intent-filter data-generated="true">([\s\S]*?)<\/intent-filter>/g)]
  .map((m) => m[1]);

const actual = generated.map((body) => ({
  action: (body.match(/<action android:name="([^"]+)"/) ?? [])[1],
  cats: [...body.matchAll(/<category android:name="([^"]+)"/g)].map((m) => m[1]),
  mimes: [...body.matchAll(/<data android:mimeType="([^"]+)"/g)].map((m) => m[1]),
}));

let ok = true;
const check = (label, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) ok = false;
};

check(`generated filter count = ${expected.length}`, generated.length === expected.length);
expected.forEach((exp, i) => {
  const act = actual[i] ?? {};
  check(
    `filter ${i + 1} action = ${exp.action}`,
    act.action === exp.action && act.action.startsWith("android.intent.action.") && !act.action.includes("action.android.")
  );
  check(
    `filter ${i + 1} categories = ${exp.cats.join(",")}`,
    JSON.stringify(act.cats) === JSON.stringify(exp.cats)
  );
  check(
    `filter ${i + 1} mimes = ${exp.mimes.join(",")}`,
    JSON.stringify(act.mimes) === JSON.stringify(exp.mimes)
  );
});

console.log(ok ? "\nALL PASS" : "\nFAILURES");
process.exit(ok ? 0 : 1);
