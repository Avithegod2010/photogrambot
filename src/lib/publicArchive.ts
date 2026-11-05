// Public read-only sharing: an invite link plus a standalone HTML index.
//
// Family can open the channel in Telegram (no bot needed) and use the HTML
// index to jump straight to individual photos. The HTML contains only
// filenames, dates and t.me links - no file contents, no credentials.

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { createChatInviteLink, getChat } from "./telegram";
import { getChannelId } from "./settings";
import { getPhotosByUploadStatus } from "./db";

export async function createReadOnlyInvite(): Promise<string> {
  const channelId = await getChannelId();
  if (!channelId) throw new Error("Channel not configured.");
  const link = await createChatInviteLink(channelId, "PhotogramBot family");
  if (!link) throw new Error("Could not create an invite link (bot must be a channel admin).");
  return link;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function buildPublicIndexHtml(): Promise<string> {
  const channelId = await getChannelId();
  if (!channelId) throw new Error("Channel not configured.");
  let username = "";
  try {
    const chat = await getChat(channelId);
    username = chat?.username ?? "";
  } catch {}
  const photos = await getPhotosByUploadStatus("uploaded");
  const internal = channelId.startsWith("-100") ? channelId.slice(4) : channelId.replace(/^-/, "");
  const linkFor = (messageId: number | null): string | null => {
    if (!messageId) return null;
    return username
      ? `https://t.me/${username}/${messageId}`
      : `https://t.me/c/${internal}/${messageId}`;
  };
  const rows = photos
    .map((p) => {
      const link = linkFor(p.message_id ?? p.preview_message_id);
      const date = new Date(p.taken_at).toISOString().slice(0, 10);
      return `<tr><td>${date}</td><td>${escapeHtml(p.filename)}</td><td>${
        link ? `<a href="${link}">Open</a>` : "—"
      }</td></tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PhotogramBot archive</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#101014;color:#e4e2ea}
h1{font-size:20px}table{border-collapse:collapse;width:100%;max-width:900px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #2a2a31;font-size:14px}
a{color:#a8c7fa}th{color:#c4c6d0;font-weight:600}
</style></head><body>
<h1>PhotogramBot archive</h1>
<p>${photos.length} photos. Links open the item in Telegram (channel membership required).</p>
<table><thead><tr><th>Date</th><th>File</th><th>Link</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}

export async function sharePublicIndex(): Promise<void> {
  const html = await buildPublicIndexHtml();
  const file = new File(Paths.cache, `photogrambot-index-${Date.now()}.html`);
  file.write(html);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/html",
      dialogTitle: "Share archive index",
    });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {}
  }
}
