// Device registry, per-device pause/revoke flags and summaries.
//
// There is no central server: every device shares the bot token, so revocation
// is cooperative (a compromised device could ignore it). The archive stays
// protected by Telegram channel membership; these flags stop accidental or
// routine uploads from a device you no longer trust.

import { getDb, kvGet, kvSet } from "./db";
import { getDeviceId } from "./settings";
import { formatDate } from "./format";

const ALIASES_KEY = "device_aliases";
const REVOKED_KEY = "device_revoked";

export interface DeviceSummary {
  id: string;
  name: string;
  count: number;
  lastSeen: number | null;
  isThis: boolean;
  revoked: boolean;
}

function shortId(id: string): string {
  return id.length > 10 ? id.slice(0, 10) : id;
}

async function aliases(): Promise<Record<string, string>> {
  try {
    const raw = await kvGet(ALIASES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function setDeviceAlias(id: string, name: string | null): Promise<void> {
  const map = await aliases();
  const key = shortId(id);
  if (!name || !name.trim()) delete map[key];
  else map[key] = name.trim().slice(0, 40);
  await kvSet(ALIASES_KEY, JSON.stringify(map));
}

export async function isThisDevice(id: string): Promise<boolean> {
  const mine = await getDeviceId();
  const a = shortId(String(id ?? "").trim().toLowerCase());
  const b = shortId(mine.trim().toLowerCase());
  return !!a && a === b;
}

export async function isDeviceRevoked(): Promise<boolean> {
  return (await kvGet(REVOKED_KEY)) === "1";
}

export async function setDeviceRevoked(revoked: boolean): Promise<void> {
  await kvSet(REVOKED_KEY, revoked ? "1" : "0");
}

export async function getDeviceSummaries(): Promise<{ rows: DeviceSummary[]; text: string }> {
  const d = await getDb();
  const mine = await getDeviceId();
  const map = await aliases();
  const revoked = await isDeviceRevoked();
  let rows: any[] = [];
  try {
    rows = await d.getAllAsync<any>(
      `SELECT COALESCE(device, 'unknown') AS device_id,
              COUNT(*) AS n,
              MAX(COALESCE(uploaded_at, added_at)) AS last_seen
       FROM photos
       WHERE id NOT IN (SELECT photo_id FROM trash)
       GROUP BY COALESCE(device, 'unknown')
       ORDER BY last_seen DESC
       LIMIT 50`
    );
  } catch {
    rows = [];
  }
  const summaries: DeviceSummary[] = rows.map((r) => {
    const id = shortId(String(r.device_id));
    return {
      id,
      name: map[id] ?? (id === shortId(mine) ? "This device" : `Device ${id}`),
      count: Number(r.n) || 0,
      lastSeen: r.last_seen ? Number(r.last_seen) : null,
      isThis: id === shortId(mine),
      revoked: false,
    };
  });
  if (!summaries.some((s) => s.isThis)) {
    const id = shortId(mine);
    summaries.unshift({
      id,
      name: map[id] ?? "This device",
      count: 0,
      lastSeen: null,
      isThis: true,
      revoked: false,
    });
  }
  // Revoked is a local flag; it applies to this device only.
  for (const s of summaries) if (s.isThis) s.revoked = revoked;
  const text = summaries.length
    ? `Devices:\n${summaries
        .map(
          (s) =>
            `• ${s.name} (${s.id}) - ${s.count} photos` +
            (s.lastSeen ? `, last ${formatDate(s.lastSeen)}` : "") +
            (s.isThis ? " ← this phone" : "") +
            (s.revoked ? " [REVOKED]" : "")
        )
        .join("\n")}`
    : "No device activity recorded yet.";
  return { rows: summaries, text };
}

/** True when automatic or manual uploads must not run on this device. */
export async function thisDeviceBlocked(): Promise<boolean> {
  if (await isDeviceRevoked()) return true;
  return (await kvGet("device_paused")) === "1";
}
