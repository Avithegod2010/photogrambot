import {
  Platform,
  PlatformColor,
  type ColorValue,
  type TextStyle,
  type ViewStyle,
} from "react-native";

/* ------------------------------------------------------------------------- *
 * Design tokens
 *
 * The theme owns colour. These scales own everything else so screens never
 * invent a one-off size, radius, duration or touch target. Additive: the
 * existing AppTheme/ThemeColors contract is unchanged, so every screen that
 * predates the token system keeps working while it is migrated.
 * ------------------------------------------------------------------------- */

/** 4-based spacing scale. `seam` is the only sub-4 value: photo-grid gaps. */
export const spacing = {
  seam: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Corner radii. Thumbnails stay sharp; controls, cards and sheets round up. */
export const radius = {
  thumb: 4,
  control: 12,
  card: 16,
  sheet: 28,
  pill: 999,
} as const;

/**
 * One type scale: 10 (photo badge) · 11 · 12 · 13 · 15 · 17 · 20 · 24 · 30.
 * Four weights only: 400 / 500 / 600 / 700. Line height stays 1.2–1.4.
 */
export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "700" },
  headline: { fontSize: 24, lineHeight: 30, fontWeight: "700" },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  section: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: "600" },
  small: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  caption: { fontSize: 11, lineHeight: 14, fontWeight: "500" },
  badge: { fontSize: 10, lineHeight: 12, fontWeight: "700" },
} satisfies Record<string, TextStyle>;

/** Motion scale in ms. Anything longer than `slow` needs a written reason. */
export const motion = {
  /** Press feedback / hover. */
  fast: 120,
  /** State change: selection, expand, chip switch. */
  base: 180,
  /** Navigation, sheet and theme transitions. */
  slow: 240,
  /** Standard easing: fast start, gentle settle. */
  easing: [0.2, 0, 0, 1] as const,
} as const;

/** Minimum interactive size in dp (Material / Android accessibility floor). */
export const touchTarget = 48;

/**
 * Non-theme overlays. White/black are the only literal colours in the design
 * system; they live here so no screen needs its own hex.
 */
export const overlay = {
  /** Android ripple. Neutral so it reads on both light and dark surfaces. */
  ripple: "rgba(128,128,128,0.16)",
  /** Scrim behind media chrome (photo viewer, slideshow). */
  mediaScrim: "rgba(0,0,0,0.55)",
  mediaScrimStrong: "rgba(0,0,0,0.75)",
  mediaScrimSoft: "rgba(0,0,0,0.35)",
  onMedia: "#FFFFFF",
  onMediaMuted: "rgba(255,255,255,0.72)",
  onMediaSubtle: "rgba(255,255,255,0.18)",
  /** Photo letterbox / full-screen canvas. */
  mediaCanvas: "#000000",
  /** Neutral skeleton wash. */
  skeleton: "rgba(128,128,128,0.18)",
} as const;

/** String fallbacks for APIs that require a literal colour (tabs, SVG props). */
export const fallback = {
  primary: "#A8C7FA",
  onSurface: "#E4E2EA",
  onSurfaceVariant: "#C4C6D0",
  favorite: "#FF8FA3",
} as const;

/** Tonal-first elevation; shadows only for floating chrome and sheets. */
export const elevation = {
  none: {} as ViewStyle,
  floating: {
    elevation: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  } as ViewStyle,
  sheet: {
    elevation: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -2 },
  } as ViewStyle,
} as const;

/**
 * One status vocabulary for every trust surface (gallery badges, upload queue,
 * digests, info sheet). Always icon + text + colour — never colour alone.
 */
export type StatusKind =
  | "local"
  | "queued"
  | "uploading"
  | "backed_up"
  | "failed"
  | "restored"
  | "duplicate";

export const STATUS_LABELS: Record<StatusKind, string> = {
  local: "On this phone",
  queued: "Queued",
  uploading: "Uploading",
  backed_up: "Backed up",
  failed: "Failed",
  restored: "Restored",
  duplicate: "Skipped — duplicate",
};

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
