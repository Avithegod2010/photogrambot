import React from "react";
import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// Clean line/filled icons for the tab bar and headers — drawn inline so the
// app needs no icon-font dependency. All icons: 24x24 viewBox, `color` prop.

export function PhotoFrameIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="16" rx="3" stroke={color} strokeWidth="2" />
      <Circle cx="8.7" cy="9.3" r="1.7" fill={color} />
      <Path
        d="M4.6 17.6l3.9-3.9a1.4 1.4 0 0 1 1.98 0l2.32 2.32 2.62-2.62a1.4 1.4 0 0 1 1.98 0l2.02 2.02"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CloudIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 18.5a4.1 4.1 0 0 1-.5-8.17 5.9 5.9 0 0 1 11.5-1.16A4.35 4.35 0 0 1 16.9 18.5H6.6z"
        fill={color}
      />
    </Svg>
  );
}

export function CloudUploadIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 15.5a4.1 4.1 0 0 1-.5-8.17 5.9 5.9 0 0 1 11.5-1.16A4.35 4.35 0 0 1 16.9 15.5H6.6z"
        fill={color}
      />
      <Path
        d="M12 17.2v4.3M9.9 19.2l2.1-2.1 2.1 2.1"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function SearchIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="10.8" cy="10.8" r="6.3" stroke={color} strokeWidth="2" />
      <Path
        d="M15.6 15.6L20.2 20.2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function GearIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"
        fill={color}
      />
    </Svg>
  );
}

// Symmetric heart drawn from two circles + rotated square — no glyph-font
// baseline wobble.
export function HeartIcon({ color, size = 24, filled = false }: { color: string; size?: number; filled?: boolean }) {
  const fill = filled ? color : "none";
  const stroke = color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.3c-.3 0-.6-.11-.83-.32C6.4 15.7 3.4 12.9 3.4 9.6c0-2.63 2.03-4.7 4.6-4.7 1.5 0 2.97.72 4 1.98 1.03-1.26 2.5-1.98 4-1.98 2.57 0 4.6 2.07 4.6 4.7 0 3.3-3 6.1-7.77 10.38-.23.21-.53.32-.83.32z"
        fill={fill}
        stroke={stroke}
        strokeWidth={filled ? 1 : 2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function TrashIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6.5h16"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Path
        d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5"
        stroke={color}
        strokeWidth="2"
      />
      <Path
        d="M6 6.5l.8 12.1A2 2 0 0 0 8.8 20.5h6.4a2 2 0 0 0 2-1.9L18 6.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 10.5v6M14 10.5v6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function RetryIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12a9 9 0 1 1-2.64-6.36"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Path
        d="M21 3.5v5.3h-5.3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
