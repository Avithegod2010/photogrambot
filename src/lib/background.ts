import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as Network from "expo-network";
import * as Battery from "expo-battery";
import { loadPrefs } from "./settings";
import { canAutoSyncNow, scanAndEnqueueAll, scanRecentAndEnqueue } from "./sync";
import { isRemotePaused } from "./remote";
import { isStorageCritical } from "./storage";
import { processQueue } from "./uploader";
import { purgeExpiredTrash, kvGet, kvSet } from "./db";
import { logDiag } from "./diaglog";

export const BACKGROUND_SYNC_TASK = "photogrambot-background-sync";
export const OVERNIGHT_CATCHUP_TASK = "photogrambot-overnight-catchup";

// Overnight catch-up window (local time): bulk work only while the phone
// would normally be idle on a charger.
const NIGHT_START_MIN = 22 * 60;
const NIGHT_END_MIN = 7 * 60;

function inSyncWindow(now: Date, windowStart: number, windowEnd: number): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (windowStart === windowEnd) return true;
  if (windowStart < windowEnd) return minutes >= windowStart && minutes <= windowEnd;
  // Window crosses midnight (e.g. 22:00 -> 06:00).
  return minutes >= windowStart || minutes <= windowEnd;
}

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const prefs = await loadPrefs();
    if (!prefs.autoSync) return BackgroundTask.BackgroundTaskResult.Success;
    if (!inSyncWindow(new Date(), prefs.syncWindowStart, prefs.syncWindowEnd)) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    if (!(await canAutoSyncNow(prefs))) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    if (prefs.trashAutoPurgeDays > 0) {
      try {
        await purgeExpiredTrash(prefs.trashAutoPurgeDays);
      } catch {}
    }
    const since = Math.max(
      prefs.lastFullSyncAt,
      Date.now() - prefs.autoSyncIntervalHours * 3600 * 1000
    );
    const enqueued = await scanRecentAndEnqueue(since);
    if (enqueued > 0) void processQueue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn("Background sync task failed:", e);
    void logDiag("background", `Background sync failed: ${String(e)}`);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// --- Overnight catch-up (#8) ---
//
// A separate WorkManager task that drains a big backlog in bulk while the
// phone charges at night: strict gates (Wi-Fi + charging + night window +
// remote pause) that do NOT inherit the owner's lenient everyday auto-sync
// prefs, plus a per-night enqueue cap so a 5000-photo first run doesn't try
// to push the whole library before morning.
//
// expo-background-task exposes no charging/idle constraints, so charging and
// Wi-Fi are probed in-handler and "idle" is approximated by the night window
// (WorkManager itself only wakes the worker when battery + network allow).
// The cap counter is a kv pair keyed by the LOCAL calendar day, so WorkManager
// re-fires during the same night keep filling up to the cap, then no-op.

const NIGHT_DAY_KEY = "overnight_day";
const NIGHT_COUNT_KEY = "overnight_count";

function localDayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

TaskManager.defineTask(OVERNIGHT_CATCHUP_TASK, async () => {
  try {
    const prefs = await loadPrefs();
    if (!prefs.overnightCatchup) return BackgroundTask.BackgroundTaskResult.Success;
    if (!inSyncWindow(new Date(), NIGHT_START_MIN, NIGHT_END_MIN)) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    // Remote /pause holds overnight work too — one gate for all automation.
    if (await isRemotePaused()) return BackgroundTask.BackgroundTaskResult.Success;
    // Low-storage guard — bulk scans write previews and staging copies.
    if (await isStorageCritical()) return BackgroundTask.BackgroundTaskResult.Success;
    try {
      const state = await Network.getNetworkStateAsync();
      if (
        !state.isConnected ||
        (state.type !== Network.NetworkStateType.WIFI &&
          state.type !== Network.NetworkStateType.ETHERNET)
      ) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }
      const battery = await Battery.getBatteryStateAsync();
      if (
        battery !== Battery.BatteryState.CHARGING &&
        battery !== Battery.BatteryState.FULL
      ) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }
    } catch {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const cap = Math.max(1, Math.round(prefs.overnightCap || 500));
    const today = localDayKey(new Date());
    const day = await kvGet(NIGHT_DAY_KEY);
    let count = day === today ? parseInt((await kvGet(NIGHT_COUNT_KEY)) ?? "0", 10) || 0 : 0;
    const remaining = cap - count;
    if (remaining <= 0) return BackgroundTask.BackgroundTaskResult.Success;

    const { enqueued } = await scanAndEnqueueAll(undefined, remaining);
    if (enqueued > 0) {
      count += enqueued;
      await kvSet(NIGHT_DAY_KEY, today);
      await kvSet(NIGHT_COUNT_KEY, String(count));
      void processQueue();
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn("Overnight catch-up task failed:", e);
    void logDiag("background", `Overnight catch-up failed: ${String(e)}`);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    const prefs = await loadPrefs();
    const minimumInterval = Math.max(15, Math.round(prefs.autoSyncIntervalHours * 60));
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval });
  } catch {}
}

export async function unregisterBackgroundSync(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  } catch {}
}

// 4 h cadence: WorkManager re-fires through the night window and the kv cap
// counter no-ops the repeats once the per-night budget is spent.
const OVERNIGHT_MINIMUM_INTERVAL_MIN = 240;

export async function registerOvernightCatchup(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    await BackgroundTask.registerTaskAsync(OVERNIGHT_CATCHUP_TASK, {
      minimumInterval: OVERNIGHT_MINIMUM_INTERVAL_MIN,
    });
  } catch {}
}

export async function unregisterOvernightCatchup(): Promise<void> {
  try {
    await BackgroundTask.unregisterTaskAsync(OVERNIGHT_CATCHUP_TASK);
  } catch {}
}

export async function getBackgroundSyncInfo(): Promise<{
  available: boolean;
  registered: boolean;
}> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    return {
      available: status === BackgroundTask.BackgroundTaskStatus.Available,
      registered,
    };
  } catch {
    return { available: false, registered: false };
  }
}
