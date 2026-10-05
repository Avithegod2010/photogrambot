import {
  getDuplicateGroups,
  getPhotosByUploadStatus,
  updatePhoto,
  getJpegRowsForPhash,
  getPhashedIds,
  getAllPhashPairs,
  setPhashBatch,
  getWipeLocalCandidates,
  clearLocalUris,
  getPhoto,
  enqueueUpload,
  type PhotoRow,
  type DuplicateGroup,
} from "./db";
import { File, FileMode } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { getFile } from "./telegram";
import { getCachedTelegramFile } from "./media";
import { tokenForPhoto } from "./destinations";
import {
  dcGridFromJpeg,
  dHashFromDc,
  clusterByDistance,
  type HashedItem,
} from "./phash";
import { classifyAutoTags } from "./autotags";

export { getDuplicateGroups, type DuplicateGroup };

export async function findDuplicateGroups(): Promise<DuplicateGroup[]> {
  return getDuplicateGroups();
}

export interface IntegrityProgress {
  checked: number;
  total: number;
  broken: number;
  currentFile: string | null;
  done: boolean;
}

export interface IntegrityResult {
  checked: number;
  brokenIds: string[];
}

export async function checkIntegrity(
  photos: PhotoRow[],
  onProgress?: (p: IntegrityProgress) => void
): Promise<IntegrityResult> {
  const brokenIds: string[] = [];
  let checked = 0;
  for (const photo of photos) {
    if (!photo.remote_file_id) continue;
    checked++;
    onProgress?.({
      checked,
      total: photos.length,
      broken: brokenIds.length,
      currentFile: photo.filename,
      done: false,
    });
    try {
      await getFile(photo.remote_file_id);
      if (photo.preview_file_id) {
        await getFile(photo.preview_file_id);
      }
    } catch {
      brokenIds.push(photo.id);
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  onProgress?.({
    checked,
    total: photos.length,
    broken: brokenIds.length,
    currentFile: null,
    done: true,
  });
  return { checked, brokenIds };
}

export async function removeBrokenPhotos(ids: string[]): Promise<void> {
  for (const id of ids) {
    await updatePhoto(id, { status: "failed", error: "File missing from Telegram" });
  }
}

export type VerificationProgress = IntegrityProgress;

export interface VerificationResult {
  checked: number;
  broken: { id: string; filename: string }[];
  sampledAt: number;
}

// Stride sample — deterministic spread (re-runs re-check the same rows), not random.
// Inclusive linspace over [0, rows.length-1]: rows are newest-first, so this keeps
// the newest upload (index 0) and the oldest in every sample, unlike a half-open stride.
function sampleRows<T>(rows: T[], sampleSize: number): T[] {
  if (rows.length <= sampleSize) return rows;
  if (sampleSize < 2) return [rows[0]];
  const sampled: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor((i * (rows.length - 1)) / (sampleSize - 1));
    if (seen.has(idx)) continue;
    seen.add(idx);
    sampled.push(rows[idx]);
  }
  return sampled;
}

export async function verifyBackupSample(
  sampleSize = 25,
  onProgress?: (p: VerificationProgress) => void
): Promise<VerificationResult> {
  const rows = await getPhotosByUploadStatus("uploaded");
  const sample = sampleRows(
    rows.filter((p): p is PhotoRow & { remote_file_id: string } => p.remote_file_id != null),
    sampleSize
  );
  const broken: { id: string; filename: string }[] = [];
  let checked = 0;
  for (const photo of sample) {
    checked++;
    onProgress?.({
      checked,
      total: sample.length,
      broken: broken.length,
      currentFile: photo.filename,
      done: false,
    });
    try {
      await getFile(photo.remote_file_id);
      if (photo.preview_file_id) {
        await getFile(photo.preview_file_id);
      }
    } catch {
      broken.push({ id: photo.id, filename: photo.filename });
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  onProgress?.({
    checked,
    total: sample.length,
    broken: broken.length,
    currentFile: null,
    done: true,
  });
  return { checked, broken, sampledAt: Date.now() };
}

// --- Near-duplicate finder (perceptual dHash over JPEG DC data) ---

// Two photos whose 64-bit dHashes differ by ≤ this many bits land in one
// cluster. 8 of 64 is the sweet spot from dHash practice: catches
// re-encodes/crops-at-same-composition, while unrelated shots of the same
// scene (different framing) sit ~16+ bits apart.
const NEARDUP_THRESHOLD = 8;

// DC decode reads the whole file — cap the byte size so a stray 40 MB
// panorama doesn't stall the scan (bigger files are skipped and reported).
const MAX_DECODE_BYTES = 25 * 1024 * 1024;

export interface NearDupProgress {
  decoded: number;
  cached: number;
  total: number;
  skipped: number;
  currentFile: string | null;
  done: boolean;
}

export interface NearDupGroup {
  photos: PhotoRow[]; // [0] = representative (newest taken_at)
}

interface ScanResult {
  groups: NearDupGroup[];
  skipped: number;
  decodeFailed: number;
}

export async function scanNearDuplicates(
  onProgress?: (p: NearDupProgress) => void
): Promise<ScanResult> {
  const rows = await getJpegRowsForPhash();
  const phashed = await getPhashedIds();
  const pairs0 = await getAllPhashPairs();
  const allHashes = new Map<string, string>(pairs0);
  const byId = new Map<string, PhotoRow>();
  let skipped = 0;
  let decodeFailed = 0;
  let cached = 0;
  let decoded = 0;
  const pendingPhash: { id: string; phash: string }[] = [];

  for (const row of rows) {
    byId.set(row.id, row);
    onProgress?.({
      decoded,
      cached,
      total: rows.length,
      skipped,
      currentFile: row.filename,
      done: false,
    });
    if (phashed.has(row.id)) {
      cached++;
      continue;
    }
    const bytes = await jpegBytesFor(row);
    if (!bytes) {
      skipped++;
      continue;
    }
    let grid = null;
    try {
      grid = dcGridFromJpeg(bytes);
    } catch {
      grid = null;
    }
    if (!grid) {
      decodeFailed++;
      continue;
    }
    const hash = dHashFromDc(grid);
    allHashes.set(row.id, hash);
    pendingPhash.push({ id: row.id, phash: hash });
    decoded++;
    if (pendingPhash.length >= 50) {
      await setPhashBatch(pendingPhash.splice(0));
    }
    await new Promise((r) => setTimeout(r, 15));
  }
  if (pendingPhash.length > 0) await setPhashBatch(pendingPhash);

  // Cluster over ALL row hashes (fresh + cached) — clustering only fresh
  // decodes would make a cached rescan erase its own results and keep new
  // photos from ever matching an older photo's persisted hash.
  const allItems: HashedItem[] = [];
  for (const row of rows) {
    const h = allHashes.get(row.id);
    if (h) allItems.push({ id: row.id, hash: h });
    // Yield periodically — clustering is O(n²) over ~2k hashes and the row
    // loop's own 15 ms sleeps don't apply to cached rows.
    if (allItems.length % 200 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const clusters = clusterByDistance(allItems, NEARDUP_THRESHOLD);
  const groups: NearDupGroup[] = clusters
    .map((c) => ({
      photos: c.members
        .map((m) => byId.get(m.id))
        .filter((p): p is PhotoRow => !!p)
        .sort((a, b) => b.taken_at - a.taken_at), // newest first = representative
    }))
    .filter((g) => g.photos.length >= 2); // pairs map may reference rows outside this scan's scope
  groups.sort((a, b) => b.photos.length - a.photos.length);

  onProgress?.({
    decoded,
    cached,
    total: rows.length,
    skipped,
    currentFile: null,
    done: true,
  });
  return { groups, skipped, decodeFailed };
}

// Computes the same persisted dHash used by the near-duplicate scanner for a
// single photo. SimilarScreen uses this for a photo opened before the user has
// run the full maintenance scan (including local-only viewer entries).
export async function computePhotoPhash(row: PhotoRow): Promise<string | null> {
  const bytes = await jpegBytesFor(row);
  if (!bytes) return null;
  try {
    const grid = dcGridFromJpeg(bytes);
    return grid ? dHashFromDc(grid) : null;
  } catch {
    return null;
  }
}

// Bytes for the decoder: prefer the local file (no network); fall back to the
// channel thumbnail (small JPEG, usually already in the thumb cache).
async function jpegBytesFor(row: PhotoRow): Promise<Uint8Array | null> {
  if (row.local_uri) {
    const local = readBytesIfSmall(row.local_uri);
    if (local) return local;
  }
  const fid = row.thumb_file_id ?? row.preview_file_id;
  if (fid) {
    try {
      const token = await tokenForPhoto(row);
      const path = await getCachedTelegramFile(fid, "jpg", token);
      const cached = readBytesIfSmall(path);
      if (cached) return cached;
    } catch {}
  }
  return null;
}

function readBytesIfSmall(path: string): Uint8Array | null {
  let handle: ReturnType<File["open"]> | null = null;
  try {
    const f = new File(path);
    if (!f.exists || f.size > MAX_DECODE_BYTES) return null;
    handle = f.open(FileMode.ReadOnly);
    return handle.readBytes(f.size);
  } catch {
    return null;
  } finally {
    try {
      handle?.close();
    } catch {}
  }
}

// --- Remote wipe (#9) ---

export interface WipeResult {
  deleted: number;
  freedBytes: number;
  kept: number;
}

// Erases the local copies of every backed-up photo (the channel copies are
// the archive — the DB rows survive as their record so nothing re-uploads).
// Per-photo getFile verification before deletion, same as Free up space: a
// row whose cloud copy no longer resolves is KEPT on device. Android may show
// a per-chunk system delete dialog; a user cancel falls through to the
// exists re-check, so whatever survived is counted as kept. Replay-safe: a
// second run finds no local copies and reports 0.
export async function wipeLocalCopies(
  onProgress?: (done: number, total: number) => void
): Promise<WipeResult> {
  const rows = await getWipeLocalCandidates();
  let deleted = 0;
  let freedBytes = 0;
  let kept = 0;

  const deletable: PhotoRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    onProgress?.(i, rows.length);
    try {
      await getFile(rows[i].remote_file_id!);
      deletable.push(rows[i]);
    } catch {
      kept++;
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  const goneIds: string[] = [];
  for (let i = 0; i < deletable.length; i += 200) {
    const chunk = deletable.slice(i, i + 200);
    onProgress?.(i, deletable.length);
    try {
      await MediaLibrary.Asset.delete(chunk.map((c) => new MediaLibrary.Asset(c.local_id!)));
    } catch {
      // User cancel / partial failure — the exists re-check below counts truth.
    }
    for (const c of chunk) {
      try {
        if (!new File(c.local_uri!).exists) {
          deleted++;
          freedBytes += c.size ?? 0;
          goneIds.push(c.id);
        } else {
          kept++;
        }
      } catch {
        kept++;
      }
    }
  }
  await clearLocalUris(goneIds);
  onProgress?.(deletable.length, deletable.length);
  return { deleted, freedBytes, kept };
}

// --- Self-repair (#2, R27) ---

export interface RepairResult {
  enqueued: number;
  skipped: number;
}

// Re-enqueues broken uploads (from verification or the weekly digest) whose
// local file still exists. The queue row is upload_type='repair', which makes
// uploadQueueItem bypass the hash-duplicate short-circuit (the hash matches
// the broken row by definition) and delete the replaced channel messages
// after success. Rows without a local copy are skipped — they can only be
// re-saved via the Telegram app.
export async function repairBrokenUploads(
  broken: { id: string; filename: string }[],
  onProgress?: (done: number, total: number, current: string | null) => void
): Promise<RepairResult> {
  let enqueued = 0;
  let skipped = 0;
  for (let i = 0; i < broken.length; i++) {
    const b = broken[i];
    onProgress?.(i, broken.length, b.filename);
    try {
      const row = await getPhoto(b.id);
      if (!row || !row.local_id || !row.local_uri) {
        skipped++;
        continue;
      }
      // Split videos are NOT repairable this way: their part chain was
      // already persisted at upload time, and re-entering the splitter with
      // those resumeParts would replay the old (broken) upload as a no-op.
      // They can only be re-saved via the Telegram app or a fresh re-upload.
      if (row.parts) {
        skipped++;
        continue;
      }
      if (!new File(row.local_uri).exists) {
        skipped++;
        continue;
      }
      const created = await enqueueUpload({
        local_id: row.local_id,
        local_uri: row.local_uri,
        filename: row.filename,
        folder: row.folder,
        size: row.size,
        taken_at: row.taken_at,
        added_at: row.added_at,
        content_hash: row.content_hash,
        upload_type: "repair",
      });
      if (created > 0) {
        enqueued++;
        // Mark honestly: the cloud copy is broken and a repair is in flight.
        // A completed repair flips this back to 'uploaded' with fresh ids.
        await updatePhoto(row.id, { status: "failed", error: "Re-uploading (self-repair)" });
      } else {
        // An active queue row for this asset already exists (uq_queue_active_local).
        skipped++;
      }
    } catch {
      skipped++;
    }
  }
  onProgress?.(broken.length, broken.length, null);
  return { enqueued, skipped };
}

// --- Auto-tag backfill (filename/mime classification) ---

export interface AutoTagProgress {
  current: number;
  total: number;
  tagged: number;
  currentFile: string | null;
  done: boolean;
}

export interface AutoTagResult {
  tagged: number;
  scanned: number;
}

// Appends missing AUTO_TAG classifications to photos.tags for the existing
// library (new uploads get them via buildTags). Rows already fully tagged are
// skipped untouched; one FTS rebuild at the end covers all changed rows.
export async function autoTagBackfill(
  onProgress?: (p: AutoTagProgress) => void
): Promise<AutoTagResult> {
  const { getDb, ftsRebuild } = await import("./db");
  const d = await getDb();
  const rows = await d.getAllAsync<{
    id: string;
    filename: string;
    mime: string | null;
    tags: string | null;
  }>("SELECT id, filename, mime, tags FROM photos WHERE filename != ''");
  const pending: { id: string; tags: string }[] = [];
  for (const row of rows) {
    const existing = new Set((row.tags ?? "").split(/\s+/).filter(Boolean));
    const missing = classifyAutoTags(row.filename, row.mime).filter((t) => !existing.has(t));
    if (missing.length === 0) continue;
    const base = (row.tags ?? "").trim();
    pending.push({ id: row.id, tags: base ? `${base} ${missing.join(" ")}` : missing.join(" ") });
  }
  let tagged = 0;
  const BATCH = 200;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    await d.withTransactionAsync(async () => {
      for (const item of batch) {
        await d.runAsync("UPDATE photos SET tags = ? WHERE id = ?", [item.tags, item.id]);
      }
    });
    tagged += batch.length;
    onProgress?.({
      current: Math.min(i + BATCH, pending.length),
      total: pending.length,
      tagged,
      currentFile: null,
      done: false,
    });
    await new Promise((r) => setTimeout(r, 15));
  }
  if (tagged > 0) await ftsRebuild();
  onProgress?.({
    current: pending.length,
    total: pending.length,
    tagged,
    currentFile: null,
    done: true,
  });
  return { tagged, scanned: rows.length };
}
