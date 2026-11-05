// Scene/object tagging. Two providers:
// - on-device MobileNetV3-Small (downloaded on demand, no network at runtime);
// - opt-in Gemini vision with the user's own tagging key.
// Both write "scene:<label>" tokens into photos.tags so the existing FTS
// search finds them.

import { getPhotosMissingSceneTags, addPhotoTags, type PhotoRow } from "./db";
import { imageToTensor, topK, softmax } from "./imageTensor";
import { loadModel, readLabels } from "./mlModels";
import { photoImageUri } from "./photoSource";
import { getEffectiveTaggingKey, loadPrefs } from "./settings";
import { sceneTagsWithGemini } from "./ai";
import { logDiag } from "./diaglog";

export interface SceneTagProgress {
  done: number;
  total: number;
  tagged: number;
  failed: number;
  currentFile: string | null;
}

export interface SceneTagResult {
  done: number;
  tagged: number;
  failed: number;
}

function labelToTag(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function sourceUri(row: PhotoRow): Promise<string | null> {
  return photoImageUri(row);
}

async function onDeviceLabels(row: PhotoRow): Promise<string[]> {
  const uri = await sourceUri(row);
  if (!uri) return [];
  const model = await loadModel("scene");
  const labels = await readLabels();
  const input = await imageToTensor(uri, 224, 224, "unit");
  const inputSpec: any = Array.isArray((model as any).inputs) ? (model as any).inputs[0] : null;
  const dataType = String(inputSpec?.dataType ?? "float32").toLowerCase();
  let output: ArrayBuffer[];
  if (dataType.includes("uint8")) {
    const bytes = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) bytes[i] = Math.round(input[i] * 255);
    output = await model.run([bytes.buffer]);
  } else {
    output = await model.run([input.buffer]);
  }
  const first = output?.[0];
  if (!first) return [];
  const floats = new Float32Array(first);
  const max = floats.length ? Math.max(...Array.from(floats).slice(0, 1000)) : 0;
  const probs = max > 1.01 || max < -0.01 ? softmax(floats) : floats;
  const top = topK(probs, 6);
  const out: string[] = [];
  for (const { index, score } of top) {
    if (score < 0.08) continue;
    // TF Hub classifiers usually emit [background, class0..]; labels may be
    // 1000 or 1001 lines. Pick the mapping that fits.
    const offset = labels.length === floats.length ? 0 : 1;
    const label = labels[index - offset];
    if (!label || /^background$/i.test(label)) continue;
    const tag = labelToTag(label);
    if (tag) out.push(`scene:${tag}`);
  }
  return [...new Set(out)].slice(0, 5);
}

export async function tagScenesOnDevice(
  limit = 50,
  onProgress?: (p: SceneTagProgress) => void
): Promise<SceneTagResult> {
  const rows = await getPhotosMissingSceneTags(limit);
  let done = 0;
  let tagged = 0;
  let failed = 0;
  for (const row of rows) {
    onProgress?.({ done, total: rows.length, tagged, failed, currentFile: row.filename });
    try {
      const tags = await onDeviceLabels(row);
      if (tags.length > 0) {
        await addPhotoTags(row.id, tags);
        tagged++;
      } else {
        // Mark as scanned so the same photo isn't retried forever.
        await addPhotoTags(row.id, ["scene:none"]);
      }
      done++;
    } catch (e: any) {
      failed++;
      void logDiag("sync", `Scene tagging failed for ${row.filename}: ${e?.message ?? e}`);
    }
    onProgress?.({ done, total: rows.length, tagged, failed, currentFile: row.filename });
    await new Promise((r) => setTimeout(r, 120));
  }
  return { done, tagged, failed };
}

export async function tagScenesWithGemini(
  limit = 50,
  onProgress?: (p: SceneTagProgress) => void
): Promise<SceneTagResult> {
  const apiKey = await getEffectiveTaggingKey();
  if (!apiKey) {
    throw new Error("Add a Gemini API key (or a separate tagging key) in Settings first.");
  }
  const { aiModel } = await loadPrefs();
  const model = aiModel || "gemini-2.5-flash";
  const rows = await getPhotosMissingSceneTags(limit);
  let done = 0;
  let tagged = 0;
  let failed = 0;
  for (const row of rows) {
    onProgress?.({ done, total: rows.length, tagged, failed, currentFile: row.filename });
    try {
      const uri = await sourceUri(row);
      if (!uri) {
        await addPhotoTags(row.id, ["scene:none"]);
        done++;
        continue;
      }
      const labels = await sceneTagsWithGemini({ apiKey, model, imageUri: uri });
      if (labels.length > 0) {
        await addPhotoTags(row.id, labels.map((l) => `gemini:${labelToTag(l)}`));
        tagged++;
      } else {
        await addPhotoTags(row.id, ["scene:none"]);
      }
      done++;
    } catch (e: any) {
      failed++;
      void logDiag("sync", `Gemini tagging failed for ${row.filename}: ${e?.message ?? e}`);
    }
    onProgress?.({ done, total: rows.length, tagged, failed, currentFile: row.filename });
    await new Promise((r) => setTimeout(r, 300));
  }
  return { done, tagged, failed };
}
