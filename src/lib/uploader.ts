import { File } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import {
  enqueueUpload,
  nextQueueBatch,
  updateQueueItem,
  insertPhoto,
  updatePhoto,
  getPhoto,
  getPhotoByHash,
  getInFlightHashConflict,
  getPhotoByLocalId,
  hasActiveQueuedUpload,
  getQueueCounts,
  recoverStaleRunning,
  kvGet,
  kvSet,
  type QueueRow,
} from "./db";
import { getBotToken, getChannelId, loadPrefs, getDeviceId, getAiApiKey, DEFAULT_AI_PROMPT } from "./settings";
import {
  sendDocument,
  sendPhoto,
  sendVideo,
  sendMediaGroup,
  createForumTopic,
  TelegramError,
  TgMessage,
} from "./telegram";
import { captionImageWithGemini } from "./ai";
import { buildCaption, buildPreviewCaption } from "./caption";
import { generatePreview, getAssetMeta, guessMime, buildTags } from "./media";
import { hashFileCached } from "./hash";
import { isVideoMime } from "./format";
import { splitAndUploadVideo, type VideoPart } from "./vsplit";
import { notifyUploadProgress, notifyUploadComplete, notifyUploadsFailed } from "./notify";
import {
  resolveDestination,
  profileIdForFolder,
  type Destination,
} from "./destinations";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_RETRIES = 5;
const UPLOAD_CONCURRENCY = 2;
const PROGRESS_EMIT_MS = 250;
const PERMANENT_CODES = new Set([400, 404, 413]);
let processing = false;
let cancelRequested = false;

const activeCancels = new Set<() => void>();

