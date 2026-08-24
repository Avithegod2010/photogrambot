import React, { useEffect, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../useTheme";
import { getMemories, type MemoryGroup } from "../lib/db";
import { TelegramImage } from "./TelegramImage";

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
      <Text style={[styles.title, { color: theme.colors.onSurface }]}>Memories</Text>
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
          >
            <TelegramImage
              fileId={m.cover_preview_id ?? m.cover_file_id}
              style={{ width: cardW, height: cardH }}
            />
            <View style={[styles.overlay, { backgroundColor: theme.colors.scrim }]} />
            <View style={styles.cardText}>
              <Text style={[styles.years, { color: "#fff" }]} numberOfLines={1}>
                {m.label}
              </Text>
              <Text style={[styles.count, { color: "rgba(255,255,255,0.85)" }]}>
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
    marginTop: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
  },
  overlay: {
    ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    opacity: 0.45,
  },
  cardText: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
  },
  years: {
    fontSize: 13,
    fontWeight: "800",
  },
  count: {
    fontSize: 11,
    marginTop: 2,
  },
});
