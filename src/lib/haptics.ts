import { useSettingsStore } from "../store/useSettingsStore";

/**
 * Guarded haptics.
 *
 * `expo-haptics` is a native module. JS can be updated over the air, but the
 * native side only exists after a rebuild — so every call is lazy, cached and
 * fail-soft: on a build without the module the import rejects and the app
 * simply stays silent. The Settings → Haptics toggle is honoured at call time.
 */

type HapticsModule = typeof import("expo-haptics");

let cached: HapticsModule | null | undefined;
let loading: Promise<HapticsModule | null> | null = null;

function enabled(): boolean {
  try {
    return useSettingsStore.getState().prefs.haptics !== false;
  } catch {
    return true;
  }
}

function load(): Promise<HapticsModule | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!loading) {
    loading = import("expo-haptics")
      .then((m) => {
        cached = m;
        return m;
      })
      .catch(() => {
        cached = null;
        return null;
      });
  }
  return loading;
}

function run(fn: (m: HapticsModule) => Promise<void>): void {
  if (!enabled()) return;
  void load().then((m) => {
    if (!m) return;
    void fn(m).catch(() => {});
  });
}

/** A tick for a value crossing a step: tab, segment, chip, switch, keypad. */
export function hapticSelection(): void {
  run((m) => m.selectionAsync());
}

/** A physical tap for a completed action. */
export function hapticImpact(style: "light" | "medium" | "heavy" = "light"): void {
  run((m) =>
    m.impactAsync(
      style === "medium"
        ? m.ImpactFeedbackStyle.Medium
        : style === "heavy"
          ? m.ImpactFeedbackStyle.Heavy
          : m.ImpactFeedbackStyle.Light
    )
  );
}

export function hapticSuccess(): void {
  run((m) => m.notificationAsync(m.NotificationFeedbackType.Success));
}

export function hapticWarning(): void {
  run((m) => m.notificationAsync(m.NotificationFeedbackType.Warning));
}

export function hapticError(): void {
  run((m) => m.notificationAsync(m.NotificationFeedbackType.Error));
}
