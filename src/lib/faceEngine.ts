// On-device face indexing: BlazeFace detection + MobileFaceNet embeddings,
// then cosine clustering into people. Models are downloaded on demand; this
// module never bundles them.

import { Image } from "react-native";
import {
  getPhotosMissingFaceIndex,
  replaceFacesForPhoto,
  getAllFaceSamples,
  savePeopleClusters,
  type PhotoRow,
  type FaceWrite,
} from "./db";
import { loadModel } from "./mlModels";
import { imageToTensor } from "./imageTensor";
import { photoImageUri } from "./photoSource";
import {
  blazeAnchors,
  decodeBlazeFace,
  nms,
  toPixelCrop,
  type FaceBox,
} from "./faceMath";
import { clusterFaces, normalizeVector } from "./peopleCluster";
import { logDiag } from "./diaglog";

export interface FaceProgress {
  done: number;
  total: number;
  faces: number;
  failed: number;
  currentFile: string | null;
}

export interface FaceIndexResult {
  done: number;
  faces: number;
  failed: number;
  people: number;
}

async function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (e) => reject(e)
    );
  });
}

async function outputAsFloats(buffer: ArrayBuffer): Promise<Float32Array> {
  return new Float32Array(buffer);
}

async function detectFaces(uri: string, model: any): Promise<FaceBox[]> {
  const tensor = await imageToTensor(uri, 128, 128, "symmetric");
  const outputs: ArrayBuffer[] = await model.run([tensor.buffer]);
  // Output order is model-defined; identify the 16-value regressors by size.
  const anchors = blazeAnchors();
  let regressors: Float32Array | null = null;
  let scores: Float32Array | null = null;
  for (const out of outputs) {
    const floats = await outputAsFloats(out);
    if (floats.length >= anchors.length * 16) regressors = floats;
    else if (floats.length >= anchors.length) scores = floats;
  }
  if (!regressors || !scores) {
    throw new Error("Face detector returned an unexpected tensor layout");
  }
  return nms(decodeBlazeFace(regressors, scores, anchors, { minScore: 0.55 }), 0.3).slice(0, 5);
}

async function embedFace(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number },
  model: any
): Promise<number[]> {
  const tensor = await imageToTensor(uri, 112, 112, "symmetric", crop);
  const outputs: ArrayBuffer[] = await model.run([tensor.buffer]);
  if (!outputs?.length) throw new Error("Face embedder returned nothing");
  const floats = await outputAsFloats(outputs[0]);
  const normalized = normalizeVector(Array.from(floats));
  if (!normalized) throw new Error("Face embedder returned a zero vector");
  return normalized;
}

/** Detect + embed every face in one photo. */
export async function indexPhotoFaces(
  row: PhotoRow,
  detectModel: any,
  embedModel: any
): Promise<FaceWrite[]> {
  const uri = await photoImageUri(row);
  if (!uri) return [];
  const { width, height } = await imageSize(uri);
  if (!width || !height) return [];
  const boxes = await detectFaces(uri, detectModel);
  const faces: FaceWrite[] = [];
  for (const box of boxes) {
    const crop = toPixelCrop(box, width, height, 0.25);
    try {
      const embedding = await embedFace(uri, crop, embedModel);
      faces.push({
        box: [crop.originX, crop.originY, crop.width, crop.height],
        embedding,
      });
    } catch (e: any) {
      void logDiag("sync", `Face embedding failed for ${row.filename}: ${e?.message ?? e}`);
    }
  }
  return faces;
}

/**
 * Index a batch of photos, then recluster ALL stored faces. Clustering is
 * global (transitive), so a new batch can merge/split existing people.
 */
export async function buildPeopleIndex(
  limit = 25,
  onProgress?: (p: FaceProgress) => void
): Promise<FaceIndexResult> {
  const detectModel = await loadModel("face-detect");
  const embedModel = await loadModel("face-embed");
  const rows = await getPhotosMissingFaceIndex(limit);
  let done = 0;
  let faces = 0;
  let failed = 0;
  for (const row of rows) {
    onProgress?.({ done, total: rows.length, faces, failed, currentFile: row.filename });
    try {
      const found = await indexPhotoFaces(row, detectModel, embedModel);
      await replaceFacesForPhoto(row.id, found);
      faces += found.length;
      done++;
    } catch (e: any) {
      failed++;
      void logDiag("sync", `Face indexing failed for ${row.filename}: ${e?.message ?? e}`);
    }
    onProgress?.({ done, total: rows.length, faces, failed, currentFile: row.filename });
    await new Promise((r) => setTimeout(r, 150));
  }

  // Global recluster from the stored embeddings.
  const stored = await getAllFaceSamples();
  const samples = stored.map((s) => ({
    id: `${s.photoId}|${s.faceIndex}`,
    photoId: s.photoId,
    embedding: s.embedding,
  }));
  const clusters = clusterFaces(samples, 0.62);
  await savePeopleClusters(
    clusters.map((c) => ({
      faceKeys: c.faceIds,
      coverPhotoId: c.photoIds[0] ?? null,
    }))
  );
  return { done, faces, failed, people: clusters.length };
}
