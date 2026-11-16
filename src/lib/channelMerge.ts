// Channel merge / migration.
//
// Copies a source channel's PhotogramBot archive into the configured channel
// using Telegram's copyMessage (no download/re-upload; works for files of any
// size the bot can see). The source index comes from the channel's pinned
// #db_backup document. The bot must be a member/admin of the source channel.
//
// Message ids are remapped: every copied message gets a new id in the
// destination, and the local index stores the new ids.

import { File, Paths } from "expo-file-system";
import {
  insertPhoto,
  getPhotoByHash,
  createAlbum,
  addToAlbum,
  type PhotoRow,
} from "./db";
import { getChannelId } from "./settings";
import {
  copyMessage,
  downloadFile,
  getChatPinnedMessage,
  getFile,
} from "./telegram";
import { isEncryptedBackup, decryptText } from "./secretbox";

export interface MergeResult {
  copied: number;
  skipped: number;
  albums: number;
  failed: number;
}

interface BackupPhoto extends Partial<PhotoRow> {
  id: string;
  message_id?: number | null;
  preview_message_id?: number | null;
  motion_message_id?: number | null;
  parts?: string | null;
}

function parseParts(raw: string | null | undefined): { message_id?: number }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readPinnedBackup(
  chatId: string,
  token?: string,
  passphrase?: string
): Promise<any> {
  const pinned = await getChatPinnedMessage(chatId, token);
  if (!pinned?.document) throw new Error("No pinned backup found in the source channel.");
  if (!(pinned.caption ?? "").includes("#db_backup")) {
    throw new Error("The pinned message is not a PhotogramBot backup.");
  }
  const fileId = pinned.document.file_id;
  const info = await getFile(fileId, token);
  if ((info.file_size ?? 0) > 20 * 1024 * 1024) {
    throw new Error("The source backup is larger than the 20 MB bot download limit.");
  }
  const dest = new File(Paths.cache, `merge_${Date.now()}.json`);
  try {
    await downloadFile(fileId, dest.uri, token);
    let text = await dest.text();
    if (isEncryptedBackup(text)) {
      if (!passphrase) throw new Error("The source backup is encrypted — enter its passphrase.");
      text = await decryptText(text, passphrase);
    }
    const data = JSON.parse(text);
    if (data?.format !== "photogrambot-backup") {
      throw new Error("The downloaded document is not a PhotogramBot backup.");
    }
    return data;
  } finally {
    try {
      if (dest.exists) dest.delete();
    } catch {}
  }
}

export async function mergeChannelArchive(options: {
  sourceChannelId: string;
  sourceToken?: string;
  passphrase?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<MergeResult> {
  const dest = await getChannelId();
  if (!dest) throw new Error("Configure this device's channel first.");
  if (!options.sourceChannelId || options.sourceChannelId === dest) {
    throw new Error("Pick a different source channel.");
  }
  const data = await readPinnedBackup(
    options.sourceChannelId,
    options.sourceToken,
    options.passphrase
  );
  const photos: BackupPhoto[] = Array.isArray(data.photos) ? data.photos : [];
  const result: MergeResult = { copied: 0, skipped: 0, albums: 0, failed: 0 };
  const idMap = new Map<string, string>();

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    options.onProgress?.(i + 1, photos.length);
    if (p.content_hash) {
      const existing = await getPhotoByHash(p.content_hash);
      if (existing) {
        idMap.set(p.id, existing.id);
        result.skipped++;
        continue;
      }
    }
    const originalId = p.message_id
      ? await copyMessage(dest, options.sourceChannelId, p.message_id, options.sourceToken)
      : null;
    if (p.message_id && !originalId) {
      result.failed++;
      continue;
    }
    const previewId = p.preview_message_id
      ? await copyMessage(dest, options.sourceChannelId, p.preview_message_id, options.sourceToken)
      : null;
    const motionId = p.motion_message_id
      ? await copyMessage(dest, options.sourceChannelId, p.motion_message_id, options.sourceToken)
      : null;

    // Split videos: copy each part message and rewrite the chain.
    const parts = parseParts(p.parts);
    const newParts: { message_id: number | null }[] = [];
    for (const part of parts) {
      const copied = part.message_id
        ? await copyMessage(dest, options.sourceChannelId, part.message_id, options.sourceToken)
        : null;
      newParts.push({ ...part, message_id: copied });
    }

    const newId = `merge_${originalId ?? Date.now()}_${p.content_hash ?? p.id}`;
    try {
      await insertPhoto({
        id: newId,
        local_id: null,
        local_uri: null,
        remote_file_id: p.remote_file_id ?? null,
        preview_file_id: p.preview_file_id ?? null,
        thumb_file_id: p.thumb_file_id ?? null,
        message_id: originalId,
        preview_message_id: previewId,
        filename: p.filename ?? `merged_${originalId ?? i}.jpg`,
        folder: p.folder ?? null,
        width: p.width ?? null,
        height: p.height ?? null,
        size: p.size ?? null,
        mime: p.mime ?? null,
        taken_at: p.taken_at ?? Date.now(),
        added_at: Date.now(),
        uploaded_at: p.uploaded_at ?? Date.now(),
        remote_date: p.remote_date ?? null,
        content_hash: p.content_hash ?? null,
        device: p.device ?? null,
        camera: p.camera ?? null,
        tags: p.tags ?? null,
        latitude: p.latitude ?? null,
        longitude: p.longitude ?? null,
        exif: p.exif ?? null,
        ai_caption: p.ai_caption ?? null,
        duration: p.duration ?? null,
        parts: newParts.length ? JSON.stringify(newParts) : null,
        profile_id: null,
        favorite: p.favorite ?? 0,
        motion_file_id: p.motion_file_id ?? null,
        motion_message_id: motionId,
        ocr_text: p.ocr_text ?? null,
        status: "uploaded",
        error: null,
        upload_type: "merge",
        phash: p.phash ?? null,
        asset_mtime: p.asset_mtime ?? null,
      });
      idMap.set(p.id, newId);
      result.copied++;
    } catch {
      result.failed++;
    }
  }

  // Merge album membership by remapping the old photo ids.
  const albums = Array.isArray(data.albums) ? data.albums : [];
  for (const a of albums) {
    if (!a?.name) continue;
    try {
      const id = await createAlbum(String(a.name).slice(0, 100));
      const members = (data.album_photos ?? [])
        .filter((ap: any) => ap.album_id === a.id)
        .map((ap: any) => idMap.get(ap.photo_id))
        .filter((id: string | undefined): id is string => !!id);
      if (members.length > 0) await addToAlbum(id, members);
      result.albums++;
    } catch {
      // A single bad album must not abort the merge.
    }
  }
  return result;
}
