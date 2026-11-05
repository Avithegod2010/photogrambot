// Downloadable on-device models. Nothing is bundled in the APK: the user
// downloads what they need from Settings, and the files live in the app's
// document directory. A custom URL per model lets the owner host their own
// copies (or point at a mirror).

import { Directory, File, Paths } from "expo-file-system";
import { loadPrefs } from "./settings";

export type ModelId = "face-detect" | "face-embed" | "scene" | "imagenet-labels";

export interface ModelSpec {
  id: ModelId;
  name: string;
  filename: string;
  url: string;
  approxBytes: number;
  kind: "tflite" | "text";
  note: string;
}

// Small, well-known models:
// - BlazeFace short-range (MediaPipe, ~2.3 MB) for face boxes.
// - MobileFaceNet (~9 MB float; the smallest widely-available 192-d face
//   embedding model — the same family Ente's FlutterFace demo uses).
// - MobileNetV3-Small (ImageNet, ~5 MB) for scene labels.
export const MODELS: ModelSpec[] = [
  {
    id: "face-detect",
    name: "Face detection",
    filename: "blaze_face_short_range.tflite",
    url: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
    approxBytes: 2_300_000,
    kind: "tflite",
    note: "BlazeFace short-range — finds faces in photos.",
  },
  {
    id: "face-embed",
    name: "Face recognition",
    filename: "mobilefacenet.tflite",
    url: "https://github.com/MCarlomagno/FaceRecognitionAuth/raw/master/assets/mobilefacenet.tflite",
    approxBytes: 9_461_795,
    kind: "tflite",
    note: "MobileFaceNet — 192-d identity vectors, grouped into people.",
  },
  {
    id: "scene",
    name: "Scene labels",
    filename: "mobilenet_v3_small.tflite",
    url: "https://storage.googleapis.com/tfhub-lite-models/google/lite-model/imagenet/mobilenet_v3_small_100_224/classification/5/default/1.tflite",
    approxBytes: 5_000_000,
    kind: "tflite",
    note: "MobileNetV3-Small — 1,000 ImageNet labels (beach, dog, receipt…).",
  },
  {
    id: "imagenet-labels",
    name: "ImageNet labels",
    filename: "imagenet_labels.txt",
    url: "https://storage.googleapis.com/download.tensorflow.org/data/ImageNetLabels.txt",
    approxBytes: 35_000,
    kind: "text",
    note: "Label names for the scene model (one per line).",
  },
];

const DIR_NAME = "ml-models";
const modelCache = new Map<ModelId, any>();

export function modelSpec(id: ModelId): ModelSpec {
  const spec = MODELS.find((m) => m.id === id);
  if (!spec) throw new Error(`Unknown model ${id}`);
  return spec;
}

function modelDir(): Directory {
  return new Directory(Paths.document, DIR_NAME);
}

export function modelFile(id: ModelId): File {
  return new File(modelDir(), modelSpec(id).filename);
}

export async function customModelUrls(): Promise<Partial<Record<ModelId, string>>> {
  try {
    const prefs = await loadPrefs();
    const raw = (prefs as any).mlModelUrls;
    if (!raw || typeof raw !== "object") return {};
    const out: Partial<Record<ModelId, string>> = {};
    for (const spec of MODELS) {
      const value = (raw as any)[spec.id];
      if (typeof value === "string" && /^https?:\/\//i.test(value)) out[spec.id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export async function modelUrl(id: ModelId): Promise<string> {
  const custom = await customModelUrls();
  return custom[id] ?? modelSpec(id).url;
}

export interface ModelStatus {
  id: ModelId;
  downloaded: boolean;
  bytes: number;
  url: string;
}

export async function modelStatus(id: ModelId): Promise<ModelStatus> {
  const file = modelFile(id);
  let bytes = 0;
  try {
    if (file.exists) bytes = file.size ?? 0;
  } catch {}
  return {
    id,
    downloaded: bytes > 1000,
    bytes,
    url: await modelUrl(id),
  };
}

export async function allModelStatuses(): Promise<ModelStatus[]> {
  return Promise.all(MODELS.map((m) => modelStatus(m.id)));
}

export async function downloadModel(
  id: ModelId,
  onProgress?: (written: number, total: number) => void
): Promise<File> {
  const dir = modelDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const destination = modelFile(id);
  if (destination.exists) destination.delete();
  const task = File.createDownloadTask(await modelUrl(id), destination, {
    onProgress: (p) => onProgress?.(p.bytesWritten, p.totalBytes),
  });
  const file = await task.downloadAsync();
  if (!file || !file.exists || (file.size ?? 0) < 1000) {
    throw new Error("Download failed or the file is not a valid model");
  }
  modelCache.delete(id);
  return file;
}

export async function deleteModel(id: ModelId): Promise<void> {
  const file = modelFile(id);
  try {
    if (file.exists) file.delete();
  } catch {}
  modelCache.delete(id);
}

/** Loads (and caches) a TFLite model from the downloaded file. */
export async function loadModel(id: ModelId): Promise<any> {
  if (modelCache.has(id)) return modelCache.get(id);
  const status = await modelStatus(id);
  if (!status.downloaded) throw new Error(`${modelSpec(id).name} is not downloaded yet`);
  const { loadTensorflowModel } = await import("react-native-fast-tflite");
  const model = await loadTensorflowModel({ url: modelFile(id).uri }, []);
  modelCache.set(id, model);
  return model;
}

export async function readLabels(): Promise<string[]> {
  const file = modelFile("imagenet-labels");
  if (!file.exists) throw new Error("ImageNet labels are not downloaded yet");
  const text = await file.text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function clearModelCache(): void {
  modelCache.clear();
}
