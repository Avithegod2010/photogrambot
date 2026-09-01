import * as SQLite from "expo-sqlite";

export type PhotoStatus = "local" | "uploading" | "uploaded" | "failed" | "skipped_too_large";

export interface PhotoRow {
  id: string;
  local_id: string | null;
  local_uri: string | null;
  remote_file_id: string | null;
  preview_file_id: string | null;
  thumb_file_id: string | null;
  message_id: number | null;
  preview_message_id: number | null;
  filename: string;
  folder: string | null;
  width: number | null;
  height: number | null;
  size: number | null;
  mime: string | null;
  taken_at: number;
  added_at: number;
  uploaded_at: number | null;
  remote_date: number | null;
  content_hash: string | null;
  device: string | null;
  camera: string | null;
  tags: string | null;
  latitude: number | null;
  longitude: number | null;
  exif: string | null;
  ai_caption: string | null;
  duration: number | null;
  parts: string | null;
  profile_id: string | null;
  favorite: number;
  status: PhotoStatus;
  error: string | null;
  upload_type: string | null;
}

export interface AlbumRow {
  id: number;
  name: string;
  created_at: number;
  locked?: number | null;
}

export interface TrashRow {
  photo_id: string;
  trashed_at: number;
  remote_deleted: number;
}

export interface QueueRow {
  id: number;
  local_id: string;
  local_uri: string;
  filename: string;
  folder: string | null;
  size: number | null;
  taken_at: number;
  added_at: number;
  content_hash: string | null;
  upload_type: string;
  state: "pending" | "running" | "done" | "failed" | "skipped" | "duplicate";
  retries: number;
  next_attempt_at: number | null;
  profile_id: string | null;
  error: string | null;
  created_at: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync("photogrambot.db");
      await d.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
      await migrate(d);
      return d;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      local_id TEXT,
      local_uri TEXT,
      remote_file_id TEXT,
      preview_file_id TEXT,
      thumb_file_id TEXT,
      message_id INTEGER,
      preview_message_id INTEGER,
      filename TEXT NOT NULL DEFAULT '',
      folder TEXT,
      width INTEGER,
      height INTEGER,
      size INTEGER,
      mime TEXT,
      taken_at INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL DEFAULT 0,
      uploaded_at INTEGER,
      remote_date INTEGER,
      content_hash TEXT,
      device TEXT,
      camera TEXT,
      tags TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'local',
      error TEXT,
      upload_type TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_photos_taken ON photos(taken_at DESC);
    CREATE INDEX IF NOT EXISTS idx_photos_hash ON photos(content_hash);
    CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status);
    CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder);
    CREATE INDEX IF NOT EXISTS idx_photos_local ON photos(local_id);

    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS album_photos (
      album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (album_id, photo_id)
    );
    CREATE TABLE IF NOT EXISTS trash (
      photo_id TEXT PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
      trashed_at INTEGER NOT NULL,
      remote_deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS upload_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      filename TEXT NOT NULL,
      folder TEXT,
      size INTEGER,
      taken_at INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT,
      upload_type TEXT NOT NULL DEFAULT 'manual',
      state TEXT NOT NULL DEFAULT 'pending',
      retries INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_queue_state ON upload_queue(state);
    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS photos_fts USING fts5(
      photo_id UNINDEXED, filename, folder, tags, device, camera, mime, ai_caption
    );
  `);
  await addColumnsIfMissing(db, "photos", [
    ["latitude", "REAL"],
    ["longitude", "REAL"],
    ["exif", "TEXT"],
    ["ai_caption", "TEXT"],
    ["duration", "INTEGER"],
    ["parts", "TEXT"],
    ["profile_id", "TEXT"],
  ]);
  await addColumnsIfMissing(db, "upload_queue", [
    ["next_attempt_at", "INTEGER"],
    ["profile_id", "TEXT"],
  ]);
  await addColumnsIfMissing(db, "albums", [
    ["locked", "INTEGER"],
  ]);
  await migrateFtsSchema(db);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS hash_cache (
      local_id TEXT NOT NULL,
      modification_time INTEGER NOT NULL,
      hash TEXT NOT NULL,
      PRIMARY KEY (local_id, modification_time)
    );
  `);
  // Collapse duplicate active rows left by historical races between concurrent
  // scans (watcher scan vs bootstrap/background task run in separate contexts,
  // so the app-level hasActiveQueuedUpload check is not atomic across them),
  // then let SQLite enforce one active row per asset from now on.
  await db.execAsync(`
    DELETE FROM upload_queue
     WHERE state IN ('pending','running')
       AND id NOT IN (
         SELECT MIN(id) FROM upload_queue
          WHERE state IN ('pending','running')
          GROUP BY local_id
       );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_active_local
      ON upload_queue(local_id) WHERE state IN ('pending','running');
  `);
}

async function addColumnsIfMissing(
  db: SQLite.SQLiteDatabase,
  table: string,
  columns: [string, string][]
): Promise<void> {
  const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  const existing = new Set(info.map((c) => c.name));
  for (const [name, type] of columns) {
    if (!existing.has(name)) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  }
}

async function migrateFtsSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'photos_fts'"
  );
  if (!row || row.sql.includes("ai_caption")) return;
  // FTS5 tables cannot be altered — drop and rebuild (derived data only).
  await db.execAsync("DROP TABLE photos_fts");
  await db.execAsync(`
    CREATE VIRTUAL TABLE photos_fts USING fts5(
      photo_id UNINDEXED, filename, folder, tags, device, camera, mime, ai_caption
    );
  `);
  await ftsRebuild();
}

