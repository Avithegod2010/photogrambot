import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  exportAllData,
  importAllData,
  kvGet,
  kvSet,
} from "./db";
import {
  getBotToken,
  getChannelId,
  setBotToken,
  setChannelId,
  loadPrefs,
  getBackupPassphrase,
} from "./settings";
import { getChatPinnedMessage, downloadFile, getFile } from "./telegram";
import { encryptText, decryptText, isEncryptedBackup } from "./secretbox";

const BACKUP_FILENAME = "photogrambot-backup.json";
const KV_BACKUP_MESSAGE_ID = "backup_message_id";

function backupDir(): Directory {
  const dir = new Directory(Paths.document, "backups");
  if (!dir.exists) dir.create();
  return dir;
}

export function localBackupPath(): string {
  return `${backupDir().uri}${BACKUP_FILENAME}`;
}

async function serializeBackup(): Promise<string> {
  const json = await exportAllData();
  const prefs = await loadPrefs();
  const data = JSON.parse(json) as Record<string, unknown>;
  if (prefs.dbBackupIncludeToken) {
    const token = await getBotToken();
    if (token) data.bot_token = token;
  }
  const payload = JSON.stringify(data);
  if (!prefs.dbBackupEncrypt) return payload;
  const passphrase = await getBackupPassphrase();
  if (!passphrase) {
    throw new Error("Backup encryption is on but no passphrase is set — add one in Settings");
  }
  return encryptText(payload, passphrase);
}

/**
 * A backup that carries the bot token (opt-in) lets a device that has NOT
 * been set up yet adopt the old connection. A device that already has a
 * working token always keeps its own.
 */
async function adoptBackupToken(data: Record<string, unknown>): Promise<void> {
  const token = data?.bot_token;
  if (typeof token !== "string" || !/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) return;
  const current = await getBotToken();
  if (!current) await setBotToken(token);
}

async function deserializeBackup(text: string): Promise<string> {
  if (!isEncryptedBackup(text)) return text;
  const passphrase = await getBackupPassphrase();
  if (!passphrase) {
    throw new Error("This backup is encrypted — enter its passphrase in Settings first");
  }
  return decryptText(text, passphrase);
}

export async function exportToLocalFile(): Promise<string> {
  const payload = await serializeBackup();
  const file = new File(localBackupPath());
  if (file.exists) file.delete();
  file.write(payload);
  return file.uri;
}

export async function shareLocalBackup(): Promise<void> {
  const uri = await exportToLocalFile();
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/json",
      dialogTitle: "Save PhotogramBot backup",
    });
  }
}

export async function importFromLocalFile(replace: boolean): Promise<number> {
  const file = new File(localBackupPath());
  if (!file.exists) throw new Error("No local backup file found");
  const json = await deserializeBackup(await file.text());
  const token = await getBotToken();
  const channelId = await getChannelId();
  const count = await importAllData(json, replace);
  if (token) await setBotToken(token);
  if (channelId) await setChannelId(channelId);
  else {
    try {
      await adoptBackupToken(JSON.parse(json) as Record<string, unknown>);
    } catch {}
  }
  return count;
}

export async function importFromJsonString(raw: string, replace: boolean): Promise<number> {
  const json = await deserializeBackup(raw);
  const data = JSON.parse(json);
  if (data.format !== "photogrambot-backup") throw new Error("Not a PhotogramBot backup file");
  const savedToken = await getBotToken();
  const savedChannel = await getChannelId();
  const count = await importAllData(json, replace);
  if (savedToken) await setBotToken(savedToken);
  else await adoptBackupToken(data);
  if (savedChannel) await setChannelId(savedChannel);
  return count;
}

export async function uploadBackupToChannel(): Promise<boolean> {
  const channelId = await getChannelId();
  if (!channelId) return false;
  const { sendDocument, pinChatMessage, unpinChatMessage } = await import("./telegram");
  const payload = await serializeBackup();
  const prefs = await loadPrefs();
  const tmp = new File(Paths.cache, BACKUP_FILENAME);
  if (tmp.exists) tmp.delete();
  tmp.write(payload);
  const oldMessageId = await kvGet(KV_BACKUP_MESSAGE_ID);
  if (oldMessageId) {
    await unpinChatMessage(channelId, parseInt(oldMessageId, 10));
  }
  const message = await sendDocument(channelId, tmp.uri, {
    caption: `#db_backup #app:photogrambot${prefs.dbBackupEncrypt ? " #encrypted" : ""} ${new Date().toISOString()}`,
    filename: BACKUP_FILENAME,
    mime: "application/json",
  });
  await kvSet(KV_BACKUP_MESSAGE_ID, String(message.message_id));
  await pinChatMessage(channelId, message.message_id);
  try { tmp.delete(); } catch {}
  return true;
}

export interface RestoreResult {
  restored: number;
  source: "pinned" | "local";
}

export interface BackupOffer {
  messageId: number;
  exportedAt: string | null;
  encrypted: boolean;
}

/**
 * Look for a pinned PhotogramBot backup in the configured channel — the
 * migration-wizard entry point on a fresh install. Best-effort: any error
 * (offline, no pinned message, permissions) simply yields no offer.
 */
export async function findChannelBackupOffer(): Promise<BackupOffer | null> {
  try {
    const channelId = await getChannelId();
    if (!channelId) return null;
    const pinned = await getChatPinnedMessage(channelId);
    if (!pinned?.document) return null;
    const caption = pinned.caption ?? "";
    if (!caption.includes("#db_backup")) return null;
    const iso = caption.match(/\d{4}-\d{2}-\d{2}T[^\s"]+/)?.[0] ?? null;
    return {
      messageId: pinned.message_id,
      exportedAt: iso,
      encrypted: caption.includes("#encrypted"),
    };
  } catch {
    return null;
  }
}

export async function restoreFromChannelPinned(replace: boolean): Promise<RestoreResult> {
  const channelId = await getChannelId();
  if (!channelId) throw new Error("Channel not configured");
  const pinned = await getChatPinnedMessage(channelId);
  if (!pinned?.document) throw new Error("No pinned backup found in the channel");
  const caption = pinned.caption ?? "";
  if (!caption.includes("#db_backup")) throw new Error("Pinned message is not a PhotogramBot backup");
  const fileId = pinned.document.file_id;
  const info = await getFile(fileId);
  if ((info.file_size ?? 0) > 20 * 1024 * 1024) {
    throw new Error("Backup file too large to download via bot (20 MB limit)");
  }
  const dest = new File(Paths.cache, `restore_${Date.now()}.json`);
  await downloadFile(fileId, dest.uri);
  const json = await dest.text();
  const count = await importFromJsonString(json, replace);
  try { dest.delete(); } catch {}
  await kvSet(KV_BACKUP_MESSAGE_ID, String(pinned.message_id));
  return { restored: count, source: "pinned" };
}
