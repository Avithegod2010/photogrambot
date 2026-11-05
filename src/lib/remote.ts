// Remote control via bot commands — the owner messages the channel from any
// Telegram client and the app reacts. Wired into pollUpdates (updates.ts):
// non-channel messages are currently DROPPED there, so commands must arrive
// in the configured channel chat itself (the usual setup — private channel
// with the bot as admin posting backups).
//
// Commands (case-insensitive, reply forms where noted):
//   /status          — library + queue totals
//   /stats           — full archive-health report on demand (same body as the
//                      weekly digest, including a sampled backup verification)
//   /sync            — full-gallery scan + enqueue (respects network gates)
//   /pause           — hold auto-sync (watcher/background/bootstrap)
//   /resume          — release the pause, then one scan
//   /delete          — REPLY to a backed-up photo's message → trashes it
//                      locally and deletes the channel message
//   /find <words>    — search the backed-up library, list top 5 matches
//   /search <words>  — alias of /find
//   /last            — recent captures
//   /favorite        — REPLY to a photo → toggle favorite
//   /album <name>    — REPLY to a photo → add it to an album (created if needed)
//   /restore         — REPLY to a backed-up photo's message → downloads the
//                      original back onto this phone
//   /help, /ping     — command list / liveness check
//   /wipe            — arm the local wipe; /wipe confirm within 5 minutes
//                      erases every backed-up photo's LOCAL copy from this
//                      device (anti-theft: channel archive survives). Two-step
//                      so a stray message can't mass-delete.
//
// Inline keyboards: /status and /help carry buttons (sync/pause/stats/queue).
// Callback presses are authorized with getChatAdministrators — only channel
// admins can drive the device (cached for 5 minutes).
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
  createAlbum,
  addToAlbum,
  searchPhotos,
  setFavorite,
  getPhoto,
  getAlbums,
} from "./db";
import {
  sendMessage,
  deleteMessage,
  answerCallbackQuery,
  getChatAdministrators,
  type InlineKeyboardButton,
  type TgCallbackQuery,
  type TgMessage,
} from "./telegram";
import { requiredRoleForCommand, roleAtLeast, type RemoteRole } from "./remoteAuth";
import { tokenForPhoto } from "./destinations";
import { formatBytes, formatDate } from "./format";

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
  // Informational extra — a failure here must not kill the whole status reply
  // (the "largest" query is the only part that touches optional data).
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
  await sendMessage(chatId, lines.join("\n"), {
    replyToMessageId: replyTo || undefined,
    inlineKeyboard: [
      [
        { text: "Sync now", callback_data: "act:sync" },
        { text: paused ? "Resume" : "Pause", callback_data: paused ? "act:resume" : "act:pause" },
        { text: "Stats", callback_data: "act:stats" },
      ],
    ],
  });
}

const HELP_TEXT = [
  "PhotogramBot commands",
  "/status — library + queue + pause state",
  "/stats — archive-health report",
  "/sync — scan and enqueue new photos",
  "/pause, /resume — hold/release automatic sync",
  "/last — recent captures",
  "/find <words> or /search <words> — search the library",
  "/favorite — reply to a photo to toggle favorite",
  "/album <name> — reply to a photo to add it to an album",
  "/delete — reply to a photo to trash + delete it",
  "/restore — reply to a photo to save the original here",
  "/wipe - arm/confirm a local-copy wipe (two-step)",
  "/queue - pending/failed/backed-up counts",
  "/devices - devices seen in the archive",
  "/revoke <deviceId>, /unrevoke <deviceId> - block/resume this device",
  "/pause <deviceId>, /resume <deviceId> - target one device",
  "/ping - check the bot is alive",
].join("\n");

// getChatAdministrators is one network call; cache for five minutes so a burst
// of button presses doesn't hammer Telegram.
let adminCache: { at: number; ids: Set<number> } | null = null;

