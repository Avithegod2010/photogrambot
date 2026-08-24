import { File } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import {
  enqueueUpload,
  nextQueueBatch,
  updateQueueItem,
  insertPhoto,
  updatePhoto,
  getPhotoByHash,
  getPhotoByLocalId,
  getQueueCounts,
  kvGet,
  kvSet,
  type QueueRow,
} from "./db";
import { getBotToken, getChannelId, loadPrefs, getDeviceId } from "./settings";
import { sendDocument, sendPhoto, TgMessage } from "./telegram";
import { buildCaption, buildPreviewCaption } from "./caption";
import { generatePreview, getAssetMeta, guessMime, buildTags } from "./media";
import { hashFileCached } from "./hash";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
let processing = false;
let cancelRequested = false;

export interface UploadProgress {
  running: boolean;
  current: number;
  total: number;
  currentFile: string | null;
  done: number;
  failed: number;
  skipped: number;
  duplicates: number;
}

type ProgressListener = (p: UploadProgress) => void;
const listeners = new Set<ProgressListener>();
let progress: UploadProgress = {
  running: false,
  current: 0,
  total: 0,
  currentFile: null,
  done: 0,
  failed: 0,
  skipped: 0,
  duplicates: 0,
};

export function onUploadProgress(listener: ProgressListener): () => void {
  listeners.add(listener);
  listener(progress);
  return () => listeners.delete(listener);
}

function setProgress(patch: Partial<UploadProgress>): void {
  progress = { ...progress, ...patch };
  listeners.forEach((l) => l(progress));
}

export function getUploadProgress(): UploadProgress {
  return progress;
}

export function requestCancelUpload(): void {
  cancelRequested = true;
}

export interface LocalAssetRef {
  local_id: string;
  filename: string;
  folder: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  taken_at: number;
  added_at: number;
}

export async function enqueueUploads(
  items: LocalAssetRef[],
  uploadType: "manual" | "sync"
): Promise<number> {
  let enqueued = 0;
  for (const item of items) {
    const existing = await getPhotoByLocalId(item.local_id);
    if (existing && existing.status === "uploaded") continue;
    let localUri = existing?.local_uri ?? null;
    if (!localUri) {
      try {
        const asset = new MediaLibrary.Asset(item.local_id);
        localUri = await asset.getUri();
      } catch {
        continue;
      }
    }
    const queueId = await enqueueUpload({
      local_id: item.local_id,
      local_uri: localUri,
      filename: item.filename,
      folder: item.folder,
      size: item.size,
      taken_at: item.taken_at,
      added_at: Date.now(),
      content_hash: null,
      upload_type: uploadType,
    });
    if (queueId > 0) {
      await insertPhoto({
        id: `local_${item.local_id}`,
        local_id: item.local_id,
        local_uri: localUri,
        filename: item.filename,
        folder: item.folder,
        size: item.size,
        width: item.width,
        height: item.height,
        mime: guessMime(item.filename),
        taken_at: item.taken_at,
        added_at: Date.now(),
        status: "local",
        upload_type: uploadType,
      });
      enqueued++;
    }
  }
  return enqueued;
}

export async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  cancelRequested = false;
  try {
    let totalProcessed = 0;
    let first = true;
    for (;;) {
      if (cancelRequested) break;
      const batch = await nextQueueBatch(10);
      if (batch.length === 0) break;
      if (first) {
        setProgress({ running: true, current: 0, total: batch.length, done: 0, failed: 0, skipped: 0, duplicates: 0, currentFile: null });
        first = false;
      }
      for (const item of batch) {
        if (cancelRequested) break;
        totalProcessed++;
        setProgress({ current: totalProcessed, currentFile: item.filename });
        await uploadQueueItem(item);
        const counts = await getQueueCounts();
        setProgress({
          done: counts.done ?? 0,
          failed: counts.failed ?? 0,
          skipped: counts.skipped ?? 0,
          duplicates: counts.duplicate ?? 0,
        });
      }
    }
  } finally {
    processing = false;
    setProgress({ running: false, currentFile: null });
  }
}

export function isProcessing(): boolean {
  return processing;
}

