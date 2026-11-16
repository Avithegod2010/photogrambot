import React from "react";
import { StyleSheet, Text as RNText, type TextProps } from "react-native";
import { useSettingsStore } from "../store/useSettingsStore";

/**
 * App-wide Text replacement that honours the "Font scale" preference.
 *
 * Every screen imports Text from `src/rn` (which re-exports this component),
 * so a single multiplier reaches the whole UI without touching each style.
 * When the scale is 1 this is a transparent passthrough.
 */
export const Text = React.forwardRef<any, TextProps>(function ScaledText(props, ref) {
  const scale = useSettingsStore((s) => s.prefs.fontScale);
  const family = useSettingsStore((s) => s.prefs.fontFamily);
  const factor = typeof scale === "number" && scale > 0 ? scale : 1;
  const flat = StyleSheet.flatten(props.style) as
    | { fontSize?: number; lineHeight?: number; fontFamily?: string }
    | undefined;
  const familyOverride =
    family && family !== "system" && !flat?.fontFamily ? { fontFamily: family } : undefined;
  if (factor === 1 && !familyOverride) return <RNText {...props} ref={ref} />;

  const override: { fontSize?: number; lineHeight?: number; fontFamily?: string } = {};
  if (typeof flat?.fontSize === "number") override.fontSize = flat.fontSize * factor;
  if (typeof flat?.lineHeight === "number") override.lineHeight = flat.lineHeight * factor;
  return (
    <RNText
      {...props}
      ref={ref}
      style={[props.style, override, familyOverride]}
    />
  );
});