export async function isChannelAdmin(chatId: string, userId: number): Promise<boolean> {
  try {
    if (!adminCache || Date.now() - adminCache.at > 5 * 60 * 1000) {
      const admins = await getChatAdministrators(chatId);
      adminCache = {
        at: Date.now(),
        ids: new Set(
          admins.map((a) => a.user?.id).filter((id): id is number => typeof id === "number")
        ),
      };
    }
    return adminCache.ids.has(userId);
  } catch {
    return false;
  }
}

// Inline-keyboard presses. Only channel admins may drive the device; the
// callback's attached message is already constrained to the configured channel
// by updates.ts.
export async function handleCallbackQuery(
  cb: TgCallbackQuery,
  chatId: string,
  actorRole: RemoteRole = "admin",
  replyChatId: string = chatId
): Promise<boolean> {
  const data = cb.data ?? "";
  if (!/^(act|del|wipe|alb|find):/.test(data)) return false;
  const replyTo = cb.message?.message_id ?? 0;
  const required: RemoteRole =
    data === "del:yes" || data === "wipe:yes"
      ? "admin"
      : data === "act:sync" ||
          data === "act:pause" ||
          data === "act:resume" ||
          data.startsWith("alb:") ||
          data.startsWith("find:")
        ? "write"
        : "read";
  if (!roleAtLeast(actorRole, required)) {
    await answerCallbackQuery(cb.id, `Not authorized (needs ${required})`, true);
    return true;
  }
  try {
    if (data.startsWith("find:")) {
      const offset = parseInt(data.slice(5), 10) || 0;
      const query = (await kvGet("find_query")) ?? "";
      if (!query) {
        await answerCallbackQuery(cb.id, "Search expired - run /find again", true);
        return true;
      }
      const rows = await searchPhotos(query, undefined, offset + 5);
      const page = rows.slice(offset, offset + 5);
      if (page.length === 0) {
        await answerCallbackQuery(cb.id, "No more matches");
        return true;
      }
      const lines = page.map((p) => `• ${p.filename} - ${formatDate(p.taken_at)}`);
      const buttons: InlineKeyboardButton[][] = [];
      if (rows.length >= offset + 5) {
        buttons.push([{ text: "More results", callback_data: `find:${offset + 5}` }]);
      }
      await sendMessage(replyChatId, `Matches ${offset + 1}-${offset + page.length}:\n${lines.join("\n")}`, {
        replyToMessageId: replyTo || undefined,
        ...(buttons.length ? { inlineKeyboard: buttons } : {}),
      });
      await answerCallbackQuery(cb.id, "Done");
      return true;
    }

    if (data.startsWith("alb:")) {
      const albumId = parseInt(data.slice(4), 10);
      const photoId = await kvGet("pending_album_photo");
      if (!albumId || !photoId) {
        await answerCallbackQuery(cb.id, "Album selection expired", true);
        return true;
      }
      const album = (await getAlbums()).find((a) => a.id === albumId);
      if (!album) {
        await answerCallbackQuery(cb.id, "Unknown album", true);
        return true;
      }
      await addToAlbum(albumId, [photoId]);
      await kvSet("pending_album_photo", "");
      await sendMessage(replyChatId, `Added to album "${album.name}".`, {
        replyToMessageId: replyTo || undefined,
      });
      await answerCallbackQuery(cb.id, "Added");
      return true;
    }

    if (data === "del:yes" || data === "del:no") {
      const photoId = await kvGet("pending_delete_id");
      await kvSet("pending_delete_id", "");
      if (data === "del:no") {
        await sendMessage(replyChatId, "Delete cancelled.", {
          replyToMessageId: replyTo || undefined,
        });
        await answerCallbackQuery(cb.id, "Cancelled");
        return true;
      }
      if (!photoId) {
        await answerCallbackQuery(cb.id, "Nothing to delete (expired)", true);
        return true;
      }
      const photo = await getPhoto(photoId);
      if (!photo) {
        await answerCallbackQuery(cb.id, "Photo no longer in the index", true);
        return true;
      }
      const token = await tokenForPhoto(photo);
      const ids = new Set<number>();
      if (photo.message_id) ids.add(photo.message_id);
      if (photo.preview_message_id) ids.add(photo.preview_message_id);
      for (const id of ids) await deleteMessage(chatId, id, token ?? undefined);
      await addToTrash(photo.id);
      await markTrashRemoteDeleted(photo.id);
      await sendMessage(replyChatId, `Deleted "${photo.filename}" (moved to app trash).`, {
        replyToMessageId: replyTo || undefined,
      });
      await answerCallbackQuery(cb.id, "Deleted");
      return true;
    }

    if (data === "wipe:yes" || data === "wipe:no") {
      if (data === "wipe:no") {
        await kvSet(WIPE_ARM_KEY, "0");
        await sendMessage(replyChatId, "Wipe cancelled.", {
          replyToMessageId: replyTo || undefined,
        });
        await answerCallbackQuery(cb.id, "Cancelled");
        return true;
      }
      const armedAt = parseInt((await kvGet(WIPE_ARM_KEY)) ?? "0", 10) || 0;
      if (Date.now() - armedAt > WIPE_ARM_WINDOW_MS) {
        await answerCallbackQuery(cb.id, "Wipe expired - send /wipe again", true);
        return true;
      }
      await performWipe(replyChatId, replyTo);
      await answerCallbackQuery(cb.id, "Wiping");
      return true;
    }

    switch (data) {
      case "act:status":
        await replyStatus(replyChatId, replyTo);
        break;
      case "act:stats": {
        const { buildDigestText } = await import("./digest");
        const { text } = await buildDigestText("PhotogramBot report");
        await sendMessage(replyChatId, text, { replyToMessageId: replyTo || undefined });
        break;
      }
      case "act:sync": {
        const { runSyncNow } = await import("./sync");
        const r = await runSyncNow();
        await sendMessage(
          replyChatId,
          `Sync complete: ${r.scanned} photos scanned, ${r.enqueued} new queued.`,
          { replyToMessageId: replyTo || undefined }
        );
        break;
      }
      case "act:pause":
        await kvSet(PAUSE_KEY, "1");
        await sendMessage(replyChatId, "Auto-sync paused. Press Resume or send /resume.", {
          replyToMessageId: replyTo || undefined,
        });
        break;
      case "act:resume": {
        await kvSet(PAUSE_KEY, "0");
        const { runSyncNow } = await import("./sync");
        const r = await runSyncNow();
        await sendMessage(
          replyChatId,
          `Resumed. Scanned ${r.scanned} photos, ${r.enqueued} new queued.`,
          { replyToMessageId: replyTo || undefined }
        );
        break;
      }
      case "act:queue": {
        const s = await getStats();
        await sendMessage(
          replyChatId,
          `Queue: ${s.pending} pending, ${s.failed} failed, ${s.uploaded} backed up.`,
          { replyToMessageId: replyTo || undefined }
        );
        break;
      }
      case "act:devices": {
        const { getDeviceSummaries } = await import("./devices");
        const { text } = await getDeviceSummaries();
        await sendMessage(replyChatId, text, { replyToMessageId: replyTo || undefined });
        break;
      }
      default:
        await answerCallbackQuery(cb.id, "Unknown action", true);
        return true;
    }
    await answerCallbackQuery(cb.id, "Done");
  } catch (e: any) {
    await answerCallbackQuery(cb.id, `Failed: ${e?.message ?? "unknown"}`, true);
  }
  return true;
}

