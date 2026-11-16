import { Platform } from "react-native";
import { useSettingsStore } from "./store/useSettingsStore";
import {
  dynamicDarkTheme,
  dynamicLightTheme,
  type AppTheme,
} from "./theme";
import { accentTheme, isHexColor } from "./lib/appearance";

export function useTheme(): AppTheme {
  // resolvedTheme applies the system/schedule resolution once (App refreshes it
  // on prefs changes, on foreground and on a minute timer), so every consumer
  // sees the same concrete mode.
  const mode = useSettingsStore((s) => s.resolvedTheme);
  const dynamicColor = useSettingsStore((s) => s.prefs.dynamicColor);
  const accentColor = useSettingsStore((s) => s.prefs.accentColor);
  const canDynamic = Platform.OS === "android" && Number(Platform.Version) >= 31;

  // A custom accent takes precedence over Material You: wallpaper colors are
  // opaque resource values that cannot be blended toward a chosen hue.
  if (isHexColor(accentColor)) return accentTheme(mode, accentColor);

  if (dynamicColor && canDynamic) {
    if (mode === "light") return dynamicLightTheme();
    return dynamicDarkTheme();
  }
  return accentTheme(mode, null);
}
