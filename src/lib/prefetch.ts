// Thumbnail prefetch. Telegram previews are downloaded on demand; warming the
// next few tiles makes scrolling a 3k+ library feel instant without changing
// the list implementation.

import { getCachedTelegramFile } from "./media";
import { tokenForPhoto } from "./destinations";
import type { PhotoRow } from "./db";

let inFlight = 0;
const queued = new Set<string>();

export async function prefetchThumbs(
  photos: PhotoRow[],
  limit = 18,
  concurrency = 3
): Promise<void> {
  const rows = photos
    .filter((p) => !!(p.preview_file_id ?? p.thumb_file_id))
    .slice(0, limit);
  for (const p of rows) {
    const fileId = p.preview_file_id ?? p.thumb_file_id;
    if (!fileId || queued.has(fileId)) continue;
    queued.add(fileId);
    // Wait for a slot without blocking the caller.
    while (inFlight >= concurrency) {
      await new Promise((r) => setTimeout(r, 60));
    }
    inFlight++;
    void (async () => {
      try {
        const token = p.profile_id ? await tokenForPhoto(p) : null;
        await getCachedTelegramFile(fileId, "jpg", token);
      } catch {
      } finally {
        inFlight--;
      }
    })();
  }
}

export function clearPrefetchQueue(): void {
  queued.clear();
}
