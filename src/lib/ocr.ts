// Screenshot OCR (#3 follow-up, R30): extracts visible text from
// screenshot-tagged uploads via Gemini vision so word search finds
// "wifi password" style content. Runs as an on-demand Maintenance pass.
//
// Retry model: ocr_text NULL = not done (no preview, network/API failure —
// retried next pass); '' = Gemini saw no text (finished, never requeued).
// Rate: 150 ms spacing between calls; 200-row batches per pass.

import { File } from "expo-file-system";
import {
  getScreenshotOcrPending,
  updatePhoto,
  type PhotoRow,
} from "./db";
import { ocrImageWithGemini } from "./ai";
import { getAiApiKey, loadPrefs } from "./settings";
import { getCachedTelegramFile } from "./media";
import { tokenForPhoto } from "./destinations";
import { logDiag } from "./diaglog";
import { bumpHealth } from "./digest";

export interface OcrProgress {
  done: number;
  total: number;
  currentFile: string | null;
  found: number;
  failed: number;
}

export interface OcrResult {
  done: number;
  found: number;
  failed: number;
}

// Preview/thumbnail URI for the OCR request — screenshot text stays legible
// at preview resolution, and the 65 KB preview keeps uploads cheap. Null for
// rows with neither file id (marked done-empty so they don't loop forever).
async function ocrSourceUri(row: PhotoRow): Promise<string | null> {
  const fid = row.preview_file_id ?? row.thumb_file_id;
  if (!fid) return null;
  const token = await tokenForPhoto(row);
  const uri = await getCachedTelegramFile(fid, "jpg", token);
  const f = new File(uri);
  return f.exists && f.size > 0 ? uri : null;
}

export async function ocrScreenshotBackfill(
  onProgress?: (p: OcrProgress) => void
): Promise<OcrResult> {
  const apiKey = await getAiApiKey();
  if (!apiKey) {
    throw new Error("Add a Gemini API key in Settings → AI captioning first.");
  }
  const { aiModel } = await loadPrefs();
  const model = aiModel || "gemini-2.5-flash";
  const rows = await getScreenshotOcrPending();
  let done = 0;
  let found = 0;
  let failed = 0;
  for (const row of rows) {
    onProgress?.({ done, total: rows.length, currentFile: row.filename, found, failed });
    try {
      const uri = await ocrSourceUri(row);
      if (!uri) {
        // Nothing readable — record as finished-empty instead of retrying forever.
        await updatePhoto(row.id, { ocr_text: "" });
        done++;
        continue;
      }
      const text = await ocrImageWithGemini({ apiKey, model, imageUri: uri });
      await updatePhoto(row.id, { ocr_text: text });
      if (text) {
        found++;
        void bumpHealth("ocr");
      }
      done++;
    } catch (e: any) {
      failed++;
      void logDiag("sync", `OCR failed for ${row.filename}: ${e?.message ?? e}`);
    }
    onProgress?.({ done, total: rows.length, currentFile: row.filename, found, failed });
    await new Promise((r) => setTimeout(r, 150));
  }
  return { done, found, failed };
}