export async function kvGet(key: string): Promise<string | null> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ v: string }>("SELECT v FROM kv WHERE k = ?", [key]);
  return row?.v ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    "INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    [key, value]
  );
}

function rowToPhoto(r: any): PhotoRow {
  return r as PhotoRow;
}

export async function insertPhoto(p: Partial<PhotoRow> & { id: string }): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    `INSERT INTO photos
      (id, local_id, local_uri, remote_file_id, preview_file_id, thumb_file_id,
       message_id, preview_message_id, filename, folder, width, height, size, mime,
       taken_at, added_at, uploaded_at, remote_date, content_hash, device, camera,
       tags, latitude, longitude, exif, ai_caption, duration, parts, profile_id, favorite, status, error, upload_type)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       local_id=excluded.local_id, local_uri=excluded.local_uri,
       remote_file_id=excluded.remote_file_id, preview_file_id=excluded.preview_file_id,
       thumb_file_id=excluded.thumb_file_id, message_id=excluded.message_id,
       preview_message_id=excluded.preview_message_id, filename=excluded.filename,
       folder=excluded.folder, width=excluded.width, height=excluded.height,
       size=excluded.size, mime=excluded.mime, taken_at=excluded.taken_at,
       added_at=excluded.added_at, uploaded_at=excluded.uploaded_at,
       remote_date=excluded.remote_date, content_hash=excluded.content_hash,
       device=excluded.device, camera=excluded.camera, tags=excluded.tags,
       latitude=excluded.latitude, longitude=excluded.longitude, exif=excluded.exif,
       ai_caption=excluded.ai_caption, duration=excluded.duration, parts=excluded.parts,
       profile_id=excluded.profile_id, status=excluded.status, error=excluded.error,
       upload_type=excluded.upload_type`,
    [
      p.id,
      p.local_id ?? null,
      p.local_uri ?? null,
      p.remote_file_id ?? null,
      p.preview_file_id ?? null,
      p.thumb_file_id ?? null,
      p.message_id ?? null,
      p.preview_message_id ?? null,
      p.filename ?? "",
      p.folder ?? null,
      p.width ?? null,
      p.height ?? null,
      p.size ?? null,
      p.mime ?? null,
      p.taken_at ?? 0,
      p.added_at ?? 0,
      p.uploaded_at ?? null,
      p.remote_date ?? null,
      p.content_hash ?? null,
      p.device ?? null,
      p.camera ?? null,
      p.tags ?? null,
      p.latitude ?? null,
      p.longitude ?? null,
      p.exif ?? null,
      p.ai_caption ?? null,
      p.duration ?? null,
      p.parts ?? null,
      p.profile_id ?? null,
      p.favorite ?? 0,
      p.status ?? "local",
      p.error ?? null,
      p.upload_type ?? null,
    ]
  );
  await ftsIndexPhoto(p as PhotoRow);
}

export async function updatePhoto(id: string, patch: Partial<PhotoRow>): Promise<void> {
  const d = await getDb();
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (keys.length === 0) return;
  const setSql = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => (patch as any)[k] ?? null);
  await d.runAsync(`UPDATE photos SET ${setSql} WHERE id = ?`, [...values, id]);
  if (
    keys.some((k) =>
      ["filename", "folder", "tags", "device", "camera", "mime", "ai_caption"].includes(k)
    )
  ) {
    const full = await getPhoto(id);
    if (full) await ftsIndexPhoto(full);
  }
}

export async function getPhoto(id: string): Promise<PhotoRow | null> {
  const d = await getDb();
  const row = await d.getFirstAsync<any>("SELECT * FROM photos WHERE id = ?", [id]);
  return row ? rowToPhoto(row) : null;
}

export async function getPhotoByLocalId(localId: string): Promise<PhotoRow | null> {
  const d = await getDb();
  const row = await d.getFirstAsync<any>(
    "SELECT * FROM photos WHERE local_id = ? ORDER BY rowid DESC LIMIT 1",
    [localId]
  );
  return row ? rowToPhoto(row) : null;
}

export async function getPhotoByHash(hash: string): Promise<PhotoRow | null> {
  const d = await getDb();
  const row = await d.getFirstAsync<any>(
    "SELECT * FROM photos WHERE content_hash = ? AND status = 'uploaded' LIMIT 1",
    [hash]
  );
  return row ? rowToPhoto(row) : null;
}

export async function getInFlightHashConflict(
  hash: string,
  excludePhotoId: string
): Promise<PhotoRow | null> {
  const d = await getDb();
  const row = await d.getFirstAsync<any>(
    `SELECT * FROM photos WHERE content_hash = ? AND id != ? AND status = 'uploading' LIMIT 1`,
    [hash, excludePhotoId]
  );
  return row ? rowToPhoto(row) : null;
}

export async function getPhotoByMessageId(messageId: number): Promise<PhotoRow | null> {
  const d = await getDb();
  // Update polling only sees the default destination's channel, so ignore rows
  // that were routed to another bot/channel (their message_ids live in a
  // different namespace and could collide).
  const row = await d.getFirstAsync<any>(
    `SELECT * FROM photos
     WHERE (message_id = ? OR preview_message_id = ?)
     AND (profile_id IS NULL OR profile_id = 'default')
     LIMIT 1`,
    [messageId, messageId]
  );
  return row ? rowToPhoto(row) : null;
}

