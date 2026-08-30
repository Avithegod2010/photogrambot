import { Platform, PlatformColor, type ColorValue } from "react-native";

export type ThemeColors = {
  [key: string]: ColorValue | undefined;
  background: ColorValue;
  surface: ColorValue;
  surfaceContainer: ColorValue;
  surfaceHighest: ColorValue;
  outline: ColorValue;
  outlineVariant: ColorValue;
  primary: ColorValue;
  onPrimary: ColorValue;
  primaryContainer: ColorValue;
  onPrimaryContainer: ColorValue;
  secondaryContainer: ColorValue;
  onSecondaryContainer: ColorValue;
  surfaceVariant: ColorValue;
  onSurface: ColorValue;
  onSurfaceVariant: ColorValue;
  error: ColorValue;
  onError: ColorValue;
  errorContainer: ColorValue;
  scrim: ColorValue;
  success: ColorValue;
  favorite: ColorValue;
};

export interface AppTheme {
  mode: "dark" | "amoled" | "light";
  dynamic: boolean;
  colors: ThemeColors;
}

const staticDarkColors: ThemeColors = {
  background: "#101014",
  surface: "#1B1B1F",
  surfaceContainer: "#1E1E24",
  surfaceHighest: "#26262C",
  outline: "#3A3A43",
  outlineVariant: "#2A2A31",
  primary: "#A8C7FA",
  onPrimary: "#062E5F",
  primaryContainer: "#254377",
  onPrimaryContainer: "#D6E3FF",
  secondaryContainer: "#39424F",
  onSecondaryContainer: "#D8E2F5",
  surfaceVariant: "#3F4754",
  onSurface: "#E4E2EA",
  onSurfaceVariant: "#C4C6D0",
  error: "#FFB4AB",
  onError: "#690005",
  errorContainer: "#5C1A16",
  scrim: "rgba(0,0,0,0.6)",
  success: "#7DDB8A",
  favorite: "#FF8FA3",
};

const staticAmoledColors: ThemeColors = {
  ...staticDarkColors,
  background: "#000000",
  surface: "#0A0A0C",
  surfaceContainer: "#101013",
  surfaceHighest: "#17171B",
};

const staticLightColors: ThemeColors = {
  background: "#F7F7FA",
  surface: "#FFFFFF",
  surfaceContainer: "#F0F0F4",
  surfaceHighest: "#E4E4EA",
  outline: "#C4C6D0",
  outlineVariant: "#DADAE0",
  primary: "#2E5FA3",
  onPrimary: "#FFFFFF",
  primaryContainer: "#D6E3FF",
  onPrimaryContainer: "#0A2A5C",
  secondaryContainer: "#D8E2F5",
  onSecondaryContainer: "#1A2A40",
  surfaceVariant: "#E0E2EC",
  onSurface: "#1A1B20",
  onSurfaceVariant: "#44474F",
  error: "#B3261E",
  onError: "#FFFFFF",
  errorContainer: "#F9DEDC",
  scrim: "rgba(0,0,0,0.4)",
  success: "#1E7D34",
  favorite: "#C2185B",
};

export const darkTheme: AppTheme = { mode: "dark", dynamic: false, colors: staticDarkColors };
export const amoledTheme: AppTheme = { mode: "amoled", dynamic: false, colors: staticAmoledColors };
export const lightTheme: AppTheme = { mode: "light", dynamic: false, colors: staticLightColors };

const isAndroid12 = Platform.OS === "android" && Number(Platform.Version) >= 31;

// RN resolves resource_paths only for strings starting with '@' or '?' —
// a bare name crashes natively in ColorPropConverter ("None of the paths
// … resolved to a color resource"), so always pass a full resource path.
// A JS try/catch can't help: the failure happens at native render time.
function sys(name: string, fallback: ColorValue): ColorValue {
  if (!isAndroid12) return fallback;
  return PlatformColor(`@android:color/${name}`);
}

// system_error has no @android:color resource — the attr is colorError.
function sysAttr(name: string, fallback: ColorValue): ColorValue {
  if (!isAndroid12) return fallback;
  return PlatformColor(`?android:attr/${name}`);
}

export function dynamicDarkTheme(): AppTheme {
  return {
    mode: "dark",
    dynamic: true,
    colors: {
      background: sys("system_neutral1_900", staticDarkColors.background),
      surface: sys("system_neutral2_800", staticDarkColors.surface),
      surfaceContainer: sys("system_neutral2_900", staticDarkColors.surfaceContainer),
      surfaceHighest: sys("system_neutral2_800", staticDarkColors.surfaceHighest),
      outline: sys("system_neutral2_600", staticDarkColors.outline),
      outlineVariant: sys("system_neutral2_700", staticDarkColors.outlineVariant),
      primary: sys("system_accent1_200", staticDarkColors.primary),
      onPrimary: sys("system_accent1_900", staticDarkColors.onPrimary),
      primaryContainer: sys("system_accent1_700", staticDarkColors.primaryContainer),
      onPrimaryContainer: sys("system_accent1_100", staticDarkColors.onPrimaryContainer),
      secondaryContainer: sys("system_accent2_700", staticDarkColors.secondaryContainer),
      onSecondaryContainer: sys("system_accent2_100", staticDarkColors.onSecondaryContainer),
      surfaceVariant: sys("system_neutral2_700", staticDarkColors.surfaceVariant),
      onSurface: sys("system_neutral1_100", staticDarkColors.onSurface),
      onSurfaceVariant: sys("system_neutral2_300", staticDarkColors.onSurfaceVariant),
      error: sysAttr("colorError", staticDarkColors.error),
      onError: staticDarkColors.onError,
      errorContainer: staticDarkColors.errorContainer,
      scrim: "rgba(0,0,0,0.6)",
      success: "#7DDB8A",
      favorite: sys("system_accent3_200", staticDarkColors.favorite),
    },
  };
}

export function dynamicLightTheme(): AppTheme {
  return {
    mode: "light",
    dynamic: true,
    colors: {
      background: sys("system_neutral1_50", staticLightColors.background),
      surface: sys("system_neutral1_0", staticLightColors.surface),
      surfaceContainer: sys("system_neutral2_50", staticLightColors.surfaceContainer),
      surfaceHighest: sys("system_neutral2_100", staticLightColors.surfaceHighest),
      outline: sys("system_neutral2_400", staticLightColors.outline),
      outlineVariant: sys("system_neutral2_300", staticLightColors.outlineVariant),
      primary: sys("system_accent1_600", staticLightColors.primary),
      onPrimary: sys("system_accent1_0", staticLightColors.onPrimary),
      primaryContainer: sys("system_accent1_100", staticLightColors.primaryContainer),
      onPrimaryContainer: sys("system_accent1_900", staticLightColors.onPrimaryContainer),
      secondaryContainer: sys("system_accent2_100", staticLightColors.secondaryContainer),
      onSecondaryContainer: sys("system_accent2_800", staticLightColors.onSecondaryContainer),
      surfaceVariant: sys("system_neutral2_100", staticLightColors.surfaceVariant),
      onSurface: sys("system_neutral1_900", staticLightColors.onSurface),
      onSurfaceVariant: sys("system_neutral2_600", staticLightColors.onSurfaceVariant),
      error: sysAttr("colorError", staticLightColors.error),
      onError: staticLightColors.onError,
      errorContainer: staticLightColors.errorContainer,
      scrim: "rgba(0,0,0,0.4)",
      success: "#1E7D34",
      favorite: sys("system_accent3_500", staticLightColors.favorite),
    },
  };
}
