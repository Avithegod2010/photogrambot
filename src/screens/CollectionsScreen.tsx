import React, { useCallback, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useLibraryStore } from "../store/useLibraryStore";
import { getLibraryCounts, getPhotosByUploadStatus, setAlbumLocked, type PhotoRow } from "../lib/db";
import { unlockHiddenAlbum } from "../lib/biometrics";
import { isDecoyActive } from "../lib/applock";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { Dialog, Button, TextField, SectionLabel } from "../components/ui";

export function CollectionsScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { albums, favorites, trash, stats, newAlbum, removeAlbum } = useLibraryStore();
  const [tab, setTab] = useState<"albums" | "trash">("albums");
  const [newAlbumVisible, setNewAlbumVisible] = useState(false);
  const [albumName, setAlbumName] = useState("");
  const [counts, setCounts] = useState({ local: 0, cloud: 0 });
  const decoy = isDecoyActive();

  useFocusEffect(
    useCallback(() => {
      if (isDecoyActive()) {
        setCounts({ local: 0, cloud: 0 });
        return;
      }
      void getLibraryCounts().then(setCounts);
    }, [])
  );

  const tile = (Dimensions.get("window").width - 32 - 12) / 2;
  const visibleAlbums = decoy ? [] : albums;
  const visibleFavorites = decoy ? [] : favorites;
  const visibleTrash = decoy ? [] : trash;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Collections</Text>
        {tab === "albums" ? (
          <Pressable onPress={() => setNewAlbumVisible(true)} style={styles.addBtn}>
            <Text style={{ color: theme.colors.primary, fontWeight: "700", fontSize: 18 }}>＋</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.tabs, { backgroundColor: theme.colors.surfaceContainer }]}>
        {(["albums", "trash"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[
              styles.tabBtn,
              tab === t && { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Text
              style={{
                color: tab === t ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
                fontWeight: tab === t ? "700" : "500",
                fontSize: 13,
              }}
            >
              {t === "albums" ? `Albums · ${visibleAlbums.length}` : `Trash · ${visibleTrash.length}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "albums" ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <SectionLabel text="Library" theme={theme} />
          <View style={styles.albumGrid}>
            <Pressable
              style={[styles.albumCard, { width: tile, height: tile * 0.8, backgroundColor: theme.colors.surface }]}
              onPress={() => navigation.navigate("Library", { filter: "local", title: "Local" })}
            >
              <View style={styles.albumTilePlaceholder}>
                <Text style={{ fontSize: 30 }}>📱</Text>
              </View>
              <Text style={[styles.albumName, { color: theme.colors.onSurface }]}>Local</Text>
              <Text style={[styles.albumCount, { color: theme.colors.onSurfaceVariant }]}>
                {counts.local} not backed up
              </Text>
            </Pressable>
            <Pressable
              style={[styles.albumCard, { width: tile, height: tile * 0.8, backgroundColor: theme.colors.surface }]}
              onPress={() => navigation.navigate("Library", { filter: "cloud", title: "Cloud" })}
            >
              <View style={styles.albumTilePlaceholder}>
                <Text style={{ fontSize: 30 }}>☁</Text>
              </View>
              <Text style={[styles.albumName, { color: theme.colors.onSurface }]}>Cloud</Text>
              <Text style={[styles.albumCount, { color: theme.colors.onSurfaceVariant }]}>
                {counts.cloud} backed up
              </Text>
            </Pressable>
          </View>

          <SectionLabel text="Smart collections" theme={theme} />
          <View style={styles.albumGrid}>
            <Pressable
              style={[styles.albumCard, { width: tile, height: tile * 0.8, backgroundColor: theme.colors.surface }]}
              onPress={() => navigation.navigate("Album", { albumId: -1, albumName: "Favorites" })}
            >
              <View style={styles.albumTilePlaceholder}>
                <Text style={{ fontSize: 30 }}>♥</Text>
              </View>
              <Text style={[styles.albumName, { color: theme.colors.onSurface }]}>Favorites</Text>
              <Text style={[styles.albumCount, { color: theme.colors.onSurfaceVariant }]}>
                {visibleFavorites.length} photos
              </Text>
            </Pressable>
          </View>

          <SectionLabel text="Your albums" theme={theme} />
          {visibleAlbums.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
              No albums yet. Tap ＋ to create one and organize your backed-up photos.
            </Text>
          ) : (
            <View style={styles.albumGrid}>
              {visibleAlbums.map((a) => (
                <Pressable
                  key={a.id}
                  style={[styles.albumCard, { width: tile, height: tile * 0.8, backgroundColor: theme.colors.surface }]}
                  onPress={() => navigation.navigate("Album", { albumId: a.id, albumName: a.name, locked: !!a.locked })}
                  onLongPress={() =>
                    Alert.alert(a.name, undefined, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: a.locked ? "Remove lock" : "Lock album",
                        onPress: async () => {
                          await setAlbumLocked(a.id, !a.locked);
                          await useLibraryStore.getState().refreshMeta();
                        },
                      },
                      {
                        text: "Delete album",
                        style: "destructive",
                        onPress: () => void removeAlbum(a.id),
                      },
                    ])
                  }
                >
                  <View style={styles.albumTilePlaceholder}>
                    <TelegramImage
                      fileId={a.cover_preview_id ?? a.cover_file_id}
                      style={{ width: tile, height: tile * 0.8 }}
                    />
                  </View>
              <Text style={[styles.albumName, { color: theme.colors.onSurface }]} numberOfLines={1}>
                {a.locked ? "🔒 " : ""}
                {a.name}
              </Text>
                  <Text style={[styles.albumCount, { color: theme.colors.onSurfaceVariant }]}>
                    {a.count} photos
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : (
        <TrashTab navigation={navigation} theme={theme} trash={visibleTrash} />
      )}

      <Dialog visible={newAlbumVisible} theme={theme} title="New album">
        <TextField
          value={albumName}
          onChangeText={setAlbumName}
          placeholder="Album name"
          theme={theme}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Button
            title="Cancel"
            theme={theme}
            variant="text"
            onPress={() => {
              setAlbumName("");
              setNewAlbumVisible(false);
            }}
          />
          <Button
            title="Create"
            theme={theme}
            disabled={!albumName.trim()}
            onPress={async () => {
              await newAlbum(albumName.trim());
              setAlbumName("");
              setNewAlbumVisible(false);
            }}
          />
        </View>
      </Dialog>
    </View>
  );
}

function TrashTab({
  navigation,
  theme,
  trash,
}: {
  navigation: any;
  theme: ReturnType<typeof useTheme>;
  trash: ReturnType<typeof useLibraryStore.getState>["trash"];
}) {
  const { restorePhotos, deleteForever, emptyTrash } = useLibraryStore();
  const tile = (Dimensions.get("window").width - 4) / 3;

  if (trash.length === 0) {
    return (
      <View style={styles.trashEmpty}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🗑</Text>
        <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>Trash is empty</Text>
        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
          Trashed photos are hidden here for 30 days before being permanently removed.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={trash}
        numColumns={3}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 2, paddingBottom: 120 }}
        renderItem={({ item }) => (
          <Pressable
            style={{ width: tile, height: tile, padding: 1 }}
            onPress={() =>
              Alert.alert(item.filename, "Restore this photo or delete it forever?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: item.remote_deleted ? "Remove from trash" : "Restore",
                  onPress: () => void restorePhotos([item.id]),
                },
                {
                  text: "Delete forever",
                  style: "destructive",
                  onPress: () => void deleteForever([item.id]),
                },
              ])
            }
          >
            <TelegramImage
              fileId={item.preview_file_id ?? item.thumb_file_id ?? item.remote_file_id}
              localUri={item.local_uri}
              profileId={item.profile_id}
              style={{ width: "100%", height: "100%", opacity: 0.6 }}
            />
          </Pressable>
        )}
      />
      <View style={[styles.trashFooter, { backgroundColor: theme.colors.surfaceContainer }]}>
        <Text style={{ color: theme.colors.onSurfaceVariant, flex: 1, fontSize: 12 }}>
          Items auto-delete after 30 days
        </Text>
        <Button
          title="Empty trash"
          variant="danger"
          theme={theme}
          onPress={() =>
            Alert.alert("Empty trash?", "All trashed photos will be permanently deleted.", [
              { text: "Cancel", style: "cancel" },
              { text: "Empty", style: "destructive", onPress: () => void emptyTrash() },
            ])
          }
        />
      </View>
    </View>
  );
}

export function AlbumScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const albumId: number = route.params?.albumId ?? -1;
  const albumName: string = route.params?.albumName ?? "Album";
  const needsUnlock: boolean = !!route.params?.locked && albumId !== -1;
  const [unlocked, setUnlocked] = useState(!needsUnlock);
  const { favorites, addPhotosToAlbum, removePhotosFromAlbum } = useLibraryStore();
  const [photos, setPhotos] = React.useState<any[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (needsUnlock && !unlocked) {
      void unlockHiddenAlbum().then((ok) => {
        if (ok) setUnlocked(true);
        else navigation.goBack();
      });
      return;
    }
    (async () => {
      if (albumId === -1) {
        setPhotos(favorites);
      } else {
        const list = await useLibraryStore.getState().loadAlbumPhotos(albumId);
        setPhotos(list);
      }
    })();
  }, [albumId, favorites, unlocked, needsUnlock]);

  const tile = (Dimensions.get("window").width - 4) / 3;

  if (!unlocked) {
    return <View style={[styles.container, { backgroundColor: theme.colors.background }]} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: 0 }]}>
      <View style={[styles.subHeader, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.subTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
          {albumName}
        </Text>
        {selection.size > 0 ? (
          <Pressable
            onPress={() => {
              const ids = Array.from(selection);
              Alert.alert(
                `Remove ${ids.length} from album?`,
                undefined,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                      await removePhotosFromAlbum(albumId, ids);
                      setSelection(new Set());
                    },
                  },
                ]
              );
            }}
          >
            <Text style={{ color: theme.colors.error, fontWeight: "600" }}>
              Remove ({selection.size})
            </Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={photos}
        numColumns={3}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 2 }}
        renderItem={({ item }) => {
          const selected = selection.has(item.id);
          return (
            <Pressable
              style={{ width: tile, height: tile, padding: 1 }}
              onPress={() => {
                if (albumId === -1) {
                  navigation.navigate("Viewer", { photos, index: photos.indexOf(item) });
                  return;
                }
                const next = new Set(selection);
                if (next.has(item.id)) next.delete(item.id);
                else next.add(item.id);
                setSelection(next);
              }}
            >
              <TelegramImage
                fileId={item.preview_file_id ?? item.thumb_file_id ?? item.remote_file_id}
                localUri={item.local_uri}
                profileId={item.profile_id}
                style={{ width: "100%", height: "100%" }}
              />
              {selected ? (
                <View style={[styles.pickedOverlay, { borderColor: theme.colors.primary }]}>
                  <View style={[styles.checkbox, { backgroundColor: theme.colors.primary }]}>
                    <Text style={{ color: theme.colors.onPrimary, fontSize: 11 }}>✓</Text>
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant, padding: 24 }]}>
            {albumId === -1
              ? "Tap ♥ on any photo to add it here."
              : "No photos in this album yet. Select photos in the gallery, then use the album menu."}
          </Text>
        }
      />
    </View>
  );
}

export function LibraryScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const filter: "local" | "cloud" = route.params?.filter === "cloud" ? "cloud" : "local";
  const title: string = route.params?.title ?? (filter === "cloud" ? "Cloud" : "Local");
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      void getPhotosByUploadStatus(filter === "cloud" ? "uploaded" : "local").then((rows) => {
        if (!alive) return;
        setPhotos(rows);
        setLoading(false);
      });
      return () => {
        alive = false;
      };
    }, [filter])
  );

  const tile = (Dimensions.get("window").width - 4) / 3;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.subHeader, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.subTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, paddingRight: 12 }}>
          {photos.length}
        </Text>
      </View>
      {loading ? null : (
        <FlatList
          data={photos}
          numColumns={3}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 2, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const thumb = resolvePhotoThumb(item);
            return (
              <Pressable
                style={{ width: tile, height: tile, padding: 1 }}
                onPress={() =>
                  navigation.navigate("Viewer", { photos, index: photos.indexOf(item) })
                }
              >
                <TelegramImage
                  fileId={thumb.fileId}
                  localUri={thumb.localUri}
                  profileId={item.profile_id}
                  style={{ width: "100%", height: "100%" }}
                />
                {item.status === "uploaded" ? (
                  <View
                    style={[styles.cloudBadge, { backgroundColor: theme.colors.primaryContainer }]}
                  >
                    <Text
                      style={{
                        color: theme.colors.onPrimaryContainer,
                        fontSize: 9,
                        fontWeight: "800",
                        lineHeight: 11,
                      }}
                    >
                      ✓
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant, padding: 24 }]}>
              {filter === "cloud"
                ? "Nothing backed up yet. Tap ＋ in the gallery to start."
                : "All caught up — every photo here is backed up to your channel."}
            </Text>
          }
        />
      )}
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
  },
  addBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 999,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 60,
  },
  albumGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  albumCard: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 4,
  },
  albumTilePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  albumName: {
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  albumCount: {
    fontSize: 12,
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 10,
  },
  emptyText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  trashEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  trashFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  subTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  pickedOverlay: {
    ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    borderWidth: 2,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    padding: 3,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  cloudBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 15,
    height: 15,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
