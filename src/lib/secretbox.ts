import * as Crypto from "expo-crypto";
import { pbkdf2Sha256 } from "./pbkdf2";

// pbgcm1: AES-256-GCM keyed by a homebrew KDF (1000 chained SHA-256s of
// "<hex>:<i>" — nonstandard, no HMAC construction, under-stretched).
// pbgcm2: same AES-GCM mechanics, key = PBKDF2-HMAC-SHA256 (pure-TS, pbkdf2.ts)
// over the raw 16 salt bytes. Both magics stay readable (see decryptText).
const MAGIC = "pbgcm1";
const MAGIC_V2 = "pbgcm2";
// Legacy pbgcm1 KDF rounds — decrypt-only, never used for new backups.
const KEY_ITERATIONS = 1000;

// pbgcm2 work factor. Backup/restore is a rare, explicitly-triggered
// interactive operation — unlike the PIN path (applock.ts budgets ~300 ms at
// 20k iterations) a multi-second derivation is acceptable, and the passphrase
// protects the entire library index, so stretching is the only real cost
// lever. OWASP recommends 600k for PBKDF2-HMAC-SHA256. Measured with this
// pure-TS implementation in desktop Node (V8): ~110 ms per 100k iterations
// (~0.66 s at 600k; node:crypto native reference ~0.25 s) — expect ~2-4x that
// on Hermes, i.e. a couple of seconds on the reference device, by design.
const PBKDF2_BACKUP_ITERATIONS = 600000;

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toB64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_ALPHABET[b0 >> 2];
    out += b1 === undefined ? B64_ALPHABET[(b0 & 3) << 4] : B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)];
    out += b2 === undefined ? "=" : B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)];
    out += b2 === undefined ? "=" : B64_ALPHABET[b2 & 63];
  }
  return out;
}

function fromB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let p = 0;
  for (const ch of clean) {
    const v = B64_ALPHABET.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, p);
}

function utf8ToBytes(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i)!;
    if (c > 0xffff) i++;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000)
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 63),
        0x80 | ((c >> 6) & 63),
        0x80 | (c & 63)
      );
  }
  return new Uint8Array(out);
}

function bytesToUtf8(b: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    let cp: number;
    if (c < 0x80) {
      cp = c;
      i += 1;
    } else if (c < 0xe0) {
      cp = ((c & 31) << 6) | (b[i + 1] & 63);
      i += 2;
    } else if (c < 0xf0) {
      cp = ((c & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63);
      i += 3;
    } else {
      cp =
        ((c & 7) << 18) |
        ((b[i + 1] & 63) << 12) |
        ((b[i + 2] & 63) << 6) |
        (b[i + 3] & 63);
      i += 4;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Legacy pbgcm1 KDF, kept verbatim from the original implementation (renamed
// only). Ciphertext lives ONLY in the Telegram channel (pinned message /
// channel docs) — there is no local copy to migrate and no rewrite pass will
// ever touch old blobs, so this must stay byte-exact for as long as a
// pre-pbgcm2 backup may be restored.
async function legacyDeriveKey(passphrase: string, saltB64: string): Promise<Uint8Array> {
  let hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${saltB64}:${passphrase}`
  );
  for (let i = 0; i < KEY_ITERATIONS; i++) {
    hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${hex}:${i}`);
  }
  return hexToBytes(hex);
}

export function isEncryptedBackup(text: string): boolean {
  // Restore-path detector (backup.ts deserializeBackup): must accept BOTH
  // magics — a pre-pbgcm2 channel backup is still an encrypted backup.
  return text.startsWith(`${MAGIC}:`) || text.startsWith(`${MAGIC_V2}:`);
}

export async function encryptText(plain: string, passphrase: string): Promise<string> {
  const saltBytes = Crypto.getRandomBytes(16);
  const saltB64 = toB64(saltBytes);
  // pbgcm2 keys from the RAW salt bytes (the salt's base64 text was pbgcm1
  // key material and must not leak into the new derivation). utf8ToBytes is
  // surrogate-pair aware, byte-identical to pbkdf2.ts's utf8() helper.
  const key = await Crypto.AESEncryptionKey.import(
    pbkdf2Sha256(utf8ToBytes(passphrase), saltBytes, PBKDF2_BACKUP_ITERATIONS, 32)
  );
  const sealed = await Crypto.aesEncryptAsync(utf8ToBytes(plain), key);
  const iv = (await sealed.iv()) as Uint8Array;
  const ciphertext = (await sealed.ciphertext({ includeTag: true })) as Uint8Array;
  return `${MAGIC_V2}:${saltB64}:${toB64(iv)}:${toB64(ciphertext)}`;
}

export async function decryptText(payload: string, passphrase: string): Promise<string> {
  const parts = payload.trim().split(":");
  if (parts.length !== 4 || (parts[0] !== MAGIC && parts[0] !== MAGIC_V2)) {
    throw new Error("Unrecognized encrypted backup format");
  }
  const [magic, saltB64, ivB64, ctB64] = parts;
  // Dispatch on magic: pbgcm2 runs PBKDF2 over the decoded salt bytes;
  // pbgcm1 keeps the legacy KDF over the salt's base64 TEXT (that string is
  // part of the old key material, so it must pass through unchanged).
  const key =
    magic === MAGIC_V2
      ? pbkdf2Sha256(utf8ToBytes(passphrase), fromB64(saltB64), PBKDF2_BACKUP_ITERATIONS, 32)
      : await legacyDeriveKey(passphrase, saltB64);
  const aesKey = await Crypto.AESEncryptionKey.import(key);
  let sealed: Crypto.AESSealedData;
  let plainBytes: Uint8Array;
  try {
    // fromParts decodes base64 natively — invalid iv/ct text throws a raw
    // IllegalArgumentException before GCM ever runs; catch it so every
    // failure surfaces as the friendly message.
    sealed = Crypto.AESSealedData.fromParts(ivB64, ctB64);
    plainBytes = (await Crypto.aesDecryptAsync(sealed, aesKey, {
      output: "bytes",
    })) as Uint8Array;
  } catch {
    throw new Error("Wrong passphrase or corrupted backup");
  }
  return bytesToUtf8(plainBytes);
}
