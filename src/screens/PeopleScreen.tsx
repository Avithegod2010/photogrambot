import React, { useEffect, useState } from "react";
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from "../rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { getPeopleClusters, getPersonPhotos, setPersonName, type PersonClusterSummary, type PhotoRow } from "../lib/db";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { EmptyAlbumArt } from "../components/illustrations";
import { isDecoyActive } from "../lib/applock";
import { Button, Dialog, TextField } from "../components/ui";

// People tab. Clusters are produced by the pluggable face-embedding provider
// (schema + clustering engine are in this build; the model is the remaining
// piece). Until the provider writes rows, this screen explains the state
// instead of showing fake people.
export function PeopleScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [clusters, setClusters] = useState<PersonClusterSummary[] | null>(null);
  const [selected, setSelected] = useState<PersonClusterSummary | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[] | null>(null);
  const [renameTarget, setRenameTarget] = useState<PersonClusterSummary | null>(null);
  const [renameName, setRenameName] = useState("");

  useEffect(() => {
    if (isDecoyActive()) {
      setClusters([]);
      return;
    }
    getPeopleClusters().then(setClusters).catch(() => setClusters([]));
  }, []);

  useEffect(() => {
    if (!selected) {
      setPhotos(null);
      return;
    }
    let alive = true;
    getPersonPhotos(selected.id)
      .then((rows) => {
        if (alive) setPhotos(rows);
      })
      .catch(() => {
        if (alive) setPhotos([]);
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  const tile = Math.floor((Dimensions.get("window").width - 8) / 2);
  const photoTile = Math.floor((Dimensions.get("window").width - 8) / 3);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (selected) setSelected(null);
            else navigation.goBack();
          }}
          style={styles.backBtn}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {selected ? selected.name ?? `Person ${selected.id}` : "People"}
          </Text>
          {!selected ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
              Long-press a person to rename
            </Text>
          ) : null}
        </View>
        {selected ? (
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
            {selected.count}
          </Text>
        ) : clusters ? (
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
            {clusters.length}
          </Text>
        ) : null}
      </View>

      {selected ? (
        <FlatList
          data={photos ?? []}
          numColumns={3}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 2, paddingBottom: 40 }}
          renderItem={({ item, index }) => {
            const thumb = resolvePhotoThumb(item);
            return (
              <Pressable
                style={{ width: photoTile, height: photoTile, padding: 1 }}
                onPress={() =>
                  navigation.navigate("Viewer", { photos: photos ?? [], index })
                }
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
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
              {photos === null ? "Loading…" : "No photos in this cluster."}
            </Text>
          }
        />
      ) : clusters === null ? (
        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Loading…</Text>
      ) : clusters.length === 0 ? (
        <View style={styles.empty}>
          <EmptyAlbumArt
            color={theme.colors.onSurfaceVariant}
            accent={theme.colors.primary}
            size={116}
          />
          <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
            No people clusters yet
          </Text>
          <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
            People clustering needs a face-embedding model. This build ships the
            clustering engine and database schema; the on-device model (or an
            opt-in cloud pass) is the remaining step. Nothing is sent anywhere
            unless you enable it.
          </Text>
        </View>
      ) : (
        <FlatList
          data={clusters}
          numColumns={2}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { width: tile, backgroundColor: theme.colors.surface }]}
              onPress={() => setSelected(item)}
              onLongPress={() => {
                setRenameTarget(item);
                setRenameName(item.name ?? "");
              }}
            >
              <TelegramImage
                fileId={item.cover_file_id}
                style={{ width: tile, height: tile, borderRadius: 14 }}
              />
              <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
                {item.name ?? `Person ${item.id}`}
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                {item.count} photo{item.count === 1 ? "" : "s"}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Dialog
        visible={!!renameTarget}
        theme={theme}
        title="Name this person"
        message="The name is stored only in your local index and travels with your backups."
      >
        <TextField
          value={renameName}
          onChangeText={setRenameName}
          placeholder="Name"
          theme={theme}
          autoCapitalize="words"
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Button title="Cancel" variant="text" theme={theme} onPress={() => setRenameTarget(null)} />
          <Button
            title="Save"
            theme={theme}
            onPress={() => {
              if (!renameTarget) return;
              const target = renameTarget;
              const name = renameName.trim() || null;
              void setPersonName(target.id, name).then(() => {
                setClusters((prev) =>
                  prev ? prev.map((c) => (c.id === target.id ? { ...c, name } : c)) : prev
                );
                setSelected((prev) => (prev && prev.id === target.id ? { ...prev, name } : prev));
                setRenameTarget(null);
              });
            }}
          />
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 4,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontWeight: "800" },
  empty: { alignItems: "center", padding: 32 },
  emptyTitle: { fontSize: 17, fontWeight: "700", marginTop: 10, textAlign: "center" },
  emptyText: { fontSize: 13.5, lineHeight: 20, textAlign: "center", padding: 12 },
  card: { borderRadius: 16, padding: 10, gap: 4 },
  cardTitle: { fontSize: 14.5, fontWeight: "700", marginTop: 4 },
});
