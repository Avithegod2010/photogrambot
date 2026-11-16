// Multi-device index sync transport.
//
// Local mutations are recorded in sync_ops (db.ts). This module publishes the
// unsent ops as a small #sync_ops JSON document in the channel and ingests the
// same documents from other devices. Last-write-wins uses the Lamport clock +
// device id; disagreements are recorded in sync_conflicts for the UI.

import { File, Paths } from "expo-file-system";
import {
  applyRemoteOps,
  exportSyncOps,
  getSyncConflicts,
  markSyncOpsSent,
  pendingSyncOpCount,
  type SyncOp,
} from "./db";
import { downloadFile, getFile, sendDocument, type TgMessage } from "./telegram";
import { getChannelId, getDeviceId } from "./settings";

const MAX_SYNC_BYTES = 5 * 1024 * 1024;

export async function publishSyncOps(): Promise<number> {
  const channelId = await getChannelId();
  if (!channelId) return 0;
  const count = await pendingSyncOpCount();
  if (count === 0) return 0;
  const ops = await exportSyncOps(500);
  if (ops.length === 0) return 0;
  const device = await getDeviceId();
  // Chunk at 100 ops so a large first sync still fits Telegram's document
  // limits and each chunk can be acknowledged independently.
  for (let i = 0; i < ops.length; i += 100) {
    await publishChunk(channelId, device, ops.slice(i, i + 100));
  }
  return ops.length;
}

async function publishChunk(
  channelId: string,
  device: string,
  ops: SyncOp[]
): Promise<void> {
  const payload = JSON.stringify({
    format: "photogrambot-sync",
    version: 1,
    device,
    exportedAt: new Date().toISOString(),
    ops,
  });
  const file = new File(Paths.cache, `sync_ops_${Date.now()}_${ops.length}.json`);
  file.write(payload);
  try {
    await sendDocument(channelId, file.uri, {
      caption: `#sync_ops #app:photogrambot ${new Date().toISOString()}`,
      filename: "sync_ops.json",
      mime: "application/json",
    });
    await markSyncOpsSent(ops.map((o) => o.op_id));
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {}
  }
}

export async function ingestSyncDocument(msg: TgMessage): Promise<number> {
  const doc = msg.document;
  if (!doc) return 0;
  if ((msg.caption ?? "").includes("#db_backup")) return 0;
  if ((doc.file_size ?? 0) > MAX_SYNC_BYTES) return 0;
  const dest = new File(Paths.cache, `sync_in_${msg.message_id}_${Date.now()}.json`);
  try {
    const info = await getFile(doc.file_id);
    if ((info.file_size ?? 0) > MAX_SYNC_BYTES) return 0;
    await downloadFile(doc.file_id, dest.uri);
    const data = JSON.parse(await dest.text());
    if (data?.format !== "photogrambot-sync" || !Array.isArray(data.ops)) return 0;
    const { applied } = await applyRemoteOps(data.ops as SyncOp[]);
    return applied;
  } catch {
    return 0;
  } finally {
    try {
      if (dest.exists) dest.delete();
    } catch {}
  }
}

export async function openConflictCount(): Promise<number> {
  return (await getSyncConflicts(200)).length;
}
