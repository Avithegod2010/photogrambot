import React, { useEffect, useState } from "react";
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { getMonthGroups, getYearGroups, type PeriodGroup } from "../lib/db";
import { TelegramImage } from "../components/TelegramImage";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function PeriodScreen({
  mode,
  navigation,
}: {
  mode: "years" | "months";
  navigation: any;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<PeriodGroup[]>([]);

  useEffect(() => {
    (async () => {
      if (mode === "years") {
        setGroups(await getYearGroups());
      } else {
        setGroups(await getMonthGroups(null));
      }
    })();
  }, [mode]);

  const tileW = (Dimensions.get("window").width - 32 - 12) / 2;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          {mode === "years" ? "Years" : "Months"}
        </Text>
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
            onPress={() => {
              if (mode === "years") {
                navigation.navigate("MonthsOfYear", { year: parseInt(item.key, 10) });
              } else {
                navigation.navigate("PeriodPhotos", {
                  title: item.label,
                  startMs: item.startMs,
                  endMs: item.endMs,
                });
              }
            }}
          >
            <View style={[styles.cover, { width: tileW, height: tileW * 0.72 }]}>
              <TelegramImage
                fileId={item.cover_preview_id ?? item.cover_file_id}
                style={{ width: tileW, height: tileW * 0.72 }}
              />
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
            Nothing here yet.
          </Text>
        }
      />
    </View>
  );
}

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
    getMonthGroups(year).then(setGroups);
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
              <TelegramImage
                fileId={item.cover_preview_id ?? item.cover_file_id}
                style={{ width: tileW, height: tileW * 0.72 }}
              />
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
    import("../lib/db")
      .then(({ getPhotosInRange }) => getPhotosInRange(startMs, endMs))
      .then(setPhotos)
      .finally(() => setLoading(false));
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
          onPress={(p) => navigation.navigate("Viewer", { photos, index: photos.indexOf(p) })}
        />
      )}
    </View>
  );
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
          <TelegramImage
            fileId={item.preview_file_id ?? item.thumb_file_id ?? item.remote_file_id}
            localUri={item.local_uri}
            profileId={item.profile_id}
            style={{ width: "100%", height: "100%" }}
          />
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
