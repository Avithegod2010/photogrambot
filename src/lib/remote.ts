// Remote control via bot commands — the owner messages the channel from any
// Telegram client and the app reacts. Wired into pollUpdates (updates.ts):
// non-channel messages are currently DROPPED there, so commands must arrive
// in the configured channel chat itself (the usual setup — private channel
// with the bot as admin posting backups).
//
// Commands (case-insensitive, reply forms where noted):
//   /status          — library + queue totals
//   /sync            — full-gallery scan + enqueue (respects network gates)
//   /pause           — hold auto-sync (watcher/background/bootstrap)
//   /resume          — release the pause, then one scan
//   /delete          — REPLY to a backed-up photo's message → trashes it
//                      locally and deletes the channel message
//   /wipe            — arm the local wipe; /wipe confirm within 5 minutes
//                      erases every backed-up photo's LOCAL copy from this
//                      device (anti-theft: channel archive survives). Two-step
//                      so a stray message can't mass-delete.
//
// Security: every command is authenticated by the channel — only messages
// inside the configured channel chat are honored (updates.ts already drops
// foreign chats before we run). /delete additionally requires a reply target
// that maps to a known photo row.

import {
  getStats,
  getPhotoByMessageId,
  addToTrash,
  markTrashRemoteDeleted,
  getLargestUploaded,
  kvGet,
  kvSet,
} from "./db";
import { sendMessage, deleteMessage, type TgMessage } from "./telegram";
import { tokenForPhoto } from "./destinations";
import { formatBytes } from "./format";

const PAUSE_KEY = "remote_paused";
const WIPE_ARM_KEY = "wipe_armed_at";
const WIPE_ARM_WINDOW_MS = 5 * 60 * 1000;

export async function isRemotePaused(): Promise<boolean> {
  return (await kvGet(PAUSE_KEY)) === "1";
}

function fmt(n: number): string {
  return String(n);
}

async function replyStatus(chatId: string, replyTo: number): Promise<void> {
  const s = await getStats();
  const paused = await isRemotePaused();
  // Informational extra — a failure here must not kill the whole reply (a
  // thrown /status unwinds past the offset persistence in pollUpdates and
  // replays the whole batch on the next poll).
  let largestLine = "";
  try {
    const largest = await getLargestUploaded(3);
    if (largest.length > 0) {
      largestLine = `Largest: ${largest
        .map((p) => `${p.filename} (${formatBytes(p.size)})`)
        .join(", ")}`;
    }
  } catch {}
  const lines = [
    `PhotogramBot status`,
    `Library: ${fmt(s.total)} photos, ${fmt(s.uploaded)} backed up (${formatBytes(s.totalBytes)})`,
    `Queue: ${fmt(s.pending)} pending, ${fmt(s.failed)} failed`,
    `Trash: ${fmt(s.trashed)}`,
    paused ? "Auto-sync: PAUSED (send /resume)" : "Auto-sync: active",
  ];
  if (largestLine) lines.push(largestLine);
  await sendMessage(chatId, lines.join("\n"), { replyToMessageId: replyTo });
}

