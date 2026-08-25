import * as Notifications from "expo-notifications";
import { AppState } from "react-native";

const PROGRESS_ID = "pb-upload-progress";

let configured = false;

function ensureHandler() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function inBackground(): boolean {
  return AppState.currentState === "background";
}

export async function requestNotificationPermission(): Promise<void> {
  try {
    ensureHandler();
    await Notifications.requestPermissionsAsync();
  } catch {}
}

export async function notifyUploadProgress(
  done: number,
  total: number,
  currentFile: string | null
): Promise<void> {
  if (!inBackground()) return;
  try {
    ensureHandler();
    await Notifications.dismissNotificationAsync(PROGRESS_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: PROGRESS_ID,
      content: {
        title: "Backing up photos…",
        body: `${done}/${total}${currentFile ? ` — ${currentFile}` : ""}`,
      },
      trigger: null,
    });
  } catch {}
}

export async function notifyUploadComplete(saved: number, failed: number): Promise<void> {
  if (!inBackground()) return;
  try {
    ensureHandler();
    await Notifications.dismissNotificationAsync(PROGRESS_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: PROGRESS_ID,
      content: {
        title: "Backup complete",
        body: `${saved} item(s) uploaded${failed > 0 ? `, ${failed} failed` : ""}`,
      },
      trigger: null,
    });
  } catch {}
}
