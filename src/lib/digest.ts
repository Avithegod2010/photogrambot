// Weekly channel digest (#6): posts a self-audit summary to the backup
// channel — library/queue stats plus a sampled backup verification — so the
// owner can see from any Telegram client that the archive is alive.
//
// Scheduling: the app's cold-start bootstrap (App.tsx) calls
// maybePostWeeklyDigest(); a kv timestamp gates it to one post per 7 days.
// A failed send is NOT recorded, so the next app start retries.
// Foreground-only by design: WorkManager tasks run when the channel config
// may be stale (token rotated, channel changed) and the digest is not worth
// a native wake-up on its own.

import { getStats, getLargestUploaded, kvGet, kvSet } from "./db";
import { sendMessage } from "./telegram";
import { getChannelId } from "./settings";
import { verifyBackupSample } from "./maintenance";
import { formatBytes } from "./format";

const LAST_DIGEST_AT = "last_digest_at";
const LAST_DIGEST_UPLOADED = "last_digest_uploaded";
const DIGEST_INTERVAL_MS = 7 * 24 * 3600 * 1000;

// Verification sample for the digest — small on purpose: this runs
// unattended on app start and each getFile is a Bot API round-trip.
const DIGEST_VERIFY_SAMPLE = 10;

export async function maybePostWeeklyDigest(): Promise<void> {
  try {
    const channelId = await getChannelId();
    if (!channelId) return;
    const lastRaw = await kvGet(LAST_DIGEST_AT);
    const last = lastRaw ? parseInt(lastRaw, 10) : 0;
    if (Date.now() - last < DIGEST_INTERVAL_MS) return;
    // Verification hits the network with spacing between calls — keep it out
    // of the critical path ordering but awaited so a killed app mid-check
    // can't double-post (the timestamp is only written after the send).
    const text = await buildDigestText();
    const ok = await sendMessage(channelId, text);
    if (!ok) return;
    await kvSet(LAST_DIGEST_AT, String(Date.now()));
    const s = await getStats();
    await kvSet(LAST_DIGEST_UPLOADED, String(s.uploaded));
  } catch {
    // The digest must never break the bootstrap pass.
  }
}

async function buildDigestText(): Promise<string> {
  const s = await getStats();
  const lines: string[] = [];
  lines.push(`PhotogramBot weekly digest — ${new Date().toISOString().slice(0, 10)}`);
  lines.push(
    `Library: ${s.total} photos, ${s.uploaded} backed up (${formatBytes(s.totalBytes)})`
  );
  const lastRaw = await kvGet(LAST_DIGEST_UPLOADED);
  if (lastRaw) {
    const delta = s.uploaded - (parseInt(lastRaw, 10) || 0);
    if (delta > 0) lines.push(`New since last digest: +${delta}`);
  }
  lines.push(`Queue: ${s.pending} pending, ${s.failed} failed`);
  lines.push(`Trash: ${s.trashed}`);
  if (s.failed > 0) lines.push(`Action needed: retry failed uploads from Maintenance.`);
  let verifyLine = "Verification: skipped (no uploaded photos yet)";
  try {
    if (s.uploaded > 0) {
      const v = await verifyBackupSample(DIGEST_VERIFY_SAMPLE);
      verifyLine = v.broken.length === 0
        ? `Verification: ${v.checked} sampled uploads OK`
        : `Verification: ${v.broken.length}/${v.checked} sampled uploads UNREACHABLE — run the full check in Maintenance`;
    }
  } catch {}
  lines.push(verifyLine);
  try {
    const largest = await getLargestUploaded(3);
    if (largest.length > 0) {
      lines.push(
        `Largest: ${largest.map((p) => `${p.filename} (${formatBytes(p.size)})`).join(", ")}`
      );
    }
  } catch {}
  return lines.join("\n");
}
