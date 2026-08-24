import { getDuplicateGroups, updatePhoto, type PhotoRow, type DuplicateGroup } from "./db";
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