async function performWipe(chatId: string, replyTo: number): Promise<void> {
  await kvSet(WIPE_ARM_KEY, "0");
  await sendMessage(chatId, "Wiping local copies of backed-up photos.", {
    replyToMessageId: replyTo || undefined,
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
      { replyToMessageId: replyTo || undefined }
    );
  } catch (e: any) {
    await sendMessage(chatId, `Wipe failed: ${e?.message ?? "unknown error"}.`, {
      replyToMessageId: replyTo || undefined,
    });
  }
}

// Returns true if the message was a command (caller should skip ingestion).
export async function handleRemoteCommand(
  msg: TgMessage,
  chatId: string,
  actorRole: RemoteRole = "admin"
): Promise<boolean> {
  const text = (msg.text ?? "").trim();
  if (!text.startsWith("/")) return false;
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  const required = requiredRoleForCommand(cmd);
  if (!required) return false; // unknown slash command - let ingestion proceed
  if (!roleAtLeast(actorRole, required)) {
    await sendMessage(
      chatId,
      `Not authorized: ${cmd} requires the "${required}" role (you have "${actorRole}").`,
      { replyToMessageId: msg.message_id }
    );
    return true;
  }

  if (cmd === "/status") {
    await replyStatus(chatId, msg.message_id);
  } else if (cmd === "/help") {
    await sendMessage(chatId, HELP_TEXT, {
      replyToMessageId: msg.message_id,
      inlineKeyboard: [
        [
          { text: "Status", callback_data: "act:status" },
          { text: "Stats", callback_data: "act:stats" },
          { text: "Queue", callback_data: "act:queue" },
        ],
      ],
    });
  } else if (cmd === "/ping") {
    await sendMessage(chatId, "pong", { replyToMessageId: msg.message_id });
  } else if (cmd === "/last") {
    try {
      const rows = await searchPhotos("", undefined, 10);
      if (rows.length === 0) {
        await sendMessage(chatId, "No photos in the library yet.", {
          replyToMessageId: msg.message_id,
        });
      } else {
        const lines = rows.map((p) => `• ${p.filename} — ${formatDate(p.taken_at)}`);
        await sendMessage(chatId, `Recent captures:\n${lines.join("\n")}`, {
          replyToMessageId: msg.message_id,
        });
      }
    } catch (e: any) {
      await sendMessage(chatId, `Recent lookup failed: ${e?.message ?? "unknown error"}`, {
        replyToMessageId: msg.message_id,
      });
    }
  } else if (cmd === "/favorite" || cmd === "/album") {
    const target = msg.reply_to_message;
    if (!target) {
      await sendMessage(
        chatId,
        cmd === "/favorite"
          ? "Reply /favorite to a backed-up photo's message to toggle it."
          : "Reply /album <name> to a backed-up photo's message to add it to an album.",
        { replyToMessageId: msg.message_id }
      );
      return true;
    }
    const photo = await getPhotoByMessageId(target.message_id);
    if (!photo) {
      await sendMessage(chatId, "That message isn't a backed-up photo this app manages.", {
        replyToMessageId: msg.message_id,
      });
      return true;
    }
    if (cmd === "/favorite") {
      try {
        await setFavorite(photo.id, !photo.favorite);
        await sendMessage(
          chatId,
          `${photo.favorite ? "Removed" : "Added"} "${photo.filename}" ${photo.favorite ? "from" : "to"} favorites.`,
          { replyToMessageId: msg.message_id }
        );
      } catch (e: any) {
        await sendMessage(chatId, `Favorite failed: ${e?.message ?? "unknown error"}`, {
          replyToMessageId: msg.message_id,
        });
      }
    } else {
      const name = text.split(/\s+/).slice(1).join(" ").trim().slice(0, 100);
      if (!name) {
        // No name supplied: offer the existing albums as tappable buttons,
        // remembering which photo this picker belongs to.
        try {
          const albums = (await getAlbums()).slice(0, 24);
          if (albums.length > 0) {
            await kvSet("pending_album_photo", photo.id);
            await sendMessage(chatId, `Pick an album for "${photo.filename}":`, {
              replyToMessageId: msg.message_id,
              inlineKeyboard: albums.map((a) => [
                { text: a.name.slice(0, 30), callback_data: `alb:${a.id}` },
              ]),
            });
          } else {
            await sendMessage(chatId, "No albums yet. Usage: reply /album <name> to a photo.", {
              replyToMessageId: msg.message_id,
            });
          }
        } catch (e: any) {
          await sendMessage(chatId, `Album list failed: ${e?.message ?? "unknown error"}`, {
            replyToMessageId: msg.message_id,
          });
        }
        return true;
      }
      try {
        const albumId = await createAlbum(name);
        await addToAlbum(albumId, [photo.id]);
        await sendMessage(chatId, `Added "${photo.filename}" to album "${name}".`, {
          replyToMessageId: msg.message_id,
        });
      } catch (e: any) {
        await sendMessage(chatId, `Album failed: ${e?.message ?? "unknown error"}`, {
          replyToMessageId: msg.message_id,
        });
      }
    }
  } else if (cmd === "/stats") {
    try {
      const { buildDigestText } = await import("./digest");
      const { text } = await buildDigestText("PhotogramBot report");
      await sendMessage(chatId, text, { replyToMessageId: msg.message_id });
    } catch (e: any) {
      await sendMessage(chatId, `Stats failed: ${e?.message ?? "unknown error"}`, {
        replyToMessageId: msg.message_id,
      });
    }
  } else if (cmd === "/pause") {
    const targetId = text.split(/\s+/)[1]?.trim();
    if (targetId) {
      const { isThisDevice } = await import("./devices");
      if (!(await isThisDevice(targetId))) return true; // another phone's command
    }
    await kvSet(PAUSE_KEY, "1");
    await sendMessage(chatId, "Auto-sync paused. Send /resume to continue.", {
      replyToMessageId: msg.message_id,
    });
  } else if (cmd === "/resume") {
    const targetId = text.split(/\s+/)[1]?.trim();
    if (targetId) {
      const { isThisDevice } = await import("./devices");
      if (!(await isThisDevice(targetId))) return true;
    }
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
  } else if (cmd === "/find" || cmd === "/search") {
    const query = text.split(/\s+/).slice(1).join(" ").trim();
    if (!query) {
      await sendMessage(chatId, `Usage: ${cmd} <words> — searches your backed-up library.`, {
        replyToMessageId: msg.message_id,
      });
      return true;
    }
    try {
      const { searchPhotos } = await import("./db");
      const results = await searchPhotos(query, undefined, 5);
      if (results.length === 0) {
        await sendMessage(chatId, `No matches for "${query}".`, {
          replyToMessageId: msg.message_id,
        });
        return true;
      }
      const lines = results.map((p) => `• ${p.filename} — ${formatDate(p.taken_at)}`);
      lines.push("Reply /restore to a photo's backup message to save the original to this phone.");
      await kvSet("find_query", query);
      await sendMessage(chatId, `Top ${results.length} matches:\n${lines.join("\n")}`, {
        replyToMessageId: msg.message_id,
        inlineKeyboard: [[{ text: "More results", callback_data: "find:5" }]],
      });
    } catch (e: any) {
      await sendMessage(chatId, `Search failed: ${e?.message ?? "unknown error"}`, {
        replyToMessageId: msg.message_id,
      });
    }
  } else if (cmd === "/restore") {
    const target = msg.reply_to_message;
    if (!target) {
      await sendMessage(
        chatId,
        "Reply /restore to a backed-up photo's message to save the original back onto this phone.",
        { replyToMessageId: msg.message_id }
      );
      return true;
    }
    const photo = await getPhotoByMessageId(target.message_id);
    if (!photo) {
      await sendMessage(chatId, "That message isn't a backed-up photo this app manages.", {
        replyToMessageId: msg.message_id,
      });
      return true;
    }
    try {
      const { savePhotoToDevice } = await import("./restore");
      await savePhotoToDevice(photo);
      await sendMessage(chatId, `Saved "${photo.filename}" to your gallery.`, {
        replyToMessageId: msg.message_id,
      });
    } catch (e: any) {
      // Includes the friendly oversize message for >20 MB originals.
      await sendMessage(
        chatId,
        `Restore failed: ${e?.message ?? "unknown error"}. Open the item in the Telegram app if the bot can't download it.`,
        { replyToMessageId: msg.message_id }
      );
    }
  } else if (cmd === "/wipe") {
    const arg = text.split(/\s+/).slice(1)[0]?.toLowerCase();
    if (arg !== "confirm") {
      // Arm — a second explicit message is required before anything deletes.
      await kvSet(WIPE_ARM_KEY, String(Date.now()));
      await sendMessage(
        chatId,
        "This erases the LOCAL copies of ALL backed-up photos from this device. " +
          "The originals stay in this channel and the app index keeps working. " +
          "Press the button below (or send /wipe confirm) within 5 minutes.",
        {
          replyToMessageId: msg.message_id,
          inlineKeyboard: [
            [
              { text: "Confirm wipe", callback_data: "wipe:yes" },
              { text: "Cancel", callback_data: "wipe:no" },
            ],
          ],
        }
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
    await performWipe(chatId, msg.message_id);
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
    // Two-step destructive action: the inline keyboard is the confirmation.
    await kvSet("pending_delete_id", photo.id);
    await sendMessage(
      chatId,
      `Delete "${photo.filename}"?\nThis trashes it locally and permanently removes the channel message.`,
      {
        replyToMessageId: msg.message_id,
        inlineKeyboard: [
          [
            { text: "Delete forever", callback_data: "del:yes" },
            { text: "Cancel", callback_data: "del:no" },
          ],
        ],
      }
    );
  } else if (cmd === "/queue") {
    const s = await getStats();
    await sendMessage(
      chatId,
      `Queue: ${s.pending} pending, ${s.failed} failed, ${s.uploaded} backed up, ${s.trashed} trashed.`,
      { replyToMessageId: msg.message_id }
    );
  } else if (cmd === "/devices") {
    try {
      const { getDeviceSummaries } = await import("./devices");
      const { text } = await getDeviceSummaries();
      await sendMessage(chatId, text, { replyToMessageId: msg.message_id });
    } catch (e: any) {
      await sendMessage(chatId, `Devices failed: ${e?.message ?? "unknown error"}`, {
        replyToMessageId: msg.message_id,
      });
    }
  } else if (cmd === "/revoke" || cmd === "/unrevoke") {
    const targetId = text.split(/\s+/).slice(1)[0]?.trim();
    if (!targetId) {
      await sendMessage(chatId, `Usage: ${cmd} <deviceId>`, {
        replyToMessageId: msg.message_id,
      });
      return true;
    }
    try {
      const { setDeviceRevoked } = await import("./devices");
      const { isThisDevice } = await import("./devices");
      const mine = await isThisDevice(targetId);
      if (!mine) {
        await sendMessage(
          chatId,
          `Device ${targetId} isn't this phone. Only the target device can apply the flag; it will act when it sees this command.`,
          { replyToMessageId: msg.message_id }
        );
        return true;
      }
      await setDeviceRevoked(cmd === "/revoke");
      await sendMessage(
        chatId,
        cmd === "/revoke"
          ? "This device is now revoked: auto-sync and manual uploads are blocked. Send /unrevoke to restore."
          : "This device is unrevoked; uploads can resume.",
        { replyToMessageId: msg.message_id }
      );
    } catch (e: any) {
      await sendMessage(chatId, `Device update failed: ${e?.message ?? "unknown error"}`, {
        replyToMessageId: msg.message_id,
      });
    }
  }
  return true;
}
