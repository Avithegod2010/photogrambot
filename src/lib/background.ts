import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { loadPrefs } from "./settings";
import { canAutoSyncNow, scanRecentAndEnqueue } from "./sync";
import { processQueue } from "./uploader";
import { purgeExpiredTrash } from "./db";

export const BACKGROUND_SYNC_TASK = "photogrambot-background-sync";

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