async function uploadQueueItem(item: QueueRow): Promise<void> {
  const token = await getBotToken();
  const channelId = await getChannelId();
  if (!token || !channelId) {
    await updateQueueItem(item.id, { state: "failed", error: "Bot not configured" });
    return;
  }
  await updateQueueItem(item.id, { state: "running" });
  const photoId = `local_${item.local_id}`;
  try {
    const file = new File(item.local_uri);
    if (!file.exists) {
      await updateQueueItem(item.id, { state: "failed", error: "File missing on device" });
      await updatePhoto(photoId, { status: "failed", error: "File missing on device" });
      return;
    }
    const actualSize = file.size;
    if (actualSize > MAX_UPLOAD_BYTES) {
      await updateQueueItem(item.id, { state: "skipped", error: "Photo larger than 50 MB" });
      await updatePhoto(photoId, { status: "skipped_too_large", error: "Photo larger than 50 MB" });
      return;
    }

    const prefs = await loadPrefs();
    const deviceId = await getDeviceId();

    let hash = item.content_hash;
    if (!hash) {
      let mtime: number | null = null;
      try {
        mtime = file.info().modificationTime ?? null;
      } catch {}
      hash = await hashFileCached(item.local_id, item.local_uri, mtime);
      await updateQueueItem(item.id, { content_hash: hash });
    }

    if (hash) {
      const existing = await getPhotoByHash(hash);
      if (existing) {
        await updateQueueItem(item.id, { state: "duplicate" });
        if (existing.local_id === item.local_id || existing.id === photoId) {
          await updatePhoto(photoId, {
            status: "uploaded",
            remote_file_id: existing.remote_file_id,
            message_id: existing.message_id,
            uploaded_at: Date.now(),
          });
        }
        return;
      }
    }

    await updatePhoto(photoId, { status: "uploading", content_hash: hash });

    let metaFull: Awaited<ReturnType<typeof getAssetMeta>> | null = null;
    try {
      metaFull = await getAssetMeta(item.local_id);
    } catch {
      metaFull = null;
    }

    const takenAt = metaFull?.takenAt || item.taken_at || Date.now();
    const mime = metaFull?.mime ?? guessMime(item.filename);
    const tags = buildTags(item.filename, item.folder, takenAt, mime, metaFull?.camera ?? null);

    let previewMessage: TgMessage | null = null;
    let previewFileId: string | null = null;
    let previewMessageId: number | null = null;
    if (prefs.uploadPreviews) {
      try {
        const preview = await generatePreview(item.local_uri, prefs.previewTargetKB);
        if (preview) {
          previewMessage = await sendPhoto(channelId, preview.uri, {
            caption: buildPreviewCaption(hash, preview.size),
            filename: `preview_${item.filename.replace(/\.[^.]+$/, "")}.jpg`,
          });
          previewFileId = previewMessage.photo?.[previewMessage.photo.length - 1]?.file_id ?? null;
          previewMessageId = previewMessage.message_id;
          try { new File(preview.uri).delete(); } catch {}
        }
      } catch {
        previewMessage = null;
      }
    }

    const caption = buildCaption({
      filename: item.filename,
      path: metaFull?.localUri,
      size: metaFull?.size ?? file.size,
      width: metaFull?.width ?? null,
      height: metaFull?.height ?? null,
      mime,
      dateTaken: takenAt,
      dateAdded: metaFull?.addedAt ?? item.added_at,
      camera: metaFull?.camera ?? null,
      technical: metaFull?.technical ?? null,
      gps: metaFull?.gps ?? null,
      tags,
      device: deviceId,
      deviceName: null,
      hash,
    });

    const message = await sendDocument(channelId, item.local_uri, {
      caption,
      filename: item.filename,
      mime,
    });

    const doc = message.document;
    await updatePhoto(photoId, {
      status: "uploaded",
      remote_file_id: doc?.file_id ?? null,
      thumb_file_id: doc?.thumbnail?.file_id ?? null,
      preview_file_id: previewFileId,
      message_id: message.message_id,
      preview_message_id: previewMessageId,
      uploaded_at: Date.now(),
      content_hash: hash,
      device: deviceId,
      camera: metaFull?.camera ?? null,
      tags: tags.join(" "),
      size: metaFull?.size ?? file.size,
      width: metaFull?.width ?? null,
      height: metaFull?.height ?? null,
      latitude: metaFull?.gps?.lat ?? null,
      longitude: metaFull?.gps?.lon ?? null,
      exif: metaFull?.technical ? JSON.stringify(metaFull.technical) : null,
      error: null,
    });
    await updateQueueItem(item.id, { state: "done", error: null });
  } catch (e: any) {
    const message = e?.message ?? "Upload failed";
    const retries = item.retries + 1;
    if (retries >= 3 || /413|429|entity too large/i.test(message)) {
      await updateQueueItem(item.id, {
        state: "failed",
        retries,
        error: message,
      });
      await updatePhoto(photoId, { status: "failed", error: message });
    } else {
      await updateQueueItem(item.id, { state: "pending", retries, error: message });
    }
  }
}

export async function getResumeOffset(): Promise<number> {
  const v = await kvGet("updates_offset");
  return v ? parseInt(v, 10) : 0;
}

export async function setResumeOffset(offset: number): Promise<void> {
  await kvSet("updates_offset", String(offset));
}
