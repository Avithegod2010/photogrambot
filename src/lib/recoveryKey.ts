// Backup recovery key: encrypts the backup passphrase with a one-time key so
// a forgotten passphrase is not necessarily fatal.
//
// The wrapped passphrase blob is stored in SecureStore. The recovery key
// itself is shown once and never stored in plaintext.

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { encryptText, decryptText, isEncryptedBackup } from "./secretbox";
import { encodeRecoveryKey, normalizeRecoveryKey } from "./recoveryCode";

const RECOVERY_BLOB = "pb_backup_recovery_blob";
const RECOVERY_AT = "pb_backup_recovery_created";

export async function hasRecoveryKey(): Promise<boolean> {
  try {
    return !!(await SecureStore.getItemAsync(RECOVERY_BLOB));
  } catch {
    return false;
  }
}

/**
 * Generates a new recovery key, wraps `passphrase` with it and stores the
 * wrapped blob. Returns the formatted key — show it once, then discard.
 */
export async function createRecoveryKey(passphrase: string): Promise<string> {
  if (!passphrase) throw new Error("Set a backup passphrase first.");
  const bytes = new Uint8Array(20);
  Crypto.getRandomValues(bytes);
  const key = encodeRecoveryKey(bytes);
  const canonical = normalizeRecoveryKey(key);
  if (!canonical) throw new Error("Could not generate a recovery key.");
  const blob = await encryptText(passphrase, canonical);
  await SecureStore.setItemAsync(RECOVERY_BLOB, blob);
  await SecureStore.setItemAsync(RECOVERY_AT, String(Date.now()));
  return key;
}

/** Unwraps the stored passphrase. Throws a friendly error on a wrong key. */
export async function recoverPassphrase(input: string): Promise<string> {
  const canonical = normalizeRecoveryKey(input);
  if (!canonical) throw new Error("That does not look like a recovery key.");
  let blob: string | null = null;
  try {
    blob = await SecureStore.getItemAsync(RECOVERY_BLOB);
  } catch {
    blob = null;
  }
  if (!blob || !isEncryptedBackup(blob)) {
    throw new Error("No recovery key has been created on this device.");
  }
  try {
    return await decryptText(blob, canonical);
  } catch {
    throw new Error("Wrong recovery key.");
  }
}

export async function clearRecoveryKey(): Promise<void> {
  await SecureStore.deleteItemAsync(RECOVERY_BLOB).catch(() => {});
  await SecureStore.deleteItemAsync(RECOVERY_AT).catch(() => {});
}

export async function recoveryKeyCreatedAt(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(RECOVERY_AT);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
