// Index export (R31): the whole photo index as CSV — sizes, dates, folders,
// hashes, channel message ids, GPS. Complements the JSON backup (which is
// for restore) with a human/Excel-readable format for auditing and
// lock-in-free exits. The archive itself stays in the channel; this exports
// only the index.

import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getDb } from "./db";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  // Quote anything with a comma, quote or newline; double embedded quotes.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function iso(ms: number | null | undefined): string {
  return ms ? new Date(ms).toISOString() : "";
}

const HEADER =
  "id,filename,folder,taken_at,uploaded_at,size_bytes,mime,width,height,duration_ms," +
  "camera,device,content_hash,message_id,latitude,longitude,status,favorite";

export async function buildPhotosCsv(): Promise<string> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT id, filename, folder, taken_at, uploaded_at, size, mime, width, height,
            duration, camera, device, content_hash, message_id, latitude, longitude,
            status, favorite
     FROM photos ORDER BY taken_at ASC`
  );
  const lines = [HEADER];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.filename,
        r.folder,
        iso(r.taken_at),
        iso(r.uploaded_at),
        r.size,
        r.mime,
        r.width,
        r.height,
        r.duration,
        r.camera,
        r.device,
        r.content_hash,
        r.message_id,
        r.latitude,
        r.longitude,
        r.status,
        r.favorite ? "1" : "0",
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export async function exportIndexCsv(): Promise<string> {
  const csv = await buildPhotosCsv();
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `photogrambot-index-${stamp}.csv`);
  if (file.exists) file.delete();
  file.write(csv);
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Sharing is not available on this device");
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      dialogTitle: "Export library index",
    });
  } finally {
    // The share sheet holds its own copy once handed off.
    try {
      file.delete();
    } catch {}
  }
  return file.uri;
}
