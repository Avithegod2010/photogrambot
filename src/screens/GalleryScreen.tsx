import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
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
import { File } from "expo-file-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLibraryStore } from "../store/useLibraryStore";
import { useSetupStore } from "../store/useSetupStore";
import { useUploadStore } from "../store/useUploadStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useTheme } from "../useTheme";
import { groupPhotosByDate, formatBytes, formatDuration, isVideoMime } from "../lib/format";
import { getUploadedLocalIds, getPhotoByLocalId, getMonthlyBuckets, getDistinctDevices, saveSearch, type MonthBucket, type SearchFilters } from "../lib/db";
import { ToggleRow } from "../components/ui";
import { isDecoyActive } from "../lib/applock";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";
import { GearIcon, HeartIcon, TrashIcon, SparkleIcon } from "../components/icons";
import { MemoriesCarousel } from "../components/MemoriesCarousel";
import { getCachedTelegramFile } from "../lib/media";
import { tokenForPhoto, listProfiles } from "../lib/destinations";
import { shareMedia } from "../../modules/share-intent";
import { Button, Dialog, TextField } from "../components/ui";
import { nlToSearch } from "../lib/ai";
import { getAiApiKey } from "../lib/settings";
import { AUTO_TAGS } from "../lib/autotags";
import type { PeriodGroup } from "../lib/db";
import type { PhotoRow } from "../lib/db";

type LocalItem = {
  id: string;
  taken_at: number;
  width: number | null;
  height: number | null;
  asset: MediaLibrary.AssetMetadata;
};

const ABS_FILL: any = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 };

const COLUMNS = 3;

