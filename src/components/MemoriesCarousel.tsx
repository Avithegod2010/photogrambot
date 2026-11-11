import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "../rn";
import { useTheme } from "../useTheme";
import { getMemories, type MemoryGroup } from "../lib/db";
import { TelegramImage } from "./TelegramImage";
import { overlay, radius, spacing, typography } from "../theme";

/**
 * "On this day" memories. This is one of the few places where a little
 * delight is allowed: taller cards, a scrim, and type sitting on the photo.
 */
export function MemoriesCarousel({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const [memories, setMemories] = useState<MemoryGroup[]>([]);

  useEffect(() => {
    getMemories().then(setMemories);
  }, []);

  if (memories.length === 0) return null;

  const cardW = 116;
  const cardH = 168;

  return (
    <View style={styles.wrap}>
      <Text
        accessibilityRole="header"
        style={[typography.bodyStrong, { color: theme.colors.onSurface, paddingHorizontal: spacing.lg, marginBottom: spacing.sm }]}
      >
        Memories
      </Text>
      <View style={styles.row}>
        {memories.map((m) => (
          <Pressable
            key={m.label}
            style={[styles.card, { width: cardW, height: cardH }]}
            onPress={async () => {
              const { getPhotosInRange } = await import("../lib/db");
              const photos = await getPhotosInRange(m.startMs, m.endMs);
              if (photos.length === 0) return;
              navigation.navigate("Viewer", { photos, index: 0, title: m.label });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${m.label}, ${m.count} photo${m.count === 1 ? "" : "s"}`}
          >
            <TelegramImage
              fileId={m.cover_preview_id ?? m.cover_file_id}
              style={{ width: cardW, height: cardH }}
            />
            <View style={[styles.overlay, { backgroundColor: theme.colors.scrim }]} />
            <View style={styles.cardText}>
              <Text style={[typography.smallStrong, { color: overlay.onMedia }]} numberOfLines={1}>
                {m.label}
              </Text>
              <Text style={[typography.caption, { color: overlay.onMediaMuted }]}>
                {m.count} photo{m.count === 1 ? "" : "s"}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  card: {
    borderRadius: radius.card,
    overflow: "hidden",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.45,
  },
  cardText: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
  },
});
