import * as Crypto from "expo-crypto";

const MAGIC = "pbgcm1";
const KEY_ITERATIONS = 1000;

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

async function deriveKey(passphrase: string, saltB64: string): Promise<Uint8Array> {
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
  return text.startsWith(`${MAGIC}:`);
}

export async function encryptText(plain: string, passphrase: string): Promise<string> {
  const saltBytes = Crypto.getRandomBytes(16);
  const saltB64 = toB64(saltBytes);
  const key = await Crypto.AESEncryptionKey.import(await deriveKey(passphrase, saltB64));
  const sealed = await Crypto.aesEncryptAsync(utf8ToBytes(plain), key);
  const iv = (await sealed.iv()) as Uint8Array;
  const ciphertext = (await sealed.ciphertext({ includeTag: true })) as Uint8Array;
  return `${MAGIC}:${saltB64}:${toB64(iv)}:${toB64(ciphertext)}`;
}

export async function decryptText(payload: string, passphrase: string): Promise<string> {
  const parts = payload.trim().split(":");
  if (parts.length !== 4 || parts[0] !== MAGIC) {
    throw new Error("Unrecognized encrypted backup format");
  }
  const [, saltB64, ivB64, ctB64] = parts;
  const key = await Crypto.AESEncryptionKey.import(await deriveKey(passphrase, saltB64));
  const sealed = Crypto.AESSealedData.fromParts(ivB64, ctB64);
  let plainBytes: Uint8Array;
  try {
    plainBytes = (await Crypto.aesDecryptAsync(sealed, key, {
      output: "bytes",
    })) as Uint8Array;
  } catch {
    throw new Error("Wrong passphrase or corrupted backup");
  }
  return bytesToUtf8(plainBytes);
}
