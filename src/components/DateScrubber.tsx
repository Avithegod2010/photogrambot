import React, { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { Text } from "../rn";
import type { AppTheme } from "../theme";

/**
 * Slim date scrubber for long galleries. Dragging maps the vertical position
 * to a section index and asks the list to jump to that section's measured Y.
 * Purely presentational — the caller owns the scroll position.
 */
export function DateScrubber({
  labels,
  onJump,
  theme,
  top = 150,
  bottom = 120,
}: {
  labels: string[];
  onJump: (index: number) => void;
  theme: AppTheme;
  top?: number;
  bottom?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const heightRef = useRef(0);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const onJumpRef = useRef(onJump);
  onJumpRef.current = onJump;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => labelsRef.current.length > 1,
        onMoveShouldSetPanResponder: () => labelsRef.current.length > 1,
        onPanResponderGrant: (e) => handle(e.nativeEvent.locationY),
        onPanResponderMove: (e) => handle(e.nativeEvent.locationY),
        onPanResponderRelease: () => setActive(null),
        onPanResponderTerminate: () => setActive(null),
      }),
    []
  );

  function handle(y: number) {
    const count = labelsRef.current.length;
    if (count < 2) return;
    const height = heightRef.current || 1;
    const ratio = Math.max(0, Math.min(1, y / height));
    const index = Math.round(ratio * (count - 1));
    setActive(index);
    onJumpRef.current(index);
  }

  if (labels.length < 2) return null;

  return (
    <View
      style={[styles.rail, { top, bottom }]}
      onLayout={(e) => {
        heightRef.current = e.nativeEvent.layout.height;
      }}
      {...panResponder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Scroll by date"
    >
      {labels.map((label, i) => (
        <View
          key={`${i}:${label}`}
          style={[
            styles.tick,
            {
              backgroundColor:
                active === i ? theme.colors.primary : theme.colors.outlineVariant,
              width: active === i ? 14 : i % 5 === 0 ? 10 : 6,
            },
          ]}
        />
      ))}
      {active !== null ? (
        <View style={[styles.bubble, { backgroundColor: theme.colors.surfaceHighest }]}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 11, fontWeight: "700" }}>
            {labels[active]}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: "absolute",
    right: 2,
    width: 22,
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
    zIndex: 20,
  },
  tick: {
    height: 2,
    borderRadius: 2,
  },
  bubble: {
    position: "absolute",
    right: 22,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 64,
    alignItems: "center",
  },
});
