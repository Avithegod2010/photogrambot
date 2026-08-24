export async function getRandomPhotoForWidget(): Promise<{
  imageDataUri: `data:image${string}` | null;
  imageWidth: number;
  imageHeight: number;
  count: number;
  takenAt: number | null;
} | null> {
  try {
    const { getDb } = await import("./src/lib/db");
    const { getCachedTelegramFile } = await import("./src/lib/media");
    const { File } = await import("expo-file-system");
    const db = await getDb();
    const row = await db.getFirstAsync<any>(
      `SELECT id, preview_file_id, thumb_file_id, remote_file_id, taken_at, width, height FROM photos
       WHERE status IN ('uploaded','local')
       AND id NOT IN (SELECT photo_id FROM trash)
       AND (preview_file_id IS NOT NULL OR thumb_file_id IS NOT NULL OR remote_file_id IS NOT NULL)
       ORDER BY RANDOM() LIMIT 1`
    );
    const total = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) as n FROM photos WHERE status IN ('uploaded','local') AND id NOT IN (SELECT photo_id FROM trash)"
    );
    if (!row) {
      return {
        imageDataUri: null,
        imageWidth: 200,
        imageHeight: 200,
        count: total?.n ?? 0,
        takenAt: null,
      };
    }
    const fileId = row.preview_file_id ?? row.thumb_file_id ?? row.remote_file_id;
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
      imageWidth: row.width ?? 1080,
      imageHeight: row.height ?? 1080,
      count: total?.n ?? 0,
      takenAt: row.taken_at ?? null,
    };
  } catch {
    return null;
  }
}
