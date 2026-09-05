// Local-roll period support: the Days view shows the phone's local roll
// (MediaLibrary) while Months/Years previously queried the DB (backed-up
// library) only — on a device where most photos are still local-only the
// period views looked empty. These helpers let period views span BOTH
// sources: MediaLibrary date-bucketing for the jump-list cards, and a
// local+DB merge for the in-range grid.

import * as MediaLibrary from "expo-media-library";
import type { PhotoRow } from "./db";

export interface LocalPeriodBucket {
  key: string; // "2025" or "2025-09"
  startMs: number;
  endMs: number;
  count: number;
  coverLocalId: string | null;
}

// Buckets local assets by year (granularity "years") or calendar month
// ("months"). MediaLibrary has no aggregate API, so this walks the metadata
// the caller already has or fetches lazily; assets with no creationTime are
// skipped (nothing sensible to bucket them under).
export async function getLocalPeriodBuckets(
  granularity: "months" | "years",
  year: number | null
): Promise<LocalPeriodBucket[]> {
  const q = new MediaLibrary.Query().orderBy({
    key: MediaLibrary.AssetField.CREATION_TIME,
    ascending: false,
  });
  const assets = await q.exeForMetadata();
  const map = new Map<string, LocalPeriodBucket>();
  for (const a of assets) {
    const ts = a.creationTime;
    if (!ts) continue;
    const d = new Date(ts);
    const y = d.getFullYear();
    if (granularity === "years") {
      const key = String(y);
      bucket(map, key, ts, a.id);
    } else {
      if (year && y !== year) continue;
      const m = d.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      bucket(map, key, ts, a.id);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

function bucket(
  map: Map<string, LocalPeriodBucket>,
  key: string,
  ts: number,
  id: string
): void {
  const existing = map.get(key);
  if (existing) {
    existing.count++;
    existing.startMs = Math.min(existing.startMs, ts);
    existing.endMs = Math.max(existing.endMs, ts);
    existing.coverLocalId = existing.coverLocalId ?? id; // newest-first walk keeps the first hit
  } else {
    map.set(key, { key, startMs: ts, endMs: ts, count: 1, coverLocalId: id });
  }
}

// Local assets taken within [startMs, endMs], mapped to the PhotoRow-ish
// shape MonthGrid/Viewer already consume. local_uri stays null — resolving
// asset URIs is per-asset bridge work, so the grid does it lazily per tile
// (same pattern as GalleryScreen's LocalThumb). TelegramImage renders via
// localUri once the tile resolves one.
export async function getLocalPhotosInRange(
  startMs: number,
  endMs: number
): Promise<PhotoRow[]> {
  // Builder has no date-range helper — gte/lte on CREATION_TIME is the
  // documented shape (values are epoch ms).
  const q = new MediaLibrary.Query()
    .gte(MediaLibrary.AssetField.CREATION_TIME, startMs)
    .lte(MediaLibrary.AssetField.CREATION_TIME, endMs)
    .orderBy({
      key: MediaLibrary.AssetField.CREATION_TIME,
      ascending: false,
    });
  const assets = await q.exeForMetadata();
  return assets.map((a) => ({
    id: `asset_${a.id}`,
    local_id: a.id,
    local_uri: null,
    remote_file_id: null,
    preview_file_id: null,
    thumb_file_id: null,
    message_id: null,
    preview_message_id: null,
    filename: a.filename ?? `photo_${a.id}`,
    folder: null,
    width: a.width,
    height: a.height,
    size: null,
    mime: a.mediaType === MediaLibrary.MediaType.VIDEO ? "video/mp4" : "image/jpeg",
    taken_at: a.creationTime ?? 0,
    added_at: a.modificationTime ?? a.creationTime ?? 0,
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
    status: "local" as const,
    error: null,
    upload_type: null,
  }));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(key: string): string {
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
