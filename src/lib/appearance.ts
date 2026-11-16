import {
  amoledTheme,
  darkTheme,
  lightTheme,
  type AppTheme,
  type ThemeColors,
} from "../theme";
import {
  isHexColor,
  mixColors,
  readableOn,
  type ResolvedThemeMode,
} from "./appearanceMath";

// Theme-dependent appearance helpers. The pure math/constants live in
// appearanceMath.ts so the Node suite can import them without react-native.

export * from "./appearanceMath";

const BASE_BY_MODE: Record<ResolvedThemeMode, AppTheme> = {
  dark: darkTheme,
  amoled: amoledTheme,
  light: lightTheme,
};

/**
 * Apply a custom accent to a static base theme. Containers are derived by
 * blending the accent into the surface so the result stays legible in both
 * light and dark modes. Dynamic (wallpaper) colors cannot be blended, so a
 * custom accent intentionally wins over Material You.
 */
export function accentTheme(mode: ResolvedThemeMode, accent: string | null | undefined): AppTheme {
  const base = BASE_BY_MODE[mode];
  if (!accent || !isHexColor(accent)) return base;
  const bg = typeof base.colors.background === "string" ? base.colors.background : "#101014";
  const surface = typeof base.colors.surface === "string" ? base.colors.surface : "#1B1B1F";
  const onSurface = typeof base.colors.onSurface === "string" ? base.colors.onSurface : "#E4E2EA";
  const primaryContainer = mixColors(accent, bg, 0.32);
  const secondaryContainer = mixColors(accent, surface, 0.22);
  const colors: ThemeColors = {
    ...base.colors,
    primary: accent,
    onPrimary: readableOn(accent),
    primaryContainer,
    onPrimaryContainer: readableOn(primaryContainer),
    secondaryContainer,
    onSecondaryContainer: onSurface,
    favorite: typeof base.colors.favorite === "string" ? base.colors.favorite : "#FF8FA3",
  };
  return { ...base, colors };
}
