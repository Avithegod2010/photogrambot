// Image → Float32 tensor for the on-device models. Resizes/crops with
// expo-image-manipulator, decodes the JPEG with jpeg-js (pure JS) and builds
// an NHWC Float32Array. All intermediate files are deleted.

import { File } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { decode as decodeJpeg } from "jpeg-js";

export type TensorMode = "unit" | "symmetric";

export interface CropBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

async function fileBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  if (!file.exists) throw new Error("Image file missing");
  const bytes = (file as any).bytes;
  if (typeof bytes === "function") return await bytes.call(file);
  // Fallback for older runtime builds.
  const base64 = await file.base64();
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Decode an image into a NHWC Float32 tensor.
 * mode "unit" maps [0,255] → [0,1]; "symmetric" maps to [-1,1] (BlazeFace).
 */
export async function imageToTensor(
  uri: string,
  width: number,
  height: number,
  mode: TensorMode = "unit",
  crop?: CropBox
): Promise<Float32Array> {
  const actions: ImageManipulator.Action[] = [];
  if (crop && crop.width > 1 && crop.height > 1) {
    actions.push({ crop });
  }
  actions.push({ resize: { width, height } });
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  try {
    const bytes = await fileBytes(result.uri);
    const decoded = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 64,
    });
    if (decoded.width !== width || decoded.height !== height) {
      throw new Error(`Unexpected tensor image ${decoded.width}x${decoded.height}`);
    }
    const out = new Float32Array(width * height * 3);
    const rgba = decoded.data;
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      if (mode === "symmetric") {
        out[j] = rgba[i] / 127.5 - 1;
        out[j + 1] = rgba[i + 1] / 127.5 - 1;
        out[j + 2] = rgba[i + 2] / 127.5 - 1;
      } else {
        out[j] = rgba[i] / 255;
        out[j + 1] = rgba[i + 1] / 255;
        out[j + 2] = rgba[i + 2] / 255;
      }
    }
    return out;
  } finally {
    try {
      new File(result.uri).delete();
    } catch {}
  }
}

export function topK(values: Float32Array | number[], k: number): { index: number; score: number }[] {
  const arr = Array.from(values);
  const out: { index: number; score: number }[] = [];
  for (let i = 0; i < arr.length; i++) {
    const score = arr[i];
    if (!Number.isFinite(score)) continue;
    if (out.length < k) {
      out.push({ index: i, score });
      out.sort((a, b) => b.score - a.score);
    } else if (score > out[out.length - 1].score) {
      out[out.length - 1] = { index: i, score };
      out.sort((a, b) => b.score - a.score);
    }
  }
  return out;
}

/** Softmax in place (when a classifier returns logits rather than probs). */
export function softmax(values: Float32Array | number[]): Float32Array {
  const arr = Array.from(values);
  const max = Math.max(...arr);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Math.exp(arr[i] - max);
    sum += arr[i];
  }
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / sum;
  return out;
}
