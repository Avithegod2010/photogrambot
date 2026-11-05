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
import { handleCallbackQuery, handleRemoteCommand } from "./remote";
import { logDiag } from "./diaglog";

export interface UpdatesResult {
  processed: number;
  newPhotos: number;
  backups: number;
  commands: number;
}

interface IngestResult {
  newPhotos: number;
  backups: number;
  commands: number;
}

const NOTHING: IngestResult = { newPhotos: 0, backups: 0, commands: 0 };

// One update's worth of work, isolated so a single malformed/duplicate message
// cannot abort the batch before the offset is persisted (a permanent throw
// would make every poll replay the same update forever). Replays are safe:
// photo inserts are guarded by message-id/hash lookups and remote commands are
// idempotent or explicitly armed.
async function ingestUpdate(u: TgUpdate, channelId: string): Promise<IngestResult> {
  // Inline-keyboard presses arrive as callback_query updates (no channel_post).
  // Only callbacks attached to the configured channel are considered, and the
  // handler verifies the presser is a channel admin before acting.
  if (u.callback_query) {
    const cbChatId = String(u.callback_query.message?.chat?.id ?? "");
    if (cbChatId !== channelId) return NOTHING;
    const handled = await handleCallbackQuery(u.callback_query, channelId);
    return handled ? { ...NOTHING, commands: 1 } : NOTHING;
  }
  const msg = u.channel_post ?? u.message;
  if (!msg) return NOTHING;
  // getUpdates returns messages from every chat the bot can see; only ingest
  // the configured channel so foreign chats can't collide with our message_id
  // namespace. Callers only poll after setup, so channelId is a real id here.
  if (String(msg.chat.id) !== channelId) return NOTHING;
  // Bot commands (/status /sync /pause /resume /delete) — channel posts ONLY.
  // Channel-post restriction is the authorization model: in a private channel
  // only admins can post, so every command sender is an admin. If the
  // configured chat were a group, member messages arrive as u.message and
  // commands stay dead (security audit: chat-membership alone would let any
  // member drive the device). Private chats can't match a -100 channel id, so
  // they're excluded by the filter above anyway.
  if (
    u.channel_post &&
    u.channel_post.text &&
    (await handleRemoteCommand(u.channel_post, String(u.channel_post.chat.id)))
  ) {
    return { ...NOTHING, commands: 1 };
  }
  const parsed = parseCaption(msg.caption);
  if (parsed.isDbBackup) return { ...NOTHING, backups: 1 };
  const existing = await getPhotoByMessageId(msg.message_id);
  if (existing) return NOTHING;
  if (parsed.isPreview) return NOTHING;
  const isVsplitPart = parsed.tags.includes("vsplit");
  const docMime = msg.document?.mime_type ?? "";
  if (msg.document && !isVsplitPart && (docMime.startsWith("image/") || docMime.startsWith("video/"))) {
    const doc = msg.document;
    if (parsed.hash && (await getPhotoByHash(parsed.hash))) return NOTHING;
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
    return { ...NOTHING, newPhotos: 1 };
  }
  if (msg.video) {
    const v = msg.video;
    if (parsed.hash && (await getPhotoByHash(parsed.hash))) return NOTHING;
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
    return { ...NOTHING, newPhotos: 1 };
  }
  if (msg.photo && msg.photo.length > 0) {
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
    return { ...NOTHING, newPhotos: 1 };
  }
  return NOTHING;
}

export async function pollUpdates(): Promise<UpdatesResult> {
  const channelId = await getChannelId();
  // No channel means setup never completed. Return without touching the
  // offset so nothing is consumed/ingested from foreign chats.
  if (!channelId) {
    return { processed: 0, newPhotos: 0, backups: 0, commands: 0 };
  }
  const offsetRaw = await kvGet("updates_offset");
  let offset = offsetRaw ? parseInt(offsetRaw, 10) : 0;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
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
  for (const u of updates) {
    processed++;
    // Advance before doing the work: the update is considered consumed even
    // if its handler fails, so one poisonous message cannot stall the feed.
    offset = Math.max(offset, u.update_id + 1);
    try {
      const result = await ingestUpdate(u, channelId);
      newPhotos += result.newPhotos;
      backups += result.backups;
      commands += result.commands;
    } catch (e: any) {
      void logDiag("updates", `Update ${u.update_id} failed: ${e?.message ?? e}`);
    }
  }
  if (offset > 0) await kvSet("updates_offset", String(offset));
  return { processed, newPhotos, backups, commands };
}
