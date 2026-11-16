// "Best shot" ranking. Used by the near-duplicate/burst cleanup (keep the best
// copy) and the Best of collection. Deliberately metadata-only: favorites,
// resolution, file size and recency — no extra decode pass.

import type { PhotoRow } from "./db";

export function photoScore(p: PhotoRow): number {
  const megapixels = ((p.width ?? 0) * (p.height ?? 0)) / 1_000_000;
  const sizeMb = (p.size ?? 0) / 1_000_000;
  return (
    (p.favorite ? 100_000 : 0) +
    Math.min(megapixels, 200) * 100 +
    Math.min(sizeMb, 50) +
    (p.taken_at ? 1 : 0)
  );
}

export function sortByBest(photos: PhotoRow[]): PhotoRow[] {
  return [...photos].sort((a, b) => photoScore(b) - photoScore(a));
}

export function rankPhotos(photos: PhotoRow[], limit = 40): PhotoRow[] {
  return sortByBest(photos).slice(0, Math.max(0, limit));
}
