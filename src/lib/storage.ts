// Low-storage guard (#3, R27): automatic backup work stops when the device is
// critically low on space — uploads, restores and the thumbnail cache all
// need headroom, and a full disk turns silent failures into corruption-adjacent
// weirdness. Manual syncs are never gated (the owner overrules).
//
// The free-space probe uses the legacy expo-file-system entry (still exported
// in SDK 57); if the probe itself fails we FAIL OPEN — an unknown state must
// not silently disable backups.

import * as LegacyFS from "expo-file-system/legacy";
import { Directory, Paths } from "expo-file-system";

export const LOW_STORAGE_THRESHOLD_BYTES = 500 * 1024 * 1024;

export async function getFreeDiskBytes(): Promise<number> {
  try {
    return await LegacyFS.getFreeDiskStorageAsync();
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export async function isStorageCritical(): Promise<boolean> {
  return (await getFreeDiskBytes()) < LOW_STORAGE_THRESHOLD_BYTES;
}

export async function thumbCacheBytes(): Promise<number> {
  try {
    const dir = new Directory(Paths.cache, "photogram/thumbs");
    if (!dir.exists) return 0;
    let total = 0;
    for (const entry of dir.list()) {
      if (entry instanceof File) total += entry.size;
    }
    return total;
  } catch {
    return 0;
  }
}

// Thumbnails are re-downloadable on demand — wiping the directory is always
// safe; thumbDir() recreates it lazily on the next image load.
export async function pruneThumbCache(): Promise<void> {
  try {
    const dir = new Directory(Paths.cache, "photogram/thumbs");
    if (dir.exists) dir.delete();
  } catch {}
}
