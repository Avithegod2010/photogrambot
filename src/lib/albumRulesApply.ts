// Applies album auto-add rules. Idempotent: addToAlbum uses INSERT OR IGNORE,
// so running after every scan only adds new matches.

import { addToAlbum, getDb, type PhotoRow } from "./db";
import { loadPrefs } from "./settings";
import { hasRuleConditions, type AlbumRule } from "./albumRules";

export async function photosForAlbumRule(rule: AlbumRule, limit = 5000): Promise<PhotoRow[]> {
  const d = await getDb();
  const conds = [
    "status IN ('uploaded','local')",
    "id NOT IN (SELECT photo_id FROM trash)",
  ];
  const params: any[] = [];
  if (rule.folder?.trim()) {
    conds.push("LOWER(folder) LIKE ?");
    params.push(`%${rule.folder.trim().toLowerCase()}%`);
  }
  if (rule.tag?.trim()) {
    conds.push("LOWER(tags) LIKE ?");
    params.push(`%${rule.tag.trim().toLowerCase()}%`);
  }
  if (rule.favorite) conds.push("favorite = 1");
  params.push(limit);
  return d.getAllAsync<PhotoRow>(
    `SELECT * FROM photos WHERE ${conds.join(" AND ")} ORDER BY taken_at DESC LIMIT ?`,
    params
  );
}

export async function applyAlbumRules(): Promise<{ added: number; albums: number }> {
  let added = 0;
  let albums = 0;
  try {
    const { albumRules } = await loadPrefs();
    for (const [albumId, rule] of Object.entries(albumRules ?? {})) {
      if (!hasRuleConditions(rule)) continue;
      const rows = await photosForAlbumRule(rule);
      if (rows.length === 0) continue;
      await addToAlbum(Number(albumId), rows.map((p) => p.id));
      added += rows.length;
      albums++;
    }
  } catch {
    // Rules are best-effort; a failure must never break a scan.
  }
  return { added, albums };
}