export interface GalleryPage {
  photos: PhotoRow[];
  hasMore: boolean;
}

export async function getGalleryPage(
  limit: number,
  before: { taken_at: number; id: string } | null,
  favoritesOnly: boolean = false
): Promise<GalleryPage> {
  const d = await getDb();
  let sql = `SELECT * FROM photos
             WHERE status IN ('uploaded', 'local', 'failed')
             AND id NOT IN (SELECT photo_id FROM trash)`;
  const params: any[] = [];
  if (before) {
    sql += " AND (taken_at < ? OR (taken_at = ? AND id < ?))";
    params.push(before.taken_at, before.taken_at, before.id);
  }
  if (favoritesOnly) {
    sql += " AND favorite = 1";
  }
  sql += " ORDER BY taken_at DESC, id DESC LIMIT ?";
  params.push(limit + 1);
  const rows = await d.getAllAsync<any>(sql, params);
  const hasMore = rows.length > limit;
  return { photos: rows.slice(0, limit).map(rowToPhoto), hasMore };
}

export async function getAllUploadedPhotoIds(): Promise<string[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ id: string }>(
    "SELECT id FROM photos WHERE status = 'uploaded'"
  );
  return rows.map((r) => r.id);
}

export async function getUploadedLocalIds(): Promise<Set<string>> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ local_id: string }>(
    "SELECT local_id FROM photos WHERE status = 'uploaded' AND local_id IS NOT NULL"
  );
  return new Set(rows.map((r) => r.local_id));
}

export interface SearchFilters {
  takenWithinDays?: number | null;
  hasGps?: boolean;
  camera?: string | null;
}

export async function searchPhotos(
  query: string,
  filters?: SearchFilters,
  limit = 500
): Promise<PhotoRow[]> {
  const d = await getDb();
  const cleaned = query.trim();
  const conds: string[] = ["p.id NOT IN (SELECT photo_id FROM trash)"];
  const params: any[] = [];
  if (filters?.takenWithinDays && filters.takenWithinDays > 0) {
    conds.push("p.taken_at >= ?");
    params.push(Date.now() - filters.takenWithinDays * 86400000);
  }
  if (filters?.hasGps) {
    conds.push("p.latitude IS NOT NULL AND p.longitude IS NOT NULL");
  }
  if (filters?.camera && filters.camera.trim()) {
    conds.push("LOWER(p.camera) LIKE ?");
    params.push(`%${filters.camera.trim().toLowerCase()}%`);
  }
  const where = conds.join(" AND ");
  if (!cleaned) {
    const rows = await d.getAllAsync<any>(
      `SELECT p.* FROM photos p WHERE ${where} ORDER BY p.taken_at DESC LIMIT ?`,
      [...params, limit]
    );
    return rows.map(rowToPhoto);
  }
  const terms = cleaned
    .split(/\s+/)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");
  const rows = await d.getAllAsync<any>(
    `SELECT p.* FROM photos p
     JOIN photos_fts f ON p.id = f.photo_id
     WHERE photos_fts MATCH ?
     AND ${where}
     ORDER BY p.taken_at DESC LIMIT ?`,
    [terms, ...params, limit]
  );
  return rows.map(rowToPhoto);
}

export async function ftsIndexPhoto(p: PhotoRow): Promise<void> {
  const d = await getDb();
  await d.runAsync("DELETE FROM photos_fts WHERE photo_id = ?", [p.id]);
  await d.runAsync(
    "INSERT INTO photos_fts (photo_id, filename, folder, tags, device, camera, mime, ai_caption) VALUES (?,?,?,?,?,?,?,?)",
    [p.id, p.filename ?? "", p.folder ?? "", p.tags ?? "", p.device ?? "", p.camera ?? "", p.mime ?? "", p.ai_caption ?? ""]
  );
}

export async function ftsRebuild(): Promise<void> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>("SELECT * FROM photos");
  await d.runAsync("DELETE FROM photos_fts");
  for (const r of rows) {
    const p = rowToPhoto(r);
    await d.runAsync(
      "INSERT INTO photos_fts (photo_id, filename, folder, tags, device, camera, mime, ai_caption) VALUES (?,?,?,?,?,?,?,?)",
      [p.id, p.filename ?? "", p.folder ?? "", p.tags ?? "", p.device ?? "", p.camera ?? "", p.mime ?? "", p.ai_caption ?? ""]
    );
  }
}

export async function deletePhoto(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync("DELETE FROM photos WHERE id = ?", [id]);
  await d.runAsync("DELETE FROM photos_fts WHERE photo_id = ?", [id]);
}

export async function setFavorite(id: string, fav: boolean): Promise<void> {
  await updatePhoto(id, { favorite: fav ? 1 : 0 });
}

export async function getFavorites(): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos WHERE favorite = 1 AND status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash) ORDER BY taken_at DESC`
  );
  return rows.map(rowToPhoto);
}

export async function addToTrash(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    "INSERT OR REPLACE INTO trash (photo_id, trashed_at, remote_deleted) VALUES (?,?,0)",
    [id, Date.now()]
  );
}

export async function restoreFromTrash(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync("DELETE FROM trash WHERE photo_id = ?", [id]);
}

export async function getTrashItems(): Promise<(PhotoRow & { trashed_at: number; remote_deleted: number })[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT p.*, t.trashed_at, t.remote_deleted FROM photos p
     JOIN trash t ON p.id = t.photo_id ORDER BY t.trashed_at DESC`
  );
  return rows.map((r) => ({ ...rowToPhoto(r), trashed_at: r.trashed_at, remote_deleted: r.remote_deleted }));
}

