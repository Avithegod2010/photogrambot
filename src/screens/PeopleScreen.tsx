import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "../rn";
import { useTheme } from "../useTheme";
import { getPeopleClusters, getPersonPhotos, setPersonName, type PersonClusterSummary, type PhotoRow } from "../lib/db";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { EmptyAlbumArt } from "../components/illustrations";
import { isDecoyActive } from "../lib/applock";
import { AppBar, Button, Dialog, EmptyState, TextField } from "../components/ui";
import { useResponsive } from "../lib/responsive";
import { radius, spacing, typography } from "../theme";

// People tab. Clusters are produced by the pluggable face-embedding provider
// (schema + clustering engine are in this build; the model is the remaining
// piece). Until the provider writes rows, this screen explains the state
// instead of showing fake people.
export function PeopleScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
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

  const { width } = useResponsive();
  const clusterColumns = width >= 1000 ? 4 : width >= 720 ? 3 : 2;
  const tile = Math.floor(
    (width - spacing.lg * 2 - spacing.md * (clusterColumns - 1)) / clusterColumns
  );
  const photoColumns = width >= 1000 ? 6 : width >= 720 ? 5 : 3;
  const photoTile = Math.floor((width - spacing.seam * (photoColumns - 1)) / photoColumns);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AppBar
        title={selected ? selected.name ?? `Person ${selected.id}` : "People"}
        subtitle={
          selected
            ? `${selected.count} photo${selected.count === 1 ? "" : "s"}`
            : "Long-press a person to rename"
        }
        onBack={() => {
          if (selected) setSelected(null);
          else navigation.goBack();
        }}
        theme={theme}
        borderless
      />

      {selected ? (
        <FlatList
          data={photos ?? []}
          numColumns={photoColumns}
          key={photoColumns}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item, index }) => {
            const thumb = resolvePhotoThumb(item);
            return (
              <Pressable
                style={{ width: photoTile, height: photoTile, padding: spacing.seam / 2 }}
                onPress={() => navigation.navigate("Viewer", { photos: photos ?? [], index })}
                accessibilityRole="button"
                accessibilityLabel={item.filename}
              >
                <TelegramImage
                  fileId={thumb.fileId}
                  localUri={thumb.localUri}
                  profileId={item.profile_id}
                  style={{ width: "100%", height: "100%", borderRadius: radius.thumb }}
                />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            photos === null ? (
              <ActivityIndicator style={{ marginTop: 60 }} color={theme.colors.primary} />
            ) : (
              <EmptyState
                theme={theme}
                title="No photos in this cluster"
                message="This person's photos may have been moved or trashed."
              />
            )
          }
        />
      ) : clusters === null ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={theme.colors.primary} />
      ) : clusters.length === 0 ? (
        <EmptyState
          theme={theme}
          art={<EmptyAlbumArt color={theme.colors.onSurfaceVariant} accent={theme.colors.primary} size={116} />}
          title="No people clusters yet"
          message="People clustering needs a face-embedding model. This build ships the clustering engine and database schema; the on-device model is the remaining step. Nothing is sent anywhere unless you enable it."
          actionLabel="Back to collections"
          onAction={() => navigation.goBack()}
        />
      ) : (
        <FlatList
          data={clusters}
          numColumns={clusterColumns}
          key={clusterColumns}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
          columnWrapperStyle={{ gap: spacing.md }}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.card, { width: tile, backgroundColor: theme.colors.surface }]}
              onPress={() => setSelected(item)}
              onLongPress={() => {
                setRenameTarget(item);
                setRenameName(item.name ?? "");
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.name ?? `Person ${item.id}`}, ${item.count} photo${item.count === 1 ? "" : "s"}`}
              accessibilityHint="Long-press to rename"
            >
              <TelegramImage
                fileId={item.cover_file_id}
                style={{ width: tile - spacing.xs * 2, height: tile - spacing.xs * 2, borderRadius: radius.control }}
              />
              <Text style={[typography.bodyStrong, { color: theme.colors.onSurface }]} numberOfLines={1}>
                {item.name ?? `Person ${item.id}`}
              </Text>
              <Text style={[typography.caption, { color: theme.colors.onSurfaceVariant }]}>
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
        onClose={() => setRenameTarget(null)}
      >
        <TextField
          value={renameName}
          onChangeText={setRenameName}
          placeholder="Name"
          label="Name"
          theme={theme}
          autoCapitalize="words"
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.lg }}>
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
  card: { borderRadius: radius.card, padding: spacing.xs, gap: spacing.xs },
});
