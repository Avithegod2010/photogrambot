// Local database encryption (SQLCipher).
//
// The key is a random 256-bit value stored in Android Keystore via
// SecureStore. It never leaves the device and is deliberately NOT part of the
// channel backups - a restored index on a new phone is a fresh, unencrypted
// database until the user opts in again.
//
// SQLCipher is compiled into the app by expo-sqlite's `useSQLCipher` config
// (see app.config.ts + android/gradle.properties). On a build without it the
// PRAGMA is a no-op and `sqlCipherAvailable()` returns false, so the Settings
// action explains that the next native build is required.

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";

const DB_KEY = "pb_db_encryption_key";

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_KEY);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const bytes = new Uint8Array(32);
  Crypto.getRandomValues(bytes);
  const key = toHex(bytes);
  await SecureStore.setItemAsync(DB_KEY, key);
  return key;
}

export async function hasDbKey(): Promise<boolean> {
  try {
    const key = await SecureStore.getItemAsync(DB_KEY);
    return !!key && /^[0-9a-f]{64}$/.test(key);
  } catch {
    return false;
  }
}

/** True when the native SQLite was compiled with SQLCipher. */
export async function sqlCipherAvailable(db: SQLiteDatabase): Promise<boolean> {
  try {
    const row = await db.getFirstAsync<{ cipher_version: string | null }>(
      "PRAGMA cipher_version"
    );
    return !!row?.cipher_version;
  } catch {
    return false;
  }
}

/** Must run before any query on an encrypted database. */
export async function applyDbKey(db: SQLiteDatabase): Promise<void> {
  const key = await getOrCreateDbKey();
  // x'..' is a raw key (no KDF); the value is generated locally and hex-only.
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
}