export async function markTrashRemoteDeleted(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE trash SET remote_deleted = 1 WHERE photo_id = ?", [id]);
}

export async function purgeExpiredTrash(days: number): Promise<string[]> {
  const d = await getDb();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await d.getAllAsync<{ photo_id: string }>(
    "SELECT photo_id FROM trash WHERE trashed_at < ? AND remote_deleted = 1",
    [cutoff]
  );
  const ids = rows.map((r) => r.photo_id);
  for (const id of ids) {
    await deletePhoto(id);
  }
  await d.runAsync("DELETE FROM trash WHERE trashed_at < ? AND remote_deleted = 1", [cutoff]);
  return ids;
}

export async function getTrashPendingRemoteDelete(): Promise<{ photo_id: string; message_id: number | null }[]> {
  const d = await getDb();
  return d.getAllAsync<{ photo_id: string; message_id: number | null }>(
    `SELECT t.photo_id, p.message_id FROM trash t
     JOIN photos p ON p.id = t.photo_id
     WHERE t.remote_deleted = 0 AND p.message_id IS NOT NULL`
  );
}

export async function createAlbum(name: string): Promise<number> {
  const d = await getDb();
  const res = await d.runAsync(
    "INSERT OR IGNORE INTO albums (name, created_at) VALUES (?, ?)",
    [name, Date.now()]
  );
  if (res.changes === 0) {
    const row = await d.getFirstAsync<{ id: number }>("SELECT id FROM albums WHERE name = ?", [name]);
    return row!.id;
  }
  return res.lastInsertRowId ?? 0;
}

export async function deleteAlbum(id: number): Promise<void> {
  const d = await getDb();
  await d.runAsync("DELETE FROM albums WHERE id = ?", [id]);
}

export async function renameAlbum(id: number, name: string): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE albums SET name = ? WHERE id = ?", [name, id]);
}

export interface AlbumWithCover extends AlbumRow {
  count: number;
  cover_file_id: string | null;
  cover_preview_id: string | null;
}

export async function getAlbums(): Promise<AlbumWithCover[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT a.*, COUNT(ap.photo_id) as count,
       (SELECT p.remote_file_id FROM album_photos ap2 JOIN photos p ON p.id = ap2.photo_id
        WHERE ap2.album_id = a.id ORDER BY p.taken_at DESC LIMIT 1) as cover_file_id,
       (SELECT p.preview_file_id FROM album_photos ap3 JOIN photos p ON p.id = ap3.photo_id
        WHERE ap3.album_id = a.id ORDER BY p.taken_at DESC LIMIT 1) as cover_preview_id
     FROM albums a
     LEFT JOIN album_photos ap ON ap.album_id = a.id
     GROUP BY a.id ORDER BY a.created_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    count: r.count,
    cover_file_id: r.cover_file_id,
    cover_preview_id: r.cover_preview_id,
  }));
}

export async function getAlbumPhotos(albumId: number): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT p.* FROM album_photos ap JOIN photos p ON p.id = ap.photo_id
     WHERE ap.album_id = ? AND p.id NOT IN (SELECT photo_id FROM trash)
     ORDER BY p.taken_at DESC`,
    [albumId]
  );
  return rows.map(rowToPhoto);
}

export async function addToAlbum(albumId: number, photoIds: string[]): Promise<void> {
  const d = await getDb();
  for (const pid of photoIds) {
    await d.runAsync(
      "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?,?,?)",
      [albumId, pid, Date.now()]
    );
  }
}

export async function removeFromAlbum(albumId: number, photoIds: string[]): Promise<void> {
  const d = await getDb();
  for (const pid of photoIds) {
    await d.runAsync("DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?", [albumId, pid]);
  }
}

export async function getPhotoAlbums(photoId: string): Promise<AlbumRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    "SELECT a.* FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE ap.photo_id = ?",
    [photoId]
  );
  return rows.map((r) => ({ id: r.id, name: r.name, created_at: r.created_at }));
}

export async function setAlbumLocked(id: number, locked: boolean): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE albums SET locked = ? WHERE id = ?", [locked ? 1 : 0, id]);
}

export async function enqueueUpload(item: {
  local_id: string;
  local_uri: string;
  filename: string;
  folder: string | null;
  size: number | null;
  taken_at: number;
  added_at: number;
  content_hash: string | null;
  upload_type: string;
  profile_id?: string | null;
}): Promise<number> {
  const d = await getDb();
  let res;
  try {
    res = await d.runAsync(
      `INSERT INTO upload_queue (local_id, local_uri, filename, folder, size, taken_at, added_at,
        content_hash, upload_type, state, retries, created_at, profile_id)
       VALUES (?,?,?,?,?,?,?,?,?,'pending',0,?,?)`,
      [
        item.local_id,
        item.local_uri,
        item.filename,
        item.folder,
        item.size,
        item.taken_at,
        item.added_at,
        item.content_hash,
        item.upload_type,
        Date.now(),
        item.profile_id ?? null,
      ]
    );
  } catch (e) {
    // uq_queue_active_local: a concurrent scan enqueued this asset first.
    if (String((e as Error)?.message ?? "").includes("UNIQUE constraint failed")) return 0;
    throw e;
  }
  return res.lastInsertRowId ?? 0;
}

export async function nextQueueBatch(limit: number): Promise<QueueRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM upload_queue
     WHERE state = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY CASE WHEN upload_type = 'manual' THEN 0 ELSE 1 END, taken_at ASC, created_at ASC
     LIMIT ?`,
    [Date.now(), limit]
  );
  return rows.map((r) => r as QueueRow);
}

