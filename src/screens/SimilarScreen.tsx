import React, { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { getAllPhashPairs, getJpegRowsForPhash, type PhotoRow } from "../lib/db";
import { computePhotoPhash } from "../lib/maintenance";
import { hammingHex } from "../lib/phash";
import { isDecoyActive } from "../lib/applock";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";

const HASH_RE = /^[0-9a-f]{16}$/i;
const SIMILAR_THRESHOLD = 12;

export function SimilarScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const photo: PhotoRow | null = route.params?.photo ?? null;
  const [similar, setSimilar] = useState<PhotoRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isDecoyActive() || !photo) {
      setSimilar([]);
      return;
    }
    let alive = true;
    void (async () => {
      const targetHash = HASH_RE.test(photo.phash ?? "")
        ? photo.phash!
        : await computePhotoPhash(photo);
      if (!alive) return;
      if (!targetHash || !HASH_RE.test(targetHash)) {
        setSimilar([]);
        setMessage("This item has no readable JPEG thumbnail yet. Run Maintenance → Find near-duplicates to build the visual index.");
        return;
      }
      try {
        const [rows, pairs] = await Promise.all([getJpegRowsForPhash(), getAllPhashPairs()]);
        const matches = rows
          .filter((row) => row.id !== photo.id)
          .map((row) => {
            const hash = pairs.get(row.id) ?? row.phash;
            return { row, distance: hash && HASH_RE.test(hash) ? hammingHex(targetHash, hash) : 64 };
          })
          .filter((item) => item.distance <= SIMILAR_THRESHOLD)
          .sort((a, b) => a.distance - b.distance || b.row.taken_at - a.row.taken_at)
          .slice(0, 60)
          .map((item) => item.row);
        if (alive) {
          setSimilar(matches);
          setMessage(
            matches.length > 0
              ? null
              : pairs.size === 0
                ? "Run Maintenance → Find near-duplicates to build the visual index first."
                : "No visually similar photos found yet."
          );
        }
      } catch {
        if (alive) {
          setSimilar([]);
          setMessage("Couldn’t load similar photos.");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [photo]);

  const allPhotos = photo ? [photo, ...(similar ?? [])] : [];
  const tile = Math.floor((Dimensions.get("window").width - 8) / 3);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.onSurface }]} numberOfLines={1}>
          Similar photos
        </Text>
        {similar ? <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>{similar.length}</Text> : null}
      </View>
      {similar === null ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={theme.colors.primary} />
      ) : message && similar.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>{message}</Text>
      ) : (
        <FlatList
          data={similar}
          numColumns={3}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 2, paddingBottom: 40 }}
          renderItem={({ item, index }) => {
            const thumb = resolvePhotoThumb(item);
            return (
              <Pressable
                style={{ width: tile, height: tile, padding: 1 }}
                onPress={() => navigation.navigate("Viewer", { photos: allPhotos, index: index + 1 })}
              >
                <TelegramImage
                  fileId={thumb.fileId}
                  localUri={thumb.localUri}
                  profileId={item.profile_id}
                  style={{ width: "100%", height: "100%" }}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>No visually similar photos found yet.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontWeight: "800" },
  empty: { fontSize: 13.5, textAlign: "center", padding: 24, lineHeight: 20 },
});
