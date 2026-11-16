// Resolve a usable local image URI for on-device inference. Prefers the local
// original, then the channel preview/thumbnail (cached by media.ts).
import { File } from "expo-file-system";
import { getCachedTelegramFile } from "./media";
import { tokenForPhoto } from "./destinations";
import type { PhotoRow } from "./db";

export async function photoImageUri(row: PhotoRow): Promise<string | null> {
  // Local original: file:// works directly; content:// is best-effort.
  if (row.local_uri) {
    try {
      const f = new File(row.local_uri);
      if (f.exists && (f.size ?? 0) > 0) return row.local_uri;
    } catch {}
  }
  const fileId = row.preview_file_id ?? row.thumb_file_id;
  if (!fileId) return null;
  try {
    const token = await tokenForPhoto(row);
    const uri = await getCachedTelegramFile(fileId, "jpg", token);
    const f = new File(uri);
    if (f.exists && (f.size ?? 0) > 0) return uri;
  } catch {}
  return null;
}