export async function hasActiveQueuedUpload(localId: string): Promise<boolean> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM upload_queue
     WHERE local_id = ? AND state IN ('pending','running')`,
    [localId]
  );
  return (row?.n ?? 0) > 0;
}

export async function recoverStaleRunning(): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    "UPDATE upload_queue SET state = 'pending', error = NULL WHERE state = 'running'"
  );
}

export async function updateQueueItem(id: number, patch: Partial<QueueRow>): Promise<void> {
  const d = await getDb();
  const keys = Object.keys(patch).filter((k) => k !== "id");
  if (keys.length === 0) return;
  const setSql = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => (patch as any)[k] ?? null);
  await d.runAsync(`UPDATE upload_queue SET ${setSql} WHERE id = ?`, [...values, id]);
}

export async function retryFailedUploads(): Promise<number> {
  const d = await getDb();
  let requeued = 0;
  await d.withTransactionAsync(async () => {
    // A newer pending/running row for the same asset means the failed row is
    // redundant — requeuing it would hit uq_queue_active_local, so drop it.
    await d.runAsync(
      `DELETE FROM upload_queue
       WHERE state = 'failed'
         AND EXISTS (
           SELECT 1 FROM upload_queue q2
           WHERE q2.local_id = upload_queue.local_id
             AND q2.state IN ('pending','running')
         )`
    );
    // A still-failing asset gets re-enqueued by every scan, so duplicate
    // failed rows exist — flipping both would collide on the partial UNIQUE
    // index. Keep only the oldest attempt per local_id.
    await d.runAsync(
      `DELETE FROM upload_queue
       WHERE state = 'failed'
         AND EXISTS (
           SELECT 1 FROM upload_queue q2
           WHERE q2.local_id = upload_queue.local_id
             AND q2.state = 'failed'
             AND q2.id < upload_queue.id
         )`
    );
    // NOT EXISTS re-checks at UPDATE time: a concurrent enqueue may have
    // added a pending sibling after the DELETE — skip that row instead of
    // violating uq_queue_active_local and rolling everything back.
    const res = await d.runAsync(
      `UPDATE upload_queue
       SET state = 'pending', retries = 0, error = NULL, next_attempt_at = NULL
       WHERE state = 'failed'
         AND NOT EXISTS (
           SELECT 1 FROM upload_queue q2
           WHERE q2.local_id = upload_queue.local_id
             AND q2.state IN ('pending','running')
         )`
    );
    requeued = res.changes ?? 0;
    await d.runAsync("UPDATE photos SET status = 'local' WHERE status = 'failed'");
  });
  return requeued;
}

export async function getQueueCounts(): Promise<Record<string, number>> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ state: string; n: number }>(
    "SELECT state, COUNT(*) as n FROM upload_queue GROUP BY state"
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.state] = r.n;
  return out;
}

export async function getQueueItems(states: string[], limit = 200): Promise<QueueRow[]> {
  const d = await getDb();
  if (states.length === 0) return [];
  const placeholders = states.map(() => "?").join(",");
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM upload_queue
     WHERE state IN (${placeholders})
     ORDER BY created_at DESC
     LIMIT ?`,
    [...states, limit]
  );
  return rows.map((r) => r as QueueRow);
}

