// Tiny "did you mean" helper for the search box. Pure and dependency-free.

export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[t.length];
}

/** Returns the closest candidate within a length-aware distance, else null. */
export function suggestTerm(
  query: string,
  candidates: readonly string[],
  maxDistance?: number
): string | null {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return null;
  const limit = maxDistance ?? Math.min(2, Math.max(1, Math.floor(q.length / 4)));
  let best: { term: string; d: number } | null = null;
  for (const candidate of candidates) {
    const c = candidate.trim();
    if (!c || c.toLowerCase() === q) continue;
    const d = levenshtein(q, c);
    if (d <= limit && (!best || d < best.d)) best = { term: c, d };
  }
  return best?.term ?? null;
}
