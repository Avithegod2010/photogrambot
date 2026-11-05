import React, { useEffect, useState } from "react";
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "../rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { searchPhotos, type PhotoRow } from "../lib/db";
import { rankPhotos } from "../lib/bestOf";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { EmptyAlbumArt } from "../components/illustrations";
import { isDecoyActive } from "../lib/applock";

export function BestOfScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<PhotoRow[] | null>(null);
  const [scope, setScope] = useState("the last year");

  useEffect(() => {
    if (isDecoyActive()) {
      setPhotos([]);
      return;
    }
    void (async () => {
      let rows = await searchPhotos("", { takenWithinDays: 365 }, 2000).catch(() => []);
      if (rows.length < 10) {
        rows = await searchPhotos("", undefined, 2000).catch(() => []);
        setScope("your library");
      }
      setPhotos(rankPhotos(rows, 60));
    })();
  }, []);

  const tile = Math.floor((Dimensions.get("window").width - 8) / 3);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Best of {scope}</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5 }}>
            Favorites, resolution and size — up to 60 shots
          </Text>
        </View>
      </View>
      <FlatList
        data={photos ?? []}
        numColumns={3}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 2, paddingBottom: 40 }}
        renderItem={({ item, index }) => {
          const thumb = resolvePhotoThumb(item);
          return (
            <Pressable
              style={{ width: tile, height: tile, padding: 1 }}
              onPress={() => navigation.navigate("Viewer", { photos: photos ?? [], index })}
            >
              <TelegramImage
                fileId={thumb.fileId}
                localUri={thumb.localUri}
                profileId={item.profile_id}
                style={{ width: "100%", height: "100%" }}
              />
              {item.favorite ? (
                <Text style={{ position: "absolute", left: 6, bottom: 6, color: "#FF8FA3", fontSize: 14 }}>
                  ♥
                </Text>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          photos === null ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, padding: 24 }}>Loading…</Text>
          ) : (
            <View style={{ alignItems: "center", padding: 24 }}>
              <EmptyAlbumArt
                color={theme.colors.onSurfaceVariant}
                accent={theme.colors.primary}
                size={104}
              />
              <Text style={{ color: theme.colors.onSurfaceVariant, padding: 12, textAlign: "center" }}>
                No backed-up photos yet.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800" },
});
