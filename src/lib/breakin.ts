// Break-in log (#9): an evidence trail of failed unlock attempts. Entries are
// `pin_fail` (wrong PIN), `biometric_fail` (biometric rejected — user cancels
// do NOT count), and `decoy_unlock` (the duress PIN was entered — not a
// successful break-in, but proof someone was made to use it).
//
// Stored as a capped JSON array in the kv store rather than a table — no
// migration, and the whole log is invisible to a decoy session because the
// Settings UI (its only reader) is decoy-gated. Entries carry no PIN material.

import { kvGet, kvSet } from "./db";

export type BreakInKind = "pin_fail" | "biometric_fail" | "decoy_unlock";

export interface BreakInEvent {
  t: number;
  kind: BreakInKind;
}

const KEY = "breakin_log";
// Oldest entries fall off — a log that grew unbounded would itself become a
// memory/parse liability on a device that gets probed daily.
const CAP = 100;

export async function logBreakIn(kind: BreakInKind): Promise<void> {
  try {
    const list = await getBreakInLog();
    list.push({ t: Date.now(), kind });
    await kvSet(KEY, JSON.stringify(list.slice(-CAP)));
  } catch {
    // Logging must never break the unlock flow.
  }
}

export async function getBreakInLog(): Promise<BreakInEvent[]> {
  try {
    const raw = await kvGet(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is BreakInEvent =>
        e && typeof e.t === "number" && ["pin_fail", "biometric_fail", "decoy_unlock"].includes(e.kind)
    );
  } catch {
    return [];
  }
}

export async function clearBreakInLog(): Promise<void> {
  try {
    await kvSet(KEY, "[]");
  } catch {}
}
