import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLibraryStore } from "../store/useLibraryStore";
import { useSetupStore } from "../store/useSetupStore";
import { useUploadStore } from "../store/useUploadStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useTheme } from "../useTheme";
import { groupPhotosByDate, formatBytes, formatDuration, isVideoMime } from "../lib/format";
import { getUploadedLocalIds } from "../lib/db";
import { enqueueUploads, processQueue } from "../lib/uploader";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { MemoriesCarousel } from "../components/MemoriesCarousel";
import { Button, Dialog, TextField } from "../components/ui";
import type { PeriodGroup } from "../lib/db";
import type { PhotoRow } from "../lib/db";

const ABS_FILL: any = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 };

const COLUMNS = 3;

export function GalleryScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { photos, loading, loadingMore, hasMore, loadInitial, loadMore, refresh, refreshMeta, stats } =
    useLibraryStore();
  const { channelId, channelTitle } = useSetupStore();
  const { progress, start, cancel, subscribe } = useUploadStore();

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PhotoRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [albumDialogVisible, setAlbumDialogVisible] = useState(false);
  const [viewMode, setViewMode] = useState<"days" | "months" | "years">("days");
  const { albums, newAlbum, addPhotosToAlbum } = useLibraryStore();
  const staggered = useSettingsStore((s) => s.prefs.staggeredGrid);
  const [newAlbumName, setNewAlbumName] = useState("");

  useEffect(() => {
    void loadInitial();
    return subscribe();
  }, []);

  const sections = useMemo(() => {
    const source = searchResults ?? photos;
    return groupPhotosByDate(source).map((g) => ({
      label: g.label,
      data: g.items,
    }));
  }, [photos, searchResults]);

  const tile = (Dimensions.get("window").width - 4) / COLUMNS;

  const onTilePress = useCallback(
    (photo: PhotoRow, index: number) => {
      if (selectionMode) {
        const next = new Set(selection);
        if (next.has(photo.id)) next.delete(photo.id);
        else next.add(photo.id);
        setSelection(next);
        if (next.size === 0) setSelectionMode(false);
      } else {
        const flat = searchResults ?? photos;
        const idx = flat.findIndex((p) => p.id === photo.id);
        navigation.navigate("Viewer", { photos: flat, index: idx });
      }
    },
    [selectionMode, selection, photos, searchResults, navigation]
  );

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function runSearch(q: string) {
    setSearch(q);
    if (q.trim().length === 0) {
      setSearchResults(null);
      return;
    }
    const results = await useLibraryStore.getState().search(q);
    setSearchResults(results);
  }

  async function trashSelected() {
    const ids = Array.from(selection);
    Alert.alert(
      `Move ${ids.length} photo${ids.length === 1 ? "" : "s"} to trash?`,
      "You can restore them from Collections → Trash, or delete from Telegram permanently later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hide locally",
          onPress: async () => {
            await useLibraryStore.getState().trashPhotos(ids, false);
            setSelection(new Set());
            setSelectionMode(false);
          },
        },
        {
          text: "Delete from Telegram too",
          style: "destructive",
          onPress: async () => {
            await useLibraryStore.getState().trashPhotos(ids, true);
            setSelection(new Set());
            setSelectionMode(false);
          },
        },
      ]
    );
  }

  function renderTile(photo: PhotoRow, width?: number, height?: number) {
    const thumb = resolvePhotoThumb(photo);
    const selected = selection.has(photo.id);
    const w = width ?? tile;
    const h = height ?? tile;
    return (
      <Pressable onPress={() => onTilePress(photo, 0)} onLongPress={() => {
        setSelectionMode(true);
        setSelection(new Set([photo.id]));
      }} style={{ width: w, height: h }}>
        <TelegramImage
          fileId={thumb.fileId}
          localUri={thumb.localUri}
          style={{ width: w, height: h }}
        />
        {photo.favorite ? (
          <View style={[styles.favBadge, { backgroundColor: theme.colors.scrim }]}>
            <Text style={styles.favIcon}>♥</Text>
          </View>
        ) : null}
        {isVideoMime(photo.mime) || (photo.duration ?? 0) > 0 ? (
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>
              ▶ {formatDuration(photo.duration)}
            </Text>
          </View>
        ) : null}
        {photo.status === "failed" || photo.status === "skipped_too_large" ? (
          <View style={[styles.favBadge, { backgroundColor: theme.colors.errorContainer }]}>
            <Text style={{ color: theme.colors.error, fontSize: 11, fontWeight: "800" }}>!</Text>
          </View>
        ) : null}
        {photo.status === "uploaded" ? (
          <View style={[styles.cloudBadge, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[styles.cloudBadgeText, { color: theme.colors.onPrimaryContainer }]}>✓</Text>
          </View>
        ) : null}
        {selected ? (
          <View
            style={[
              styles.selectedOverlay,
              { backgroundColor: "rgba(0,0,0,0.45)", borderColor: theme.colors.primary },
            ]}
          >
            <View style={[styles.checkbox, { backgroundColor: theme.colors.primary }]}>
              <Text style={{ color: theme.colors.onPrimary, fontSize: 12, fontWeight: "800" }}>
                ✓
              </Text>
            </View>
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.appTitle, { color: theme.colors.onSurface }]}>PhotogramBot</Text>
          {channelTitle ? (
            <View
              style={[
                styles.channelChip,
                { backgroundColor: theme.colors.surfaceHighest },
              ]}
            >
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                {channelTitle}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={() => navigation.navigate("Map")}
          style={styles.gear}
          accessibilityLabel="Map view"
        >
          <Text style={{ fontSize: 18, color: theme.colors.onSurface }}>◉</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate("SettingsTab")} style={styles.gear}>
          <Text style={{ fontSize: 20, color: theme.colors.onSurface }}>⚙</Text>
        </Pressable>
      </View>

      <View style={styles.viewSwitchRow}>
        <View style={[styles.viewSwitch, { backgroundColor: theme.colors.surfaceContainer }]}>
          {(["days", "months", "years"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setViewMode(m)}
              style={[
                styles.viewSwitchBtn,
                viewMode === m && { backgroundColor: theme.colors.primaryContainer },
              ]}
            >
              <Text
                style={{
                  color:
                    viewMode === m
                      ? theme.colors.onPrimaryContainer
                      : theme.colors.onSurfaceVariant,
                  fontWeight: viewMode === m ? "700" : "500",
                  fontSize: 12,
                  textTransform: "capitalize",
                }}
              >
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.searchBar, { backgroundColor: theme.colors.surfaceContainer }]}>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>⌕</Text>
        <TextInput
          placeholder="Search photos"
          placeholderTextColor={theme.colors.onSurfaceVariant}
          value={search}
          onChangeText={runSearch}
          style={[styles.searchInput, { color: theme.colors.onSurface }]}
          selectionColor={theme.colors.primary}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => runSearch("")}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {progress.running ? (
        <Pressable
          style={[styles.progressBanner, { backgroundColor: theme.colors.primaryContainer }]}
          onPress={cancel}
        >
          <ActivityIndicator size="small" color={theme.colors.onPrimaryContainer} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ color: theme.colors.onPrimaryContainer, fontWeight: "600", fontSize: 13 }}>
              Backing up {progress.current}/{progress.total}
              {progress.percent !== null ? ` — ${progress.percent}%` : ""}
            </Text>
            <Text style={{ color: theme.colors.onPrimaryContainer, fontSize: 11 }} numberOfLines={1}>
              {progress.currentFile ?? "Preparing…"} — tap to cancel
            </Text>
          </View>
        </Pressable>
      ) : null}

      {searchResults && searchResults.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>No results for “{search}”</Text>
        </View>
      ) : viewMode !== "days" ? (
        <PeriodJumpList
          mode={viewMode}
          navigation={navigation}
          theme={theme}
        />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.label}
          onEndReached={() => {
            if (!searchResults) void loadMore();
          }}
          onEndReachedThreshold={0.6}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={
            !searchResults ? (
              <View>
                <OverviewCard theme={theme} stats={stats} />
                <MemoriesCarousel navigation={navigation} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View>
              <Text style={[styles.dateHeader, { color: theme.colors.onSurfaceVariant }]}>
                {item.label}
              </Text>
              <SectionGrid
                photos={item.data}
                staggered={staggered && !searchResults}
                renderTile={renderTile}
              />
            </View>
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={{ marginTop: 60 }} color={theme.colors.primary} />
            ) : (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
                  No photos yet
                </Text>
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                  Tap + to back up photos from this device to your channel.
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={theme.colors.primary} />
            ) : null
          }
        />
      )}

      {selectionMode ? (
        <View
          style={[
            styles.selectionBar,
            { backgroundColor: theme.colors.surfaceContainer, paddingBottom: insets.bottom + 8 },
          ]}
        >
          <Text style={{ color: theme.colors.onSurface, fontWeight: "700", flex: 1 }}>
            {selection.size} selected
          </Text>
          <Pressable
            onPress={() => useLibraryStore.getState().selectAll((searchResults ?? photos).map((p) => p.id))}
            style={styles.selAction}
          >
            <Text style={{ color: theme.colors.primary }}>All</Text>
          </Pressable>
          <Pressable onPress={() => setAlbumDialogVisible(true)} style={styles.selAction}>
            <Text style={{ color: theme.colors.primary }}>Album</Text>
          </Pressable>
          <Pressable onPress={trashSelected} style={styles.selAction}>
            <Text style={{ color: theme.colors.error }}>Trash</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setSelection(new Set());
              setSelectionMode(false);
            }}
            style={styles.selAction}
          >
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        !searchResults && (
          <Pressable
            style={[
              styles.fab,
              { backgroundColor: theme.colors.primaryContainer, bottom: insets.bottom + 16 },
            ]}
            onPress={() => setPickerVisible(true)}
          >
            <Text style={[styles.fabText, { color: theme.colors.onPrimaryContainer }]}>＋</Text>
          </Pressable>
        )
      )}

      <LocalPickerSheet
        visible={pickerVisible}
        theme={theme}
        onClose={() => setPickerVisible(false)}
      />

      <Dialog
        visible={albumDialogVisible}
        theme={theme}
        title="Add to album"
        message={`${selection.size} photo${selection.size === 1 ? "" : "s"} selected`}
      >
        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
          {albums.map((a) => (
            <Pressable
              key={a.id}
              style={[styles.albumRow, { backgroundColor: theme.colors.surface }]}
              onPress={async () => {
                await addPhotosToAlbum(a.id, Array.from(selection));
                setAlbumDialogVisible(false);
                setSelection(new Set());
                setSelectionMode(false);
              }}
            >
              <Text style={{ color: theme.colors.onSurface, flex: 1 }}>{a.name}</Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>{a.count}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <TextField
            value={newAlbumName}
            onChangeText={setNewAlbumName}
            placeholder="New album name"
            theme={theme}
            style={{ flex: 1 }}
          />
          <Button
            title="Add"
            theme={theme}
            disabled={!newAlbumName.trim()}
            onPress={async () => {
              const id = await newAlbum(newAlbumName.trim());
              await addPhotosToAlbum(id, Array.from(selection));
              setNewAlbumName("");
              setAlbumDialogVisible(false);
              setSelection(new Set());
              setSelectionMode(false);
            }}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
          <Button
            title="Cancel"
            variant="text"
            theme={theme}
            onPress={() => setAlbumDialogVisible(false)}
          />
        </View>
      </Dialog>
    </View>
  );
}

function OverviewCard({
  theme,
  stats,
}: {
  theme: ReturnType<typeof useTheme>;
  stats: { total: number; uploaded: number; pending: number; failed: number; totalBytes: number };
}) {
  const [open, setOpen] = useState(true);
  const tiles = [
    { label: "Photos", value: String(stats.total) },
    { label: "Backed up", value: String(stats.uploaded) },
    { label: "Pending", value: String(stats.pending + stats.failed) },
    { label: "Size", value: formatBytes(stats.totalBytes) },
  ];
  return (
    <View style={[styles.overviewCard, { backgroundColor: theme.colors.surfaceContainer }]}>
      <Pressable style={styles.overviewHeader} onPress={() => setOpen((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 }}>
            Library overview
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 1 }}>
            {stats.uploaded} of {stats.total} backed up to your channel
          </Text>
        </View>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>{open ? "⌃" : "⌄"}</Text>
      </Pressable>
      {open ? (
        <View style={styles.overviewGrid}>
          {tiles.map((t) => (
            <View
              key={t.label}
              style={[styles.overviewTile, { backgroundColor: theme.colors.surfaceHighest }]}
            >
              <Text style={{ color: theme.colors.onSurface, fontWeight: "800", fontSize: 16 }} numberOfLines={1}>
                {t.value}
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5 }}>{t.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function isWantedPickerMedia(m: MediaLibrary.AssetMetadata): boolean {
  return (
    m.mediaType === MediaLibrary.MediaType.IMAGE ||
    m.mediaType === MediaLibrary.MediaType.VIDEO
  );
}

function LocalPickerSheet({
  visible,
  theme,
  onClose,
}: {
  visible: boolean;
  theme: ReturnType<typeof useTheme>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState<MediaLibrary.AssetMetadata[]>([]);
  const [backedUp, setBackedUp] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [confirmVisible, setConfirmVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setPicked(new Set());
    (async () => {
      try {
        const includeVideos = useSettingsStore.getState().prefs.includeVideos;
        let metas = await new MediaLibrary.Query()
          .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
          .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
          .limit(600)
          .exeForMetadata();
        if (includeVideos) {
          const all = await new MediaLibrary.Query()
            .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
            .limit(900)
            .exeForMetadata();
          metas = all.filter((m) => isWantedPickerMedia(m));
        }
        const ids = await getUploadedLocalIds();
        setAssets(metas);
        setBackedUp(ids);
      } catch {}
      setLoading(false);
    })();
  }, [visible]);

  const pickedMetas = assets.filter((a) => picked.has(a.id));
  const dupeCount = pickedMetas.filter((a) => backedUp.has(a.id)).length;

  async function onUpload() {
    if (dupeCount > 0) {
      setConfirmVisible(true);
      return;
    }
    await doUpload();
  }

  async function doUpload() {
    setConfirmVisible(false);
    const items = pickedMetas.map((a) => ({
      local_id: a.id,
      filename: a.filename ?? `photo_${a.id}`,
      folder: null,
      size: null,
      width: a.width,
      height: a.height,
      taken_at: a.creationTime ?? 0,
      added_at: a.modificationTime ?? a.creationTime ?? 0,
    }));
    const n = await enqueueUploads(items, "manual");
    onClose();
    if (n > 0) void processQueue();
  }

  const tile = (Dimensions.get("window").width - 4) / 4;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.sheetHeader, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>✕</Text>
          </Pressable>
          <Text style={{ color: theme.colors.onSurface, fontWeight: "700", fontSize: 16 }}>
            Select photos
          </Text>
          <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>
            {picked.size}
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
        ) : (
          <FlatList
            data={assets}
            numColumns={4}
            keyExtractor={(a) => a.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item }) => {
              const isPicked = picked.has(item.id);
              const isDupe = backedUp.has(item.id);
              return (
                <Pressable
                  style={{ width: tile, height: tile, padding: 1 }}
                  onPress={() => {
                    const next = new Set(picked);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    setPicked(next);
                  }}
                >
                  <LocalThumb assetId={item.id} />
                  {item.mediaType === MediaLibrary.MediaType.VIDEO ? (
                    <View style={styles.videoBadge}>
                      <Text style={styles.videoBadgeText}>
                        ▶ {formatDuration(item.duration)}
                      </Text>
                    </View>
                  ) : null}
                  {isDupe ? (
                    <View style={[styles.dupeBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                      <Text style={{ fontSize: 10, color: theme.colors.onPrimaryContainer }}>☁</Text>
                    </View>
                  ) : null}
                  {isPicked ? (
                    <View style={[styles.pickedOverlay, { borderColor: theme.colors.primary }]}>
                      <View style={[styles.checkbox, { backgroundColor: theme.colors.primary }]}>
                        <Text style={{ color: theme.colors.onPrimary, fontSize: 11, fontWeight: "800" }}>
                          ✓
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
          />
        )}
        <View
          style={[
            styles.sheetFooter,
            { backgroundColor: theme.colors.surfaceContainer, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, flex: 1 }}>
            {dupeCount > 0 ? `${dupeCount} already backed up` : "Photos upload as original quality"}
          </Text>
          <Button
            title={picked.size > 0 ? `Upload ${picked.size}` : "Upload"}
            theme={theme}
            disabled={picked.size === 0}
            onPress={onUpload}
          />
        </View>
      </View>

      <Dialog
        visible={confirmVisible}
        theme={theme}
        title="Already backed up"
        message={`${dupeCount} of the selected photos are already in your channel. Upload them again anyway?`}
      >
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <Button
            title="Cancel"
            theme={theme}
            variant="text"
            onPress={() => setConfirmVisible(false)}
          />
          <Button title="Upload anyway" theme={theme} onPress={doUpload} />
        </View>
      </Dialog>
    </Modal>
  );
}

function SectionGrid({
  photos,
  staggered,
  renderTile,
}: {
  photos: PhotoRow[];
  staggered: boolean;
  renderTile: (p: PhotoRow, w?: number, h?: number) => React.ReactNode;
}) {
  if (!staggered) {
    return (
      <View style={styles.grid}>
        {photos.map((p) => (
          <React.Fragment key={p.id}>{renderTile(p)}</React.Fragment>
        ))}
      </View>
    );
  }
  const colW = (Dimensions.get("window").width - 4) / COLUMNS;
  const heights = photos.map((p) => {
    const aspect =
      p.width && p.height ? p.height / p.width : 1;
    return Math.max(colW * 0.6, Math.min(colW * 1.8, colW * aspect));
  });
  const columns: { p: PhotoRow; h: number }[][] = Array.from(
    { length: COLUMNS },
    () => []
  );
  const colHeights = new Array(COLUMNS).fill(0);
  photos.forEach((p, i) => {
    const shortest = colHeights.indexOf(Math.min(...colHeights));
    columns[shortest].push({ p, h: heights[i] });
    colHeights[shortest] += heights[i] + 2;
  });
  return (
    <View style={[styles.grid, { flexDirection: "row", gap: 2, alignItems: "flex-start" }]}>
      {columns.map((col, ci) => (
        <View key={ci} style={{ flex: 1, gap: 2 }}>
          {col.map(({ p, h }) => (
            <React.Fragment key={p.id}>{renderTile(p, colW, h)}</React.Fragment>
          ))}
        </View>
      ))}
    </View>
  );
}

function PeriodJumpList({
  mode,
  navigation,
  theme,
}: {
  mode: "months" | "years";
  navigation: any;
  theme: ReturnType<typeof useTheme>;
}) {
  const [groups, setGroups] = useState<PeriodGroup[]>([]);
  useEffect(() => {
    if (mode === "years") {
      import("../lib/db").then(({ getYearGroups }) => getYearGroups()).then(setGroups);
    } else {
      import("../lib/db").then(({ getMonthGroups }) => getMonthGroups(null)).then(setGroups);
    }
  }, [mode]);

  return (
    <FlatList
      data={groups}
      keyExtractor={(g) => g.key}
      numColumns={2}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
      columnWrapperStyle={{ gap: 12 }}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.periodCard, { backgroundColor: theme.colors.surface }]}
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
          <TelegramImage
            fileId={item.cover_preview_id ?? item.cover_file_id}
            style={{ width: "100%", height: 96 }}
          />
          <Text style={[styles.periodLabel, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, paddingHorizontal: 10, paddingBottom: 10 }}>
            {item.count} photo{item.count === 1 ? "" : "s"}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 40 }}>
          Nothing here yet.
        </Text>
      }
    />
  );
}

function LocalThumb({ assetId }: { assetId: string }) {
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
      style={{ width: "100%", height: "100%", backgroundColor: "rgba(128,128,128,0.12)" }}
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
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  channelChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gear: {
    padding: 6,
  },
  viewSwitchRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  viewSwitch: {
    flexDirection: "row",
    alignSelf: "flex-start",
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  viewSwitchBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  periodCard: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  periodLabel: {
    fontSize: 14.5,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  progressBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateHeader: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 2,
    gap: 2,
  },
  favBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    borderRadius: 999,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cloudBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    borderRadius: 999,
    width: 15,
    height: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  cloudBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
  videoBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  videoBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  overviewCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  overviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  overviewTile: {
    flexGrow: 1,
    minWidth: "45%",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  favIcon: {
    color: "#FF8FA3",
    fontSize: 12,
  },
  selectedOverlay: {
    ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    borderWidth: 2,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    padding: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
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
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fabText: {
    fontSize: 26,
    fontWeight: "400",
    marginTop: -2,
  },
  empty: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    fontSize: 13.5,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  sheet: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sheetFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  dupeBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 999,
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
  albumRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 6,
  },
});
