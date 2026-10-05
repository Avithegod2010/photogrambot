// Monthly ZIP export (#8, R27): bundles one calendar month's backed-up
// originals into a single archive and hands it to the Android share sheet.
//
// Memory model: JSZip builds the archive in RAM, so the export is capped —
// per-file at the Bot API's 20 MB download reach, and 500 MB total per
// archive (JPEG/video bytes are stored uncompressed; they're already
// compressed and JSZip's deflate would burn minutes for ~0% gain). Files
// beyond the cap are counted and reported, not silently dropped.

import JSZip from "jszip";
import { File, Paths, FileMode } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getUploadedPhotosInMonth, type PhotoRow } from "./db";
import { downloadFile } from "./telegram";
import { tokenForPhoto } from "./destinations";

const BOT_DOWNLOAD_LIMIT = 20 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

export interface ZipExportProgress {
  downloaded: number;
  total: number;
  currentFile: string | null;
  bytes: number;
}

export interface ZipExportResult {
  count: number;
  bytes: number;
  skippedOversize: number;
  skippedCap: number;
  fileName: string;
}

function safeName(name: string): string {
  return (name || "photo").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}

export async function exportMonthZip(
  year: number,
  month: number, // 0-based
  onProgress?: (p: ZipExportProgress) => void
): Promise<ZipExportResult> {
  const rows = await getUploadedPhotosInMonth(year, month);
  if (rows.length === 0) {
    throw new Error("No backed-up photos in that month.");
  }

  const zip = new JSZip();
  let bytes = 0;
  let count = 0;
  let skippedOversize = 0;
  let skippedCap = 0;

  for (let i = 0; i < rows.length; i++) {
    const row: PhotoRow = rows[i];
    onProgress?.({ downloaded: count, total: rows.length, currentFile: row.filename, bytes });
    const size = row.size ?? 0;
    if (size > BOT_DOWNLOAD_LIMIT) {
      skippedOversize++;
      continue;
    }
    if (bytes + size > MAX_ARCHIVE_BYTES) {
      skippedCap++;
      continue;
    }
    const tmp = new File(Paths.cache, `pb_zip_${Date.now()}_${i}_${safeName(row.filename)}`);
    try {
      const token = await tokenForPhoto(row);
      await downloadFile(row.remote_file_id!, tmp.uri, token ?? undefined);
      if (tmp.exists) {
        const handle = tmp.open();
        try {
          const data = handle.readBytes(tmp.size);
          // Index prefix keeps duplicate filenames from colliding in the archive.
          zip.file(`${String(count + 1).padStart(4, "0")}_${safeName(row.filename)}`, data);
          bytes += tmp.size;
          count++;
        } finally {
          try {
            handle.close();
          } catch {}
        }
      }
    } catch {
      // Unreachable file — skip it; the archive still builds with the rest.
    } finally {
      try {
        if (tmp.exists) tmp.delete();
      } catch {}
    }
  }

  if (count === 0) {
    throw new Error(
      "Nothing exportable — every photo in that month is either over the bot's 20 MB download reach or unreachable."
    );
  }

  onProgress?.({ downloaded: count, total: rows.length, currentFile: "Packing archive…", bytes });
  const data = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  const fileName = `PhotogramBot_${year}-${String(month + 1).padStart(2, "0")}.zip`;
  const out = new File(Paths.cache, fileName);
  const outHandle = out.open(FileMode.WriteOnly);
  try {
    outHandle.writeBytes(data);
  } finally {
    try {
      outHandle.close();
    } catch {}
  }

  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Sharing is not available on this device");
    }
    await Sharing.shareAsync(out.uri, {
      mimeType: "application/zip",
      dialogTitle: `Export ${fileName}`,
    });
  } finally {
    // The share sheet has its own copy once handed off; the cache copy can go.
    try {
      out.delete();
    } catch {}
  }

  return { count, bytes, skippedOversize, skippedCap, fileName };
}
