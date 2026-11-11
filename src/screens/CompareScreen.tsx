import React from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "../rn";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useT } from "../useT";
import { TelegramImage } from "../components/TelegramImage";
import { EmptyState } from "../components/ui";
import { CloseIcon } from "../components/icons";
import { formatBytes, formatDate } from "../lib/format";
import type { PhotoRow } from "../lib/db";
import { motion } from "../theme";

/**
 * Side-by-side comparison. Each pane zooms and pans independently (pinch +
 * drag), double-tap resets. Portrait stacks the panes vertically; landscape
 * and tablets use columns.
 */
export function CompareScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const left: PhotoRow = route.params?.left;
  const right: PhotoRow = route.params?.right;
  const stacked = width < height;

  if (!left || !right) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <EmptyState
          theme={theme}
          title="Pick two photos"
          message="Select exactly two photos in the gallery, then choose Compare from the selection bar."
          actionLabel={tr("common.close")}
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityLabel="Close compare"
          accessibilityRole="button"
          style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
        >
          <CloseIcon color={theme.colors.onSurface} size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.onSurface }]}>
          {tr("viewer.compare")}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={[styles.panes, { flexDirection: stacked ? "column" : "row" }]}>
        <ComparePane photo={left} label="A" theme={theme} />
        <View
          style={{
            height: stacked ? 1 : "100%",
            width: stacked ? "100%" : 1,
            backgroundColor: theme.colors.outlineVariant,
          }}
        />
        <ComparePane photo={right} label="B" theme={theme} />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        {[left, right].map((p, i) => (
          <View key={p.id} style={styles.footerRow}>
            <Text style={{ color: theme.colors.primary, fontWeight: "700", width: 16 }}>
              {i === 0 ? "A" : "B"}
            </Text>
            <Text style={{ color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
              {p.filename}
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
              {formatDate(p.taken_at)} · {p.width ?? "?"}×{p.height ?? "?"} ·{" "}
              {p.size ? formatBytes(p.size) : "?"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ComparePane({
  photo,
  label,
  theme,
}: {
  photo: PhotoRow;
  label: string;
  theme: ReturnType<typeof useTheme>;
}) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(1, startScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        scale.value = withTiming(1, { duration: motion.base });
        translateX.value = withTiming(0, { duration: motion.base });
        translateY.value = withTiming(0, { duration: motion.base });
      }
    });

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(1, { duration: motion.base });
      translateX.value = withTiming(0, { duration: motion.base });
      translateY.value = withTiming(0, { duration: motion.base });
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={styles.pane}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
          <TelegramImage
            fileId={photo.remote_file_id ?? photo.preview_file_id}
            localUri={photo.local_uri}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        </Animated.View>
      </GestureDetector>
      <View style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={{ color: theme.colors.onPrimaryContainer, fontWeight: "700", fontSize: 12 }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700", textAlign: "center" },
  panes: { flex: 1 },
  pane: { flex: 1, overflow: "hidden" },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { paddingHorizontal: 14, paddingTop: 8, gap: 6 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