export interface UploadProgress {
  running: boolean;
  current: number;
  total: number;
  currentFile: string | null;
  done: number;
  failed: number;
  skipped: number;
  duplicates: number;
  sentBytes: number;
  totalBytes: number;
  percent: number | null;
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
  sentBytes: 0,
  totalBytes: 0,
  percent: null,
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
  for (const cancel of [...activeCancels]) {
    try {
      cancel();
    } catch {}
  }
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
  uploadType: "manual" | "sync",
  profileId?: string | null
): Promise<number> {
  let enqueued = 0;
  for (const item of items) {
    const existing = await getPhotoByLocalId(item.local_id);
    if (existing && existing.status === "uploaded") continue;
    // A full-gallery sync can run for minutes — never stack duplicate queue
    // rows for an asset that is already pending or mid-upload.
    if (await hasActiveQueuedUpload(item.local_id)) continue;
    let localUri = existing?.local_uri ?? null;
    if (!localUri) {
      try {
        const asset = new MediaLibrary.Asset(item.local_id);
        localUri = await asset.getUri();
      } catch {
        continue;
      }
    }
    const pid =
      profileId ??
      (await profileIdForFolder(item.folder));
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
      profile_id: pid,
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
        profile_id: pid,
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
  let runDone = 0;
  let runFailed = 0;
  try {
    await recoverStaleRunning();
    // Banner denominator = everything pending when the run began. Batches are
    // pulled 10 at a time, so counting per batch made the total climb
    // 10→20→30… while uploading. discovered only exceeds the snapshot when
    // genuinely new items are enqueued mid-run (e.g. camera watch).
    const startPending = (await getQueueCounts()).pending ?? 0;
    let discovered = 0;
    let started = 0;
    let first = true;
    for (;;) {
      if (cancelRequested) break;
      const batch = await nextQueueBatch(UPLOAD_CONCURRENCY * 5);
      if (batch.length === 0) break;
      if (first) {
        setProgress({
          running: true,
          current: 0,
          total: startPending,
          done: 0,
          failed: 0,
          skipped: 0,
          duplicates: 0,
          currentFile: null,
          sentBytes: 0,
          totalBytes: 0,
          percent: null,
        });
        first = false;
      }
      discovered += batch.length;
      setProgress({ total: Math.max(startPending, discovered) });
      let index = 0;
      const workers = Array.from(
        { length: Math.min(UPLOAD_CONCURRENCY, batch.length) },
        async () => {
          for (;;) {
            if (cancelRequested) return;
            const i = index++;
            if (i >= batch.length) return;
            const item = batch[i];
            started++;
            setProgress({ current: started, currentFile: item.filename });
            const outcome = await uploadQueueItem(item);
            if (outcome === "done") runDone++;
            else if (outcome === "failed") runFailed++;
            const counts = await getQueueCounts();
            setProgress({
              done: counts.done ?? 0,
              failed: counts.failed ?? 0,
              skipped: counts.skipped ?? 0,
              duplicates: counts.duplicate ?? 0,
            });
            void maybeNotifyProgress();
          }
        }
      );
      await Promise.all(workers);
    }
  } finally {
    processing = false;
    try {
      await flushPreviews();
    } catch {}
    setProgress({ running: false, currentFile: null, sentBytes: 0, totalBytes: 0, percent: null });
    if (!cancelRequested) {
      if (runFailed > 0) {
        void notifyUploadsFailed(runFailed, runDone);
      } else {
        void notifyUploadComplete(runDone, runFailed);
      }
    }
  }
}

let lastNotifyAt = 0;

async function maybeNotifyProgress(): Promise<void> {
  const now = Date.now();
  if (now - lastNotifyAt < 3000) return;
  lastNotifyAt = now;
  await notifyUploadProgress(progress.current, progress.total, progress.currentFile);
}

export function isProcessing(): boolean {
  return processing;
}

let lastProgressEmitAt = 0;

function emitFileProgress(sentBytes: number, totalBytes: number): void {
  const now = Date.now();
  if (totalBytes <= 0 || now - lastProgressEmitAt < PROGRESS_EMIT_MS) return;
  lastProgressEmitAt = now;
  setProgress({
    sentBytes,
    totalBytes,
    percent: Math.min(99, Math.round((sentBytes / totalBytes) * 100)),
  });
}

function computeBackoffMs(e: unknown, retries: number): number {
  const retryAfter = e instanceof TelegramError ? e.retryAfter : undefined;
  if (retryAfter && retryAfter > 0) return (retryAfter + 1) * 1000;
  const base = Math.min(30_000 * 2 ** retries, 30 * 60_000);
  return base + Math.floor(Math.random() * 5_000);
}

async function topicIdFor(
  channelId: string,
  folder: string | null,
  token: string
): Promise<number | null> {
  try {
    const prefs = await loadPrefs();
    if (!prefs.topicPerFolder || !folder) return null;
    const raw = await kvGet("topic_map");
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    if (map[folder]) return map[folder];
    const topic = await createForumTopic(channelId, folder, token);
    if (!topic) return null;
    map[folder] = topic.message_thread_id;
    await kvSet("topic_map", JSON.stringify(map));
    return topic.message_thread_id;
  } catch {
    return null;
  }
}

interface PendingPreview {
  uri: string;
  caption: string;
  filename: string;
  channelId: string;
  token: string;
  threadId?: number;
  resolve: (m: TgMessage | null) => void;
}

let previewBuffer: PendingPreview[] = [];
let previewFlushTimer: ReturnType<typeof setTimeout> | null = null;

async function queuePreview(
  channelId: string,
  token: string,
  uri: string,
  caption: string,
  filename: string,
  messageThreadId?: number
): Promise<TgMessage | null> {
  return new Promise<TgMessage | null>((resolve) => {
    previewBuffer.push({ uri, caption, filename, channelId, token, threadId: messageThreadId, resolve });
    if (previewBuffer.length >= 10) {
      void flushPreviews();
    } else if (!previewFlushTimer) {
      previewFlushTimer = setTimeout(() => {
        void flushPreviews();
      }, 1500);
    }
  });
}

async function flushPreviews(): Promise<void> {
  if (previewFlushTimer) {
    clearTimeout(previewFlushTimer);
    previewFlushTimer = null;
  }
  const batch = previewBuffer;
  previewBuffer = [];
  if (batch.length === 0) return;
  // Group by destination so profiles never cross contaminate a media group.
  const groups = new Map<string, PendingPreview[]>();
  for (const p of batch) {
    const key = `${p.token}|${p.channelId}|${p.threadId ?? ""}`;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  for (const group of groups.values()) {
    for (const chunk of chunksOf(group, 10)) {
      if (cancelRequested) {
        // Upload was cancelled — don't leave orphan previews in the channel.
        chunk.forEach((p) => p.resolve(null));
        continue;
      }
      try {
        const messages = await sendMediaGroup(
          chunk[0].channelId,
          chunk.map((p) => ({ uri: p.uri, caption: p.caption, filename: p.filename })),
          { messageThreadId: chunk[0].threadId, token: chunk[0].token }
        );
        if (messages && messages.length === chunk.length) {
          chunk.forEach((p, i) => p.resolve(messages[i] ?? null));
          continue;
        }
        throw new Error("Media group size mismatch");
      } catch {
        for (const p of chunk) {
          try {
            p.resolve(
              await sendPhoto(p.channelId, p.uri, {
                caption: p.caption,
                filename: p.filename,
                token: p.token,
              })
            );
          } catch {
            p.resolve(null);
          }
        }
      }
    }
  }
}

function chunksOf<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type UploadOutcome = "done" | "duplicate" | "skipped" | "failed" | "requeued";

async function uploadQueueItem(item: QueueRow): Promise<UploadOutcome> {
  const dest: Destination | null = await resolveDestination(item.profile_id);
  if (!dest) {
    await updateQueueItem(item.id, {
      state: "failed",
      error: item.profile_id
        ? "Destination missing or its bot token was never entered"
        : "Bot not configured",
    });
    return "failed";
  }
  const token = dest.token;
  const channelId = dest.channelId;
  await updateQueueItem(item.id, { state: "running" });
  const photoId = `local_${item.local_id}`;
  try {
    const file = new File(item.local_uri);
    if (!file.exists) {
      await updateQueueItem(item.id, { state: "failed", error: "File missing on device" });
      await updatePhoto(photoId, { status: "failed", error: "File missing on device" });
      return "failed";
    }
    const actualSize = file.size;
    const looksLikeVideo = isVideoMime(guessMime(item.filename));
    if (actualSize > MAX_UPLOAD_BYTES && !looksLikeVideo) {
      await updateQueueItem(item.id, { state: "skipped", error: "Photo larger than 50 MB" });
      await updatePhoto(photoId, { status: "skipped_too_large", error: "Photo larger than 50 MB" });
      return "skipped";
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
        return "duplicate";
      }
      // Another worker may be uploading the identical file right now —
      // requeue briefly instead of double-uploading.
      const inflight = await getInFlightHashConflict(hash, photoId);
      if (inflight) {
        await updateQueueItem(item.id, {
          state: "pending",
          error: "Waiting for an identical upload to finish",
          next_attempt_at: Date.now() + 15_000,
        });
        return "requeued";
      }
    }

    await updatePhoto(photoId, { status: "uploading", content_hash: hash });
    const threadId = await topicIdFor(channelId, item.folder, token);

    let metaFull: Awaited<ReturnType<typeof getAssetMeta>> | null = null;
    try {
      metaFull = await getAssetMeta(item.local_id);
    } catch {
      metaFull = null;
    }

    const takenAt = metaFull?.takenAt || item.taken_at || Date.now();
    const mime = metaFull?.mime ?? guessMime(item.filename);
    const tags = buildTags(item.filename, item.folder, takenAt, mime, metaFull?.camera ?? null);

    if (looksLikeVideo || isVideoMime(mime)) {
      await uploadVideoItem(item, photoId, channelId, {
        hash,
        mime,
        metaFull,
        takenAt,
        tags,
        deviceId,
        fileSize: file.size,
        threadId,
        token,
      });
      await updateQueueItem(item.id, { state: "done", error: null });
      return "done";
    }

    let previewMessage: TgMessage | null = null;
    let previewFileId: string | null = null;
    let previewMessageId: number | null = null;
    let previewLocalUri: string | null = null;
    if (prefs.uploadPreviews) {
      try {
        const preview = await generatePreview(item.local_uri, prefs.previewTargetKB);
        if (preview) {
          previewLocalUri = preview.uri;
          previewMessage = await queuePreview(
            channelId,
            token,
            preview.uri,
            buildPreviewCaption(hash, preview.size),
            `preview_${item.filename.replace(/\.[^.]+$/, "")}.jpg`,
            threadId ?? undefined
          );
          previewFileId =
            previewMessage?.photo?.[previewMessage.photo.length - 1]?.file_id ?? null;
          previewMessageId = previewMessage?.message_id ?? null;
        }
      } catch {
        previewMessage = null;
      }
    }

    let aiDescription: string | null = null;
    let aiOnlyPreviewUri: string | null = null;
    if (prefs.aiCaptions) {
      try {
        const apiKey = await getAiApiKey();
        if (apiKey) {
          let aiUri = previewLocalUri;
          if (!aiUri) {
            const tiny = await generatePreview(item.local_uri, 100);
            if (tiny) {
              aiUri = tiny.uri;
              aiOnlyPreviewUri = tiny.uri;
            }
          }
          if (aiUri) {
            aiDescription = await captionImageWithGemini({
              apiKey,
              model: prefs.aiModel || "gemini-2.5-flash",
              prompt: prefs.aiPrompt || DEFAULT_AI_PROMPT,
              imageUri: aiUri,
            });
          }
        }
      } catch {}
    }
    if (aiOnlyPreviewUri) {
      try { new File(aiOnlyPreviewUri).delete(); } catch {}
    }
    if (previewLocalUri) {
      try { new File(previewLocalUri).delete(); } catch {}
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
      aiDescription,
    });

    const controller = new AbortController();
    const cancelFn = () => controller.abort();
    activeCancels.add(cancelFn);
    let message: TgMessage;
    try {
      message = await sendDocument(channelId, item.local_uri, {
        caption,
        filename: item.filename,
        mime,
        onProgress: emitFileProgress,
        signal: controller.signal,
        messageThreadId: threadId ?? undefined,
        token,
      });
    } finally {
      activeCancels.delete(cancelFn);
    }

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
      ai_caption: aiDescription,
      profile_id: item.profile_id,
      error: null,
    });
    await updateQueueItem(item.id, { state: "done", error: null });
    return "done";
  } catch (e: any) {
    const message = e?.message ?? "Upload failed";
    if (cancelRequested) {
      // User cancelled — put the item back without burning a retry.
      await updateQueueItem(item.id, { state: "pending", error: "Cancelled" });
      return "requeued";
    }
    const retries = item.retries + 1;
    const permanent =
      (e instanceof TelegramError && PERMANENT_CODES.has(e.code)) ||
      /entity too large/i.test(message);
    if (permanent || retries >= MAX_RETRIES) {
      await updateQueueItem(item.id, { state: "failed", retries, error: message });
      await updatePhoto(photoId, { status: "failed", error: message });
      return "failed";
    } else {
      await updateQueueItem(item.id, {
        state: "pending",
        retries,
        error: message,
        next_attempt_at: Date.now() + computeBackoffMs(e, retries),
      });
      return "requeued";
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

async function uploadVideoItem(
  item: QueueRow,
  photoId: string,
  channelId: string,
  ctx: {
    hash: string | null;
    mime: string;
    metaFull: Awaited<ReturnType<typeof getAssetMeta>> | null;
    takenAt: number;
    tags: string[];
    deviceId: string;
    fileSize: number;
    threadId: number | null;
    token: string;
  }
): Promise<void> {
  const { metaFull } = ctx;
  const duration = metaFull?.duration ?? null;
  const fileSize = metaFull?.size ?? ctx.fileSize;
  const caption = buildCaption({
    filename: item.filename,
    path: metaFull?.localUri,
    size: fileSize,
    width: metaFull?.width ?? null,
    height: metaFull?.height ?? null,
    mime: ctx.mime,
    duration,
    dateTaken: ctx.takenAt,
    dateAdded: metaFull?.addedAt ?? item.added_at,
    camera: metaFull?.camera ?? null,
    technical: null,
    gps: metaFull?.gps ?? null,
    tags: ctx.tags,
    device: ctx.deviceId,
    deviceName: null,
    hash: ctx.hash,
  });

  const controller = new AbortController();
  const cancelFn = () => controller.abort();
  activeCancels.add(cancelFn);
  try {
    let partsJson: string | null = null;
    let thumbOverride: string | null = null;
    let message: TgMessage | null = null;
    if (fileSize > MAX_UPLOAD_BYTES) {
      // Too large for one Bot API message — split into reassemblable parts.
      // Persist partial progress so a retry resumes instead of re-uploading.
      const existing = await getPhoto(photoId);
      const resumeParts = parsePartsJson(existing?.parts ?? null);
      const result = await splitAndUploadVideo(channelId, item.local_uri, {
        hash: ctx.hash ?? "",
        filename: item.filename,
        messageThreadId: ctx.threadId ?? undefined,
        token: ctx.token,
        resumeParts: resumeParts ?? undefined,
        onPartsChanged: (parts) => {
          void updatePhoto(photoId, { parts: JSON.stringify(parts) });
        },
        onProgress: emitFileProgress,
        signal: controller.signal,
      });
      partsJson = JSON.stringify(result.parts);
      thumbOverride = existing?.thumb_file_id ?? result.thumbFileId;
    } else {
      try {
        message = await sendVideo(channelId, item.local_uri, {
          caption,
          filename: item.filename,
          mime: ctx.mime,
          duration: duration ?? undefined,
          width: metaFull?.width ?? undefined,
          height: metaFull?.height ?? undefined,
          supportsStreaming: true,
          onProgress: emitFileProgress,
          signal: controller.signal,
          messageThreadId: ctx.threadId ?? undefined,
          token: ctx.token,
        });
      } catch (e) {
        if (e instanceof TelegramError && (e.code === 400 || e.code === 415)) {
          // Unsupported container/codec for sendVideo — keep the original as a document.
          message = await sendDocument(channelId, item.local_uri, {
            caption,
            filename: item.filename,
            mime: ctx.mime,
            onProgress: emitFileProgress,
            signal: controller.signal,
            messageThreadId: ctx.threadId ?? undefined,
            token: ctx.token,
          });
        } else {
          throw e;
        }
      }
    }

    await updatePhoto(photoId, {
      status: "uploaded",
      remote_file_id:
        message?.video?.file_id ?? message?.document?.file_id ?? null,
      thumb_file_id:
        message?.video?.thumbnail?.file_id ??
        message?.document?.thumbnail?.file_id ??
        thumbOverride ??
        null,
      preview_file_id: null,
      message_id: message?.message_id ?? null,
      preview_message_id: null,
      uploaded_at: Date.now(),
      content_hash: ctx.hash,
      device: ctx.deviceId,
      camera: metaFull?.camera ?? null,
      tags: ctx.tags.join(" "),
      size: fileSize,
      width: metaFull?.width ?? null,
      height: metaFull?.height ?? null,
      latitude: metaFull?.gps?.lat ?? null,
      longitude: metaFull?.gps?.lon ?? null,
      duration,
      parts: partsJson,
      profile_id: item.profile_id,
      error: null,
    });
  } finally {
    activeCancels.delete(cancelFn);
  }
}

function parsePartsJson(raw: string | null | undefined): VideoPart[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VideoPart[];
    return Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.file_id ? parsed : null;
  } catch {
    return null;
  }
}