export async function retryQueueItem(id: number): Promise<boolean> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ local_id: string }>(
    "SELECT local_id FROM upload_queue WHERE id = ? AND state = 'failed'",
    [id]
  );
  if (!row) return false;
  const activeRow = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM upload_queue
     WHERE local_id = ? AND state IN ('pending','running') AND id != ?`,
    [row.local_id, id]
  );
  if ((activeRow?.n ?? 0) > 0) {
    // An active row already covers this asset — the failed row is redundant.
    await d.runAsync("DELETE FROM upload_queue WHERE id = ?", [id]);
    return true;
  }
  try {
    await d.runAsync(
      `UPDATE upload_queue
       SET state = 'pending', retries = 0, error = NULL, next_attempt_at = NULL
       WHERE id = ? AND state = 'failed'`,
      [id]
    );
  } catch (e) {
    if (String((e as Error)?.message ?? "").includes("UNIQUE constraint failed")) {
      // Lost the race with a concurrent scan — drop the now-redundant row.
      await d.runAsync("DELETE FROM upload_queue WHERE id = ?", [id]);
      return true;
    }
    throw e;
  }
  await d.runAsync(
    "UPDATE photos SET status = 'local' WHERE status = 'failed' AND local_id = ?",
    [row.local_id]
  );
  return true;
}

export async function removeQueueItem(id: number): Promise<boolean> {
  const d = await getDb();
  const res = await d.runAsync(
    "DELETE FROM upload_queue WHERE id = ? AND state IN ('pending','failed')",
    [id]
  );
  return (res.changes ?? 0) > 0;
}

export async function clearFinishedQueue(): Promise<void> {
  const d = await getDb();
  await d.runAsync("DELETE FROM upload_queue WHERE state IN ('done','skipped','duplicate')");
}

export async function getStats(): Promise<{
  total: number;
  uploaded: number;
  pending: number;
  failed: number;
  skipped: number;
  favorites: number;
  trashed: number;
  totalBytes: number;
}> {
  const d = await getDb();
  const photo = await d.getFirstAsync<any>(
    `SELECT COUNT(*) as total,
       SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END) as uploaded,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
       SUM(CASE WHEN status = 'skipped_too_large' THEN 1 ELSE 0 END) as skipped,
       SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favorites,
       SUM(CASE WHEN status = 'uploaded' THEN COALESCE(size,0) ELSE 0 END) as totalBytes
     FROM photos`
  );
  const queue = await d.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) as n FROM upload_queue WHERE state = 'pending'"
  );
  const trash = await d.getFirstAsync<{ n: number }>("SELECT COUNT(*) as n FROM trash");
  return {
    total: photo?.total ?? 0,
    uploaded: photo?.uploaded ?? 0,
    failed: photo?.failed ?? 0,
    skipped: photo?.skipped ?? 0,
    favorites: photo?.favorites ?? 0,
    totalBytes: photo?.totalBytes ?? 0,
    pending: queue?.n ?? 0,
    trashed: trash?.n ?? 0,
  };
}

export async function getPhotosByUploadStatus(
  which: "uploaded" | "local"
): Promise<PhotoRow[]> {
  const d = await getDb();
  const cond = which === "uploaded" ? "status = 'uploaded'" : "status != 'uploaded'";
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE ${cond} AND id NOT IN (SELECT photo_id FROM trash)
     ORDER BY taken_at DESC`
  );
  return rows.map(rowToPhoto);
}

export async function getLibraryCounts(): Promise<{ local: number; cloud: number }> {
  const d = await getDb();
  const row = await d.getFirstAsync<any>(`
    SELECT
      SUM(CASE WHEN status != 'uploaded' THEN 1 ELSE 0 END) AS local,
      SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END) AS cloud
    FROM photos
    WHERE id NOT IN (SELECT photo_id FROM trash)
  `);
  return { local: row?.local ?? 0, cloud: row?.cloud ?? 0 };
}

export interface MonthBucket {
  label: string;
  count: number;
  bytes: number;
}

export async function getMonthlyBuckets(monthsBack = 6): Promise<MonthBucket[]> {
  const d = await getDb();
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  const rows = await d.getAllAsync<{ ym: string; count: number; bytes: number }>(
    `SELECT strftime('%Y-%m', taken_at / 1000, 'unixepoch') AS ym,
            COUNT(*) AS count,
            COALESCE(SUM(COALESCE(size, 0)), 0) AS bytes
     FROM photos
     WHERE taken_at >= ? AND id NOT IN (SELECT photo_id FROM trash)
     GROUP BY ym`,
    [since.getTime()]
  );
  const byKey = new Map(rows.map((r) => [r.ym, r]));
  const buckets: MonthBucket[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const dte = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1) + i, 1);
    const key = `${dte.getFullYear()}-${String(dte.getMonth() + 1).padStart(2, "0")}`;
    const row = byKey.get(key);
    buckets.push({
      label: dte.toLocaleString(undefined, { month: "narrow" }),
      count: row?.count ?? 0,
      bytes: row?.bytes ?? 0,
    });
  }
  return buckets;
}

export interface PeriodGroup {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
  count: number;
  cover_preview_id: string | null;
  cover_file_id: string | null;
}

export async function getYearGroups(): Promise<PeriodGroup[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT strftime('%Y', taken_at / 1000, 'unixepoch') as key,
       COUNT(*) as count,
       MIN(taken_at) as startMs,
       MAX(taken_at) as endMs,
       (SELECT p.preview_file_id FROM photos p
         WHERE p.status IN ('uploaded','local','failed')
         AND p.id NOT IN (SELECT photo_id FROM trash)
         AND strftime('%Y', p.taken_at / 1000, 'unixepoch') = key
         ORDER BY p.taken_at DESC LIMIT 1) as cover_preview_id,
       (SELECT p.remote_file_id FROM photos p
         WHERE p.status IN ('uploaded','local','failed')
         AND p.id NOT IN (SELECT photo_id FROM trash)
         AND strftime('%Y', p.taken_at / 1000, 'unixepoch') = key
         ORDER BY p.taken_at DESC LIMIT 1) as cover_file_id
     FROM photos
     WHERE status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
     GROUP BY key ORDER BY key DESC`
  );
  return rows.map((r) => ({
    key: r.key,
    label: r.key,
    startMs: r.startMs,
    endMs: r.endMs,
    count: r.count,
    cover_preview_id: r.cover_preview_id,
    cover_file_id: r.cover_file_id,
  }));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function getMonthGroups(year: number | null): Promise<PeriodGroup[]> {
  const d = await getDb();
  const yearFilter = year ? "AND strftime('%Y', taken_at / 1000, 'unixepoch') = ?" : "";
  const params: any[] = year ? [String(year)] : [];
  const rows = await d.getAllAsync<any>(
    `SELECT strftime('%Y-%m', taken_at / 1000, 'unixepoch') as key,
       COUNT(*) as count,
       MIN(taken_at) as startMs,
       MAX(taken_at) as endMs,
       (SELECT p.preview_file_id FROM photos p
         WHERE p.status IN ('uploaded','local','failed')
         AND p.id NOT IN (SELECT photo_id FROM trash)
         AND strftime('%Y-%m', p.taken_at / 1000, 'unixepoch') = key
         ORDER BY p.taken_at DESC LIMIT 1) as cover_preview_id,
       (SELECT p.remote_file_id FROM photos p
         WHERE p.status IN ('uploaded','local','failed')
         AND p.id NOT IN (SELECT photo_id FROM trash)
         AND strftime('%Y-%m', p.taken_at / 1000, 'unixepoch') = key
         ORDER BY p.taken_at DESC LIMIT 1) as cover_file_id
     FROM photos
     WHERE status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
     ${yearFilter}
     GROUP BY key ORDER BY key DESC`,
    params
  );
  return rows.map((r) => {
    const y = parseInt(r.key.slice(0, 4), 10);
    const m = parseInt(r.key.slice(5, 7), 10);
    return {
      key: r.key,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      startMs: r.startMs,
      endMs: r.endMs,
      count: r.count,
      cover_preview_id: r.cover_preview_id,
      cover_file_id: r.cover_file_id,
    };
  });
}

export async function getPhotosInRange(startMs: number, endMs: number): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
     AND taken_at >= ? AND taken_at <= ?
     ORDER BY taken_at DESC`,
    [startMs, endMs]
  );
  return rows.map(rowToPhoto);
}

