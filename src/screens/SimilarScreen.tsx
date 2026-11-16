import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "../rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { getAllPhashPairs, getJpegRowsForPhash, type PhotoRow } from "../lib/db";
import { computePhotoPhash } from "../lib/maintenance";
import { hammingHex } from "../lib/phash";
import { isDecoyActive } from "../lib/applock";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { EmptySearchArt } from "../components/illustrations";
import { AppBar, EmptyState } from "../components/ui";
import { useResponsive } from "../lib/responsive";
import { spacing } from "../theme";

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
  const { width } = useResponsive();
  const columns = width >= 1000 ? 6 : width >= 720 ? 5 : 3;
  const tile = Math.floor((width - spacing.seam * (columns - 1)) / columns);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AppBar
        title="Similar photos"
        subtitle={similar ? `${similar.length} match${similar.length === 1 ? "" : "es"}` : undefined}
        onBack={() => navigation.goBack()}
        theme={theme}
        borderless
      />
      {similar === null ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={theme.colors.primary} />
      ) : message && similar.length === 0 ? (
        <EmptyState
          theme={theme}
          art={<EmptySearchArt color={theme.colors.onSurfaceVariant} accent={theme.colors.primary} size={104} />}
          title="No similar photos"
          message={message}
          actionLabel="Back to photo"
          onAction={() => navigation.goBack()}
        />
      ) : (
        <FlatList
          data={similar}
          numColumns={columns}
          key={columns}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item, index }) => {
            const thumb = resolvePhotoThumb(item);
            return (
              <Pressable
                style={{ width: tile, height: tile, padding: spacing.seam / 2 }}
                onPress={() => navigation.navigate("Viewer", { photos: allPhotos, index: index + 1 })}
                accessibilityRole="button"
                accessibilityLabel={item.filename}
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
            <View style={{ alignItems: "center", padding: 24 }}>
              <EmptySearchArt
                color={theme.colors.onSurfaceVariant}
                accent={theme.colors.primary}
                size={104}
              />
              <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
                No visually similar photos found yet.
              </Text>
            </View>
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
