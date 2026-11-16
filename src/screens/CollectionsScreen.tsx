import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "../rn";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File } from "expo-file-system";
import { useTheme } from "../useTheme";
import { useT } from "../useT";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useLibraryStore } from "../store/useLibraryStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { ACCENT_PRESETS, albumAccent, isHexColor } from "../lib/appearance";
import { hasRuleConditions } from "../lib/albumRules";
import { getPhotosByUploadStatus, setAlbumLocked, setAlbumCover, setFavorite, getSavedSearches, saveSearch, deleteSavedSearch, renameSavedSearch, syncTripAlbums, reorderAlbums, type AlbumWithCover, type PhotoRow, type SavedSearchRow } from "../lib/db";
import { getChannelId } from "../lib/settings";
import { setMessageReaction } from "../lib/telegram";
import { getCachedTelegramFile } from "../lib/media";
import { tokenForPhoto } from "../lib/destinations";
import { shareMedia } from "../../modules/share-intent";
import { unlockHiddenAlbum } from "../lib/biometrics";
import { restorePhotosToDevice } from "../lib/restore";
import { shareTripStory } from "../lib/story";
import { isDecoyActive } from "../lib/applock";
import { HeartIcon, TrashIcon, SearchIcon } from "../components/icons";
import { EmptyAlbumArt, EmptyTrashArt } from "../components/illustrations";
import { formatSearchFilterSummary } from "../lib/filterSummary";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import {
  AppBar,
  Badge,
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  IconButton,
  ListRow,
  Section,
  SectionLabel,
  SegmentedControl,
  Sheet,
  TextField,
} from "../components/ui";
import { MoreVerticalIcon, PlayIcon, SparkleIcon, StackIcon } from "../components/icons";
import { useResponsive } from "../lib/responsive";
import { radius, spacing, touchTarget, typography, overlay, fallback } from "../theme";
export function CollectionsScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const { albums, favorites, trash, stats, newAlbum, removeAlbum } = useLibraryStore();
  const [tab, setTab] = useState<"albums" | "trash">("albums");
  const [newAlbumVisible, setNewAlbumVisible] = useState(false);
  const [albumName, setAlbumName] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearchRow[]>([]);
  const [renameTarget, setRenameTarget] = useState<SavedSearchRow | null>(null);
  const [renameName, setRenameName] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [albumMenu, setAlbumMenu] = useState<AlbumWithCover | null>(null);
  const [searchMenu, setSearchMenu] = useState<SavedSearchRow | null>(null);
  const albumAccents = useSettingsStore((s) => s.prefs.albumAccents);
  const decoyAlbumNames = useSettingsStore((s) => s.prefs.decoyAlbumNames);
  const decoy = isDecoyActive();

  useFocusEffect(
    useCallback(() => {
      if (decoy) {
        setSavedSearches([]);
        return;
      }
      void syncTripAlbums()
        .then(() => useLibraryStore.getState().refreshMeta())
        .catch(() => {});
      getSavedSearches()
        .then(setSavedSearches)
        .catch(() => {});
    }, [decoy])
  );

  // Responsive album grid: 2 columns on phones, 3 on tablets/foldables,
  // 4 on wide DeX/tablet landscape. No Dimensions.get — rotation must reflow.
  const { width } = useResponsive();
  const gridColumns = width >= 1000 ? 4 : width >= 720 ? 3 : 2;
  const gridGap = spacing.md;
  const tile = Math.floor((width - spacing.lg * 2 - gridGap * (gridColumns - 1)) / gridColumns);
  const albumCardHeight = Math.round(tile * 0.78);
  // Decoy mode shows only the configured fake album names, never real data.
  const visibleAlbums = useMemo(
    () =>
      decoy
        ? decoyAlbumNames.map((name, i) => ({
            id: -1000 - i,
            name,
            created_at: 0,
            locked: 0,
            query: null,
            cover_photo_id: null,
            count: 0,
            cover_file_id: null,
            cover_preview_id: null,
            covers: [] as string[],
          }))
        : albums,
    [decoy, decoyAlbumNames, albums]
  );
  const visibleTripAlbums = useMemo(
    () => visibleAlbums.filter((album) => !!album.query),
    [visibleAlbums]
  );
  const visibleManualAlbums = useMemo(
    () => visibleAlbums.filter((album) => !album.query),
    [visibleAlbums]
  );
  const visibleFavorites = decoy ? [] : favorites;
  const visibleTrash = decoy ? [] : trash;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AppBar
        title="Collections"
        subtitle={`${visibleAlbums.length} albums · ${visibleFavorites.length} favorites`}
        theme={theme}
        borderless
        right={
          tab === "albums" ? (
            <IconButton
              icon={<Text style={{ color: theme.colors.onSurface, fontSize: 26, lineHeight: 28 }}>＋</Text>}
              label="Create album"
              theme={theme}
              onPress={() => setNewAlbumVisible(true)}
            />
          ) : (
            <View style={{ width: touchTarget }} />
          )
        }
      />

      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
        <SegmentedControl
          accessibilityLabel="Collections sections"
          options={[
            { key: "albums", label: `Albums · ${visibleAlbums.length}` },
            { key: "trash", label: `Trash · ${visibleTrash.length}` },
          ]}
          value={tab}
          onChange={setTab}
          theme={theme}
        />
      </View>

      {tab === "albums" ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <SectionLabel text={tr("collections.smart")} theme={theme} />
          <View style={styles.albumGrid}>
            <Pressable
              style={[styles.albumCard, { width: tile, height: albumCardHeight, backgroundColor: theme.colors.surface }]}
              onPress={() => navigation.navigate("Album", { albumId: -1, albumName: "Favorites" })}
              onLongPress={() => navigation.navigate("Album", { albumId: -1, albumName: "Favorites", selectMode: true })}
              disabled={decoy}
            >
              <View style={styles.albumTilePlaceholder}>
                <HeartIcon
                  color={typeof theme.colors.favorite === "string" ? theme.colors.favorite : fallback.favorite}
                  size={36}
                  filled={true}
                />
              </View>
              <Text style={[styles.albumName, { color: theme.colors.onSurface }]}>{tr("common.favorites")}</Text>
              <Text style={[styles.albumCount, { color: theme.colors.onSurfaceVariant }]}>
                {visibleFavorites.length} photo{visibleFavorites.length === 1 ? "" : "s"}
              </Text>
            </Pressable>
          </View>

          {!decoy && savedSearches.length > 0 ? (
            <View style={styles.albumGrid}>
              {savedSearches.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.albumCard, { width: tile, height: albumCardHeight, backgroundColor: theme.colors.surface }]}
                  onPress={() =>
                    navigation.navigate("SearchResults", {
                      title: s.name,
                      query: s.query,
                      filtersJson: JSON.stringify(s.filters ?? null),
                    })
                  }
                  onLongPress={() => setSearchMenu(s)}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.name}, saved search. ${formatSearchFilterSummary(s.filters, s.query)}`}
                  accessibilityHint="Opens the saved search. Long-press for rename or delete."
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

          {visibleTripAlbums.length > 0 ? (
            <>
              <SectionLabel text={tr("collections.trips")} theme={theme} />
              <View style={styles.albumGrid}>
                {visibleTripAlbums.map((a) => (
                  <Pressable
                    key={a.id}
                    style={[
                      styles.albumCard,
                      { width: tile, height: albumCardHeight, backgroundColor: theme.colors.surface },
                      isHexColor(albumAccent(albumAccents, a.id, "")) && {
                        borderWidth: 2,
                        borderColor: albumAccent(albumAccents, a.id, ""),
                      },
                    ]}
                    onPress={() => navigation.navigate("Album", { albumId: a.id, albumName: a.name, isTrip: true })}
                    onLongPress={() => setAlbumMenu(a)}
                    accessibilityRole="button"
                    accessibilityLabel={`${a.name}, trip with ${a.count} photo${a.count === 1 ? "" : "s"}`}
                    accessibilityHint="Long-press for album actions."
                  >
                    <View style={styles.albumTilePlaceholder}>
                      <AlbumCoverMosaic
                        covers={a.covers}
                        fallbackFileId={a.cover_preview_id ?? a.cover_file_id}
                        width={tile}
                        height={albumCardHeight}
                      />
                    </View>
                    <Text style={[styles.albumName, { color: theme.colors.onSurface }]} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={[styles.albumCount, { color: theme.colors.onSurfaceVariant }]}>
                      {a.count} photo{a.count === 1 ? "" : "s"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingRight: 16,
            }}
          >
            <SectionLabel text={tr("collections.yourAlbums")} theme={theme} />
            {!decoy && visibleManualAlbums.length > 1 ? (
              <Pressable onPress={() => setReorderMode((v) => !v)} hitSlop={8}>
                <Text style={{ color: theme.colors.primary, fontWeight: "600", fontSize: 12.5 }}>
                  {reorderMode ? "Done" : "Reorder"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {reorderMode ? (
            <ReorderAlbumList
              albums={visibleManualAlbums}
              theme={theme}
              onCommit={(ids) => {
                void reorderAlbums(ids).then(() => useLibraryStore.getState().refreshMeta());
              }}
            />
          ) : visibleManualAlbums.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
              No albums yet. Tap ＋ to create one and organize your backed-up photos.
            </Text>
          ) : (
            <View style={styles.albumGrid}>
              {visibleManualAlbums.map((a) => (
                <Pressable
                  key={a.id}
                  style={[
                    styles.albumCard,
                    { width: tile, height: albumCardHeight, backgroundColor: theme.colors.surface },
                    isHexColor(albumAccent(albumAccents, a.id, "")) && {
                      borderWidth: 2,
                      borderColor: albumAccent(albumAccents, a.id, ""),
                    },
                  ]}
                  onPress={() => navigation.navigate("Album", { albumId: a.id, albumName: a.name, locked: !!a.locked })}
                  onLongPress={() => {
                    // Decoy albums are display-only: no management menu.
                    if (decoy) return;
                    setAlbumMenu(a);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.name}, album with ${a.count} photo${a.count === 1 ? "" : "s"}${a.locked ? ", locked" : ""}`}
                  accessibilityHint="Long-press for album actions."
                >
                  <View style={styles.albumTilePlaceholder}>
                    <AlbumCoverMosaic
                      covers={a.covers}
                      fallbackFileId={a.cover_preview_id ?? a.cover_file_id}
                      width={tile}
                      height={albumCardHeight}
                    />
                  </View>
              <Text style={[styles.albumName, { color: theme.colors.onSurface }]} numberOfLines={1}>
                {a.locked ? "🔒 " : ""}
                {a.name}
              </Text>
                  <Text style={[styles.albumCount, { color: theme.colors.onSurfaceVariant }]}>
                    {a.count} photo{a.count === 1 ? "" : "s"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <SectionLabel text="Explore" theme={theme} />
          <View style={[styles.group, { backgroundColor: theme.colors.surface }]}>
            <ListRow
              title="Best of the last year"
              subtitle="Favorites, sharpness and size — up to 60 shots"
              leading={<SparkleIcon color={theme.colors.primary} size={22} />}
              theme={theme}
              showChevron
              onPress={() => navigation.navigate("BestOf")}
            />
            <ListRow
              title="Play a slideshow"
              subtitle="Full-screen auto-advance through backed-up photos"
              leading={<PlayIcon color={theme.colors.primary} size={22} />}
              theme={theme}
              showChevron
              onPress={() => {
                if (decoy) return;
                navigation.navigate("Slideshow", { title: "Slideshow" });
              }}
            />
            <ListRow
              title="Ask your photos"
              subtitle="Chat with your library — answers cite the photos (Gemini)"
              leading={<SearchIcon color={theme.colors.primary} size={22} />}
              theme={theme}
              showChevron
              onPress={() => navigation.navigate("Ask")}
            />
            <ListRow
              title="People"
              subtitle="Face clusters — the embedding model is the remaining step"
              leading={<StackIcon color={theme.colors.primary} size={22} />}
              theme={theme}
              showChevron
              onPress={() => navigation.navigate("People")}
            />
          </View>

          <View style={{ height: spacing.xxl }} />
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

      <Sheet
        visible={!!albumMenu}
        theme={theme}
        title={albumMenu?.name ?? ""}
        subtitle={
          albumMenu
            ? `${albumMenu.count} photo${albumMenu.count === 1 ? "" : "s"}${
                albumMenu.query ? " · grouped by time and place" : ""
              }`
            : undefined
        }
        onClose={() => setAlbumMenu(null)}
      >
        {albumMenu ? (
          <View>
            <ListRow
              title="Select photos"
              subtitle="Pick several photos to share, move or delete"
              theme={theme}
              showChevron
              onPress={() => {
                const a = albumMenu;
                setAlbumMenu(null);
                navigation.navigate("Album", {
                  albumId: a.id,
                  albumName: a.name,
                  isTrip: !!a.query,
                  locked: !!a.locked,
                  selectMode: true,
                });
              }}
            />
            {!albumMenu.query ? (
              <>
                <ListRow
                  title={albumMenu.locked ? "Remove lock" : "Lock album"}
                  subtitle={
                    albumMenu.locked
                      ? "Anyone opening this app can see the album again"
                      : "Require biometrics or PIN to open"
                  }
                  theme={theme}
                  showChevron
                  onPress={() => {
                    const a = albumMenu;
                    setAlbumMenu(null);
                    void setAlbumLocked(a.id, !a.locked);
                    void useLibraryStore.getState().refreshMeta();
                  }}
                />
                <ListRow
                  title="Delete album"
                  subtitle="The photos stay in your library"
                  theme={theme}
                  destructive
                  onPress={() => {
                    const a = albumMenu;
                    setAlbumMenu(null);
                    void removeAlbum(a.id);
                  }}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet
        visible={!!searchMenu}
        theme={theme}
        title={searchMenu?.name ?? ""}
        subtitle="Saved search"
        onClose={() => setSearchMenu(null)}
      >
        {searchMenu ? (
          <View>
            <ListRow
              title="Rename"
              theme={theme}
              showChevron
              onPress={() => {
                const s = searchMenu;
                setSearchMenu(null);
                setRenameTarget(s);
                setRenameName(s.name);
              }}
            />
            <ListRow
              title="Delete search"
              subtitle="Removes the shortcut, not the photos"
              theme={theme}
              destructive
              onPress={() => {
                const s = searchMenu;
                setSearchMenu(null);
                void deleteSavedSearch(s.id)
                  .then(() => getSavedSearches().then(setSavedSearches))
                  .catch((e: any) =>
                    Alert.alert("Delete search", e?.message ?? "Couldn’t delete this search.")
                  );
              }}
            />
          </View>
        ) : null}
      </Sheet>
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
  const { width } = useResponsive();
  const columns = width >= 1000 ? 6 : width >= 720 ? 4 : 3;
  const tile = Math.floor((width - spacing.seam * (columns - 1)) / columns);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [menuItem, setMenuItem] = useState<(typeof trash)[number] | null>(null);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

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
    setConfirmIds(ids);
  }

  if (trash.length === 0) {
    return (
      <View style={styles.trashEmpty}>
        <EmptyState
          theme={theme}
          art={<EmptyTrashArt color={theme.colors.onSurfaceVariant} accent={theme.colors.primary} size={112} />}
          title="Trash is empty"
          message="Trashed photos wait here for 30 days before they are permanently removed."
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        key={columns}
        data={trash}
        numColumns={columns}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        renderItem={({ item }) => (
          <Pressable
            style={{ width: tile, height: tile, padding: spacing.seam / 2 }}
            onPress={() => {
              if (selectionMode) {
                toggleSel(item.id);
                return;
              }
              setMenuItem(item);
            }}
            onLongPress={() => {
              setSelectionMode(true);
              setSelection(new Set([item.id]));
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: selection.has(item.id) }}
            accessibilityLabel={`${item.filename}, in trash`}
            accessibilityHint="Tap for restore or delete. Long-press to select several."
          >
            <TelegramImage
              fileId={item.preview_file_id ?? item.thumb_file_id ?? item.remote_file_id}
              localUri={item.local_uri}
              profileId={item.profile_id}
              style={{ width: "100%", height: "100%", opacity: 0.62, borderRadius: radius.thumb }}
            />
            {selection.has(item.id) ? (
              <View
                style={[
                  styles.pickedOverlay,
                  { borderColor: theme.colors.primary, backgroundColor: overlay.mediaScrim },
                ]}
              >
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
            {
              backgroundColor: theme.colors.surfaceContainer,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          <Text
            style={[typography.bodyStrong, { color: theme.colors.onSurface, flex: 1 }]}
            numberOfLines={1}
            accessibilityLiveRegion="polite"
          >
            {selection.size} selected
          </Text>
          <Pressable
            onPress={() => setSelection(new Set(trash.map((t) => t.id)))}
            style={styles.selAction}
            accessibilityRole="button"
            accessibilityLabel="Select all"
          >
            <Text style={{ color: theme.colors.primary }}>All</Text>
          </Pressable>
          <Pressable
            onPress={restoreSelected}
            style={styles.selAction}
            accessibilityRole="button"
            accessibilityLabel="Restore selected"
          >
            <Text style={{ color: theme.colors.primary }}>Restore</Text>
          </Pressable>
          <Pressable
            onPress={deleteSelectedForever}
            style={styles.selAction}
            accessibilityRole="button"
            accessibilityLabel="Delete selected forever"
          >
            <Text style={{ color: theme.colors.error }}>Delete</Text>
          </Pressable>
          <Pressable
            onPress={clearSel}
            style={styles.selAction}
            accessibilityRole="button"
            accessibilityLabel="Cancel selection"
          >
            <Text style={{ color: theme.colors.onSurfaceVariant }}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.trashFooter, { backgroundColor: theme.colors.surfaceContainer }]}>
          <Text style={[typography.caption, { color: theme.colors.onSurfaceVariant, flex: 1 }]}>
            Items auto-delete after 30 days
          </Text>
          <Button
            title="Empty trash"
            variant="danger"
            theme={theme}
            onPress={() => setConfirmEmpty(true)}
          />
        </View>
      )}

      <Sheet
        visible={!!menuItem}
        theme={theme}
        title={menuItem?.filename ?? ""}
        subtitle="In trash"
        onClose={() => setMenuItem(null)}
      >
        {menuItem ? (
          <View>
            <ListRow
              title={menuItem.remote_deleted ? "Remove from trash" : "Restore"}
              subtitle="Bring it back to your gallery"
              theme={theme}
              showChevron
              onPress={() => {
                const id = menuItem.id;
                setMenuItem(null);
                void restorePhotos([id]);
              }}
            />
            <ListRow
              title="Delete forever"
              subtitle="Also removes it from your Telegram channel"
              theme={theme}
              destructive
              onPress={() => {
                const id = menuItem.id;
                setMenuItem(null);
                setConfirmIds([id]);
              }}
            />
          </View>
        ) : null}
      </Sheet>

      <Dialog
        visible={!!confirmIds}
        theme={theme}
        title={`Delete ${confirmIds?.length ?? 0} item${(confirmIds?.length ?? 0) === 1 ? "" : "s"} forever?`}
        message="This also removes them from your Telegram channel. This cannot be undone."
        onClose={() => setConfirmIds(null)}
        actions={[
          { label: "Cancel", onPress: () => setConfirmIds(null), variant: "text" },
          {
            label: "Delete forever",
            variant: "danger",
            onPress: () => {
              const ids = confirmIds ?? [];
              setConfirmIds(null);
              void deleteForever(ids).then(clearSel);
            },
          },
        ]}
      />

      <Dialog
        visible={confirmEmpty}
        theme={theme}
        title="Empty trash?"
        message="All trashed photos will be permanently deleted."
        onClose={() => setConfirmEmpty(false)}
        actions={[
          { label: "Cancel", onPress: () => setConfirmEmpty(false), variant: "text" },
          {
            label: "Empty trash",
            variant: "danger",
            onPress: () => {
              setConfirmEmpty(false);
              void emptyTrash();
            },
          },
        ]}
      />
    </View>
  );
}

export function AlbumScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const albumId: number = route.params?.albumId ?? -1;
  const albumName: string = route.params?.albumName ?? "Album";
  // Generated trip albums derive membership from albums.query and are rebuilt
  // by syncTripAlbums, so per-photo removal does not apply to them.
  const isTrip: boolean = !!route.params?.isTrip && albumId !== -1;
  const needsUnlock: boolean = !!route.params?.locked && albumId !== -1;
  const [unlocked, setUnlocked] = useState(!needsUnlock);
  const { favorites, albums, addPhotosToAlbum, removePhotosFromAlbum } = useLibraryStore();
  const prefs = useSettingsStore((s) => s.prefs);
  const updatePrefs = useSettingsStore((s) => s.update);
  const [styleDialog, setStyleDialog] = useState(false);
  const [ruleFolder, setRuleFolder] = useState("");
  const [ruleTag, setRuleTag] = useState("");
  const [ruleFavorite, setRuleFavorite] = useState(false);
  const [photos, setPhotos] = React.useState<any[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  // Entered via the Collections long-press "Select photos" action or by
  // long-pressing a tile here. Regular albums toggle selection on tap
  // regardless (existing behavior); the flag is what lets Favorites taps
  // select instead of opening the viewer.
  const [selectionMode, setSelectionMode] = useState(!!route.params?.selectMode);
  const [coverNote, setCoverNote] = useState<string | null>(null);

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

  const { width: viewportWidth } = useResponsive();
  const albumColumns = viewportWidth >= 1000 ? 5 : viewportWidth >= 720 ? 4 : 3;
  const tile = Math.floor((viewportWidth - spacing.seam * (albumColumns - 1)) / albumColumns);
  const [albumActionsVisible, setAlbumActionsVisible] = useState(false);
  const [photoMenu, setPhotoMenu] = useState<any | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

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
  // Current curated cover for this album, if any (F11) — lets the single-select
  // action toggle to "Remove cover".
  const currentCover = albums.find((a) => a.id === albumId)?.cover_photo_id ?? null;
  const selectedId = selection.size === 1 ? Array.from(selection)[0] : null;
  const albumTint = albumAccent(
    prefs.albumAccents,
    albumId,
    typeof theme.colors.primary === "string" ? theme.colors.primary : fallback.primary
  );
  const hasCustomTint = isHexColor(prefs.albumAccents?.[String(albumId)]);

  // Curate an album/trip cover from a single selected photo (F11). Shown in
  // the header briefly; Collections reloads albums on focus so the grid tile
  // picks up the new cover on back.
  async function applyCover() {
    if (albumId === -1 || selection.size !== 1) return;
    const photoId = Array.from(selection)[0];
    const clearing = photoId === currentCover;
    try {
      await setAlbumCover(albumId, clearing ? null : photoId);
      setCoverNote(clearing ? "Default cover restored" : "Cover updated");
      setTimeout(() => setCoverNote(null), 2000);
      clearSel();
    } catch (e: any) {
      setCoverNote(e?.message ?? "Could not set cover");
    }
  }

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

  // Album-scoped restore: fill the gaps in THIS album/favorites/trip list.
  // Rows still on the phone are skipped by the restore loop itself.
  const restoreTargets = photos.filter(
    (p) => p.status === "uploaded" && (p.remote_file_id || p.parts)
  );
  const [restoringAll, setRestoringAll] = React.useState<string | null>(null);

  // Trip story (#4): post a text summary of this trip to the channel — no
  // new photo uploads, just the digest-style summary post.
  const [sharingStory, setSharingStory] = useState(false);

  async function shareStory() {
    if (sharingStory || isTrip !== true) return;
    setSharingStory(true);
    try {
      await shareTripStory(albumName, photos.filter((p) => p.status === "uploaded"));
      Alert.alert("Story shared", `A summary of "${albumName}" was posted to your channel.`);
    } catch (e: any) {
      Alert.alert("Share failed", e?.message ?? "Could not post the story.");
    } finally {
      setSharingStory(false);
    }
  }

  function restoreAll() {
    if (restoreTargets.length === 0) return;
    Alert.alert(
      `Restore ${restoreTargets.length} to device?`,
      "Photos already on this phone are skipped. Large videos reassemble from parts and may take a while.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", onPress: () => void runRestoreAll(restoreTargets) },
      ]
    );
  }

  async function runRestoreAll(targets: PhotoRow[]) {
    setRestoringAll("Starting…");
    try {
      const r = await restorePhotosToDevice(targets, (p) =>
        setRestoringAll(p.currentFile ? `${p.done}/${p.total} — ${p.currentFile}` : null)
      );
      Alert.alert(
        "Restore finished",
        `${r.saved} saved · ${r.skipped} already on device · ${r.failed} failed.`
      );
    } catch (e: any) {
      Alert.alert("Restore failed", e?.message ?? "Unknown error");
    } finally {
      setRestoringAll(null);
    }
  }

  if (!unlocked) {
    return <View style={[styles.container, { backgroundColor: theme.colors.background }]} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: 0 }]}>
      <View
        style={[
          styles.subHeader,
          { paddingTop: insets.top + 6 },
          hasCustomTint && { borderBottomWidth: 3, borderBottomColor: albumTint },
        ]}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Back" accessibilityRole="button">
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.subTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
          {albumName}
        </Text>
        {albumId !== -1 && !isDecoyActive() ? (
          <Pressable
            onPress={() => {
              const rule = prefs.albumRules?.[String(albumId)];
              setRuleFolder(rule?.folder ?? "");
              setRuleTag(rule?.tag ?? "");
              setRuleFavorite(!!rule?.favorite);
              setStyleDialog(true);
            }}
            hitSlop={10}
            style={{ marginStart: 8 }}
            accessibilityLabel="Album style"
            accessibilityRole="button"
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: albumTint,
                borderWidth: 1,
                borderColor: theme.colors.outline,
              }}
            />
          </Pressable>
        ) : null}
        {coverNote ? (
          <Text style={{ color: theme.colors.primary, fontWeight: "600", marginStart: 10 }} numberOfLines={1}>
            {coverNote}
          </Text>
        ) : null}
        {!isDecoyActive() && restoringAll ? (
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }} numberOfLines={1}>
            {restoringAll}
          </Text>
        ) : (
          <>
            {!isDecoyActive() && restoreTargets.length > 0 ? (
              <Pressable onPress={restoreAll} hitSlop={6}>
                <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>Restore all</Text>
              </Pressable>
            ) : null}
            {!isDecoyActive() && photos.length > 0 ? (
              <Pressable
                onPress={() =>
                  navigation.navigate("Slideshow", { photos, title: albumName })
                }
                hitSlop={6}
                style={{ marginStart: 14 }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>Play</Text>
              </Pressable>
            ) : null}
            {isTrip && !isDecoyActive() && restoreTargets.length > 0 ? (
              <Pressable
                onPress={() => void shareStory()}
                hitSlop={6}
                disabled={sharingStory}
                style={{ marginStart: 14 }}
              >
                <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>
                  {sharingStory ? "Sharing…" : "Story"}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
        {albumId !== -1 && !isTrip && selection.size > 0 ? (
          <Pressable
            onPress={() => setConfirmRemove(true)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${selection.size} selected photos from this album`}
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
              accessibilityRole="button"
              accessibilityLabel={`Photo${item.favorite ? ", favorite" : ""}`}
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
                if (albumId !== -1 && !isTrip) {
                  setPhotoMenu(item);
                  return;
                }
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
          <View style={{ alignItems: "center", padding: 24 }}>
            <EmptyAlbumArt
              color={theme.colors.onSurfaceVariant}
              accent={theme.colors.primary}
              size={104}
            />
            <Text
              style={[
                styles.emptyText,
                { color: theme.colors.onSurfaceVariant, padding: 12, textAlign: "center" },
              ]}
            >
              {albumId === -1
                ? "Tap ♥ on any photo to add it here."
                : "No photos in this album yet. Select photos in the gallery, then use the album menu."}
            </Text>
          </View>
        }
      />

      <Dialog
        visible={styleDialog}
        theme={theme}
        title="Album style"
        message="Pick an accent for this album, or reset its cover to the newest photo."
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          {ACCENT_PRESETS.map((preset) => {
            const current = prefs.albumAccents?.[String(albumId)];
            const selected =
              preset.key === "default" ? !hasCustomTint : !!preset.color && current === preset.color;
            return (
              <Pressable
                key={preset.key}
                onPress={() => {
                  const next = { ...(prefs.albumAccents ?? {}) };
                  if (preset.key === "default" || !preset.color) delete next[String(albumId)];
                  else next[String(albumId)] = preset.color;
                  void updatePrefs({ albumAccents: next });
                }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: preset.color ?? theme.colors.surfaceHighest,
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? theme.colors.onSurface : theme.colors.outline,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                accessibilityLabel={`${preset.label} accent`}
                accessibilityRole="button"
              >
                {preset.key === "default" ? (
                  <Text style={{ fontSize: 9, color: theme.colors.onSurfaceVariant }}>Auto</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <View
          style={{
            height: 1,
            backgroundColor: theme.colors.outlineVariant,
            marginVertical: 16,
          }}
        />
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
          Auto-add rule
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 18, marginBottom: 8 }}>
          New photos matching all conditions are added to this album after a scan.
          Leave a field empty to ignore it.
        </Text>
        <TextField
          value={ruleFolder}
          onChangeText={setRuleFolder}
          placeholder="Folder contains…"
          theme={theme}
        />
        <TextField
          value={ruleTag}
          onChangeText={setRuleTag}
          placeholder="Tag contains… (e.g. receipt)"
          theme={theme}
          style={{ marginTop: 8 }}
        />
        <Pressable
          onPress={() => setRuleFavorite((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
            paddingVertical: 4,
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ruleFavorite }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              borderWidth: 1,
              borderColor: ruleFavorite ? theme.colors.primary : theme.colors.outline,
              backgroundColor: ruleFavorite ? theme.colors.primaryContainer : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {ruleFavorite ? (
              <Text style={{ color: theme.colors.onPrimaryContainer, fontSize: 12 }}>✓</Text>
            ) : null}
          </View>
          <Text style={{ color: theme.colors.onSurface, fontSize: 13.5 }}>
            Favorites only
          </Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Button
            title="Save rule"
            variant="outlined"
            theme={theme}
            onPress={() => {
              const next = { ...(prefs.albumRules ?? {}) };
              const rule = {
                folder: ruleFolder.trim() || undefined,
                tag: ruleTag.trim() || undefined,
                favorite: ruleFavorite || undefined,
              };
              if (hasRuleConditions(rule)) next[String(albumId)] = rule;
              else delete next[String(albumId)];
              void updatePrefs({ albumRules: next }).then(() => {
                setCoverNote("Auto-add rule saved");
                void import("../lib/albumRulesApply").then((m) =>
                  m.applyAlbumRules().then((r) => {
                    if (r.added > 0) setCoverNote(`Rule applied: ${r.added} photos added`);
                  })
                );
              });
            }}
          />
          <Button
            title="Clear rule"
            variant="text"
            theme={theme}
            onPress={() => {
              const next = { ...(prefs.albumRules ?? {}) };
              delete next[String(albumId)];
              void updatePrefs({ albumRules: next }).then(() => {
                setRuleFolder("");
                setRuleTag("");
                setRuleFavorite(false);
                setCoverNote("Auto-add rule cleared");
              });
            }}
          />
        </View>

        {albumId !== -1 && !isTrip ? (
          <Button
            title="Reset cover to newest"
            variant="outlined"
            theme={theme}
            style={{ marginTop: 16 }}
            onPress={() => {
              void setAlbumCover(albumId, null).then(() => {
                setCoverNote("Default cover restored");
                setStyleDialog(false);
                void useLibraryStore.getState().refreshMeta();
              });
            }}
          />
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16 }}>
          <Button title="Done" variant="text" theme={theme} onPress={() => setStyleDialog(false)} />
        </View>
      </Dialog>

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
          <Pressable
            onPress={() => {
              const next = new Set<string>();
              for (const p of photos) if (!selection.has(p.id)) next.add(p.id);
              setSelection(next);
            }}
            style={styles.selAction}
          >
            <Text style={{ color: theme.colors.primary }}>Invert</Text>
          </Pressable>
          {selection.size === 2 ? (
            (() => {
              const pair = photos.filter((p) => selection.has(p.id));
              if (pair.length !== 2) return null;
              return (
                <Pressable
                  onPress={() => navigation.navigate("Compare", { left: pair[0], right: pair[1] })}
                  style={styles.selAction}
                >
                  <Text style={{ color: theme.colors.primary }}>{tr("viewer.compare")}</Text>
                </Pressable>
              );
            })()
          ) : null}
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
          {albumId !== -1 && selectedId ? (
            <Pressable onPress={() => void applyCover()} style={styles.selAction}>
              <Text style={{ color: theme.colors.primary }}>
                {selectedId === currentCover ? "Remove cover" : "Set cover"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={trashSelected} style={styles.selAction}>
            <Text style={{ color: theme.colors.error }}>Trash</Text>
          </Pressable>
          <Pressable onPress={clearSel} style={styles.selAction}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      <Sheet
        visible={!!photoMenu}
        theme={theme}
        title={photoMenu?.filename ?? "Photo"}
        onClose={() => setPhotoMenu(null)}
      >
        {photoMenu ? (
          <View>
            <ListRow
              title="Open"
              theme={theme}
              showChevron
              onPress={() => {
                const item = photoMenu;
                setPhotoMenu(null);
                navigation.navigate("Viewer", { photos, index: photos.indexOf(item) });
              }}
            />
            <ListRow
              title="Set as album cover"
              theme={theme}
              showChevron
              onPress={() => {
                const item = photoMenu;
                setPhotoMenu(null);
                void setAlbumCover(albumId, item.id).then(() => {
                  setCoverNote("Cover updated");
                  void useLibraryStore.getState().refreshMeta();
                });
              }}
            />
            <ListRow
              title="Select photos"
              subtitle="Switch to the selection bar"
              theme={theme}
              showChevron
              onPress={() => {
                const item = photoMenu;
                setPhotoMenu(null);
                setSelectionMode(true);
                setSelection(new Set([item.id]));
              }}
            />
          </View>
        ) : null}
      </Sheet>

      <Dialog
        visible={confirmRemove}
        theme={theme}
        title={`Remove ${selection.size} photo${selection.size === 1 ? "" : "s"} from this album?`}
        message="The photos stay in your library and in your channel."
        onClose={() => setConfirmRemove(false)}
        actions={[
          { label: "Cancel", onPress: () => setConfirmRemove(false), variant: "text" },
          {
            label: "Remove from album",
            variant: "danger",
            onPress: async () => {
              const ids = Array.from(selection);
              setConfirmRemove(false);
              await removePhotosFromAlbum(albumId, ids);
              clearSel();
            },
          },
        ]}
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

  const { width: libraryWidth } = useResponsive();
  const libraryColumns = libraryWidth >= 1000 ? 6 : libraryWidth >= 720 ? 5 : 3;
  const tile = Math.floor((libraryWidth - spacing.seam * (libraryColumns - 1)) / libraryColumns);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.subHeader, { paddingTop: insets.top + 6 }]}>
        {route.params?.tab ? null : (
          <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Back" accessibilityRole="button">
            <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
          </Pressable>
        )}
        <Text
          accessibilityRole="header"
          style={[styles.subTitle, { color: theme.colors.onSurface }]}
          numberOfLines={1}
        >
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
          numColumns={libraryColumns}
          key={libraryColumns}
          keyExtractor={(p) => p.id}
          getItemLayout={(_, index) => {
            const length = tile;
            return { length, offset: Math.floor(index / libraryColumns) * length, index };
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
                style={{ width: tile, height: tile, padding: spacing.seam / 2 }}
                onPress={() =>
                  navigation.navigate("Viewer", { photos, index: photos.indexOf(item) })
                }
                accessibilityRole="button"
                accessibilityLabel={`${item.filename}${item.status === "uploaded" ? ", backed up" : ""}`}
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
            <EmptyState
              theme={theme}
              art={<EmptyAlbumArt color={theme.colors.onSurfaceVariant} accent={theme.colors.primary} size={104} />}
              title={filter === "cloud" ? "Nothing backed up yet" : "All caught up"}
              message={
                filter === "cloud"
                  ? "Turn on Auto sync in Settings, or share photos to PhotogramBot from any app."
                  : "Every photo on this phone is backed up to your channel."
              }
              actionLabel={filter === "cloud" && !isDecoyActive() ? "Open backup settings" : undefined}
              onAction={
                filter === "cloud" && !isDecoyActive()
                  ? () => navigation.navigate("Settings")
                  : undefined
              }
            />
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
    gap: spacing.md,
  },
  group: {
    marginBottom: spacing.sm,
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
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
    minHeight: touchTarget,
  },
  subTitle: {
    ...typography.title,
    flex: 1,
  },
  iconBtn: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
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

// 2x2 album cover mosaic: up to four newest member previews. Falls back to a
// single cover when fewer than two previews are available.
function AlbumCoverMosaic({
  covers,
  fallbackFileId,
  width,
  height,
}: {
  covers: string[] | undefined;
  fallbackFileId: string | null;
  width: number;
  height: number;
}) {
  if (!covers || covers.length < 2) {
    return <TelegramImage fileId={fallbackFileId} style={{ width, height }} />;
  }
  const items = covers.slice(0, 4);
  return (
    <View style={{ width, height, flexDirection: "row", flexWrap: "wrap" }}>
      {items.map((fileId, i) => (
        <TelegramImage
          key={`${fileId}-${i}`}
          fileId={fileId}
          style={{ width: width / 2, height: height / 2 }}
        />
      ))}
      {items.length < 4
        ? Array.from({ length: 4 - items.length }).map((_, i) => (
            <View
              key={`empty-${i}`}
              style={{ width: width / 2, height: height / 2, backgroundColor: "rgba(128,128,128,0.12)" }}
            />
          ))
        : null}
    </View>
  );
}

const REORDER_ROW_HEIGHT = 54;

function ReorderAlbumList({
  albums,
  theme,
  onCommit,
}: {
  albums: AlbumWithCover[];
  theme: ReturnType<typeof useTheme>;
  onCommit: (ids: number[]) => void;
}) {
  const [items, setItems] = useState(albums);
  useEffect(() => setItems(albums), [albums]);

  const move = useCallback(
    (from: number, to: number) => {
      setItems((prev) => {
        if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onCommit(next.map((a) => a.id));
        return next;
      });
    },
    [onCommit]
  );

  return (
    <View style={{ marginHorizontal: 16 }}>
      {items.map((album, index) => (
        <ReorderRow
          key={album.id}
          index={index}
          count={items.length}
          label={album.name}
          theme={theme}
          onMove={move}
        />
      ))}
      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginTop: 8 }}>
        Drag a row by its handle to change the order.
      </Text>
    </View>
  );
}

function ReorderRow({
  index,
  count,
  label,
  theme,
  onMove,
}: {
  index: number;
  count: number;
  label: string;
  theme: ReturnType<typeof useTheme>;
  onMove: (from: number, to: number) => void;
}) {
  const translateY = useSharedValue(0);
  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const delta = Math.round(e.translationY / REORDER_ROW_HEIGHT);
      translateY.value = withSpring(0, { duration: 300, dampingRatio: 0.8 });
      const target = Math.max(0, Math.min(count - 1, index + delta));
      if (target !== index) runOnJS(onMove)(index, target);
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    zIndex: translateY.value === 0 ? 0 : 20,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            height: REORDER_ROW_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 14,
            marginBottom: 6,
            borderRadius: 12,
            backgroundColor: theme.colors.surface,
          },
          style,
        ]}
      >
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 18 }}>☰</Text>
        <Text style={{ color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>{index + 1}</Text>
      </Animated.View>
    </GestureDetector>
  );
}
