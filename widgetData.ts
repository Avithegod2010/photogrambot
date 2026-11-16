export interface WidgetPhoto {
  imageDataUri: `data:image${string}` | null;
  imageWidth: number;
  imageHeight: number;
  photoId: string | null;
  takenAt: number | null;
}

async function loadPhoto(row: any): Promise<WidgetPhoto> {
  const { getCachedTelegramFile } = await import("./src/lib/media");
  const { File } = await import("expo-file-system");
  const fileId = row?.preview_file_id ?? row?.thumb_file_id ?? row?.remote_file_id;
  let imageDataUri: `data:image${string}` | null = null;
  if (fileId) {
    try {
      const path = await getCachedTelegramFile(fileId);
      const file = new File(path);
      if (file.exists) {
        imageDataUri = `data:image/jpeg;base64,${await file.base64()}`;
      }
    } catch {}
  }
  return {
    imageDataUri,
    imageWidth: row?.width ?? 1080,
    imageHeight: row?.height ?? 1080,
    photoId: row?.id ?? null,
    takenAt: row?.taken_at ?? null,
  };
}

async function widgetDb() {
  const { getDb } = await import("./src/lib/db");
  const { loadPrefs } = await import("./src/lib/settings");
  const db = await getDb();
  const prefs = await loadPrefs();
  const scope = prefs.widgetFavoritesOnly ? "AND favorite = 1" : "";
  const hidden = `AND id NOT IN (SELECT photo_id FROM trash)
    AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)`;
  return { db, scope, hidden };
}

export async function getRandomPhotoForWidget(): Promise<
  (WidgetPhoto & { count: number }) | null
> {
  try {
    const { db, scope, hidden } = await widgetDb();
    const row = await db.getFirstAsync<any>(
      `SELECT id, preview_file_id, thumb_file_id, remote_file_id, taken_at, width, height FROM photos
       WHERE status IN ('uploaded','local') ${hidden} ${scope}
       AND (preview_file_id IS NOT NULL OR thumb_file_id IS NOT NULL OR remote_file_id IS NOT NULL)
       ORDER BY RANDOM() LIMIT 1`
    );
    const total = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) as n FROM photos WHERE status IN ('uploaded','local') ${hidden} ${scope}`
    );
    if (!row) {
      return {
        imageDataUri: null,
        imageWidth: 200,
        imageHeight: 200,
        photoId: null,
        takenAt: null,
        count: total?.n ?? 0,
      };
    }
    return { ...(await loadPhoto(row)), count: total?.n ?? 0 };
  } catch {
    return null;
  }
}

/** A photo taken on today's month/day in an earlier year. */
export async function getOnThisDayForWidget(): Promise<
  (WidgetPhoto & { yearsAgo: number }) | null
> {
  try {
    const { db, scope, hidden } = await widgetDb();
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    const row = await db.getFirstAsync<any>(
      `SELECT id, preview_file_id, thumb_file_id, remote_file_id, taken_at, width, height FROM photos
       WHERE status IN ('uploaded','local') ${hidden} ${scope}
       AND strftime('%m-%d', taken_at / 1000, 'unixepoch', 'localtime') = ?
       AND CAST(strftime('%Y', taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER) < ?
       AND (preview_file_id IS NOT NULL OR thumb_file_id IS NOT NULL OR remote_file_id IS NOT NULL)
       ORDER BY RANDOM() LIMIT 1`,
      [mmdd, now.getFullYear()]
    );
    if (!row) {
      // Fall back to any photo so the widget is never blank on a new library.
      const fallback = await db.getFirstAsync<any>(
        `SELECT id, preview_file_id, thumb_file_id, remote_file_id, taken_at, width, height FROM photos
         WHERE status IN ('uploaded','local') ${hidden} ${scope}
         AND (preview_file_id IS NOT NULL OR thumb_file_id IS NOT NULL OR remote_file_id IS NOT NULL)
         ORDER BY RANDOM() LIMIT 1`
      );
      if (!fallback) return null;
      const photo = await loadPhoto(fallback);
      const year = fallback.taken_at
        ? new Date(fallback.taken_at).getFullYear()
        : now.getFullYear();
      return { ...photo, yearsAgo: Math.max(0, now.getFullYear() - year) };
    }
    const photo = await loadPhoto(row);
    const year = row.taken_at ? new Date(row.taken_at).getFullYear() : now.getFullYear();
    return { ...photo, yearsAgo: Math.max(1, now.getFullYear() - year) };
  } catch {
    return null;
  }
}

/** Four photos for the 2x2 mosaic widget. */
export async function getMosaicForWidget(): Promise<WidgetPhoto[]> {
  try {
    const { db, scope, hidden } = await widgetDb();
    const rows = await db.getAllAsync<any>(
      `SELECT id, preview_file_id, thumb_file_id, remote_file_id, taken_at, width, height FROM photos
       WHERE status IN ('uploaded','local') ${hidden} ${scope}
       AND (preview_file_id IS NOT NULL OR thumb_file_id IS NOT NULL OR remote_file_id IS NOT NULL)
       ORDER BY RANDOM() LIMIT 4`
    );
    return Promise.all(rows.map((r: any) => loadPhoto(r)));
  } catch {
    return [];
  }
}
