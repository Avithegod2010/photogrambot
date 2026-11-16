import React from "react";
import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

// Themed empty-state artwork — drawn inline (no image assets) so it inherits
// the current accent and works in every theme mode.

type ArtProps = { color: ColorValue; accent: ColorValue; size?: number };

function Frame({ color, accent, size = 120, children }: ArtProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Circle cx="60" cy="60" r="54" fill={accent} opacity={0.12} />
      {children}
    </Svg>
  );
}

export function EmptyGalleryArt({ color, accent, size = 120 }: ArtProps) {
  return (
    <Frame color={color} accent={accent} size={size}>
      <Rect x="28" y="34" width="64" height="50" rx="8" stroke={color} strokeWidth="3" />
      <Circle cx="45" cy="49" r="5" fill={color} />
      <Path
        d="M34 76l15-15a5 5 0 0 1 7 0l7 7 8-8a5 5 0 0 1 7 0l8 8"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

export function EmptyTrashArt({ color, accent, size = 120 }: ArtProps) {
  return (
    <Frame color={color} accent={accent} size={size}>
      <Path d="M42 44h36M50 44v-5a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v5" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <Path d="M47 44l3 36a5 5 0 0 0 5 4h10a5 5 0 0 0 5-4l3-36" stroke={color} strokeWidth="3" strokeLinejoin="round" />
      <Path d="M56 54v18M64 54v18" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

export function EmptySearchArt({ color, accent, size = 120 }: ArtProps) {
  return (
    <Frame color={color} accent={accent} size={size}>
      <Circle cx="54" cy="53" r="18" stroke={color} strokeWidth="3" />
      <Path d="M67 66l13 13" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <Path d="M47 53h14M54 46v14" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

export function EmptyAlbumArt({ color, accent, size = 120 }: ArtProps) {
  return (
    <Frame color={color} accent={accent} size={size}>
      <Rect x="26" y="40" width="58" height="44" rx="7" stroke={color} strokeWidth="3" />
      <Rect x="36" y="31" width="58" height="44" rx="7" fill={accent} opacity={0.18} stroke={accent} strokeWidth="3" />
      <Circle cx="52" cy="48" r="4.5" fill={accent} />
      <Path d="M40 65l12-12a5 5 0 0 1 7 0l14 14" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}
