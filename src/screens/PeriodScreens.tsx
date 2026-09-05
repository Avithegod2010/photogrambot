import React, { useEffect, useState } from "react";
import { Dimensions, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { getMonthGroups, type PeriodGroup } from "../lib/db";
import { getLocalPeriodBuckets, monthLabel } from "../lib/localPeriods";
import { isDecoyActive } from "../lib/applock";
import { TelegramImage } from "../components/TelegramImage";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function MonthsOfYearScreen({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const year: number = route.params?.year ?? new Date().getFullYear();
  const [groups, setGroups] = useState<PeriodGroup[]>([]);

  useEffect(() => {
    if (isDecoyActive()) {
      setGroups([]);
      return;
    }
    // Same DB+local merge as the gallery's Months jump list — a month with
    // only local photos must still show up (Days shows them, so must this).
    // Local buckets exclude DB-counted assets; fetches fail independently.
    void (async () => {
      let dbGroups: PeriodGroup[] = [];
      try {
        dbGroups = await getMonthGroups(year);
      } catch {}
      try {
        const { getPeriodCountedLocalIds } = await import("../lib/db");
        const exclude = await getPeriodCountedLocalIds();
        const localBuckets = await getLocalPeriodBuckets("months", year, exclude);
        const byKey = new Map<string, PeriodGroup>();
        for (const g of dbGroups) byKey.set(g.key, { ...g });
        for (const b of localBuckets) {
          const existing = byKey.get(b.key);
          if (existing) {
            existing.count += b.count;
            existing.startMs = Math.min(existing.startMs, b.startMs);
            existing.endMs = Math.max(existing.endMs, b.endMs);
          } else {
            byKey.set(b.key, {
              key: b.key,
              label: monthLabel(b.key),
              startMs: b.startMs,
              endMs: b.endMs,
              count: b.count,
              cover_preview_id: null,
              cover_file_id: null,
            });
          }
        }
        setGroups(Array.from(byKey.values()).sort((a, b) => b.startMs - a.startMs));
      } catch {
        setGroups(dbGroups);
      }
    })();
  }, [year]);

  const tileW = (Dimensions.get("window").width - 32 - 12) / 2;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>{year}</Text>
      </View>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.key}
        numColumns={2}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        columnWrapperStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, { width: tileW, backgroundColor: theme.colors.surface }]}
            onPress={() =>
              navigation.navigate("PeriodPhotos", {
                title: item.label,
                startMs: item.startMs,
                endMs: item.endMs,
              })
            }
          >
            <View style={[styles.cover, { width: tileW, height: tileW * 0.72 }]}>
            {item.cover_preview_id ?? item.cover_file_id ? (
              <TelegramImage
                fileId={item.cover_preview_id ?? item.cover_file_id}
                style={{ width: tileW, height: tileW * 0.72 }}
              />
            ) : (
              <View
                style={{
                  width: tileW,
                  height: tileW * 0.72,
                  backgroundColor: theme.colors.surfaceHighest,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 24 }}>🖼</Text>
              </View>
            )}
          </View>
            <Text style={[styles.label, { color: theme.colors.onSurface }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.count, { color: theme.colors.onSurfaceVariant }]}>
              {item.count} photo{item.count === 1 ? "" : "s"}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
            No photos in {year}.
          </Text>
        }
      />
    </View>
  );
}

export function PeriodPhotosScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const title: string = route.params?.title ?? "";
  const startMs: number = route.params?.startMs ?? 0;
  const endMs: number = route.params?.endMs ?? Date.now();
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDecoyActive()) {
      setPhotos([]);
      setLoading(false);
      return;
    }
    // Grid spans BOTH sources: DB rows (cloud-backed) + local assets in the
    // same range. Local rows render through LocalAssetThumb (per-tile URI
    // resolve); DB rows render through TelegramImage as before.
    void (async () => {
      try {
        const dbRows = await import("../lib/db").then(({ getPhotosInRange }) =>
          getPhotosInRange(startMs, endMs)
        );
        const { getLocalPhotosInRange } = await import("../lib/localPeriods");
        const localRows = await getLocalPhotosInRange(startMs, endMs);
        const dbLocalIds = new Set(dbRows.map((r) => r.local_id).filter(Boolean));
        const merged = [...dbRows, ...localRows.filter((r) => !dbLocalIds.has(r.local_id))];
        merged.sort((a, b) => b.taken_at - a.taken_at);
        setPhotos(merged);
      } catch {
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [startMs, endMs]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.onSurface }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>{photos.length}</Text>
      </View>
      {loading ? null : (
        <MonthGrid
          photos={photos}
          onPress={(p) => void openPeriodPhoto(p, photos, navigation)}
        />
      )}
    </View>
  );
}

// Local-only rows carry local_uri: null (resolved lazily per grid tile) — the
// Viewer needs the real URI, so resolve it on press like GalleryScreen's
// onLocalPress does. DB-backed rows navigate as-is.
async function openPeriodPhoto(
  p: any,
  photos: any[],
  navigation: any
): Promise<void> {
  let row = p;
  if (p.local_id && !p.remote_file_id && !p.preview_file_id && !p.thumb_file_id && !p.local_uri) {
    let uri: string | null = null;
    try {
      uri = await new MediaLibrary.Asset(p.local_id).getUri();
    } catch {}
    row = { ...p, local_uri: uri };
  }
  navigation.navigate("Viewer", {
    photos: photos.map((x) => (x.id === row.id ? row : x)),
    index: photos.findIndex((x) => x.id === row.id),
  });
}

export function MonthGrid({
  photos,
  onPress,
  theme,
}: {
  photos: any[];
  onPress: (p: any) => void;
  theme?: ReturnType<typeof useTheme>;
}) {
  const defaultTheme = useTheme();
  const t = theme ?? defaultTheme;
  const tile = (Dimensions.get("window").width - 4) / 3;
  return (
    <FlatList
      data={photos}
      keyExtractor={(p) => p.id}
      numColumns={3}
      contentContainerStyle={{ padding: 2 }}
      renderItem={({ item }) => (
        <Pressable style={{ width: tile, height: tile, padding: 1 }} onPress={() => onPress(item)}>
          {item.local_id && !item.remote_file_id && !item.preview_file_id && !item.thumb_file_id ? (
            <LocalAssetThumb assetId={item.local_id} style={{ width: "100%", height: "100%" }} />
          ) : (
            <TelegramImage
              fileId={item.preview_file_id ?? item.thumb_file_id ?? item.remote_file_id}
              localUri={item.local_uri}
              profileId={item.profile_id}
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: t.colors.onSurfaceVariant, padding: 24 }]}>
          No photos.
        </Text>
      }
    />
  );
}

// Per-tile lazy URI resolve for local rows (same pattern as GalleryScreen's
// LocalThumb) — MediaLibrary Asset URI resolution is per-asset bridge work.
function LocalAssetThumb({ assetId, style }: { assetId: string; style: any }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    new MediaLibrary.Asset(assetId)
      .getUri()
      .then((u) => {
        if (alive) setUri(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [assetId]);
  return (
    <Image
      source={uri ? { uri } : undefined}
      style={[style, { backgroundColor: "rgba(128,128,128,0.12)" }]}
      resizeMode="cover"
    />
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
  card: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 4,
  },
  cover: {},
  label: {
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  count: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 12,
  },
  empty: {
    fontSize: 13.5,
    textAlign: "center",
  },
});