// Local-roll page size. The new Query builder exposes no cursor API
// (offset/limit only), so infinite scroll pages through the media store by
// raw-row offset and dedupes ids on append.
const LOCAL_PAGE_SIZE = 600;

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
  // "Back up" appears in the selection bar only when a selected row is still
  // local-only (computed from the same source the bar renders ids from).
  const hasBackable = useMemo(() => {
    const src = searchResults ?? photos;
    if (selection.size === 0) return false;
    for (const p of src) {
      if (selection.has(p.id) && p.status === "local" && !!p.local_id) return true;
    }
    return false;
  }, [selection, searchResults, photos]);
  const [filters, setFilters] = useState<SearchFilters | null>(null);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [nlLoading, setNlLoading] = useState(false);
  const [saveSearchVisible, setSaveSearchVisible] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [albumDialogVisible, setAlbumDialogVisible] = useState(false);
  const [viewMode, setViewMode] = useState<"days" | "months" | "years">("days");
  const { albums, newAlbum, addPhotosToAlbum } = useLibraryStore();
  const staggered = useSettingsStore((s) => s.prefs.staggeredGrid);
  const includeVideos = useSettingsStore((s) => s.prefs.includeVideos);
  const [newAlbumName, setNewAlbumName] = useState("");
  const decoy = isDecoyActive();
  // The Gallery tab mirrors the phone's own gallery: every local asset, with
  // a cloud badge on whatever is already backed up. Search/months/years
  // operate on the backed-up (DB) library.
  const [localAssets, setLocalAssets] = useState<LocalItem[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [loadingMoreLocal, setLoadingMoreLocal] = useState(false);
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(new Set());
  // Paging cursor = raw rows already consumed from the media store (not the
  // list length: includeVideos pages are filtered in JS). hasMore lives in a
  // ref so the onEndReached guard is synchronous.
  const localPageOffset = useRef(0);
  const localHasMore = useRef(true);
  const loadingMoreRef = useRef(false);
  // Mirror of the ids in localAssets (state updates are async); loadMoreLocal
  // reads it synchronously to decide whether a page was all re-shown rows.
  const seenLocalIds = useRef<Set<string>>(new Set());
  // Refresh and infinite scroll share one cursor: run local loads strictly
  // one at a time so two queries can never advance the same offset.
  const localChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    void loadInitial();
    void loadLocal();
    return subscribe();
  }, []);

  useEffect(() => {
    if (decoy) {
      setUploadedIds(new Set());
      return;
    }
    void getUploadedLocalIds().then(setUploadedIds);
  }, [photos, decoy]);

  // A mid-scroll includeVideos toggle would page a different query shape
  // against the old offset cursor — reload page 1 when the pref flips.
  // The ref skips the mount run: loadInitial already kick off loadLocal.
  const mountedIncludeVideos = useRef(includeVideos);
  useEffect(() => {
    if (mountedIncludeVideos.current === includeVideos) return;
    mountedIncludeVideos.current = includeVideos;
    void loadLocal();
  }, [includeVideos]);

  function toLocalItem(a: MediaLibrary.AssetMetadata): LocalItem {
    return {
      id: a.id,
      taken_at: a.creationTime ?? 0,
      width: a.width,
      height: a.height,
      asset: a,
    };
  }

  function fetchLocalPage(includeVideos: boolean): Promise<MediaLibrary.AssetMetadata[]> {
    const q = new MediaLibrary.Query().orderBy({
      key: MediaLibrary.AssetField.CREATION_TIME,
      ascending: false,
    });
    if (!includeVideos) {
      q.eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE);
    }
    return q.offset(localPageOffset.current).limit(LOCAL_PAGE_SIZE).exeForMetadata();
  }

  // Maps one raw store page to list items, advances the offset cursor and
  // drops ids already seen (offsets shift when new media lands mid-scroll).
  // Must be called outside setState updaters — it mutates the cursor refs.
  function consumeLocalPage(raw: MediaLibrary.AssetMetadata[], includeVideos: boolean): LocalItem[] {
    const mapped = (includeVideos ? raw.filter(isWantedPickerMedia) : raw).map(toLocalItem);
    localPageOffset.current += raw.length;
    if (raw.length < LOCAL_PAGE_SIZE) localHasMore.current = false;
    const seen = seenLocalIds.current;
    const out: LocalItem[] = [];
    for (const it of mapped) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        out.push(it);
      }
    }
    return out;
  }

  // Returns how many rows are genuinely new to the list (mirrored in
  // seenLocalIds) — an all-duplicate page must not stall infinite scroll.
  function appendLocalPage(raw: MediaLibrary.AssetMetadata[], includeVideos: boolean): number {
    const page = consumeLocalPage(raw, includeVideos);
    if (page.length === 0) return 0;
    setLocalAssets((prev) => [...prev, ...page]);
    return page.length;
  }

  function queueLocalLoad(task: () => Promise<void>) {
    localChain.current = localChain.current.then(task, task);
    return localChain.current;
  }

  // Page 1 (mount / pull-to-refresh): resets the cursor and replaces the list.
  function loadLocal() {
    if (decoy) {
      localPageOffset.current = 0;
      localHasMore.current = false;
      seenLocalIds.current = new Set();
      setLocalAssets([]);
      setLocalLoading(false);
      return Promise.resolve();
    }
    return queueLocalLoad(async () => {
      localPageOffset.current = 0;
      localHasMore.current = true;
      seenLocalIds.current = new Set();
      try {
        const includeVideos = useSettingsStore.getState().prefs.includeVideos;
        // When videos are included, the media-type-less query subsumes the
        // images-only shape — only that one runs (the old code executed both
        // and discarded the first result).
        let raw = await fetchLocalPage(includeVideos);
        const firstPage = consumeLocalPage(raw, includeVideos);
        setLocalAssets(firstPage);
        // A raw page can be all unwanted media (audio, …): keep consuming so
        // the first screenful is never an empty page (bounded like the old
        // 2400-row fetch). Seed `appended` from the first consume — otherwise
        // a productive page 1 still pulls page 2 on every mount/refresh.
        let appended = firstPage.length;
        let fetched = raw.length;
        while (appended === 0 && raw.length === LOCAL_PAGE_SIZE && fetched < LOCAL_PAGE_SIZE * 10) {
          raw = await fetchLocalPage(includeVideos);
          fetched += raw.length;
          appended = appendLocalPage(raw, includeVideos);
        }
      } catch {
        setLocalAssets([]);
        localHasMore.current = false;
      } finally {
        setLocalLoading(false);
      }
    });
  }

  // Next page for infinite scroll. Errors stop paging (append nothing);
  // pull-to-refresh re-arms it via loadLocal.
  function loadMoreLocal() {
    if (decoy || loadingMoreRef.current || !localHasMore.current || localLoading) return;
    loadingMoreRef.current = true;
    setLoadingMoreLocal(true);
    queueLocalLoad(async () => {
      try {
        const includeVideos = useSettingsStore.getState().prefs.includeVideos;
        let raw = await fetchLocalPage(includeVideos);
        let appended = appendLocalPage(raw, includeVideos);
        let fetched = raw.length;
        while (appended === 0 && raw.length === LOCAL_PAGE_SIZE && fetched < LOCAL_PAGE_SIZE * 10) {
          raw = await fetchLocalPage(includeVideos);
          fetched += raw.length;
          appended = appendLocalPage(raw, includeVideos);
        }
      } catch {
        localHasMore.current = false;
      } finally {
        loadingMoreRef.current = false;
        setLoadingMoreLocal(false);
      }
    });
  }

  const sections = useMemo(() => {
    const source = decoy ? [] : searchResults ?? [];
    return groupPhotosByDate(source).map((g) => ({
      label: g.label,
      data: g.items,
    }));
  }, [searchResults, decoy]);

  const localSections = useMemo(() => {
    if (decoy) return [];
    return groupPhotosByDate(localAssets).map((g) => ({ label: g.label, data: g.items }));
  }, [localAssets, decoy]);

  // Floor + margin: three tiles must fit the wrap container even after the
  // framework rounds fractional DP to whole pixels (2-per-row rounding bug).
  const tile = Math.floor((Dimensions.get("window").width - 8) / COLUMNS);

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
    await loadLocal();
    setRefreshing(false);
  }

  const searchSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  function runSearch(q: string) {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (decoy) {
      setSearchResults(null);
      return;
    }
    const seq = ++searchSeq.current;
    // Debounce keystrokes and drop stale responses so fast typing never
    // shows results from an earlier prefix.
    searchTimer.current = setTimeout(() => {
      void executeSearch(q, seq);
    }, 300);
  }

  async function executeSearch(q: string, seq: number) {
    const hasFilters = hasAnyFilter(filters);
    if (q.trim().length === 0 && !hasFilters) {
      if (seq === searchSeq.current) setSearchResults(null);
      return;
    }
    const results = await useLibraryStore.getState().search(q, filters ?? undefined);
    if (seq === searchSeq.current) setSearchResults(results);
  }

  async function applyFilters(f: SearchFilters | null) {
    setFilters(f);
    if (decoy) {
      setSearchResults(null);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const seq = ++searchSeq.current;
    const hasFilters = hasAnyFilter(f);
    if (!hasFilters && search.trim().length === 0) {
      setSearchResults(null);
      return;
    }
    const results = await useLibraryStore.getState().search(search, f ?? undefined);
    if (seq === searchSeq.current) setSearchResults(results);
  }

  // NL search applies text AND filters in ONE query run — applyFilters alone
  // would run the search against the stale `search` closure, then runSearch's
  // debounce would fire a second query with the opposite half applied.
  async function applyNaturalSearch(text: string, f: SearchFilters | null) {
    setSearch(text);
    setFilters(f);
    if (decoy) {
      setSearchResults(null);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const seq = ++searchSeq.current;
    if (!text.trim() && !hasAnyFilter(f)) {
      setSearchResults(null);
      return;
    }
    const results = await useLibraryStore.getState().search(text, f ?? undefined);
    if (seq === searchSeq.current) setSearchResults(results);
  }

  async function runNaturalLanguageSearch() {
    if (nlLoading) return;
    const apiKey = await getAiApiKey().catch(() => null);
    if (!apiKey) {
      Alert.alert("AI search", "Add your Gemini API key in Settings → AI captions first.");
      return;
    }
    setNlLoading(true);
    try {
      // Device names ride along in the prompt — never expose them in a decoy.
      const devices = isDecoyActive() ? [] : await getDistinctDevices().catch(() => []);
      const { searchText, filters: aiFilters } = await nlToSearch(search.trim(), {
        apiKey,
        model: useSettingsStore.getState().prefs.aiModel || "gemini-2.5-flash",
        devices,
        autoTags: [...AUTO_TAGS],
      });
      const hasAnything =
        searchText !== null || hasAnyFilter(aiFilters);
      if (!hasAnything) {
        Alert.alert("AI search", "Couldn't find a filterable meaning — try more specific words.");
        return;
      }
      await applyNaturalSearch(searchText ?? "", aiFilters);
    } catch (e: any) {
      Alert.alert("AI search", e?.message ?? "Couldn't understand that search");
    } finally {
      setNlLoading(false);
    }
  }

  async function shareSelected() {
    const items = (searchResults ?? photos).filter((p) => selection.has(p.id));
    if (items.length === 0) return;
    try {
      const uris: string[] = [];
      let allImages = true;
      for (const p of items.slice(0, 20)) {
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

  // Local-only selected rows → queue originals for upload. Same path as the
  // viewer's Back up action; enqueueUploads skips already-uploaded/queued rows.
  async function backUpSelected() {
    const items = (searchResults ?? photos).filter(
      (p): p is PhotoRow & { local_id: string } => selection.has(p.id) && p.status === "local" && !!p.local_id
    );
    if (items.length === 0) return;
    try {
      const { enqueueUploads, processQueue } = await import("../lib/uploader");
      const n = await enqueueUploads(
        items.map((p) => ({
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
      setSelection(new Set());
      setSelectionMode(false);
    } catch (e: any) {
      Alert.alert("Back up failed", e?.message ?? "Could not queue the photos.");
    }
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
          profileId={photo.profile_id}
          style={{ width: w, height: h }}
        />
        {photo.favorite ? (
          <View style={[styles.favBadge, { backgroundColor: theme.colors.scrim }]}>
            <HeartIcon color={"#FF8FA3"} size={16} filled={true} />
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

  async function onLocalPress(item: LocalItem) {
    // Backed-up assets open their real DB row; local-only ones open a
    // lightweight viewer entry straight from the device file.
    const dbPhoto = uploadedIds.has(item.id) ? await getPhotoByLocalId(item.id) : null;
    if (dbPhoto) {
      navigation.navigate("Viewer", { photos: [dbPhoto], index: 0 });
      return;
    }
    const a = item.asset;
    let uri: string | null = null;
    try {
      uri = await new MediaLibrary.Asset(a.id).getUri();
    } catch {}
    const photo: PhotoRow = {
      id: `local_${a.id}`,
      local_id: a.id,
      local_uri: uri,
      remote_file_id: null,
      preview_file_id: null,
      thumb_file_id: null,
      message_id: null,
      preview_message_id: null,
      filename: a.filename ?? "photo.jpg",
      folder: null,
      width: a.width ?? null,
      height: a.height ?? null,
      size: null,
      mime: a.mediaType === MediaLibrary.MediaType.VIDEO ? "video/mp4" : "image/jpeg",
      taken_at: a.creationTime ?? 0,
      added_at: a.creationTime ?? 0,
      uploaded_at: null,
      remote_date: null,
      content_hash: null,
      device: null,
      camera: null,
      tags: null,
      latitude: null,
      longitude: null,
      exif: null,
      ai_caption: null,
      duration: a.duration ? a.duration * 1000 : null,
      parts: null,
      profile_id: null,
      favorite: 0,
      status: "local",
      error: null,
      upload_type: null,
      phash: null,
      asset_mtime: null,
    };
    navigation.navigate("Viewer", { photos: [photo], index: 0 });
  }

  function renderLocalTile(item: LocalItem, width?: number, height?: number) {
    const backedUp = uploadedIds.has(item.id);
    const a = item.asset;
    const w = width ?? tile;
    const h = height ?? tile;
    return (
      <Pressable onPress={() => void onLocalPress(item)} style={{ width: w, height: h }}>
        <LocalThumb assetId={a.id} />
        {a.mediaType === MediaLibrary.MediaType.VIDEO ? (
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>▶ {formatDuration(a.duration)}</Text>
          </View>
        ) : null}
        {backedUp ? (
          <View style={[styles.cloudBadge, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[styles.cloudBadgeText, { color: theme.colors.onPrimaryContainer }]}>✓</Text>
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
          {channelTitle && !decoy ? (
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
        {!decoy ? (
          <Pressable onPress={() => navigation.navigate("Settings")} style={styles.gear}>
            <GearIcon
              color={typeof theme.colors.onSurface === "string" ? theme.colors.onSurface : "#E4E2EA"}
              size={22}
            />
          </Pressable>
        ) : null}
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
        {filters ? (
          <Pressable onPress={() => void applyFilters(null)} hitSlop={6}>
            <Text style={{ color: theme.colors.primary, fontSize: 11, fontWeight: "700" }}>FILTERED</Text>
          </Pressable>
        ) : null}
        {!decoy ? (
          <Pressable onPress={() => void runNaturalLanguageSearch()} hitSlop={6} disabled={nlLoading}>
            {nlLoading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <SparkleIcon color={theme.colors.primary} size={18} />
            )}
          </Pressable>
        ) : null}
        <Pressable onPress={() => setFilterSheetVisible(true)} hitSlop={6} style={{ paddingHorizontal: 4 }}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>☰</Text>
        </Pressable>
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
      ) : searchResults ? (
        <FlatList
          data={sections}
          // Size-sorted results interleave dates, so the same label can head
          // multiple sections — key by index+label like the local roll below.
          keyExtractor={(s, i) => `${i}:${s.label}`}
          onEndReached={() => {
            if (!searchResults) void loadMore();
          }}
          onEndReachedThreshold={0.6}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={
            !searchResults && !decoy ? (
              <View>
                <OverviewCard theme={theme} stats={stats} />
                <MemoriesCarousel navigation={navigation} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View>
              <View style={styles.dateHeaderRow}>
                <Text style={[styles.dateHeader, { color: theme.colors.onSurfaceVariant }]}>
                  {item.label}
                </Text>
                {selectionMode ? (
                  <Pressable
                    onPress={() =>
                      setSelection(new Set([...selection, ...item.data.map((p) => p.id)]))
                    }
                    hitSlop={8}
                  >
                    <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: "600" }}>
                      Select all
                    </Text>
                  </Pressable>
                ) : null}
              </View>
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
              Nothing backed up yet. New photos back up automatically when Auto sync is on in Settings, or share photos to PhotogramBot from any app.
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
      ) : viewMode !== "days" ? (
        <PeriodJumpList mode={viewMode} navigation={navigation} theme={theme} />
      ) : (
        <FlatList
          data={localSections}
          // Offset shifts from media added/deleted mid-scroll can leave two
          // sections with the same date label; the index keeps keys unique.
          keyExtractor={(s, i) => `${i}:${s.label}`}
          onEndReached={loadMoreLocal}
          onEndReachedThreshold={0.6}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          ListHeaderComponent={
            !decoy ? (
              <View>
                <OverviewCard theme={theme} stats={stats} />
                <MemoriesCarousel navigation={navigation} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View>
              <View style={styles.dateHeaderRow}>
                <Text style={[styles.dateHeader, { color: theme.colors.onSurfaceVariant }]}>
                  {item.label}
                </Text>
              </View>
              <SectionGrid photos={item.data} staggered={staggered} renderTile={renderLocalTile} />
            </View>
          )}
          ListEmptyComponent={
            localLoading ? (
              <ActivityIndicator style={{ marginTop: 60 }} color={theme.colors.primary} />
            ) : (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
                  Nothing here yet
                </Text>
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                  Photos from this device appear here. New photos back up automatically when Auto sync is on in Settings.
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            loadingMoreLocal ? (
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
            onPress={() => setSelection(new Set((searchResults ?? photos).map((p) => p.id)))}
            style={styles.selAction}
          >
            <Text style={{ color: theme.colors.primary }}>All</Text>
          </Pressable>
          <Pressable onPress={() => void shareSelected()} style={styles.selAction}>
            <Text style={{ color: theme.colors.primary }}>Share</Text>
          </Pressable>
          {hasBackable ? (
            <Pressable onPress={() => void backUpSelected()} style={styles.selAction}>
              <Text style={{ color: theme.colors.primary }}>Back up</Text>
            </Pressable>
          ) : null}
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
      ) : null}

      <FilterSheet
        visible={filterSheetVisible}
        theme={theme}
        initial={filters}
        searchText={search}
        onApply={(f) => {
          setFilterSheetVisible(false);
          void applyFilters(f);
        }}
        onSaveSearch={async (name, f, q) => {
          await saveSearch(name, q, f);
          setFilterSheetVisible(false);
        }}
        onClose={() => setFilterSheetVisible(false)}
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
  const [buckets, setBuckets] = useState<MonthBucket[]>([]);
  useEffect(() => {
    void getMonthlyBuckets(6).then(setBuckets);
  }, [stats.total]);
  const tiles = [
    { label: "Photos", value: String(stats.total) },
    { label: "Backed up", value: String(stats.uploaded) },
    { label: "Pending", value: String(stats.pending + stats.failed) },
    { label: "Size", value: formatBytes(stats.totalBytes) },
  ];
  const maxBytes = Math.max(1, ...buckets.map((b) => b.bytes));
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
        <View>
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
          {buckets.some((b) => b.count > 0) ? (
            <View style={[styles.overviewTile, { backgroundColor: theme.colors.surfaceHighest, marginTop: 8 }]}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginBottom: 6 }}>
                Last 6 months
              </Text>
              <View style={styles.chartRow}>
                {buckets.map((b, i) => (
                  <View key={i} style={styles.chartCol}>
                    <View style={styles.chartBarArea}>
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height: `${Math.max(4, Math.round((b.bytes / maxBytes) * 100))}%`,
                            backgroundColor: b.bytes > 0 ? theme.colors.primary : theme.colors.outlineVariant,
                          },
                        ]}
                      />
                    </View>
                    <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 9.5 }}>{b.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
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

// True when any SearchFilters dimension actually constrains the query.
// Single source for the FILTERED badge, the empty-text early-out, and the
// sheet's all-empty Apply → null handoff — keep the three in sync HERE.
function hasAnyFilter(f: SearchFilters | null | undefined): boolean {
  return (
    !!f &&
    (!!(f.takenWithinDays && f.takenWithinDays > 0) ||
      !!f.hasGps ||
      !!(f.camera && f.camera.trim()) ||
      !!f.notBackedUp ||
      !!(f.device && f.device.trim()) ||
      !!f.mediaType ||
      !!f.sort ||
      !!(f.autoTag && f.autoTag.trim()))
  );
}

function FilterSheet({
  visible,
  theme,
  initial,
  searchText,
  onApply,
  onSaveSearch,
  onClose,
}: {
  visible: boolean;
  theme: ReturnType<typeof useTheme>;
  initial: SearchFilters | null;
  searchText: string;
  onApply: (f: SearchFilters | null) => void;
  onSaveSearch: (name: string, filters: SearchFilters | null, searchText: string) => Promise<void>;
  onClose: () => void;
}) {
  const [days, setDays] = useState<number | null>(initial?.takenWithinDays ?? null);
  const [hasGps, setHasGps] = useState(!!initial?.hasGps);
  const [camera, setCamera] = useState(initial?.camera ?? "");
  const [notBackedUp, setNotBackedUp] = useState(!!initial?.notBackedUp);
  const [device, setDevice] = useState(initial?.device ?? null);
  const [mediaType, setMediaType] = useState<"photos" | "videos" | null>(
    initial?.mediaType ?? null
  );
  const [sort, setSort] = useState<"size_desc" | null>(initial?.sort ?? null);
  const [autoTag, setAutoTag] = useState<string | null>(initial?.autoTag ?? null);
  const [saveVisible, setSaveVisible] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  // Device chips come from the DB, fetched once per open (cached in state for
  // the open, not per render). In a decoy session the row stays hidden — real
  // device names would leak the hidden library, same reasoning as the decoy
  // search short-circuit.
  const [devices, setDevices] = useState<string[]>([]);
  // The Modal stays mounted, so useState's initial value only seeds the FIRST
  // open — re-seed from the applied filters every time the sheet opens.
  // Deps intentionally [visible] only: re-seeding while open would clobber edits.
  useEffect(() => {
    if (!visible) return;
    setDays(initial?.takenWithinDays ?? null);
    setHasGps(!!initial?.hasGps);
    setCamera(initial?.camera ?? "");
    setNotBackedUp(!!initial?.notBackedUp);
    setDevice(initial?.device ?? null);
    setMediaType(initial?.mediaType ?? null);
    setSort(initial?.sort ?? null);
    setAutoTag(initial?.autoTag ?? null);
    setSaveVisible(false);
    setSaveName("");
    setDevices([]);
    if (!isDecoyActive()) {
      getDistinctDevices()
        .then(setDevices)
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const ranges: { label: string; value: number | null }[] = [
    { label: "Any time", value: null },
    { label: "24 h", value: 1 },
    { label: "7 days", value: 7 },
    { label: "30 days", value: 30 },
    { label: "90 days", value: 90 },
  ];
  const mediaOptions: { label: string; value: "photos" | "videos" | null }[] = [
    { label: "Any", value: null },
    { label: "Photos", value: "photos" },
    { label: "Videos", value: "videos" },
  ];
  const sortOptions: { label: string; value: "size_desc" | null }[] = [
    { label: "Newest", value: null },
    { label: "Largest", value: "size_desc" },
  ];
  const autoTagOptions: { label: string; value: string | null }[] = [
    { label: "Any", value: null },
    { label: "Screenshots", value: "screenshot" },
    { label: "WhatsApp", value: "whatsapp" },
    { label: "Screen rec", value: "screenrec" },
    { label: "Documents", value: "document" },
  ];
  // Never surface a real device name in a decoy session. This also covers an
  // already-applied device filter that remains in component state while the
  // modal is reused across lock/unlock transitions.
  const deviceOptions = isDecoyActive()
    ? []
    : devices.map((d) => ({ label: d, value: d }));
  if (!isDecoyActive() && device && !devices.includes(device)) {
    deviceOptions.push({ label: device, value: device });
  }
  const draftHasAnyFilter =
    days !== null ||
    hasGps ||
    !!camera.trim() ||
    notBackedUp ||
    !!device ||
    !!mediaType ||
    !!sort ||
    !!autoTag;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.filterSheet, { backgroundColor: theme.colors.background }]}>
          <View style={[styles.grabber, { backgroundColor: theme.colors.outline }]} />
          {/* Body scrolls — the rows now overflow on small screens. Action
              buttons stay pinned below so Apply is always reachable.
              keyboardShouldPersistTaps keeps chip taps landing while the
              camera field's keyboard is open (matches the pre-ScrollView
              behavior of Pressables outside a scroll container). */}
          <ScrollView
            style={{ maxHeight: Math.round(Dimensions.get("window").height * 0.7) }}
            keyboardShouldPersistTaps="always"
          >
            <Text style={{ color: theme.colors.onSurface, fontWeight: "800", fontSize: 17, marginBottom: 12 }}>
              Filter photos
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginBottom: 6 }}>
              Date range
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {ranges.map((r) => (
                <Pressable
                  key={r.label}
                  onPress={() => setDays(r.value)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        days === r.value ? theme.colors.primaryContainer : theme.colors.surfaceHighest,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: days === r.value ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                      fontSize: 12.5,
                      fontWeight: "600",
                    }}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <ToggleRow
              title="Has location"
              subtitle="Only photos tagged with GPS coordinates"
              value={hasGps}
              onChange={setHasGps}
              theme={theme}
            />
            <ToggleRow
              title="Not backed up yet"
              subtitle="Only photos without a copy in your Telegram channel"
              value={notBackedUp}
              onChange={setNotBackedUp}
              theme={theme}
            />
            <View style={{ height: 10 }} />
            <TextField
              value={camera}
              onChangeText={setCamera}
              placeholder="Camera model contains…"
              theme={theme}
            />
            {/* An applied device can drop out of getDistinctDevices (its
                photos trashed since) — merge it back in so the active filter
                never renders as an unmarked chip row. */}
            {deviceOptions.length > 0 ? (
              <View style={{ marginTop: 12 }}>
                <FilterChipRow<string>
                  label="Device"
                  options={deviceOptions}
                  selected={device}
                  onSelect={setDevice}
                  theme={theme}
                />
              </View>
            ) : null}
            <View style={{ marginTop: 12 }}>
              <FilterChipRow<"photos" | "videos">
                label="Media"
                options={mediaOptions}
                selected={mediaType}
                onSelect={setMediaType}
                theme={theme}
              />
            </View>
            <View style={{ marginTop: 12 }}>
              <FilterChipRow<string>
                label="Type"
                options={autoTagOptions}
                selected={autoTag}
                onSelect={setAutoTag}
                theme={theme}
              />
            </View>
            <View style={{ marginTop: 12 }}>
              <FilterChipRow<"size_desc">
                label="Sort"
                options={sortOptions}
                selected={sort}
                onSelect={setSort}
                theme={theme}
              />
            </View>
          </ScrollView>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            {(draftHasAnyFilter || searchText.trim().length > 0) && !saveVisible ? (
              <Button
                title="Save search"
                variant="text"
                theme={theme}
                onPress={() => setSaveVisible(true)}
              />
            ) : null}
            <Button
              title="Clear"
              variant="text"
              theme={theme}
              onPress={() => {
                setDays(null);
                setHasGps(false);
                setCamera("");
                setNotBackedUp(false);
                setDevice(null);
                setMediaType(null);
                setSort(null);
                setAutoTag(null);
                onApply(null);
              }}
            />
            <Button
              title="Apply"
              theme={theme}
              onPress={() => {
                const next: SearchFilters = {
                  takenWithinDays: days,
                  hasGps,
                  camera: camera.trim() || null,
                  notBackedUp,
                  device,
                  mediaType,
                  sort,
                  autoTag,
                };
                // All-empty apply == no filters — pass null so the FILTERED
                // badge stays honest (it renders whenever `filters` is set).
                onApply(hasAnyFilter(next) ? next : null);
              }}
            />
          </View>
        </View>
        <Dialog visible={saveVisible} title="Save this search" theme={theme}>
          <TextField
            value={saveName}
            onChangeText={setSaveName}
            placeholder="e.g. Drone folder + location"
            theme={theme}
          />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <Button
              title="Cancel"
              variant="text"
              theme={theme}
              onPress={() => {
                setSaveVisible(false);
                setSaveName("");
              }}
            />
            <Button
              title="Save"
              theme={theme}
              disabled={saving || saveName.trim().length === 0}
              onPress={() => {
                const next: SearchFilters = {
                  takenWithinDays: days,
                  hasGps,
                  camera: camera.trim() || null,
                  notBackedUp,
                  device,
                  mediaType,
                  sort,
                  autoTag,
                };
                setSaving(true);
                onSaveSearch(saveName.trim().slice(0, 60), hasAnyFilter(next) ? next : null, searchText)
                  .then(() => {
                    setSaveVisible(false);
                    setSaveName("");
                    Alert.alert("Saved search", "Find it in Collections → Smart collections.");
                  })
                  .catch((e: any) => Alert.alert("Save search", e?.message ?? "Couldn't save"))
                  .finally(() => setSaving(false));
              }}
            />
          </View>
        </Dialog>
      </View>
    </Modal>
  );
}

// One row of single-select filter chips, styled after the "Date range" chips
// above (styles.filterChip, primaryContainer when selected). Tapping the
// already-selected chip clears back to null ("Any"/"Newest" are null-valued
// chips; for Device, cleared means no chip highlighted).
function FilterChipRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
  theme,
}: {
  label: string;
  options: { label: string; value: T | null }[];
  selected: T | null;
  onSelect: (v: T | null) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <>
      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginBottom: 6 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {options.map((o) => (
          <Pressable
            key={o.label}
            onPress={() => onSelect(selected === o.value ? null : o.value)}
            style={[
              styles.filterChip,
              {
                backgroundColor:
                  selected === o.value ? theme.colors.primaryContainer : theme.colors.surfaceHighest,
              },
            ]}
          >
            <Text
              style={{
                color: selected === o.value ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                fontSize: 12.5,
                fontWeight: "600",
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function SectionGrid<T extends { id: string; width?: number | null; height?: number | null }>({
  photos,
  staggered,
  renderTile,
}: {
  photos: T[];
  staggered: boolean;
  renderTile: (p: T, w?: number, h?: number) => React.ReactNode;
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
  const colW = Math.floor((Dimensions.get("window").width - 8) / COLUMNS);
  const heights = photos.map((p) => {
    const aspect =
      p.width && p.height ? p.height / p.width : 1;
    return Math.max(colW * 0.6, Math.min(colW * 1.8, colW * aspect));
  });
  const columns: { p: T; h: number }[][] = Array.from(
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
    if (isDecoyActive()) {
      setGroups([]);
      return;
    }
    // Days shows the phone's local roll; Months/Years used to query the
    // backed-up (DB) library only, so a mostly-local library rendered as
    // "Nothing here yet." Merge: DB period groups (with channel covers) +
    // local MediaLibrary buckets, where local buckets EXCLUDE assets already
    // counted in the DB groups (otherwise backed-up photos count twice).
    // DB and local fetches fail independently — a local failure keeps DB data.
    void (async () => {
      let dbGroups: PeriodGroup[] = [];
      try {
        dbGroups =
          mode === "years"
            ? await import("../lib/db").then(({ getYearGroups }) => getYearGroups())
            : await import("../lib/db").then(({ getMonthGroups }) => getMonthGroups(null));
      } catch {}
      try {
        const { getPeriodCountedLocalIds } = await import("../lib/db");
        const { getLocalPeriodBuckets, monthLabel } = await import("../lib/localPeriods");
        const exclude = await getPeriodCountedLocalIds();
        const localBuckets = await getLocalPeriodBuckets(mode, null, exclude);
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
              label: mode === "years" ? b.key : monthLabel(b.key),
              startMs: b.startMs,
              endMs: b.endMs,
              count: b.count,
              cover_preview_id: null,
              cover_file_id: null,
            });
          }
        }
        setGroups(
          Array.from(byKey.values()).sort((a, b) => b.startMs - a.startMs)
        );
      } catch {
        // Local-bucket failure — DB groups alone still render.
        setGroups(dbGroups);
      }
    })();
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
          {item.cover_preview_id ?? item.cover_file_id ? (
            <TelegramImage
              fileId={item.cover_preview_id ?? item.cover_file_id}
              style={{ width: "100%", height: 96 }}
            />
          ) : (
            <View
              style={{
                width: "100%",
                height: 96,
                backgroundColor: theme.colors.surfaceHighest,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 24 }}>🖼</Text>
            </View>
          )}
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
    paddingTop: 14,
    paddingBottom: 6,
  },
  dateHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
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
  destChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    marginBottom: 14,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  chartRow: {
    flexDirection: "row",
    height: 64,
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  chartBarArea: {
    flex: 1,
    width: "60%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  chartBar: {
    width: "100%",
    borderRadius: 4,
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