// Returns true if the message was a command (caller should skip ingestion).
export async function handleRemoteCommand(
  msg: TgMessage,
  chatId: string
): Promise<boolean> {
  const text = (msg.text ?? "").trim();
  if (!text.startsWith("/")) return false;
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  if (!["/status", "/sync", "/pause", "/resume", "/delete", "/wipe"].includes(cmd)) {
    return false; // unknown slash command — not ours; let ingestion proceed
  }

  if (cmd === "/status") {
    await replyStatus(chatId, msg.message_id);
  } else if (cmd === "/pause") {
    await kvSet(PAUSE_KEY, "1");
    await sendMessage(chatId, "Auto-sync paused. Send /resume to continue.", {
      replyToMessageId: msg.message_id,
    });
  } else if (cmd === "/resume") {
    await kvSet(PAUSE_KEY, "0");
    // Release + immediate top-up scan so the effect is observable. Like the
    // in-app "Sync full gallery now", this skips the Wi-Fi/charging gates —
    // it's an explicit request, and enqueueUploads dedupes active rows.
    const { runSyncNow } = await import("./sync");
    const r = await runSyncNow();
    await sendMessage(
      chatId,
      `Resumed. Scanned ${r.scanned} photos, ${r.enqueued} new queued.`,
      { replyToMessageId: msg.message_id }
    );
  } else if (cmd === "/sync") {
    const { runSyncNow } = await import("./sync");
    const r = await runSyncNow();
    await sendMessage(
      chatId,
      `Sync complete: ${r.scanned} photos scanned, ${r.enqueued} new queued.`,
      { replyToMessageId: msg.message_id }
    );
  } else if (cmd === "/wipe") {
    const arg = text.split(/\s+/).slice(1)[0]?.toLowerCase();
    if (arg !== "confirm") {
      // Arm — a second explicit message is required before anything deletes.
      await kvSet(WIPE_ARM_KEY, String(Date.now()));
      await sendMessage(
        chatId,
        "This erases the LOCAL copies of ALL backed-up photos from this device. " +
          "The originals stay in this channel and the app index keeps working. " +
          "To confirm, send /wipe confirm within 5 minutes.",
        { replyToMessageId: msg.message_id }
      );
      return true;
    }
    const armedAt = parseInt((await kvGet(WIPE_ARM_KEY)) ?? "0", 10) || 0;
    if (Date.now() - armedAt > WIPE_ARM_WINDOW_MS) {
      await sendMessage(
        chatId,
        "No wipe is armed (or the 5-minute window passed). Send /wipe first, then /wipe confirm.",
        { replyToMessageId: msg.message_id }
      );
      return true;
    }
    await kvSet(WIPE_ARM_KEY, "0");
    await sendMessage(chatId, "Wiping local copies of backed-up photos…", {
      replyToMessageId: msg.message_id,
    });
    try {
      const { wipeLocalCopies } = await import("./maintenance");
      const r = await wipeLocalCopies();
      await sendMessage(
        chatId,
        `Wipe complete: ${r.deleted} local copies deleted` +
          (r.freedBytes > 0 ? ` (${formatBytes(r.freedBytes)} freed)` : "") +
          (r.kept > 0 ? `, ${r.kept} kept (cloud copy failed verification or delete was declined)` : "") +
          ".",
        { replyToMessageId: msg.message_id }
      );
    } catch (e: any) {
      // A failed wipe is reported, not retried automatically — the owner can
      // send /wipe again. Photos whose verification failed stay on device.
      await sendMessage(chatId, `Wipe failed: ${e?.message ?? "unknown error"}.`, {
        replyToMessageId: msg.message_id,
      });
    }
  } else if (cmd === "/delete") {
    const target = msg.reply_to_message;
    if (!target) {
      await sendMessage(
        chatId,
        "Reply to a backed-up photo's message with /delete to remove it.",
        { replyToMessageId: msg.message_id }
      );
      return true;
    }
    const photo = await getPhotoByMessageId(target.message_id);
    if (!photo) {
      await sendMessage(
        chatId,
        "That message isn't a backed-up photo this app manages.",
        { replyToMessageId: msg.message_id }
      );
      return true;
    }
    const token = await tokenForPhoto(photo);
    // The reply may point at the original OR the preview post — delete every
    // known message id, deduped. deleteMessage fails silently on
    // already-gone messages, so replays stay idempotent.
    const ids = new Set<number>([target.message_id]);
    if (photo.message_id) ids.add(photo.message_id);
    if (photo.preview_message_id) ids.add(photo.preview_message_id);
    for (const id of ids) {
      await deleteMessage(chatId, id, token ?? undefined);
    }
    await addToTrash(photo.id);
    await markTrashRemoteDeleted(photo.id);
    await sendMessage(
      chatId,
      `Deleted "${photo.filename}" (moved to app trash).`,
      { replyToMessageId: msg.message_id }
    );
  }
  return true;
}
