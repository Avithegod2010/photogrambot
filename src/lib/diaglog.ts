// In-app diagnostics log (improvement round, R28): a small ring buffer of
// operational failures — queue errors, scan problems, background-task
// failures — so device debugging doesn't depend on adb/logcat. Read from
// Maintenance → Diagnostics; Maintenance is only reachable through Settings,
// which a decoy session never sees.
//
// kv-backed JSON array capped at 50 entries (same pattern as breakin.ts).
// Entries carry no secrets — messages are operation summaries, never tokens.

import { kvGet, kvSet } from "./db";

export type DiagKind =
  | "upload"
  | "sync"
  | "digest"
  | "background"
  | "remote"
  | "repair";

export interface DiagEvent {
  t: number;
  kind: DiagKind;
  msg: string;
}

const KEY = "diag_log";
const CAP = 50;

export async function logDiag(kind: DiagKind, msg: string): Promise<void> {
  try {
    const list = await getDiagLog();
    list.push({ t: Date.now(), kind, msg: String(msg).slice(0, 300) });
    await kvSet(KEY, JSON.stringify(list.slice(-CAP)));
  } catch {
    // Logging must never break the failing operation that called it.
  }
}

export async function getDiagLog(): Promise<DiagEvent[]> {
  try {
    const raw = await kvGet(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is DiagEvent =>
        e && typeof e.t === "number" && typeof e.msg === "string" && typeof e.kind === "string"
    );
  } catch {
    return [];
  }
}

export async function clearDiagLog(): Promise<void> {
  try {
    await kvSet(KEY, "[]");
  } catch {}
}
