// Pure vector math for the semantic index — no module dependencies, so the
// node harness can import the exact code that ships in the app.

export const EMBEDDING_DIM = 768;

// Vectors are stored as 0..255 bytes (value + 128) with a per-vector max-abs
// scale. Cosine on the quantized bytes keeps the ranking — exact float
// fidelity is unnecessary for top-K retrieval.
export function quantizeEmbedding(values: number[]): Uint8Array {
  let maxAbs = 0;
  for (const v of values) {
    const a = Math.abs(v);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs > 0 ? 127 / maxAbs : 1;
  const out = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const q = Math.round(values[i] * scale) + 128;
    out[i] = q < 0 ? 0 : q > 255 ? 255 : q;
  }
  return out;
}

export function cosineSimilarity(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - 128;
    const y = b[i] - 128;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}
