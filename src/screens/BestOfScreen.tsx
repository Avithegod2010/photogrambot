import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "../rn";
import { useTheme } from "../useTheme";
import { searchPhotos, type PhotoRow } from "../lib/db";
import { rankPhotos } from "../lib/bestOf";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { EmptyAlbumArt } from "../components/illustrations";
import { isDecoyActive } from "../lib/applock";
import { AppBar, EmptyState } from "../components/ui";
import { useResponsive } from "../lib/responsive";
import { HeartIcon } from "../components/icons";
import { overlay, radius, spacing } from "../theme";

export function BestOfScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
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

  const { width } = useResponsive();
  const columns = width >= 1000 ? 5 : width >= 720 ? 4 : 3;
  const tile = Math.floor((width - spacing.seam * (columns - 1)) / columns);

  const favoriteColor =
    typeof theme.colors.favorite === "string" ? theme.colors.favorite : overlay.onMedia;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AppBar
        title={`Best of ${scope}`}
        subtitle="Favorites, resolution and size — up to 60 shots"
        onBack={() => navigation.goBack()}
        theme={theme}
        borderless
      />
      <FlatList
        data={photos ?? []}
        numColumns={columns}
        key={columns}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item, index }) => {
          const thumb = resolvePhotoThumb(item);
          return (
            <Pressable
              style={{ width: tile, height: tile, padding: spacing.seam / 2 }}
              onPress={() => navigation.navigate("Viewer", { photos: photos ?? [], index })}
              accessibilityRole="button"
              accessibilityLabel={`${item.filename}${item.favorite ? ", favorite" : ""}`}
            >
              <TelegramImage
                fileId={thumb.fileId}
                localUri={thumb.localUri}
                profileId={item.profile_id}
                style={{ width: "100%", height: "100%", borderRadius: radius.thumb }}
              />
              {item.favorite ? (
                <View style={styles.favBadge}>
                  <HeartIcon color={favoriteColor} size={14} filled />
                </View>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          photos === null ? (
            <ActivityIndicator style={{ marginTop: 60 }} color={theme.colors.primary} />
          ) : (
            <EmptyState
              theme={theme}
              art={<EmptyAlbumArt color={theme.colors.onSurfaceVariant} accent={theme.colors.primary} size={104} />}
              title="Nothing to show yet"
              message="Back up some photos and the best shots from the last year will collect here."
              actionLabel="Back to gallery"
              onAction={() => navigation.goBack()}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  favBadge: {
    position: "absolute",
    left: spacing.xs,
    bottom: spacing.xs,
    backgroundColor: overlay.mediaScrim,
    borderRadius: radius.pill,
    padding: 4,
  },
});
