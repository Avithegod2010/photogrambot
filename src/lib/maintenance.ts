import {
  getDuplicateGroups,
  getPhotosByUploadStatus,
  updatePhoto,
  type PhotoRow,
  type DuplicateGroup,
} from "./db";
import { getFile } from "./telegram";

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
function sampleRows<T>(rows: T[], sampleSize: number): T[] {
  if (rows.length <= sampleSize) return rows;
  const sampled: T[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor((i * rows.length) / sampleSize);
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
