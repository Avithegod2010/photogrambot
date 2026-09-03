import {
  getPhotoByMessageId,
  getPhotoByHash,
  insertPhoto,
  kvGet,
  kvSet,
} from "./db";
import { getUpdates, type TgUpdate } from "./telegram";
import { parseCaption } from "./caption";
import { getChannelId } from "./settings";
import { handleRemoteCommand } from "./remote";

export interface UpdatesResult {
  processed: number;
  newPhotos: number;
  backups: number;
  commands: number;
}

export async function pollUpdates(): Promise<UpdatesResult> {
  const offsetRaw = await kvGet("updates_offset");
  let offset = offsetRaw ? parseInt(offsetRaw, 10) : 0;
  let updates: TgUpdate[] = [];
  try {
    updates = await getUpdates(offset > 0 ? offset : -1, 0);
  } catch {
    return { processed: 0, newPhotos: 0, backups: 0, commands: 0 };
  }
  let processed = 0;
  let newPhotos = 0;
  let backups = 0;
  let commands = 0;
  const channelId = await getChannelId();
  for (const u of updates) {
    processed++;
    offset = Math.max(offset, u.update_id + 1);
    const msg = u.channel_post ?? u.message;
    if (!msg) continue;
    // getUpdates returns messages from every chat the bot can see; only
    // ingest the configured channel so foreign chats can't collide with
    // our message_id namespace.
    if (channelId && String(msg.chat.id) !== channelId) continue;
    // Bot commands (/status /sync /pause /resume /delete) — only honored when
    // a channel is configured AND the message came from it; with the filter
    // above skipped (no channelId), commands stay disabled too.
    if (
      channelId &&
      msg.text &&
      (await handleRemoteCommand(msg, String(msg.chat.id)))
    ) {
      commands++;
      continue;
    }
    const parsed = parseCaption(msg.caption);
    if (parsed.isDbBackup) {
      backups++;
      continue;
    }
    const existing = await getPhotoByMessageId(msg.message_id);
    if (existing) continue;
    if (parsed.isPreview) continue;
    const isVsplitPart = parsed.tags.includes("vsplit");
    const docMime = msg.document?.mime_type ?? "";
    if (msg.document && !isVsplitPart && (docMime.startsWith("image/") || docMime.startsWith("video/"))) {
      const doc = msg.document;
      if (parsed.hash && (await getPhotoByHash(parsed.hash))) continue;
      const takenAt = msg.date * 1000;
      await insertPhoto({
        id: `msg_${msg.message_id}_${doc.file_unique_id}`,
        remote_file_id: doc.file_id,
        thumb_file_id: doc.thumbnail?.file_id ?? null,
        message_id: msg.message_id,
        filename: doc.file_name ?? `file_${msg.message_id}`,
        folder: null,
        size: doc.file_size ?? null,
        mime: doc.mime_type ?? null,
        taken_at: takenAt,
        added_at: takenAt,
        remote_date: takenAt,
        content_hash: parsed.hash,
        device: parsed.device,
        tags: parsed.tags.join(" "),
        latitude: parsed.coords?.lat ?? null,
        longitude: parsed.coords?.lon ?? null,
        exif: parsed.technical ? JSON.stringify(parsed.technical) : null,
        status: "uploaded",
      });
      newPhotos++;
    } else if (msg.video) {
      const v = msg.video;
      if (parsed.hash && (await getPhotoByHash(parsed.hash))) continue;
      const takenAt = msg.date * 1000;
      await insertPhoto({
        id: `msg_${msg.message_id}_${v.file_unique_id}`,
        remote_file_id: v.file_id,
        thumb_file_id: v.thumbnail?.file_id ?? null,
        message_id: msg.message_id,
        filename: v.file_name ?? `video_${msg.message_id}.mp4`,
        folder: null,
        size: v.file_size ?? null,
        mime: v.mime_type ?? "video/mp4",
        width: v.width,
        height: v.height,
        duration: v.duration > 0 ? v.duration * 1000 : null,
        taken_at: takenAt,
        added_at: takenAt,
        remote_date: takenAt,
        content_hash: parsed.hash,
        device: parsed.device,
        tags: parsed.tags.join(" "),
        latitude: parsed.coords?.lat ?? null,
        longitude: parsed.coords?.lon ?? null,
        status: "uploaded",
      });
      newPhotos++;
    } else if (msg.photo && msg.photo.length > 0 && !parsed.isPreview) {
      const best = msg.photo[msg.photo.length - 1];
      const takenAt = msg.date * 1000;
      await insertPhoto({
        id: `msg_${msg.message_id}_${best.file_unique_id}`,
        remote_file_id: best.file_id,
        thumb_file_id: best.file_id,
        message_id: msg.message_id,
        filename: `photo_${msg.message_id}.jpg`,
        folder: null,
        size: best.file_size ?? null,
        mime: "image/jpeg",
        width: best.width,
        height: best.height,
        taken_at: takenAt,
        added_at: takenAt,
        remote_date: takenAt,
        content_hash: parsed.hash,
        device: parsed.device,
        tags: parsed.tags.join(" "),
        latitude: parsed.coords?.lat ?? null,
        longitude: parsed.coords?.lon ?? null,
        exif: parsed.technical ? JSON.stringify(parsed.technical) : null,
        status: "uploaded",
      });
      newPhotos++;
    }
  }
  if (offset > 0) await kvSet("updates_offset", String(offset));
  return { processed, newPhotos, backups, commands };
}

