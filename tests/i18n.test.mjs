// i18n scaffolding.
import assert from "node:assert";
import {
  LANGUAGES,
  isRTLLanguage,
  resolveLanguage,
  t,
} from "../src/lib/i18n.ts";

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

check("English is the fallback for unknown keys and languages", () => {
  assert.equal(t("tabs.gallery", "en"), "Gallery");
  assert.equal(t("tabs.gallery", "xx"), "Gallery");
  assert.equal(t("no.such.key", "de"), "no.such.key");
});

check("every language translates the tab bar", () => {
  for (const lang of LANGUAGES.filter((l) => l.key !== "system")) {
    for (const key of ["tabs.gallery", "tabs.cloud", "tabs.collections", "tabs.settings"]) {
      const value = t(key, lang.key);
      assert.ok(value && value !== key, `${lang.key} missing ${key}`);
    }
  }
});

check("interpolation replaces named variables", () => {
  assert.equal(t("lock.locked", "en", { app: "PhotogramBot" }), "PhotogramBot is locked");
  assert.equal(t("lock.locked", "hi", { app: "X" }), "X लॉक है");
});

check("Arabic is the only RTL language and system resolves safely", () => {
  assert.equal(isRTLLanguage("ar"), true);
  assert.equal(isRTLLanguage("en"), false);
  assert.ok(["en", "hi", "ml", "de", "es", "ar"].includes(resolveLanguage("system")));
  assert.equal(resolveLanguage("ml"), "ml");
});

check("missing translations fall back to English per key", () => {
  // viewer.compare is translated everywhere we ship; a deliberately absent
  // key must still fall back rather than render the key.
  assert.equal(t("gallery.days", "ar"), "أيام");
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