export interface MemoryGroup {
  yearsAgo: number;
  label: string;
  startMs: number;
  endMs: number;
  count: number;
  cover_preview_id: string | null;
  cover_file_id: string | null;
}

export async function getMemories(windowDays = 2): Promise<MemoryGroup[]> {
  const d = await getDb();
  const now = new Date();
  const thisYear = now.getFullYear();
  // Build the %m-%d date list in JS so the window wraps correctly across
  // year boundaries (Dec 31 <-> Jan 1), unlike a BETWEEN on %m-%d strings.
  const dates: string[] = [];
  for (let off = -windowDays; off <= windowDays; off++) {
    const dte = new Date(thisYear, now.getMonth(), now.getDate() + off);
    dates.push(
      `${String(dte.getMonth() + 1).padStart(2, "0")}-${String(dte.getDate()).padStart(2, "0")}`
    );
  }
  const ph = dates.map(() => "?").join(",");
  const rows = await d.getAllAsync<any>(
    `SELECT CAST(strftime('%Y', taken_at / 1000, 'unixepoch') AS INTEGER) as year,
        COUNT(*) as count,
        MIN(taken_at) as startMs,
        MAX(taken_at) as endMs,
        (SELECT p2.preview_file_id FROM photos p2
          WHERE p2.status IN ('uploaded','local','failed')
          AND p2.id NOT IN (SELECT photo_id FROM trash)
          AND CAST(strftime('%Y', p2.taken_at / 1000, 'unixepoch') AS INTEGER) =
              CAST(strftime('%Y', p.taken_at / 1000, 'unixepoch') AS INTEGER)
          AND strftime('%m-%d', p2.taken_at / 1000, 'unixepoch') IN (${ph})
          ORDER BY p2.taken_at DESC LIMIT 1) as cover_preview_id,
        (SELECT p3.remote_file_id FROM photos p3
          WHERE p3.status IN ('uploaded','local','failed')
          AND p3.id NOT IN (SELECT photo_id FROM trash)
          AND CAST(strftime('%Y', p3.taken_at / 1000, 'unixepoch') AS INTEGER) =
              CAST(strftime('%Y', p.taken_at / 1000, 'unixepoch') AS INTEGER)
          AND strftime('%m-%d', p3.taken_at / 1000, 'unixepoch') IN (${ph})
          ORDER BY p3.taken_at DESC LIMIT 1) as cover_file_id
      FROM photos p
      WHERE status IN ('uploaded','local','failed')
      AND id NOT IN (SELECT photo_id FROM trash)
      AND CAST(strftime('%Y', taken_at / 1000, 'unixepoch') AS INTEGER) < ?
      AND strftime('%m-%d', taken_at / 1000, 'unixepoch') IN (${ph})
      GROUP BY year ORDER BY year DESC`,
    [...dates, ...dates, thisYear, ...dates]
  );
  return rows
    .filter((r) => r.count > 0)
    .map((r) => ({
      yearsAgo: thisYear - r.year,
      label: `${thisYear - r.year} year${thisYear - r.year === 1 ? "" : "s"} ago`,
      startMs: r.startMs,
      endMs: r.endMs,
      count: r.count,
      cover_preview_id: r.cover_preview_id,
      cover_file_id: r.cover_file_id,
    }));
}

// Full photo row; latitude/longitude are non-null because the query's WHERE
// filters them — keeps MapScreen's toFixed()/Region math honest while still
// carrying favorite, status, camera, exif, etc. into the viewer.
export type GeotaggedPhoto = Omit<PhotoRow, "latitude" | "longitude"> & {
  latitude: number;
  longitude: number;
};

