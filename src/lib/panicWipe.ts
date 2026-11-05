// Panic wipe: erase every local trace of the library and connection.
//
// Triggered by a deliberate gesture on the lock screen when enabled. The
// Telegram channel archive is NEVER touched — that is the whole point of the
// design, so a wiped phone can be restored from the channel later. What goes
// away: the SQLite index, cached thumbnails/downloads, all SecureStore
// secrets (bot token, channel id, PINs, backup passphrase, DB key, recovery
// key) and the preference store.

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, Paths } from "expo-file-system";

const SECRET_KEYS = [
  "pb_bot_token",
  "pb_channel_id",
  "pb_decoy_bot_token",
  "pb_decoy_channel_id",
  "pb_device_id",
  "pb_ai_api_key",
  "pb_tag_api_key",
  "pb_backup_pass",
  "pb_pin_hash",
  "pb_decoy_pin_hash",
  "pb_db_encryption_key",
  "pb_backup_recovery_blob",
  "pb_backup_recovery_created",
  "pb_fail_count",
  "pb_fail_ts",
];

export async function panicWipe(): Promise<void> {
  // 1. Close and delete the SQLite index (WAL/SHM included by the API).
  try {
    const { closeDb, deleteLocalDatabase } = await import("./db");
    await closeDb();
    await deleteLocalDatabase();
  } catch {
    // Continue: secrets are more important than a stale file.
  }
  // 2. Cached media / thumbnails.
  try {
    const cache = new Directory(Paths.cache, "photogram");
    if (cache.exists) cache.delete();
  } catch {}
  try {
    const backups = new Directory(Paths.document, "backups");
    if (backups.exists) backups.delete();
  } catch {}
  // 3. Secrets.
  await Promise.all(
    SECRET_KEYS.map((key) => SecureStore.deleteItemAsync(key).catch(() => {}))
  );
  // 4. Preferences (also removes the app lock + decoy settings).
  try {
    await AsyncStorage.clear();
  } catch {}
}
