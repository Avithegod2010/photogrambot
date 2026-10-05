import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { downloadFile } from "./telegram";
import { getPhotosByUploadStatus, type PhotoRow } from "./db";
import { tokenForPhoto } from "./destinations";
import type { VideoPart } from "./vsplit";

function safeName(filename: string): string {
  const cleaned = filename.replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "photo.jpg";
}

function extFor(photo: PhotoRow): string {
  const fromName = photo.filename.includes(".")
    ? photo.filename.split(".").pop()!
    : "jpg";
  return fromName.toLowerCase().slice(0, 5);
}

function parseParts(raw: string | null | undefined): VideoPart[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VideoPart[];
    return Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.file_id ? parsed : null;
  } catch {
    return null;
  }
}

async function reassembleParts(photo: PhotoRow, parts: VideoPart[], dest: File): Promise<void> {
  const token = await tokenForPhoto(photo);
  if (dest.exists) dest.delete();
  dest.create();
  const handle = dest.open();
  try {
    for (const part of parts) {
      const tmp = new File(Paths.cache, `pb_rpart_${Date.now()}.bin`);
      try {
        await downloadFile(part.file_id, tmp.uri, token ?? undefined);
        const bytes = await tmp.bytes();
        handle.writeBytes(bytes);
      } finally {
        try { tmp.delete(); } catch {}
      }
    }
  } finally {
    try { handle.close(); } catch {}
  }
}

const BOT_DOWNLOAD_LIMIT = 20 * 1024 * 1024;

export async function savePhotoToDevice(photo: PhotoRow): Promise<void> {
  const parts = parseParts(photo.parts);
  const dest = new File(
    Paths.cache,
    `pb_restore_${Date.now()}_${safeName(photo.filename)}.${parts ? "mp4" : extFor(photo)}`
  );
  try {
    if (parts) {
      await reassembleParts(photo, parts, dest);
    } else {
      const fileId = photo.remote_file_id ?? photo.preview_file_id ?? photo.thumb_file_id;
      if (!fileId) throw new Error("No cloud copy available to download");
      if ((photo.size ?? 0) > BOT_DOWNLOAD_LIMIT) {
        throw new Error(
          "Telegram bots can only download files up to 20 MB — open this item in the Telegram app to save the original"
        );
      }
      const token = await tokenForPhoto(photo);
      await downloadFile(fileId, dest.uri, token ?? undefined);
    }
    await MediaLibrary.Asset.create(dest.uri);
  } finally {
    try {
      if (dest.exists) dest.delete();
    } catch {}
  }
}

// Saves a motion photo's embedded companion clip (#7) back to the gallery as
// a video. Same download limits as stills — clips are small, but the guard
// keeps the friendly error for anything over the bot's 20 MB reach.
export async function saveMotionClip(photo: PhotoRow): Promise<void> {
  if (!photo.motion_file_id) throw new Error("This photo has no motion clip");
  if ((photo.size ?? 0) > BOT_DOWNLOAD_LIMIT) {
    throw new Error(
      "Telegram bots can only download files up to 20 MB — open this item in the Telegram app to save the original"
    );
  }
  await ensureSavePermission();
  const dest = new File(Paths.cache, `pb_motion_${Date.now()}_${safeName(photo.filename)}.mp4`);
  try {
    const token = await tokenForPhoto(photo);
    await downloadFile(photo.motion_file_id, dest.uri, token ?? undefined);
    await MediaLibrary.Asset.create(dest.uri);
  } finally {
    try {
      if (dest.exists) dest.delete();
    } catch {}
  }
}

export interface RestoreProgress {
  done: number;
  total: number;
  currentFile: string | null;
  saved: number;
  skipped: number;
  failed: number;
}

let restoring = false;
let cancelRequested = false;

export function isRestoring(): boolean {
  return restoring;
}

export function requestCancelRestore(): void {
  cancelRequested = true;
}

async function ensureSavePermission(): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync(false, ["photo"]);
  if (status !== "granted") throw new Error("Media library permission denied");
}

async function hasLocalFile(photo: PhotoRow): Promise<boolean> {
  const uri = photo.local_uri;
  if (!uri || !uri.startsWith("file://")) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export async function restoreAllToDevice(
  onProgress?: (p: RestoreProgress) => void
): Promise<RestoreProgress> {
  const photos = await getPhotosByUploadStatus("uploaded");
  return restorePhotosToDevice(photos, onProgress);
}

// Bulk save of an explicit photo list (album-scoped restore: an album,
// Favorites, a trip…). Rows that still have a local file are skipped — the
// point is filling gaps, not duplicating what's on the phone.
export async function restorePhotosToDevice(
  photos: PhotoRow[],
  onProgress?: (p: RestoreProgress) => void
): Promise<RestoreProgress> {
  if (restoring) throw new Error("A restore is already running");
  await ensureSavePermission();
  restoring = true;
  cancelRequested = false;
  const progress: RestoreProgress = {
    done: 0,
    total: 0,
    currentFile: null,
    saved: 0,
    skipped: 0,
    failed: 0,
  };
  try {
    progress.total = photos.length;
    onProgress?.({ ...progress });
    for (const photo of photos) {
      if (cancelRequested) break;
      progress.currentFile = photo.filename;
      onProgress?.({ ...progress });
      if (await hasLocalFile(photo)) {
        progress.skipped++;
      } else {
        try {
          await savePhotoToDevice(photo);
          progress.saved++;
        } catch {
          progress.failed++;
        }
      }
      progress.done++;
      onProgress?.({ ...progress });
    }
    return progress;
  } finally {
    restoring = false;
    progress.currentFile = null;
    onProgress?.({ ...progress });
  }
}
