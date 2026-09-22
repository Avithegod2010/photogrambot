import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File } from "expo-file-system";
import { useTheme } from "../useTheme";
import { useLibraryStore } from "../store/useLibraryStore";
import { getPhotosByUploadStatus, setAlbumLocked, setFavorite, getSavedSearches, saveSearch, deleteSavedSearch, renameSavedSearch, type PhotoRow, type SavedSearchRow } from "../lib/db";
import { getChannelId } from "../lib/settings";
import { setMessageReaction } from "../lib/telegram";
import { getCachedTelegramFile } from "../lib/media";
import { tokenForPhoto } from "../lib/destinations";
import { shareMedia } from "../../modules/share-intent";
import { unlockHiddenAlbum } from "../lib/biometrics";
import { isDecoyActive } from "../lib/applock";
import { HeartIcon, TrashIcon, SearchIcon } from "../components/icons";
import { formatSearchFilterSummary } from "../lib/filterSummary";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { Dialog, Button, TextField, SectionLabel } from "../components/ui";

export function CollectionsScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { albums, favorites, trash, stats, newAlbum, removeAlbum } = useLibraryStore();
  const [tab, setTab] = useState<"albums" | "trash">("albums");
  const [newAlbumVisible, setNewAlbumVisible] = useState(false);
  const [albumName, setAlbumName] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearchRow[]>([]);
  const [renameTarget, setRenameTarget] = useState<SavedSearchRow | null>(null);
  const [renameName, setRenameName] = useState("");
  const decoy = isDecoyActive();

  useFocusEffect(
    useCallback(() => {
      if (decoy) {
        setSavedSearches([]);
        return;
      }
      getSavedSearches()
        .then(setSavedSearches)
        .catch(() => {});
    }, [decoy])
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
          <SectionLabel text="Smart collections" theme={theme} />
          <View style={styles.albumGrid}>
            <Pressable
              style={[styles.albumCard, { width: tile, height: tile * 0.8, backgroundColor: theme.colors.surface }]}
              onPress={() => navigation.navigate("Album", { albumId: -1, albumName: "Favorites" })}
              onLongPress={() => navigation.navigate("Album", { albumId: -1, albumName: "Favorites", selectMode: true })}
              disabled={decoy}
            >
              <View style={styles.albumTilePlaceholder}>
                <HeartIcon
                  color={typeof theme.colors.favorite === "string" ? theme.colors.favorite : "#FF8FA3"}
                  size={36}
                  filled={true}
                />
              </View>
              <Text style={[styles.albumName, { color: theme.colors.onSurface }]}>Favorites</Text>
              <Text style={[styles.albumCount, { color: theme.colors.onSurfaceVariant }]}>
                {visibleFavorites.length} photos
              </Text>
            </Pressable>
          </View>

          {!decoy && savedSearches.length > 0 ? (
            <View style={styles.albumGrid}>
              {savedSearches.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.albumCard, { width: tile, height: tile * 0.8, backgroundColor: theme.colors.surface }]}
                  onPress={() =>
                    navigation.navigate("SearchResults", {
                      title: s.name,
                      query: s.query,
                      filtersJson: JSON.stringify(s.filters ?? null),
                    })
                  }
                  onLongPress={() =>
                    // Android Alert renders at most 3 buttons; dismissal via
                    // cancelable backdrop, never a 4th Cancel button.
                    Alert.alert(
                      s.name,
                      undefined,
                      [
                        {
                          text: "Rename",
                          onPress: () => {
                            setRenameTarget(s);
                            setRenameName(s.name);
                          },
                        },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => {
                            void deleteSavedSearch(s.id)
                              .then(() => getSavedSearches().then(setSavedSearches))
                              .catch((e: any) =>
                                Alert.alert("Delete search", e?.message ?? "Couldn’t delete this search.")
                              );
                          },
                        },
                      ],
                      { cancelable: true }
                    )
                  }
                >
                  <View style={styles.albumTilePlaceholder}>
                    <SearchIcon color={theme.colors.primary} size={36} />
                  </View>
                  <Text style={[styles.albumName, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text style={[styles.albumCount, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                    {formatSearchFilterSummary(s.filters, s.query)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

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
                    // Long-press is the album-management menu; "Select photos"
                    // is the entry into the bulk-selection grid (tap still
                    // opens the album). Android Alert renders at most 3
                    // buttons and silently drops the rest — dismissal is
                    // cancelable:true, never a 4th Cancel button.
                    Alert.alert(
                      a.name,
                      undefined,
                      [
                        {
                          text: "Select photos",
                          onPress: () =>
                            navigation.navigate("Album", {
                              albumId: a.id,
                              albumName: a.name,
                              locked: !!a.locked,
                              selectMode: true,
                            }),
                        },
                        {
                          text: a.locked ? "Remove lock" : "Lock album",
                          onPress: () => {
                            void setAlbumLocked(a.id, !a.locked);
                            void useLibraryStore.getState().refreshMeta();
                          },
                        },
                        {
                          text: "Delete album",
                          style: "destructive",
                          onPress: () => void removeAlbum(a.id),
                        },
                      ],
                      { cancelable: true }
                    )
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

      <Dialog visible={!!renameTarget} theme={theme} title="Rename search">
        <TextField
          value={renameName}
          onChangeText={setRenameName}
          placeholder="Search name"
          theme={theme}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Button
            title="Cancel"
            theme={theme}
            variant="text"
            onPress={() => {
              setRenameTarget(null);
              setRenameName("");
            }}
          />
          <Button
            title="Rename"
            theme={theme}
            disabled={!renameName.trim()}
            onPress={async () => {
              if (!renameTarget) return;
              try {
                await renameSavedSearch(renameTarget.id, renameName);
                const rows = await getSavedSearches();
                setSavedSearches(rows);
                setRenameTarget(null);
                setRenameName("");
              } catch (e: any) {
                Alert.alert("Rename search", e?.message ?? "Couldn’t rename this search.");
              }
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
  const insets = useSafeAreaInsets();
  const { restorePhotos, deleteForever, emptyTrash } = useLibraryStore();
  const tile = Math.floor((Dimensions.get("window").width - 8) / 3);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  const clearSel = () => {
    setSelection(new Set());
    setSelectionMode(false);
  };
  const toggleSel = (id: string) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
    if (selectionMode && next.size === 0) setSelectionMode(false);
  };

  // Store actions loop single-item helpers internally and refresh() themselves;
  // the local selection must clear after the list shrinks.
  function restoreSelected() {
    const ids = Array.from(selection);
    if (ids.length === 0) return;
    void restorePhotos(ids).then(clearSel);
  }

  function deleteSelectedForever() {
    const ids = Array.from(selection);
    if (ids.length === 0) return;
    Alert.alert(
      `Delete ${ids.length} item${ids.length === 1 ? "" : "s"} forever?`,
      "This also removes them from your Telegram channel. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void deleteForever(ids).then(clearSel) },
      ]
    );
  }

  if (trash.length === 0) {
    return (
      <View style={styles.trashEmpty}>
        <TrashIcon
          color={typeof theme.colors.onSurfaceVariant === "string" ? theme.colors.onSurfaceVariant : "#C4C6D0"}
          size={52}
        />
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
            onPress={() => {
              if (selectionMode) {
                toggleSel(item.id);
                return;
              }
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
              ]);
            }}
            onLongPress={() => {
              setSelectionMode(true);
              setSelection(new Set([item.id]));
            }}
          >
            <TelegramImage
              fileId={item.preview_file_id ?? item.thumb_file_id ?? item.remote_file_id}
              localUri={item.local_uri}
              profileId={item.profile_id}
              style={{ width: "100%", height: "100%", opacity: 0.6 }}
            />
            {selection.has(item.id) ? (
              <View style={[styles.pickedOverlay, { borderColor: theme.colors.primary, backgroundColor: "rgba(0,0,0,0.45)" }]}>
                <View style={[styles.checkbox, { backgroundColor: theme.colors.primary }]}>
                  <Text style={{ color: theme.colors.onPrimary, fontSize: 11 }}>✓</Text>
                </View>
              </View>
            ) : null}
          </Pressable>
        )}
      />
      {selectionMode ? (
        // Selection bar replaces the auto-delete footer while selecting so
        // the two bottom bars never stack.
        <View
          style={[
            styles.selectionBar,
            { backgroundColor: theme.colors.surfaceContainer, paddingBottom: insets.bottom + 8 },
          ]}
        >
          <Text style={{ color: theme.colors.onSurface, fontWeight: "700", flex: 1 }} numberOfLines={1}>
            {selection.size} selected
          </Text>
          <Pressable onPress={() => setSelection(new Set(trash.map((t) => t.id)))} style={styles.selAction}>
            <Text style={{ color: theme.colors.primary }}>All</Text>
          </Pressable>
          <Pressable onPress={restoreSelected} style={styles.selAction}>
            <Text style={{ color: theme.colors.primary }}>Restore</Text>
          </Pressable>
          <Pressable onPress={deleteSelectedForever} style={styles.selAction}>
            <Text style={{ color: theme.colors.error }}>Delete</Text>
          </Pressable>
          <Pressable onPress={clearSel} style={styles.selAction}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>✕</Text>
          </Pressable>
        </View>
      ) : (
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
      )}
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
  // Entered via the Collections long-press "Select photos" action or by
  // long-pressing a tile here. Regular albums toggle selection on tap
  // regardless (existing behavior); the flag is what lets Favorites taps
  // select instead of opening the viewer.
  const [selectionMode, setSelectionMode] = useState(!!route.params?.selectMode);

  React.useEffect(() => {
    if (needsUnlock && !unlocked) {
      void unlockHiddenAlbum().then((ok) => {
        if (ok) setUnlocked(true);
        else navigation.goBack();
      });
      return;
    }
    if (isDecoyActive()) {
      setPhotos([]);
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

  const tile = Math.floor((Dimensions.get("window").width - 8) / 3);

  const clearSel = () => {
    setSelection(new Set());
    setSelectionMode(false);
  };
  const toggleSel = (id: string) => {
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
    if (selectionMode && next.size === 0) setSelectionMode(false);
  };

  const selectedItems = photos.filter((p) => selection.has(p.id));
  const allFav = selectedItems.length > 0 && selectedItems.every((p) => !!p.favorite);
  // "Back up" only makes sense for rows that exist on this device but have no
  // cloud copy — enqueueUploads skips already-uploaded/queued rows anyway.
  const backupable = selectedItems.filter(
    (p): p is PhotoRow & { local_id: string } => p.status === "local" && !!p.local_id
  );
  const barVisible = selection.size > 0 || (selectionMode && photos.length > 0);

  // Deterministic bulk favorite: mixed selections favorite everything, an
  // all-favorite selection unfavorites. One Telegram reaction + one refresh
  // per action, not per photo (toggleFavorite would refresh N times).
  async function favoriteSelected() {
    if (selectedItems.length === 0) return;
    const makeFav = !allFav;
    try {
      const channelId = await getChannelId();
      for (const p of selectedItems) {
        await setFavorite(p.id, makeFav);
        if (channelId && p.message_id) {
          const token = await tokenForPhoto(p);
          try {
            await setMessageReaction(channelId, p.message_id, makeFav ? "❤️" : null, token ?? undefined);
          } catch {
            // Reaction is cosmetic — never block the loop on it.
          }
        }
      }
      await useLibraryStore.getState().refresh();
      clearSel();
    } catch (e: any) {
      Alert.alert("Favorites failed", e?.message ?? "Could not update the selected photos.");
    }
  }

  async function shareSelected() {
    if (selectedItems.length === 0) return;
    // Android intents carrying hundreds of URIs blow the ~1 MB binder limit
    // (TransactionTooLargeException) — cap like GalleryScreen's share.
    const items = selectedItems.slice(0, 20);
    try {
      const uris: string[] = [];
      let allImages = true;
      for (const p of items) {
        if (p.local_uri && p.local_uri.startsWith("file://")) {
          try {
            if (new File(p.local_uri).exists) {
              uris.push(p.local_uri);
              if (p.mime && !p.mime.startsWith("image/")) allImages = false;
              continue;
            }
          } catch {}
        }
        const fid = p.remote_file_id ?? p.preview_file_id ?? p.thumb_file_id;
        if (!fid) continue;
        const ext = p.filename.includes(".")
          ? p.filename.split(".").pop()!.toLowerCase()
          : "jpg";
        const token = p.profile_id ? await tokenForPhoto(p) : null;
        uris.push(await getCachedTelegramFile(fid, ext, token));
        if (p.mime && !p.mime.startsWith("image/")) allImages = false;
      }
      if (uris.length === 0) {
        Alert.alert("Nothing to share", "Could not prepare the selected photos.");
        return;
      }
      shareMedia(uris, allImages ? "image/*" : "*/*");
    } catch (e: any) {
      Alert.alert("Share failed", e?.message ?? "Could not share the selection.");
    }
  }

  function trashSelected() {
    const ids = selectedItems.map((p) => p.id);
    if (ids.length === 0) return;
    Alert.alert(
      `Move ${ids.length} photo${ids.length === 1 ? "" : "s"} to trash?`,
      "You can restore them from Collections → Trash, or delete from Telegram permanently later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide locally",
          onPress: () => void useLibraryStore.getState().trashPhotos(ids, false).then(clearSel),
        },
        {
          text: "Delete from Telegram too",
          style: "destructive",
          onPress: () => void useLibraryStore.getState().trashPhotos(ids, true).then(clearSel),
        },
      ]
    );
  }

  async function backupSelected() {
    if (backupable.length === 0) return;
    try {
      const { enqueueUploads, processQueue } = await import("../lib/uploader");
      const n = await enqueueUploads(
        backupable.map((p) => ({
          local_id: p.local_id,
          filename: p.filename,
          folder: p.folder,
          size: p.size,
          width: p.width,
          height: p.height,
          taken_at: p.taken_at,
          added_at: p.added_at,
        })),
        "manual"
      );
      if (n > 0) void processQueue();
      Alert.alert(
        n > 0 ? "Back up started" : "Already backing up",
        n > 0
          ? `${n} photo${n === 1 ? "" : "s"} queued for upload to your channel.`
          : "The selected photos are already queued or backed up."
      );
      clearSel();
    } catch (e: any) {
      Alert.alert("Back up failed", e?.message ?? "Could not queue the photos.");
    }
  }

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
        {albumId !== -1 && selection.size > 0 ? (
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
                      clearSel();
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
        contentContainerStyle={{ padding: 2, paddingBottom: barVisible ? 120 : 2 }}
        renderItem={({ item }) => {
          const selected = selection.has(item.id);
          return (
            <Pressable
              style={{ width: tile, height: tile, padding: 1 }}
              onPress={() => {
                if (albumId !== -1) {
                  toggleSel(item.id);
                  return;
                }
                if (selectionMode) {
                  toggleSel(item.id);
                  return;
                }
                navigation.navigate("Viewer", { photos, index: photos.indexOf(item) });
              }}
              onLongPress={() => {
                setSelectionMode(true);
                setSelection(new Set([item.id]));
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
      {barVisible ? (
        <View
          style={[
            styles.selectionBar,
            { backgroundColor: theme.colors.surfaceContainer, paddingBottom: insets.bottom + 8 },
          ]}
        >
          <Text style={{ color: theme.colors.onSurface, fontWeight: "700", flex: 1 }} numberOfLines={1}>
            {selection.size} selected
          </Text>
          <Pressable
            onPress={() => setSelection(new Set(photos.map((p) => p.id)))}
            style={styles.selAction}
          >
            <Text style={{ color: theme.colors.primary }}>All</Text>
          </Pressable>
          <Pressable onPress={() => void favoriteSelected()} style={styles.selAction}>
            <Text style={{ color: theme.colors.primary }}>{allFav ? "Unfavorite" : "Favorite"}</Text>
          </Pressable>
          {backupable.length > 0 ? (
            <Pressable onPress={() => void backupSelected()} style={styles.selAction}>
              <Text style={{ color: theme.colors.primary }}>Back up</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => void shareSelected()} style={styles.selAction}>
            <Text style={{ color: theme.colors.primary }}>Share</Text>
          </Pressable>
          <Pressable onPress={trashSelected} style={styles.selAction}>
            <Text style={{ color: theme.colors.error }}>Trash</Text>
          </Pressable>
          <Pressable onPress={clearSel} style={styles.selAction}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>✕</Text>
          </Pressable>
        </View>
      ) : null}
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
  const listRef = useRef<FlatList<PhotoRow>>(null);
  const [trackHeight, setTrackHeight] = useState(0);
  const [scrubLabel, setScrubLabel] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const timeline = useMemo(() => {
    const markers: { index: number; label: string }[] = [];
    let previous = "";
    for (let index = 0; index < photos.length; index++) {
      const date = new Date(photos[index].taken_at || 0);
      const label = Number.isFinite(date.getTime())
        ? date.toLocaleDateString(undefined, { month: "short", year: "numeric" })
        : "Unknown date";
      if (label !== previous) {
        markers.push({ index, label });
        previous = label;
      }
    }
    return markers;
  }, [photos]);

  const scrubTo = useCallback(
    (locationY: number) => {
      if (photos.length === 0 || trackHeight <= 0) return;
      const ratio = Math.max(0, Math.min(1, locationY / trackHeight));
      const index = Math.min(photos.length - 1, Math.round(ratio * (photos.length - 1)));
      listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.45 });
      let marker = timeline[0];
      for (const candidate of timeline) {
        if (candidate.index > index) break;
        marker = candidate;
      }
      setScrubLabel(marker?.label ?? null);
    },
    [photos.length, timeline, trackHeight]
  );

  const scrubResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          setScrubbing(true);
          scrubTo(event.nativeEvent.locationY);
        },
        onPanResponderMove: (event) => scrubTo(event.nativeEvent.locationY),
        onPanResponderRelease: () => setScrubbing(false),
        onPanResponderTerminate: () => setScrubbing(false),
      }),
    [scrubTo]
  );

  useFocusEffect(
    useCallback(() => {
      if (isDecoyActive()) {
        setPhotos([]);
        setLoading(false);
        return () => {};
      }
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

  const tile = Math.floor((Dimensions.get("window").width - 8) / 3);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.subHeader, { paddingTop: insets.top + 6 }]}>
        {route.params?.tab ? null : (
          <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
          </Pressable>
        )}
        <Text style={[styles.subTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, paddingRight: 12 }}>
          {photos.length}
        </Text>
      </View>
      {loading ? null : (
        <FlatList
          ref={listRef}
          data={photos}
          numColumns={3}
          keyExtractor={(p) => p.id}
          getItemLayout={(_, index) => {
            const length = tile;
            return { length, offset: Math.floor(index / 3) * length, index };
          }}
          contentContainerStyle={{
            padding: 2,
            paddingRight: filter === "cloud" && timeline.length > 0 ? 42 : 2,
            paddingBottom: 40,
          }}
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
      {filter === "cloud" && photos.length > 0 ? (
        <View
          style={styles.timelineScrubber}
          onLayout={(event) => setTrackHeight(event.nativeEvent.layout.height)}
          {...scrubResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="Cloud timeline scrubber"
        >
          <View style={[styles.timelineRail, { backgroundColor: theme.colors.outlineVariant }]} />
          {timeline
            .filter((_, index) => timeline.length <= 8 || index % Math.ceil(timeline.length / 8) === 0)
            .map((marker) => (
              <View
                key={`${marker.index}:${marker.label}`}
                pointerEvents="none"
                style={[styles.timelineMarker, { top: `${(marker.index / Math.max(1, photos.length - 1)) * 100}%` }]}
              >
                <View style={[styles.timelineDot, { backgroundColor: theme.colors.primary }]} />
                <Text style={[styles.timelineText, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                  {marker.label}
                </Text>
              </View>
            ))}
          {scrubbing && scrubLabel ? (
            <View style={[styles.timelineBubble, { backgroundColor: theme.colors.primary }]} pointerEvents="none">
              <Text style={{ color: theme.colors.onPrimary, fontSize: 12, fontWeight: "700" }}>{scrubLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
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
  // Mirrors GalleryScreen's selection bar (absolute bottom, count + actions).
  selectionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 4,
  },
  selAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  timelineScrubber: {
    position: "absolute",
    top: 112,
    right: 0,
    bottom: 28,
    width: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineRail: {
    position: "absolute",
    top: 2,
    bottom: 2,
    width: 3,
    borderRadius: 99,
  },
  timelineMarker: {
    position: "absolute",
    left: 3,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    transform: [{ translateY: -7 }],
  },
  timelineDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  timelineText: {
    fontSize: 9,
    maxWidth: 45,
  },
  timelineBubble: {
    position: "absolute",
    right: 52,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
});
