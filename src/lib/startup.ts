// Cold-start profiling. Marks are relative to module evaluation; the last
// result is stored in kv for Settings → Diagnostics.

import { kvGet, kvSet } from "./db";

const START = Date.now();
const marks: Record<string, number> = {};

export function markStartup(name: string): void {
  marks[name] = Date.now() - START;
}

export interface StartupInfo {
  totalMs: number;
  marks: Record<string, number>;
  at: number;
}

export async function finishStartup(): Promise<void> {
  const info: StartupInfo = {
    totalMs: Date.now() - START,
    marks: { ...marks },
    at: Date.now(),
  };
  try {
    await kvSet("startup_last", JSON.stringify(info));
  } catch {}
}

export async function getLastStartup(): Promise<StartupInfo | null> {
  try {
    const raw = await kvGet("startup_last");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.totalMs !== "number") return null;
    return parsed as StartupInfo;
  } catch {
    return null;
  }
}
