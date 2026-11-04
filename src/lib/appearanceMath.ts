// Dependency-free appearance math (no react-native imports) so the schedule
// resolution, color derivation and formatting can be unit-tested in Node.

import type { DateFormat, ThemeMode } from "./settings";

export type ResolvedThemeMode = "dark" | "amoled" | "light";
export type TileAspect = "square" | "original";
export type MapStyle = "standard" | "satellite" | "hybrid" | "terrain";
export type AppIconVariant = "default" | "accent" | "mono";
export type InfoDensity = "compact" | "detailed";

export const ACCENT_PRESETS: { key: string; label: string; color: string | null }[] = [
  { key: "default", label: "Default", color: null },
  { key: "#4C8DFF", label: "Blue", color: "#4C8DFF" },
  { key: "#7C4DFF", label: "Violet", color: "#7C4DFF" },
  { key: "#2BB673", label: "Green", color: "#2BB673" },
  { key: "#E5484D", label: "Red", color: "#E5484D" },
  { key: "#F5A524", label: "Amber", color: "#F5A524" },
  { key: "#00B8D9", label: "Cyan", color: "#00B8D9" },
  { key: "#FF5C8A", label: "Pink", color: "#FF5C8A" },
];

export const DATE_FORMATS: { key: DateFormat; label: string }[] = [
  { key: "locale", label: "System" },
  { key: "dmy", label: "31.12.2026" },
  { key: "mdy", label: "12/31/2026" },
  { key: "iso", label: "2026-12-31" },
];

export const MAP_STYLES: { key: MapStyle; label: string }[] = [
  { key: "standard", label: "Standard" },
  { key: "satellite", label: "Satellite" },
  { key: "hybrid", label: "Hybrid" },
  { key: "terrain", label: "Terrain" },
];

export const GRID_COLUMNS = [2, 3, 4, 5];

export const FONT_SCALES: { key: number; label: string }[] = [
  { key: 0.9, label: "Small" },
  { key: 1, label: "Default" },
  { key: 1.12, label: "Large" },
  { key: 1.25, label: "Extra large" },
];

export const APP_ICON_VARIANTS: { key: AppIconVariant; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "accent", label: "Accent" },
  { key: "mono", label: "Monochrome" },
];

/** True when `nowMinutes` falls inside [start, end), supporting a midnight wrap. */
export function isWithinWindow(nowMinutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

/**
 * Resolve the theme mode that should actually render.
 *
 * Schedule semantics: when enabled, the night window is dark (AMOLED stays
 * AMOLED at night), the day window is light. Without a schedule, "system"
 * follows the OS and an explicit mode wins.
 */
export function resolveThemeMode(
  theme: ThemeMode,
  scheduleEnabled: boolean,
  scheduleStart: number,
  scheduleEnd: number,
  systemScheme: string | null | undefined,
  now: Date = new Date()
): ResolvedThemeMode {
  if (scheduleEnabled) {
    const minutes = now.getHours() * 60 + now.getMinutes();
    const night = isWithinWindow(minutes, scheduleStart, scheduleEnd);
    if (night) return theme === "amoled" ? "amoled" : "dark";
    return "light";
  }
  if (theme === "system") return systemScheme === "light" ? "light" : "dark";
  return theme;
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const value = parseInt(m[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Linear blend: `t` is the weight of `a` (0 = all b, 1 = all a). */
export function mixColors(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  return rgbToHex(
    ca.r * t + cb.r * (1 - t),
    ca.g * t + cb.g * (1 - t),
    ca.b * t + cb.b * (1 - t)
  );
}

/** Relative luminance (0..1) with sRGB weights. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/** Pick a readable foreground for a background color. */
export function readableOn(background: string): string {
  return luminance(background) > 0.5 ? "#0A0A0A" : "#FFFFFF";
}

/** A concrete hex for places that cannot take ColorValue (notifications, SVG). */
export function accentHex(
  accent: string | null | undefined,
  mode: ResolvedThemeMode
): string {
  if (isHexColor(accent)) return accent;
  return mode === "light" ? "#2E5FA3" : "#A8C7FA";
}

export function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function albumAccent(
  accents: Record<string, string> | null | undefined,
  key: string | number,
  fallback: string
): string {
  const value = accents?.[String(key)];
  return isHexColor(value) ? value : fallback;
}
