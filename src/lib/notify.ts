import * as Notifications from "expo-notifications";
import { AppState, Appearance } from "react-native";
import { loadPrefs } from "./settings";
import { accentHex, resolveThemeMode } from "./appearance";

const PROGRESS_ID = "pb-upload-progress";

// Appearance → Notification accent color. Best-effort: a prefs read failure
// just omits the color and the system default is used.
async function notificationColor(): Promise<string | undefined> {
  try {
    const prefs = await loadPrefs();
    if (!prefs.notificationAccent) return undefined;
    const mode = resolveThemeMode(
      prefs.theme,
      prefs.themeSchedule,
      prefs.themeScheduleStart,
      prefs.themeScheduleEnd,
      Appearance.getColorScheme()
    );
    return accentHex(prefs.accentColor, mode);
  } catch {
    return undefined;
  }
}

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
        color: await notificationColor(),
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
        color: await notificationColor(),
      },
      trigger: null,
    });
  } catch {}
}

// Unlike the progress/complete notifications this one deliberately fires in
// the foreground too — with the banner handler configured, that is the only
// way a failed run becomes visible without opening the queue screen.
// The `screen` data field is what App.tsx's response listener uses to open
// the upload queue when the notification is tapped.
export async function notifyUploadsFailed(failed: number, saved: number): Promise<void> {
  try {
    ensureHandler();
    await Notifications.dismissNotificationAsync(PROGRESS_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: "pb-upload-failed",
      content: {
        title: "Uploads failed",
        body: `${failed} item${failed === 1 ? "" : "s"} failed${saved > 0 ? `, ${saved} uploaded` : ""} — tap to review the queue.`,
        data: { screen: "UploadQueue" },
        color: await notificationColor(),
      },
      trigger: null,
    });
  } catch {}
}
