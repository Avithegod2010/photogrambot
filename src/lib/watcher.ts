import * as MediaLibrary from "expo-media-library";
import * as Network from "expo-network";
import { kvGet, kvSet } from "./db";
import { canAutoSyncNow, scanRecentAndEnqueue } from "./sync";
import { processQueue } from "./uploader";

const WATCH_DEBOUNCE_MS = 5000;
const WATERMARK_KEY = "watch_last_at";
const RESCAN_OVERLAP_MS = 2 * 60_000;

let mediaSub: MediaLibrary.EventSubscription | null = null;
let netSub: ReturnType<typeof Network.addNetworkStateListener> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let scanning = false;

export function isCameraWatchActive(): boolean {
  return mediaSub !== null;
}

export async function startCameraWatch(): Promise<void> {
  if (mediaSub) return;
  const last = await kvGet(WATERMARK_KEY);
  if (!last) await kvSet(WATERMARK_KEY, String(Date.now()));
  // Android reports no incremental details — any change triggers a since-rescan.
  mediaSub = MediaLibrary.addListener(() => scheduleWatchScan());
  // When connectivity returns (e.g. rejoin Wi-Fi), flush anything pending.
  netSub = Network.addNetworkStateListener((state) => {
    if (state.isConnected) scheduleWatchScan(1500);
  });
}

export function stopCameraWatch(): void {
  mediaSub?.remove();
  mediaSub = null;
  netSub?.remove();
  netSub = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function scheduleWatchScan(delayMs = WATCH_DEBOUNCE_MS): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runWatchScan();
  }, delayMs);
}

async function runWatchScan(): Promise<void> {
  if (scanning || !(await canAutoSyncNow())) return;
  scanning = true;
  try {
    const raw = await kvGet(WATERMARK_KEY);
    const watermark = raw ? parseInt(raw, 10) : Date.now() - RESCAN_OVERLAP_MS;
    const enqueued = await scanRecentAndEnqueue(Math.max(0, watermark - RESCAN_OVERLAP_MS));
    await kvSet(WATERMARK_KEY, String(Date.now()));
    if (enqueued > 0) void processQueue();
  } catch {
    // Keep the previous watermark so the next trigger retries this window.
  } finally {
    scanning = false;
  }
}
