import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "../rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useSettingsStore } from "../store/useSettingsStore";
import { normalizeSearchFilters, searchPhotos } from "../lib/db";
import { groupPhotosByDate } from "../lib/format";
import { isDecoyActive } from "../lib/applock";
import { TelegramImage } from "../components/TelegramImage";
import { EmptySearchArt } from "../components/illustrations";
import { AppBar, EmptyState } from "../components/ui";
import type { PhotoRow } from "../lib/db";

// Runs a pinned saved search (Collections → Smart collections). Virtual by
// design: results re-run the query on every open, so the collection stays
// current with new uploads — no materialized copies.
export function SearchResultsScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const title: string = route.params?.title ?? "Search";
  const query: string = route.params?.query ?? "";
  const filtersJson: string = route.params?.filtersJson ?? "null";
  const dateFormat = useSettingsStore((s) => s.prefs.dateFormat);
  const [photos, setPhotos] = useState<PhotoRow[] | null>(null);

  useEffect(() => {
    if (isDecoyActive()) {
      setPhotos([]);
      return;
    }
    let alive = true;
    void (async () => {
      let filters: ReturnType<typeof normalizeSearchFilters> = null;
      try {
        const parsed = JSON.parse(filtersJson);
        filters = normalizeSearchFilters(parsed);
      } catch {
        filters = null;
      }
      try {
        const rows = await searchPhotos(query, filters ?? undefined);
        if (alive) setPhotos(rows);
      } catch {
        if (alive) setPhotos([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [query, filtersJson]);

  const sections = photos ? groupPhotosByDate(photos, dateFormat) : [];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AppBar
        title={title}
        subtitle={photos ? `${photos.length} photo${photos.length === 1 ? "" : "s"}` : undefined}
        onBack={() => navigation.goBack()}
        theme={theme}
        borderless
      />
      <FlatList
        data={sections}
        keyExtractor={(s, i) => `${i}:${s.label}`}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <View>
            <Text accessibilityRole="header" style={[styles.dateHeader, { color: theme.colors.onSurfaceVariant }]}>
              {item.label}
            </Text>
            <View style={styles.grid}>
              {item.items.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.tile}
                  onPress={() =>
                    navigation.navigate("Viewer", {
                      photos: item.items,
                      index: item.items.findIndex((x) => x.id === p.id),
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={p.filename}
                >
                  <TelegramImage
                    fileId={p.preview_file_id ?? p.thumb_file_id ?? p.remote_file_id}
                    localUri={p.local_uri}
                    profileId={p.profile_id}
                    style={{ width: "100%", height: "100%" }}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          photos ? (
            <EmptyState
              theme={theme}
              art={<EmptySearchArt color={theme.colors.onSurfaceVariant} accent={theme.colors.primary} size={104} />}
              title="Nothing matches this search"
              message="Try fewer words, or adjust the filters in the gallery."
              actionLabel="Back to gallery"
              onAction={() => navigation.goBack()}
            />
          ) : (
            <ActivityIndicator style={{ marginTop: 60 }} color={theme.colors.primary} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
  },
  dateHeader: {
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 2,
  },
  tile: {
    width: `${100 / 3}%` as any,
    aspectRatio: 1,
    padding: 1,
  },
  empty: {
    fontSize: 13.5,
    textAlign: "center",
    padding: 24,
  },
});
