// Opt-in crash / main-thread-stall reporting.
//
// No third-party SDK. Reports are queued locally and POSTed to an endpoint the
// owner configures (self-hosted Sentry-compatible collector or any HTTPS
// endpoint). Off by default. Reports contain the app version, platform, the
// error message/stack and the last diagnostics entries - never photos,
// tokens, channel ids or filenames.

import { kvGet, kvSet } from "./db";
import { getDiagLog } from "./diaglog";
import { loadPrefs } from "./settings";
import { CURRENT_VERSION } from "./updater";
import { Platform } from "react-native";

const QUEUE_KEY = "crash_reports";
const CAP = 10;

export interface CrashReport {
  id: string;
  at: number;
  kind: "crash" | "stall" | "manual";
  message: string;
  stack?: string;
  fatal?: boolean;
}

function randomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function readQueue(): Promise<CrashReport[]> {
  try {
    const raw = await kvGet(QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is CrashReport => r && typeof r.message === "string" && typeof r.at === "number"
    );
  } catch {
    return [];
  }
}

export async function queueCrashReport(
  kind: CrashReport["kind"],
  message: string,
  stack?: string,
  fatal?: boolean
): Promise<void> {
  try {
    const list = await readQueue();
    list.push({
      id: randomId(),
      at: Date.now(),
      kind,
      message: String(message).slice(0, 1000),
      stack: stack ? String(stack).slice(0, 6000) : undefined,
      fatal,
    });
    await kvSet(QUEUE_KEY, JSON.stringify(list.slice(-CAP)));
  } catch {}
}

export async function pendingCrashReportCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function clearCrashReports(): Promise<void> {
  await kvSet(QUEUE_KEY, "[]").catch(() => {});
}

let installed = false;
let watchdog: ReturnType<typeof setInterval> | null = null;

export function installCrashReporter(): void {
  if (installed) return;
  installed = true;
  try {
    const g = globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
        setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
      };
    };
    const errorUtils = g.ErrorUtils;
    if (!errorUtils?.setGlobalHandler) return;
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      void queueCrashReport("crash", message, stack, isFatal);
      try {
        previous?.(error, isFatal);
      } catch {}
    });
  } catch {}
}

/**
 * Detects a blocked JS thread (the usual precursor to an ANR) by measuring
 * interval drift. A single stall > 5 s is queued once per 5 minutes.
 */
export function startStallWatchdog(): void {
  if (watchdog) return;
  let last = Date.now();
  let lastReport = 0;
  watchdog = setInterval(() => {
    const now = Date.now();
    const drift = now - last - 2000;
    last = now;
    if (drift > 5000 && now - lastReport > 5 * 60 * 1000) {
      lastReport = now;
      void queueCrashReport(
        "stall",
        `Main thread blocked for ~${Math.round(drift / 1000)}s`,
        undefined,
        false
      );
    }
  }, 2000);
}

export async function flushCrashReports(): Promise<number> {
  const prefs = await loadPrefs();
  if (!prefs.crashReporting || !prefs.crashEndpoint) return 0;
  const endpoint = prefs.crashEndpoint.trim();
  if (!/^https:\/\//i.test(endpoint)) return 0;
  const queue = await readQueue();
  if (queue.length === 0) return 0;
  const diag = (await getDiagLog()).slice(-20);
  let sent = 0;
  const remaining: CrashReport[] = [];
  for (const report of queue) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app: "photogrambot",
            version: CURRENT_VERSION,
            platform: Platform.OS,
            report,
            diagnostics: diag,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sent++;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      remaining.push(report);
    }
  }
  await kvSet(QUEUE_KEY, JSON.stringify(remaining));
  return sent;
}

export async function sendTestCrashReport(): Promise<void> {
  await queueCrashReport("manual", "Test report from Settings", undefined, false);
  await flushCrashReports();
}
