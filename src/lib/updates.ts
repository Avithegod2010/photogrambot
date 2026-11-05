import {
  getPhotoByMessageId,
  getPhotoByHash,
  insertPhoto,
  kvGet,
  kvSet,
} from "./db";
import { type TgUpdate } from "./telegram";
import { fetchUpdates } from "./webhook";
import { parseCaption } from "./caption";
import { getChannelId, loadPrefs } from "./settings";
import { handleCallbackQuery, handleRemoteCommand, isChannelAdmin } from "./remote";
import { findAdmin, parseRemoteAdmins, type RemoteRole } from "./remoteAuth";
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
  const prefs = await loadPrefs();
  const admins = parseRemoteAdmins(prefs.remoteAdmins);

  // Inline-keyboard presses arrive as callback_query updates. Channel
  // callbacks require a channel admin; private-chat callbacks require the
  // presser to be on the allowlist (with their role).
  if (u.callback_query) {
    const chat = u.callback_query.message?.chat;
    const fromId = u.callback_query.from?.id;
    if (!chat || !fromId) return NOTHING;
    const cbChatId = String(chat.id);
    let role: RemoteRole | null = null;
    if (cbChatId === channelId) {
      role = (await isChannelAdmin(channelId, fromId)) ? "admin" : null;
    } else if (chat.type === "private") {
      role = findAdmin(admins, fromId)?.role ?? null;
    }
    if (!role) return NOTHING;
    const handled = await handleCallbackQuery(u.callback_query, channelId, role, cbChatId);
    return handled ? { ...NOTHING, commands: 1 } : NOTHING;
  }

  const msg = u.channel_post ?? u.message;
  if (!msg) return NOTHING;
  const chatId = String(msg.chat.id);
  const isChannel = chatId === channelId;
  let actorRole: RemoteRole | null = null;
  if (isChannel) {
    // Channel posts are the owner/admin path (only channel admins can post in
    // the usual private-channel setup).
    actorRole = "admin";
  } else if (!u.channel_post && msg.chat.type === "private") {
    actorRole = findAdmin(admins, msg.from?.id)?.role ?? null;
  }
  if (!actorRole) return NOTHING;
  if (msg.text && (await handleRemoteCommand(msg, isChannel ? channelId : chatId, actorRole))) {
    return { ...NOTHING, commands: 1 };
  }
  // Direct messages are command-only; photo ingestion stays channel-scoped.
  if (!isChannel) return NOTHING;
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
    updates = await fetchUpdates(offset);
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