export async function getGeotagged(limit = 800): Promise<GeotaggedPhoto[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT *
     FROM photos
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL
     AND status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
     ORDER BY taken_at DESC LIMIT ?`,
    [limit]
  );
  return rows as GeotaggedPhoto[];
}

export interface DuplicateGroup {
  hash: string;
  count: number;
  photos: PhotoRow[];
}

export async function getDuplicateGroups(): Promise<DuplicateGroup[]> {
  const d = await getDb();
  const hashes = await d.getAllAsync<{ content_hash: string; n: number }>(
    `SELECT content_hash, COUNT(*) as n FROM photos
     WHERE content_hash IS NOT NULL
     AND id NOT IN (SELECT photo_id FROM trash)
     GROUP BY content_hash HAVING n > 1
     ORDER BY n DESC`
  );
  const groups: DuplicateGroup[] = [];
  for (const h of hashes) {
    const rows = await d.getAllAsync<any>(
      `SELECT * FROM photos WHERE content_hash = ? AND id NOT IN (SELECT photo_id FROM trash)
       ORDER BY CASE WHEN status = 'uploaded' THEN 0 ELSE 1 END, taken_at DESC`,
      [h.content_hash]
    );
    groups.push({ hash: h.content_hash, count: h.n, photos: rows.map(rowToPhoto) });
  }
  return groups;
}

export async function getHashCache(
  localId: string,
  modificationTimeMs: number
): Promise<string | null> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ hash: string }>(
    "SELECT hash FROM hash_cache WHERE local_id = ? AND modification_time = ?",
    [localId, Math.floor(modificationTimeMs)]
  );
  return row?.hash ?? null;
}

export async function setHashCache(
  localId: string,
  modificationTimeMs: number,
  hash: string
): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    "INSERT OR REPLACE INTO hash_cache (local_id, modification_time, hash) VALUES (?,?,?)",
    [localId, Math.floor(modificationTimeMs), hash]
  );
}

export async function clearHashCache(): Promise<void> {
  const d = await getDb();
  await d.runAsync("DELETE FROM hash_cache");
}

export async function exportAllData(): Promise<string> {
  const d = await getDb();
  const photos = await d.getAllAsync<any>("SELECT * FROM photos");
  const albums = await d.getAllAsync<any>("SELECT * FROM albums");
  const albumPhotos = await d.getAllAsync<any>("SELECT * FROM album_photos");
  const trash = await d.getAllAsync<any>("SELECT * FROM trash");
  const kv = await d.getAllAsync<any>("SELECT * FROM kv");
  return JSON.stringify({
    format: "photogrambot-backup",
    version: 1,
    exported_at: Date.now(),
    photos,
    albums,
    album_photos: albumPhotos,
    trash,
    kv,
  });
}

export async function importAllData(json: string, replace: boolean): Promise<number> {
  const d = await getDb();
  const data = JSON.parse(json);
  if (data.format !== "photogrambot-backup") throw new Error("Not a PhotogramBot backup file");
  let count = 0;
  await d.withTransactionAsync(async () => {
    if (replace) {
      await d.runAsync("DELETE FROM album_photos");
      await d.runAsync("DELETE FROM albums");
      await d.runAsync("DELETE FROM trash");
      await d.runAsync("DELETE FROM photos_fts");
      await d.runAsync("DELETE FROM photos");
    }
    for (const p of data.photos ?? []) {
      const res = await d.runAsync(
        `INSERT OR IGNORE INTO photos
          (id, local_id, local_uri, remote_file_id, preview_file_id, thumb_file_id,
           message_id, preview_message_id, filename, folder, width, height, size, mime,
           taken_at, added_at, uploaded_at, remote_date, content_hash, device, camera,
           tags, latitude, longitude, exif, ai_caption, duration, parts, profile_id,
           favorite, status, error, upload_type)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          p.id, p.local_id ?? null, p.local_uri ?? null, p.remote_file_id ?? null,
          p.preview_file_id ?? null, p.thumb_file_id ?? null, p.message_id ?? null,
          p.preview_message_id ?? null, p.filename ?? "", p.folder ?? null,
          p.width ?? null, p.height ?? null, p.size ?? null, p.mime ?? null,
          p.taken_at ?? 0, p.added_at ?? 0, p.uploaded_at ?? null, p.remote_date ?? null,
          p.content_hash ?? null, p.device ?? null, p.camera ?? null, p.tags ?? null,
          p.latitude ?? null, p.longitude ?? null, p.exif ?? null,
          p.ai_caption ?? null, p.duration ?? null, p.parts ?? null, p.profile_id ?? null,
          p.favorite ?? 0, p.status ?? "local", p.error ?? null, p.upload_type ?? null,
        ]
      );
      count += res.changes > 0 ? 1 : 0;
    }
    for (const a of data.albums ?? []) {
      await d.runAsync("INSERT OR IGNORE INTO albums (id, name, created_at) VALUES (?,?,?)", [
        a.id, a.name, a.created_at,
      ]);
    }
    for (const ap of data.album_photos ?? []) {
      await d.runAsync(
        "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?,?,?)",
        [ap.album_id, ap.photo_id, ap.added_at]
      );
    }
    for (const t of data.trash ?? []) {
      await d.runAsync(
        "INSERT OR IGNORE INTO trash (photo_id, trashed_at, remote_deleted) VALUES (?,?,?)",
        [t.photo_id, t.trashed_at, t.remote_deleted ?? 0]
      );
    }
    for (const k of data.kv ?? []) {
      if (k.k !== "updates_offset") {
        await d.runAsync("INSERT OR REPLACE INTO kv (k, v) VALUES (?,?)", [k.k, k.v]);
      }
    }
  });
  await ftsRebuild();
  return count;
}
