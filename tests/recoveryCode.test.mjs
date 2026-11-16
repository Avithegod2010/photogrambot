// Recovery-key codec.
import assert from "node:assert";
import {
  encodeRecoveryKey,
  groupRecoveryKey,
  isRecoveryKey,
  normalizeRecoveryKey,
} from "../src/lib/recoveryCode.ts";

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

check("20 bytes encode to 32 base32 chars in groups of four", () => {
  const key = encodeRecoveryKey(new Uint8Array(20).fill(0));
  assert.equal(key.replace(/-/g, "").length, 32);
  assert.equal(key.split("-").length, 8);
  assert.equal(key, "0000-0000-0000-0000-0000-0000-0000-0000");
});

check("encoding is deterministic and round-trips normalisation", () => {
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = (i * 37 + 11) & 0xff;
  const key = encodeRecoveryKey(bytes);
  assert.equal(normalizeRecoveryKey(key), key);
  assert.equal(normalizeRecoveryKey(key.toLowerCase().replace(/-/g, " ")), key);
});

check("Crockford confusions are accepted", () => {
  const key = "0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ";
  assert.equal(isRecoveryKey(key), true);
  // O -> 0, I/L -> 1, U -> V
  const confused = key.replace(/0/g, "O").replace(/1/g, "I").replace(/V/g, "U");
  assert.equal(normalizeRecoveryKey(confused), key);
});

check("wrong length or illegal characters are rejected", () => {
  assert.equal(normalizeRecoveryKey("ABC"), null);
  assert.equal(normalizeRecoveryKey("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXY!"), null);
  assert.equal(isRecoveryKey(""), false);
});

check("grouping is idempotent", () => {
  const raw = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  assert.equal(groupRecoveryKey(raw), "0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ");
  assert.equal(groupRecoveryKey(groupRecoveryKey(raw).replace(/-/g, "")), groupRecoveryKey(raw));
});

console.log(`\n${passed} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
