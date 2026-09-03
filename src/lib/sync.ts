import * as MediaLibrary from "expo-media-library";
import * as Network from "expo-network";
import * as Battery from "expo-battery";
import { loadPrefs, savePrefs, type Prefs } from "./settings";
import { isVideoMime } from "./format";
import { enqueueUploads, processQueue } from "./uploader";
import { isRemotePaused } from "./remote";

export interface DeviceFolder {
  id: string;
  name: string;
  count: number;
}

export async function ensurePermissions(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync(false, ["photo", "video"]);
  return status === "granted";
}

export async function hasPermissions(): Promise<boolean> {
  const { status } = await MediaLibrary.getPermissionsAsync();
  return status === "granted";
}

function isWantedMedia(
  meta: MediaLibrary.AssetMetadata,
  includeVideos: boolean
): boolean {
  if (meta.mediaType === MediaLibrary.MediaType.IMAGE) return true;
  return includeVideos && meta.mediaType === MediaLibrary.MediaType.VIDEO;
}

export async function canAutoSyncNow(prefs?: Prefs): Promise<boolean> {
  const p = prefs ?? (await loadPrefs());
  // /pause from the channel (remote.ts) is the cheapest gate — check it first
  // so a paused device never even touches the network/battery probes.
  if (await isRemotePaused()) return false;
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) return false;
    if (
      p.autoSyncWifiOnly &&
      state.type !== Network.NetworkStateType.WIFI &&
      state.type !== Network.NetworkStateType.ETHERNET
    ) {
      return false;
    }
    if (p.uploadOnlyCharging) {
      const batteryState = await Battery.getBatteryStateAsync();
      if (
        batteryState !== Battery.BatteryState.CHARGING &&
        batteryState !== Battery.BatteryState.FULL
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function listDeviceFolders(): Promise<DeviceFolder[]> {
  const prefs = await loadPrefs();
  const albums = await MediaLibrary.Album.getAll();
  const folders: DeviceFolder[] = [];
  for (const album of albums) {
    try {
      let assets = await new MediaLibrary.Query()
        .album(album)
        .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
        .exeForMetadata();
      if (prefs.includeVideos) {
        const all = await new MediaLibrary.Query().album(album).exeForMetadata();
        assets = all.filter((m) => isWantedMedia(m, true));
      }
      if (assets.length > 0) {
        folders.push({ id: album.id, name: await album.getTitle(), count: assets.length });
      }
    } catch {}
  }
  folders.sort((a, b) => b.count - a.count);
  return folders;
}

export interface ScanResult {
  scanned: number;
  enqueued: number;
}

export async function scanAndEnqueueAll(
  onProgress?: (scanned: number, enqueued: number) => void
): Promise<ScanResult> {
  const prefs = await loadPrefs();
  const excluded = new Set(prefs.excludedFolders);
  const albums = await MediaLibrary.Album.getAll();

  const seenLocalIds = new Set<string>();
  let scanned = 0;
  let enqueued = 0;

  for (const album of albums) {
    const title = await album.getTitle();
    if (excluded.has(title)) continue;
    try {
      let assets = await new MediaLibrary.Query()
        .album(album)
        .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
        .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: true })
        .exeForMetadata();
      if (prefs.includeVideos) {
        const all = await new MediaLibrary.Query()
          .album(album)
          .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: true })
          .exeForMetadata();
        assets = all.filter((m) => isWantedMedia(m, true));
      }
      const items = [];
      for (const meta of assets) {
        if (seenLocalIds.has(meta.id)) continue;
        seenLocalIds.add(meta.id);
        scanned++;
        items.push({
          local_id: meta.id,
          filename: meta.filename ?? `photo_${meta.id}`,
          folder: title,
          size: null,
          width: meta.width,
          height: meta.height,
          taken_at: meta.creationTime ?? 0,
          added_at: meta.modificationTime ?? meta.creationTime ?? 0,
        });
      }
      if (items.length > 0) {
        enqueued += await enqueueUploads(items, "sync");
      }
      if (onProgress) onProgress(scanned, enqueued);
    } catch {}
  }

  await savePrefs({ lastFullSyncAt: Date.now() });
  return { scanned, enqueued };
}

export async function scanRecentAndEnqueue(sinceMs: number): Promise<number> {
  const prefs = await loadPrefs();
  const excluded = new Set(prefs.excludedFolders);
  const albums = await MediaLibrary.Album.getAll();
  let enqueued = 0;
  for (const album of albums) {
    const title = await album.getTitle();
    if (excluded.has(title)) continue;
    try {
      let assets = await new MediaLibrary.Query()
        .album(album)
        .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
        .gt(MediaLibrary.AssetField.MODIFICATION_TIME, Math.floor(sinceMs / 1000))
        .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: true })
        .exeForMetadata();
      if (prefs.includeVideos) {
        const all = await new MediaLibrary.Query()
          .album(album)
          .gt(MediaLibrary.AssetField.MODIFICATION_TIME, Math.floor(sinceMs / 1000))
          .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: true })
          .exeForMetadata();
        assets = all.filter((m) => isWantedMedia(m, true));
      }
      if (assets.length === 0) continue;
      enqueued += await enqueueUploads(
        assets.map((meta) => ({
          local_id: meta.id,
          filename: meta.filename ?? `photo_${meta.id}`,
          folder: title,
          size: null,
          width: meta.width,
          height: meta.height,
          taken_at: meta.creationTime ?? 0,
          added_at: meta.modificationTime ?? meta.creationTime ?? 0,
        })),
        "sync"
      );
    } catch {}
  }
  return enqueued;
}

export async function runSyncNow(
  onProgress?: (scanned: number, enqueued: number) => void
): Promise<ScanResult> {
  const result = await scanAndEnqueueAll(onProgress);
  void processQueue();
  return result;
}
