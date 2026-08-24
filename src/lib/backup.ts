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
} from "./settings";
import { getChatPinnedMessage, downloadFile, getFile } from "./telegram";

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

export async function exportToLocalFile(): Promise<string> {
  const json = await exportAllData();
  const file = new File(localBackupPath());
  if (file.exists) file.delete();
  file.write(json);
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
  const json = await file.text();
  const token = await getBotToken();
  const channelId = await getChannelId();
  const count = await importAllData(json, replace);
  if (token) await setBotToken(token);
  if (channelId) await setChannelId(channelId);
  return count;
}

export async function importFromJsonString(json: string, replace: boolean): Promise<number> {
  const data = JSON.parse(json);
  if (data.format !== "photogrambot-backup") throw new Error("Not a PhotogramBot backup file");
  const savedToken = await getBotToken();
  const savedChannel = await getChannelId();
  const count = await importAllData(json, replace);
  if (savedToken) await setBotToken(savedToken);
  if (savedChannel) await setChannelId(savedChannel);
  return count;
}

export async function uploadBackupToChannel(): Promise<boolean> {
  const channelId = await getChannelId();
  if (!channelId) return false;
  const { sendDocument, pinChatMessage, unpinChatMessage } = await import("./telegram");
  const json = await exportAllData();
  const tmp = new File(Paths.cache, BACKUP_FILENAME);
  if (tmp.exists) tmp.delete();
  tmp.write(json);
  const oldMessageId = await kvGet(KV_BACKUP_MESSAGE_ID);
  if (oldMessageId) {
    await unpinChatMessage(channelId, parseInt(oldMessageId, 10));
  }
  const message = await sendDocument(channelId, tmp.uri, {
    caption: `#db_backup #app:photogrambot ${new Date().toISOString()}`,
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
