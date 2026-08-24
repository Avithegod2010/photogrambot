import { Platform } from "react-native";
import { useSettingsStore } from "./store/useSettingsStore";
import {
  darkTheme,
  amoledTheme,
  lightTheme,
  dynamicDarkTheme,
  dynamicLightTheme,
  type AppTheme,
} from "./theme";

export function useTheme(): AppTheme {
  const mode = useSettingsStore((s) => s.prefs.theme);
  const dynamicColor = useSettingsStore((s) => s.prefs.dynamicColor);
  const canDynamic = Platform.OS === "android" && Number(Platform.Version) >= 31;
  if (dynamicColor && canDynamic) {
    if (mode === "light") return dynamicLightTheme();
    return dynamicDarkTheme();
  }
  if (mode === "amoled") return amoledTheme;
  if (mode === "light") return lightTheme;
  return darkTheme;
}
