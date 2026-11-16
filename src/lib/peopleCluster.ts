// Face-embedding clustering (pure). The embedding provider is pluggable: a
// future on-device model or an opt-in cloud pass writes FaceSample rows, and
// this module groups them. Cosine similarity + union-find (transitive), then
// deterministic clusters ordered by size.

export interface FaceSample {
  id: string;
  photoId: string;
  embedding: number[];
}

export interface PersonCluster {
  id: string;
  faceIds: string[];
  photoIds: string[];
  centroid: number[];
}

export function normalizeVector(v: number[]): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  let norm = 0;
  for (const x of v) {
    if (!Number.isFinite(x)) return null;
    norm += x * x;
  }
  norm = Math.sqrt(norm);
  if (!Number.isFinite(norm) || norm === 0) return null;
  return v.map((x) => x / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function meanVector(vectors: number[][]): number[] {
  const dim = Math.max(...vectors.map((v) => v.length));
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < v.length; i++) out[i] += v[i];
  }
  return out.map((x) => x / vectors.length);
}

/**
 * Group face samples whose cosine similarity is >= threshold (0..1).
 * Zero/invalid vectors are ignored. Clusters are ordered by descending photo
 * count, then by the first face id for determinism.
 */
export function clusterFaces(samples: FaceSample[], threshold = 0.62): PersonCluster[] {
  const valid = samples
    .map((s) => ({ ...s, embedding: normalizeVector(s.embedding) }))
    .filter((s): s is FaceSample => !!s.embedding);
  if (valid.length === 0) return [];

  const parent = valid.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (cosineSimilarity(valid[i].embedding, valid[j].embedding) >= threshold) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, FaceSample[]>();
  valid.forEach((sample, i) => {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(sample);
    groups.set(root, list);
  });

  const clusters: PersonCluster[] = [...groups.values()].map((faces) => {
    const photoIds = [...new Set(faces.map((f) => f.photoId))];
    return {
      id: `person_${faces.map((f) => f.id).sort()[0]}`,
      faceIds: faces.map((f) => f.id),
      photoIds,
      centroid: meanVector(faces.map((f) => f.embedding)),
    };
  });

  clusters.sort(
    (a, b) =>
      b.photoIds.length - a.photoIds.length ||
      (a.faceIds[0] ?? "").localeCompare(b.faceIds[0] ?? "")
  );
  return clusters;
}
