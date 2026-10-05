import { embedText } from "./ai";
import {
  getEmbeddingCorpus,
  getPhotosByIds,
  getSemanticCorpus,
  setPhotoEmbedding,
  type PhotoRow,
} from "./db";
import { EMBEDDING_DIM as EMBED_DIM, cosineSimilarity, quantizeEmbedding } from "./vecmath";

export const EMBEDDING_MODEL = "gemini-embedding-001";

export interface EmbedBackfillProgress {
  done: number;
  total: number;
}

/**
 * Index photos that don't have an embedding yet. Each embedded row drops out
 * of the missing-corpus query, so the loop always re-queries from offset 0.
 * Give up after a full pass with zero successes (API down / quota) instead of
 * spinning on the same failing rows.
 */
export async function embedIndexBackfill(
  apiKey: string,
  onProgress?: (p: EmbedBackfillProgress) => void,
  totalOverride?: number
): Promise<{ embedded: number; failed: number }> {
  const total = totalOverride ?? 0;
  let embedded = 0;
  let failed = 0;
  for (;;) {
    const batch = await getSemanticCorpus(20);
    if (batch.length === 0) break;
    let batchEmbedded = 0;
    for (const item of batch) {
      const vec = await embedText({ apiKey, text: item.text, taskType: "RETRIEVAL_DOCUMENT" });
      if (vec && vec.length === EMBED_DIM) {
        await setPhotoEmbedding(item.id, EMBEDDING_MODEL, quantizeEmbedding(vec));
        embedded++;
        batchEmbedded++;
      } else {
        failed++;
      }
      onProgress?.({ done: embedded, total });
      // Be polite to the API — one small request at a time with spacing.
      await new Promise((r) => setTimeout(r, 350));
    }
    if (batchEmbedded === 0) break;
  }
  return { embedded, failed };
}

/** Photos whose text suggests they're relevant to the query, best first. */
export async function searchSemantic(
  apiKey: string,
  query: string,
  limit = 60
): Promise<PhotoRow[]> {
  const qvec = await embedText({
    apiKey,
    text: query,
    taskType: "RETRIEVAL_QUERY",
    model: EMBEDDING_MODEL,
  });
  if (!qvec || qvec.length !== EMBED_DIM) return [];
  const q = quantizeEmbedding(qvec);
  const corpus = await getEmbeddingCorpus();
  if (corpus.length === 0) return [];
  const ranked = corpus
    .map((row) => ({ id: row.photo_id, score: cosineSimilarity(q, row.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((entry) => entry.score > 0.25);
  if (ranked.length === 0) return [];
  return getPhotosByIds(ranked.map((r) => r.id));
}
