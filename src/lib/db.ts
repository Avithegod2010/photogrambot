import * as SQLite from "expo-sqlite";
import { File } from "expo-file-system";
import { sanitizeQueueBackupRows } from "./backupQueue";
import { applyDbKey, sqlCipherAvailable } from "./dbCrypto";
import { lwwWins } from "./syncMath";

export type PhotoStatus =
  | "local"
  | "uploading"
  | "uploaded"
  | "failed"
  | "skipped_too_large"
  | "duplicate";

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
  // Motion-photo companion clip (R27): the embedded short video extracted
  // from a motion JPEG and uploaded as a reply to the photo's document.
  motion_file_id: string | null;
  motion_message_id: number | null;
  // Extracted screenshot text (R30): NULL = not attempted/failed, '' = no text.
  ocr_text: string | null;
  status: PhotoStatus;
  error: string | null;
  upload_type: string | null;
  phash: string | null;
  // Mainline/backfill marker (1 = scanned for an embedded motion clip).
  motion_checked?: number | null;
  // MediaLibrary modificationTime (seconds) captured at the last scan — the
  // edit-detection baseline for photo version history. NULL = never scanned.
  asset_mtime: number | null;
}

export interface AlbumRow {
  id: number;
  name: string;
  created_at: number;
  locked?: number | null;
  query?: string | null;
  cover_photo_id?: string | null;
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
  // Priority lanes (R27): 0 = promoted (camera/DCIM/favorited), 1 = default,
  // 2 = deprioritized (screenshots/screen recordings).
  priority: number;
  state: "pending" | "running" | "done" | "failed" | "skipped" | "duplicate";
  retries: number;
  next_attempt_at: number | null;
  profile_id: string | null;
  error: string | null;
  created_at: number;
  // Completion timestamp (ms) once the row reaches a terminal state; powers
  // the throughput readout on the upload queue screen.
  finished_at?: number | null;
  // Set only for upload_type='version' rows — the channel message being
  // superseded, so the new upload lands as a reply in the same thread.
  reply_to_message_id: number | null;
}

const DB_NAME = "photogrambot.db";
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const d = await SQLite.openDatabaseAsync(DB_NAME);
      // SQLCipher: the key must be applied before ANY other statement.
      try {
        const { loadPrefs } = await import("./settings");
        const prefs = await loadPrefs();
        if (prefs.dbEncryption) await applyDbKey(d);
      } catch (e: any) {
        // A wrong/missing key means the file cannot be read. Surface a clear
        // message instead of the raw "file is not a database".
        if (String(e?.message ?? "").includes("not a database")) {
          throw new Error(
            "The local database is encrypted but its key is unavailable. Restore the index from the channel backup."
          );
        }
        throw e;
      }
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

/** Closes the cached handle (panic wipe / database encryption swap). */
export async function closeDb(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    const d = await pending;
    await d.closeAsync();
  } catch {}
}

/** Deletes the local index file entirely. Used only by panic wipe. */
export async function deleteLocalDatabase(): Promise<void> {
  await SQLite.deleteDatabaseAsync(DB_NAME);
}

/**
 * Re-encrypt the current plaintext database in place with SQLCipher, using a
 * key held in SecureStore. Requires a native build with `useSQLCipher`.
 * The caller should restart the app afterwards (the swap closes the handle).
 */
export async function enableDatabaseEncryption(): Promise<void> {
  const d = await getDb();
  if (!(await sqlCipherAvailable(d))) {
    throw new Error(
      "This build does not include SQLCipher. Install the next native build, then try again."
    );
  }
  const { loadPrefs, savePrefs } = await import("./settings");
  if ((await loadPrefs()).dbEncryption) return;
  const { getOrCreateDbKey } = await import("./dbCrypto");
  const key = await getOrCreateDbKey();

  const dir = SQLite.defaultDatabaseDirectory;
  const src = new File(dir, DB_NAME);
  const enc = new File(dir, `${DB_NAME}.enc`);
  for (const f of [enc, new File(dir, `${DB_NAME}.enc-wal`), new File(dir, `${DB_NAME}.enc-shm`)]) {
    if (f.exists) f.delete();
  }
  await d.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");
  // The URI may contain single quotes; the key is hex-only by construction.
  const uri = enc.uri.replace(/'/g, "''");
  await d.execAsync(`ATTACH DATABASE '${uri}' AS encrypted KEY "x'${key}'";`);
  try {
    await d.execAsync("SELECT sqlcipher_export('encrypted');");
  } finally {
    await d.execAsync("DETACH DATABASE encrypted;").catch(() => {});
  }
  await d.closeAsync();
  dbPromise = null;

  // Swap the encrypted file into place and drop the plaintext WAL/SHM.
  for (const f of [src, new File(dir, `${DB_NAME}-wal`), new File(dir, `${DB_NAME}-shm`)]) {
    if (f.exists) f.delete();
  }
  await enc.move(src, { overwrite: true });
  await savePrefs({ dbEncryption: true });

  // Reopen once to prove the key works before the UI says "restart".
  const check = await getDb();
  await check.getFirstAsync("SELECT COUNT(*) AS n FROM photos");
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
      priority INTEGER NOT NULL DEFAULT 1,
      state TEXT NOT NULL DEFAULT 'pending',
      retries INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_queue_state ON upload_queue(state);
    CREATE TABLE IF NOT EXISTS saved_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      query TEXT NOT NULL DEFAULT '',
      filters TEXT NOT NULL DEFAULT 'null',
      created_at INTEGER NOT NULL
    );
    -- People clustering foundation. The embedding provider (on-device model or
    -- opt-in cloud pass) writes face_embeddings; peopleCluster.ts groups them.
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      cover_photo_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS face_embeddings (
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      face_index INTEGER NOT NULL,
      person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
      dim INTEGER NOT NULL,
      vec BLOB NOT NULL,
      model TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (photo_id, face_index)
    );
    CREATE INDEX IF NOT EXISTS idx_faces_person ON face_embeddings(person_id);
    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS photos_fts USING fts5(
      photo_id UNINDEXED, filename, folder, tags, device, camera, mime, ai_caption, ocr_text
    );
  `);
  // Multi-device index sync: a compact op log with Lamport clocks. Only
  // favorites, tags, album membership/name and covers are synced; photos
  // themselves are immutable channel records.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_ops (
      op_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field TEXT NOT NULL,
      value TEXT,
      lamport INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      sent INTEGER NOT NULL DEFAULT 0,
      applied INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_sync_ops_field
      ON sync_ops(entity, entity_id, field, lamport DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_ops_sent ON sync_ops(sent);
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      field TEXT NOT NULL,
      local_value TEXT,
      remote_value TEXT,
      remote_device TEXT,
      created_at INTEGER NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open ON sync_conflicts(resolved, created_at DESC);
  `);
  await addColumnsIfMissing(db, "photos", [
    ["latitude", "REAL"],
    ["longitude", "REAL"],
    ["exif", "TEXT"],
    ["ai_caption", "TEXT"],
    ["duration", "INTEGER"],
    ["parts", "TEXT"],
    ["profile_id", "TEXT"],
    // Perceptual dHash (16 hex chars) for the near-duplicate finder — NULL
    // until the scan first decodes the row. A stored hash is trusted on
    // rescan (content changes are already covered by content_hash-based
    // re-sync paths; the pHash is advisory clustering input, not identity).
    ["phash", "TEXT"],
    ["asset_mtime", "REAL"],
    ["motion_file_id", "TEXT"],
    ["motion_message_id", "INTEGER"],
    // Retroactive motion-clip backfill marker: 1 once the row has been scanned
    // for an embedded clip (regardless of result) so Maintenance never
    // re-decodes the same JPEG every run.
    ["motion_checked", "INTEGER"],
    // OCR of screenshot-tagged rows (R30): extracted visible text, searchable
    // via FTS. NULL = not attempted (or failed — retried next pass); '' = no
    // text found (a finished result, never retried).
    ["ocr_text", "TEXT"],
  ]);
  await migrateFtsSchema(db);
  await migrateRest(db);
}

// OCR pending set (R30): uploaded screenshot-tagged rows never successfully
// OCR'd — failures keep ocr_text NULL so a later pass retries them, while a
// finished "no text" result stores '' and never requeues.
export async function getScreenshotOcrPending(limit = 200): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status = 'uploaded'
       AND remote_file_id IS NOT NULL
       AND ocr_text IS NULL
       AND ((' ' || COALESCE(tags, '') || ' ') LIKE '% screenshot %'
            OR (' ' || COALESCE(tags, '') || ' ') LIKE '% screenshots %')
       AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ORDER BY taken_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows.map(rowToPhoto);
}

// Retroactive motion-clip candidates: uploaded JPEGs that still have a local
// copy and were never scanned for an embedded clip (motion_checked NULL/0).
// Rows already carrying a clip (motion_message_id set) or with no local file
// are excluded — nothing to re-extract.
export async function getPhotosMissingMotion(limit = 200): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status = 'uploaded'
       AND mime = 'image/jpeg'
       AND message_id IS NOT NULL
       AND local_uri IS NOT NULL
       AND motion_message_id IS NULL
       AND (motion_checked IS NULL OR motion_checked = 0)
     ORDER BY taken_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows.map(rowToPhoto);
}

// OCR source image for a row: the preview (65 KB) or channel thumbnail —
// screenshot text stays legible at preview resolution.
export async function getScreenshotOcrCount(): Promise<number> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM photos
     WHERE status = 'uploaded' AND ocr_text IS NULL
       AND ((' ' || COALESCE(tags, '') || ' ') LIKE '% screenshot %'
            OR (' ' || COALESCE(tags, '') || ' ') LIKE '% screenshots %')
       AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)`
  );
  return row?.n ?? 0;
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

async function migrateRest(db: SQLite.SQLiteDatabase): Promise<void> {
  await addColumnsIfMissing(db, "upload_queue", [
    ["next_attempt_at", "INTEGER"],
    ["profile_id", "TEXT"],
    ["reply_to_message_id", "INTEGER"],
    // Upload priority lanes (R27): 0 = promoted (favorited), 1 = default,
    // 2 = deprioritized (screenshots/screen recordings).
    ["priority", "INTEGER NOT NULL DEFAULT 1"],
    // Completion timestamp (ms) for the throughput readout on the queue screen.
    ["finished_at", "INTEGER"],
  ]);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS photo_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      content_hash TEXT,
      remote_file_id TEXT,
      preview_file_id TEXT,
      thumb_file_id TEXT,
      message_id INTEGER,
      preview_message_id INTEGER,
      size INTEGER,
      width INTEGER,
      height INTEGER,
      version INTEGER NOT NULL,
      uploaded_at INTEGER,
      profile_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_photo_versions_photo
      ON photo_versions(photo_id, version);
    CREATE TABLE IF NOT EXISTS photo_embeddings (
      photo_id TEXT PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vec BLOB NOT NULL
    );
  `);
  await addColumnsIfMissing(db, "albums", [
    ["locked", "INTEGER"],
    ["query", "TEXT"],
    // Curated album cover (F11): when set and still a member, this photo is
    // preferred over the newest-taken default. NULL = automatic.
    ["cover_photo_id", "TEXT"],
    // Manual album order (drag-to-reorder). 0 = never ordered.
    ["sort_order", "INTEGER NOT NULL DEFAULT 0"],
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
  // Dequeue lookup: pending rows read manual-first → priority → time order.
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_queue_dequeue
       ON upload_queue(state, priority, upload_type, taken_at);`
  );
}

async function migrateFtsSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'photos_fts'"
  );
  // Rebuild when the FTS table predates a column: ai_caption (R18) or
  // ocr_text (R30). FTS5 tables cannot be altered — drop and rebuild
  // (derived data only).
  if (!row || row.sql.includes("ai_caption") === false || row.sql.includes("ocr_text") === false) {
    await db.execAsync("DROP TABLE IF EXISTS photos_fts");
    await db.execAsync(`
      CREATE VIRTUAL TABLE photos_fts USING fts5(
        photo_id UNINDEXED, filename, folder, tags, device, camera, mime, ai_caption, ocr_text
      );
    `);
    await ftsRebuild(db);
  }
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

// ---------------------------------------------------------------------------
// Multi-device sync (LWW registers with Lamport clocks)
// ---------------------------------------------------------------------------

export type SyncEntity = "photo" | "album";
export type SyncField = "favorite" | "tags" | "membership" | "album_name" | "cover";

export interface SyncOp {
  op_id: string;
  device_id: string;
  entity: SyncEntity;
  entity_id: string;
  field: SyncField;
  value: string | null;
  lamport: number;
  created_at: number;
  sent: number;
  applied: number;
}

export interface SyncConflict {
  id: number;
  entity: SyncEntity;
  entity_id: string;
  field: SyncField;
  local_value: string | null;
  remote_value: string | null;
  remote_device: string | null;
  created_at: number;
}

const SYNC_FIELDS: SyncField[] = ["favorite", "tags", "membership", "album_name", "cover"];

/** Records a local change and bumps the Lamport clock. */
export async function recordSyncOp(
  entity: SyncEntity,
  entityId: string,
  field: SyncField,
  value: string | null
): Promise<void> {
  try {
    const d = await getDb();
    const raw = await kvGet("sync_lamport");
    const lamport = (parseInt(raw ?? "0", 10) || 0) + 1;
    await kvSet("sync_lamport", String(lamport));
    const { getDeviceId } = await import("./settings");
    const device = await getDeviceId();
    const opId = `${device}:${lamport}:${Math.random().toString(36).slice(2, 8)}`;
    await d.runAsync(
      `INSERT OR IGNORE INTO sync_ops
        (op_id, device_id, entity, entity_id, field, value, lamport, created_at, sent, applied)
       VALUES (?,?,?,?,?,?,?,?,0,1)`,
      [opId, device, entity, entityId, field, value, lamport, Date.now()]
    );
  } catch {
    // Sync bookkeeping must never break the primary mutation.
  }
}

export async function pendingSyncOpCount(): Promise<number> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sync_ops WHERE sent = 0"
  );
  return row?.n ?? 0;
}

export async function exportSyncOps(limit = 500): Promise<SyncOp[]> {
  const d = await getDb();
  return d.getAllAsync<SyncOp>(
    "SELECT * FROM sync_ops WHERE sent = 0 ORDER BY lamport ASC LIMIT ?",
    [limit]
  );
}

export async function markSyncOpsSent(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  const ph = ids.map(() => "?").join(",");
  await d.runAsync(`UPDATE sync_ops SET sent = 1 WHERE op_id IN (${ph})`, ids);
}

async function latestOp(
  entity: SyncEntity,
  entityId: string,
  field: SyncField
): Promise<SyncOp | null> {
  const d = await getDb();
  return d.getFirstAsync<SyncOp>(
    `SELECT * FROM sync_ops
      WHERE entity = ? AND entity_id = ? AND field = ?
      ORDER BY lamport DESC, device_id DESC LIMIT 1`,
    [entity, entityId, field]
  );
}

async function applySyncValue(
  entity: SyncEntity,
  entityId: string,
  field: SyncField,
  value: string | null
): Promise<void> {
  const d = await getDb();
  if (entity === "photo") {
    if (field === "favorite") {
      await d.runAsync("UPDATE photos SET favorite = ? WHERE id = ?", [
        value === "1" ? 1 : 0,
        entityId,
      ]);
    } else if (field === "tags") {
      await d.runAsync("UPDATE photos SET tags = ? WHERE id = ?", [value, entityId]);
      try {
        const row = await getPhoto(entityId);
        if (row) await ftsIndexPhoto({ ...row, tags: value });
      } catch {}
    }
    return;
  }
  if (field === "album_name") {
    await d.runAsync("UPDATE albums SET name = ? WHERE id = ?", [value ?? "", Number(entityId)]);
  } else if (field === "cover") {
    await d.runAsync("UPDATE albums SET cover_photo_id = ? WHERE id = ?", [
      value || null,
      Number(entityId),
    ]);
  } else if (field === "membership") {
    try {
      const parsed = JSON.parse(value ?? "{}") as { albumId?: number; member?: boolean };
      const albumId = Number(parsed.albumId);
      if (!Number.isFinite(albumId)) return;
      if (parsed.member) {
        await d.runAsync(
          "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?,?,?)",
          [albumId, entityId, Date.now()]
        );
      } else {
        await d.runAsync("DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?", [
          albumId,
          entityId,
        ]);
      }
    } catch {}
  }
}

/** Merges remote ops with last-write-wins; records disagreements for review. */
export async function applyRemoteOps(
  ops: SyncOp[]
): Promise<{ applied: number; conflicts: number }> {
  let applied = 0;
  let conflicts = 0;
  const d = await getDb();
  for (const op of ops) {
    if (!op || !SYNC_FIELDS.includes(op.field)) continue;
    if (op.entity !== "photo" && op.entity !== "album") continue;
    const lamport = Number(op.lamport);
    if (!Number.isFinite(lamport) || lamport <= 0) continue;
    if (typeof op.entity_id !== "string" || !op.entity_id) continue;
    const local = await latestOp(op.entity, op.entity_id, op.field);
    const remoteWins = lwwWins(
      lamport,
      String(op.device_id ?? ""),
      local ? local.lamport : null,
      local ? local.device_id : null
    );
    if (local && local.value !== op.value) {
      conflicts++;
      await d.runAsync(
        `INSERT INTO sync_conflicts
          (entity, entity_id, field, local_value, remote_value, remote_device, created_at, resolved)
         VALUES (?,?,?,?,?,?,?,0)`,
        [
          op.entity,
          op.entity_id,
          op.field,
          local.value,
          op.value,
          op.device_id,
          Date.now(),
        ]
      );
    }
    if (remoteWins) {
      await applySyncValue(op.entity, op.entity_id, op.field, op.value);
      applied++;
    }
    await d.runAsync(
      `INSERT OR IGNORE INTO sync_ops
        (op_id, device_id, entity, entity_id, field, value, lamport, created_at, sent, applied)
       VALUES (?,?,?,?,?,?,?,?,1,?)`,
      [
        String(op.op_id ?? `${op.device_id}:${lamport}:${Math.random().toString(36).slice(2, 8)}`),
        String(op.device_id ?? "unknown"),
        op.entity,
        op.entity_id,
        op.field,
        op.value ?? null,
        lamport,
        Number(op.created_at) || Date.now(),
        remoteWins ? 1 : 0,
      ]
    );
  }
  return { applied, conflicts };
}

export async function getSyncConflicts(limit = 50): Promise<SyncConflict[]> {
  const d = await getDb();
  return d.getAllAsync<SyncConflict>(
    "SELECT * FROM sync_conflicts WHERE resolved = 0 ORDER BY created_at DESC LIMIT ?",
    [limit]
  );
}

export async function resolveSyncConflict(
  id: number,
  keep: "local" | "remote"
): Promise<void> {
  const d = await getDb();
  const row = await d.getFirstAsync<SyncConflict>("SELECT * FROM sync_conflicts WHERE id = ?", [id]);
  if (!row) return;
  const value = keep === "local" ? row.local_value : row.remote_value;
  if (keep === "remote") {
    await applySyncValue(row.entity, row.entity_id, row.field, row.remote_value);
  }
  // Recording the choice as a fresh local op propagates it to other devices.
  await recordSyncOp(row.entity, row.entity_id, row.field, value);
  await d.runAsync("UPDATE sync_conflicts SET resolved = 1 WHERE id = ?", [id]);
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
      ["filename", "folder", "tags", "device", "camera", "mime", "ai_caption", "ocr_text"].includes(k)
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

export interface PhotoVersionRow {
  id: number;
  photo_id: string;
  content_hash: string | null;
  remote_file_id: string | null;
  preview_file_id: string | null;
  thumb_file_id: string | null;
  message_id: number | null;
  preview_message_id: number | null;
  size: number | null;
  width: number | null;
  height: number | null;
  version: number;
  uploaded_at: number | null;
  profile_id: string | null;
}

export async function getPhotosByLocalIds(localIds: string[]): Promise<PhotoRow[]> {
  const d = await getDb();
  const out: PhotoRow[] = [];
  // SQLite's host-parameter ceiling is 999 on old builds — chunk to stay safe.
  for (let i = 0; i < localIds.length; i += 400) {
    const chunk = localIds.slice(i, i + 400);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await d.getAllAsync<any>(
      `SELECT * FROM photos WHERE local_id IN (${placeholders})`,
      chunk
    );
    out.push(...rows.map(rowToPhoto));
  }
  return out;
}

/**
 * Copy the photo row's CURRENT channel state into photo_versions as the given
 * version number. Single-statement INSERT..SELECT so the snapshot cannot
 * interleave with the updatePhoto that follows it in the version-upload path.
 * Returns false when the row has no channel copy (nothing worth versioning).
 */
export async function snapshotPhotoVersion(photoId: string, version: number): Promise<boolean> {
  const d = await getDb();
  const res = await d.runAsync(
    `INSERT INTO photo_versions
      (photo_id, content_hash, remote_file_id, preview_file_id, thumb_file_id,
       message_id, preview_message_id, size, width, height, version, uploaded_at, profile_id)
     SELECT id, content_hash, remote_file_id, preview_file_id, thumb_file_id,
       message_id, preview_message_id, size, width, height, ?, uploaded_at, profile_id
     FROM photos WHERE id = ? AND message_id IS NOT NULL`,
    [version, photoId]
  );
  return res.changes > 0;
}

export async function countPhotoVersions(photoId: string): Promise<number> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM photo_versions WHERE photo_id = ?",
    [photoId]
  );
  return row?.n ?? 0;
}

export async function getPhotoVersions(photoId: string): Promise<PhotoVersionRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<PhotoVersionRow>(
    "SELECT * FROM photo_versions WHERE photo_id = ? ORDER BY version DESC",
    [photoId]
  );
  return rows;
}

/** Every channel message pair that belongs to superseded versions of a photo —
 * used so trash/delete-forever can clean the whole version chain. */
export async function getVersionMessageIds(
  photoId: string
): Promise<{ message_id: number | null; preview_message_id: number | null }[]> {
  const d = await getDb();
  return d.getAllAsync<{ message_id: number | null; preview_message_id: number | null }>(
    "SELECT message_id, preview_message_id FROM photo_versions WHERE photo_id = ? AND (message_id IS NOT NULL OR preview_message_id IS NOT NULL)",
    [photoId]
  );
}

export async function setPhotoEmbedding(
  photoId: string,
  model: string,
  vec: Uint8Array
): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    `INSERT INTO photo_embeddings (photo_id, model, dim, vec) VALUES (?,?,?,?)
     ON CONFLICT(photo_id) DO UPDATE SET model = excluded.model, dim = excluded.dim, vec = excluded.vec`,
    [photoId, model, vec.length, vec]
  );
}

export interface EmbeddingRow {
  photo_id: string;
  vec: Uint8Array;
}

/** Ranked-search corpus: embeddings of photos that are uploaded and live. */
export async function getEmbeddingCorpus(): Promise<EmbeddingRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ photo_id: string; vec: Uint8Array }>(
    `SELECT e.photo_id, e.vec FROM photo_embeddings e
     JOIN photos p ON p.id = e.photo_id
     WHERE p.status = 'uploaded' AND p.id NOT IN (SELECT photo_id FROM trash)`
  );
  return rows;
}

export async function getEmbeddingCoverage(): Promise<{ embedded: number; missing: number }> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ embedded: number; missing: number }>(
    `SELECT
       (SELECT COUNT(*) FROM photo_embeddings) AS embedded,
       (SELECT COUNT(*) FROM photos
          WHERE status = 'uploaded'
            AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
            AND id NOT IN (SELECT photo_id FROM photo_embeddings)) AS missing`
  );
  return { embedded: row?.embedded ?? 0, missing: row?.missing ?? 0 };
}

export async function clearEmbeddings(): Promise<void> {
  const d = await getDb();
  await d.runAsync("DELETE FROM photo_embeddings");
}

export interface SemanticCorpusItem {
  id: string;
  text: string;
}

/**
 * Next slice of photos that still lack an embedding. Because embedded rows
 * drop out of this query, callers can always take offset 0 and loop until it
 * returns empty.
 */
export async function getSemanticCorpus(limit = 20): Promise<SemanticCorpusItem[]> {
  const d = await getDb();
  return d.getAllAsync<SemanticCorpusItem>(
    `SELECT p.id,
       TRIM(COALESCE(p.ai_caption, '') || ' ' || p.filename || ' ' ||
            COALESCE(p.folder, '') || ' ' || COALESCE(p.tags, '')) AS text
     FROM photos p
     WHERE p.status = 'uploaded'
       AND p.id NOT IN (SELECT photo_id FROM trash)
       AND p.id NOT IN (SELECT photo_id FROM photo_embeddings)
     ORDER BY p.taken_at DESC
     LIMIT ?`,
    [limit]
  );
}

/** Photos by id, returned in the SAME order as the input ids (ranked results). */
export async function getPhotosByIds(ids: string[]): Promise<PhotoRow[]> {
  const d = await getDb();
  const found = new Map<string, PhotoRow>();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await d.getAllAsync<any>(
      `SELECT * FROM photos WHERE id IN (${placeholders}) AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)`,
      chunk
    );
    for (const r of rows) found.set(r.id as string, rowToPhoto(r));
  }
  return ids.map((id) => found.get(id)).filter((p): p is PhotoRow => !!p);
}

export async function countAllPhotoVersions(): Promise<number> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM photo_versions"
  );
  return row?.n ?? 0;
}

/**
 * Point a backed-up photo row at THIS device's local asset. Used when the
 * same content is already in the cloud under another local id — the restored
 * library / new-phone case — so the library keeps live local links instead of
 * dead ids from the previous device.
 */
export async function relinkPhotoToLocalDevice(
  photoId: string,
  localId: string,
  localUri: string | null
): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE photos SET local_id = ?, local_uri = ? WHERE id = ?", [
    localId,
    localUri,
    photoId,
  ]);
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
             AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)`;
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

// local_ids of every row the period-group queries count (uploaded/local/
// failed, not trashed) — lets local-bucket counts exclude already-counted
// assets so "N photos" on a period card matches the deduped grid.
export async function getPeriodCountedLocalIds(): Promise<Set<string>> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ local_id: string }>(
    `SELECT DISTINCT local_id FROM photos
     WHERE local_id IS NOT NULL
     AND status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)`
  );
  return new Set(rows.map((r) => r.local_id));
}

export interface SearchFilters {
  takenWithinDays?: number | null;
  /** Inclusive lower bound (epoch ms) for taken_at. */
  takenAfter?: number | null;
  /** Exclusive upper bound (epoch ms) for taken_at. */
  takenBefore?: number | null;
  /** Case-insensitive substring match on the folder name. */
  folder?: string | null;
  hasGps?: boolean;
  camera?: string | null;
  notBackedUp?: boolean;
  // Structured dimensions (batch: search-filter dimensions). All optional /
  // null = no constraint. The conds array below is shared by the no-text and
  // FTS query paths, so every fragment MUST stay `p.`-qualified.
  device?: string | null;
  mediaType?: "photos" | "videos" | null;
  sort?: "size_desc" | null;
  // One of AUTO_TAGS (src/lib/autotags.ts) — validated by the UI/whitelist
  // before it reaches here.
  autoTag?: string | null;
}

// Saved-search filters can come from an imported backup, so never trust the
// JSON shape merely because it was cast to SearchFilters. Keep this normalizer
// intentionally small and allow-list every field consumed by searchPhotos.
export function normalizeSearchFilters(value: unknown): SearchFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const out: SearchFilters = {};
  if (typeof input.takenWithinDays === "number" && Number.isFinite(input.takenWithinDays)) {
    const days = Math.round(input.takenWithinDays);
    if (days > 0) out.takenWithinDays = Math.min(days, 365);
  }
  if (typeof input.takenAfter === "number" && Number.isFinite(input.takenAfter) && input.takenAfter > 0) {
    out.takenAfter = Math.round(input.takenAfter);
  }
  if (typeof input.takenBefore === "number" && Number.isFinite(input.takenBefore) && input.takenBefore > 0) {
    out.takenBefore = Math.round(input.takenBefore);
  }
  if (typeof input.folder === "string") {
    const folder = input.folder.trim().slice(0, 200);
    if (folder) out.folder = folder;
  }
  if (input.hasGps === true) out.hasGps = true;
  if (typeof input.camera === "string") {
    const camera = input.camera.trim().slice(0, 60);
    if (camera) out.camera = camera;
  }
  if (input.notBackedUp === true) out.notBackedUp = true;
  if (typeof input.device === "string") {
    const device = input.device.trim().slice(0, 200);
    if (device) out.device = device;
  }
  if (input.mediaType === "photos" || input.mediaType === "videos") {
    out.mediaType = input.mediaType;
  }
  if (input.sort === "size_desc") out.sort = input.sort;
  if (
    input.autoTag === "screenshot" ||
    input.autoTag === "screenrec" ||
    input.autoTag === "whatsapp" ||
    input.autoTag === "document"
  ) {
    out.autoTag = input.autoTag;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function searchPhotos(
  query: string,
  filters?: SearchFilters,
  limit = 500
): Promise<PhotoRow[]> {
  const d = await getDb();
  const safeFilters = normalizeSearchFilters(filters);
  const cleaned = query.trim();
  const conds: string[] = [
    "p.id NOT IN (SELECT photo_id FROM trash)",
    // Photos inside a locked album must not leak through search/memories/map.
    "p.id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)",
  ];
  const params: any[] = [];
  if (safeFilters?.takenWithinDays && safeFilters.takenWithinDays > 0) {
    conds.push("p.taken_at >= ?");
    params.push(Date.now() - safeFilters.takenWithinDays * 86400000);
  }
  if (safeFilters?.takenAfter) {
    conds.push("p.taken_at >= ?");
    params.push(safeFilters.takenAfter);
  }
  if (safeFilters?.takenBefore) {
    conds.push("p.taken_at < ?");
    params.push(safeFilters.takenBefore);
  }
  if (safeFilters?.folder) {
    conds.push("LOWER(p.folder) LIKE ?");
    params.push(`%${safeFilters.folder.toLowerCase()}%`);
  }
  if (safeFilters?.hasGps) {
    conds.push("p.latitude IS NOT NULL AND p.longitude IS NOT NULL");
  }
  if (safeFilters?.camera && safeFilters.camera.trim()) {
    conds.push("LOWER(p.camera) LIKE ?");
    params.push(`%${safeFilters.camera.trim().toLowerCase()}%`);
  }
  if (safeFilters?.notBackedUp) {
    conds.push("p.status != 'uploaded'");
  }
  if (safeFilters?.device && safeFilters.device.trim()) {
    conds.push("p.device = ?");
    params.push(safeFilters.device.trim());
  }
  if (safeFilters?.mediaType === "photos") {
    // Null-mime rows are excluded from the photos view (accepted trade-off —
    // device backups always record mime; only edge-case legacy rows lack it).
    conds.push("p.mime LIKE 'image/%'");
  } else if (safeFilters?.mediaType === "videos") {
    conds.push("p.mime LIKE 'video/%'");
  }
  if (safeFilters?.autoTag && safeFilters.autoTag.trim()) {
    // Token match against the space-joined tags string — padding with spaces
    // via SQL concat keeps "screenshot" from matching "screenshots". The tag
    // value is a bound parameter, never interpolated into the SQL text.
    conds.push("(' ' || COALESCE(p.tags, '') || ' ') LIKE ?");
    params.push(`% ${safeFilters.autoTag.trim()} %`);
  }
  const orderBy =
    safeFilters?.sort === "size_desc"
      ? "ORDER BY COALESCE(p.size, 0) DESC"
      : "ORDER BY p.taken_at DESC";
  const where = conds.join(" AND ");
  if (!cleaned) {
    const rows = await d.getAllAsync<any>(
      `SELECT p.* FROM photos p WHERE ${where} ${orderBy} LIMIT ?`,
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
     ${orderBy} LIMIT ?`,
    [terms, ...params, limit]
  );
  return rows.map(rowToPhoto);
}

// Device names of all known photos (uploader device stored per photo), for the
// FilterSheet device chips. DISTINCT over all rows — devices of trashed photos
// are harmless to surface (a trashed device's rows are still excluded from
// search results by the trash cond in searchPhotos).
export async function getDistinctDevices(): Promise<string[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ device: string }>(
    "SELECT DISTINCT device FROM photos WHERE device IS NOT NULL AND device != '' ORDER BY device"
  );
  return rows.map((r) => r.device);
}

// Largest uploaded (backed-up), non-trashed photos — feeds the remote /status
// "Largest" line. Null sizes sink to the bottom via COALESCE.
export async function getLargestUploaded(n = 3): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status = 'uploaded' AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ORDER BY COALESCE(size, 0) DESC LIMIT ?`,
    [n]
  );
  return rows.map(rowToPhoto);
}

export interface SavedSearchRow {
  id: number;
  name: string;
  query: string;
  filters: SearchFilters | null;
  created_at: number;
}

// Upsert by name — re-saving an existing name updates its query/filters in
// place (matches the mental model of pinning a filter combo).
export async function saveSearch(
  name: string,
  query: string,
  filters: SearchFilters | null
): Promise<number> {
  const d = await getDb();
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) throw new Error("Search name is required");
  const existing = await d.getFirstAsync<{ id: number }>(
    "SELECT id FROM saved_searches WHERE name = ?",
    [trimmed]
  );
  if (existing) {
    await d.runAsync(
      "UPDATE saved_searches SET query = ?, filters = ? WHERE id = ?",
      [query.trim().slice(0, 200), JSON.stringify(normalizeSearchFilters(filters)), existing.id]
    );
    return existing.id;
  }
  const res = await d.runAsync(
    "INSERT INTO saved_searches (name, query, filters, created_at) VALUES (?,?,?,?)",
    [trimmed, query.trim().slice(0, 200), JSON.stringify(normalizeSearchFilters(filters)), Date.now()]
  );
  return res.lastInsertRowId ?? 0;
}

export async function getSavedSearches(): Promise<SavedSearchRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<{
    id: number;
    name: string;
    query: string;
    filters: string;
    created_at: number;
  }>("SELECT id, name, query, filters, created_at FROM saved_searches ORDER BY created_at DESC");
  return rows.map((r) => {
    let filters: SearchFilters | null = null;
    try {
      filters = normalizeSearchFilters(JSON.parse(r.filters));
    } catch {
      // Corrupt filters JSON (bad import) degrades to a text-only search.
      filters = null;
    }
    return { ...r, filters };
  });
}

export async function deleteSavedSearch(id: number): Promise<void> {
  const d = await getDb();
  await d.runAsync("DELETE FROM saved_searches WHERE id = ?", [id]);
}

export async function renameSavedSearch(id: number, name: string): Promise<void> {
  const d = await getDb();
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) throw new Error("Search name is required");
  await d.runAsync("UPDATE saved_searches SET name = ? WHERE id = ?", [trimmed, id]);
}

export async function ftsIndexPhoto(p: PhotoRow): Promise<void> {
  const d = await getDb();
  await d.runAsync("DELETE FROM photos_fts WHERE photo_id = ?", [p.id]);
  await d.runAsync(
    "INSERT INTO photos_fts (photo_id, filename, folder, tags, device, camera, mime, ai_caption, ocr_text) VALUES (?,?,?,?,?,?,?,?,?)",
    [p.id, p.filename ?? "", p.folder ?? "", p.tags ?? "", p.device ?? "", p.camera ?? "", p.mime ?? "", p.ai_caption ?? "", p.ocr_text ?? ""]
  );
}

// dbOverride: callers running INSIDE migrate() must pass the open handle —
// getDb() here would await the same pending promise migrate() is already
// running under and deadlock the very first launch that needs a rebuild.
export async function ftsRebuild(dbOverride?: SQLite.SQLiteDatabase): Promise<void> {
  const d = dbOverride ?? (await getDb());
  const rows = await d.getAllAsync<any>("SELECT * FROM photos");
  await d.runAsync("DELETE FROM photos_fts");
  for (const r of rows) {
    const p = rowToPhoto(r);
    await d.runAsync(
      "INSERT INTO photos_fts (photo_id, filename, folder, tags, device, camera, mime, ai_caption, ocr_text) VALUES (?,?,?,?,?,?,?,?,?)",
      [p.id, p.filename ?? "", p.folder ?? "", p.tags ?? "", p.device ?? "", p.camera ?? "", p.mime ?? "", p.ai_caption ?? "", p.ocr_text ?? ""]
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
  await recordSyncOp("photo", id, "favorite", fav ? "1" : "0");
}

export async function getFavorites(): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos WHERE favorite = 1 AND status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1) ORDER BY taken_at DESC`
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
    "INSERT OR IGNORE INTO albums (name, created_at, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM albums))",
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

// --- People clustering (read side; the embedding provider writes the rows) ---

export interface PersonClusterSummary {
  id: number;
  name: string | null;
  cover_photo_id: string | null;
  cover_file_id: string | null;
  count: number;
}

export async function getPeopleClusters(): Promise<PersonClusterSummary[]> {
  const d = await getDb();
  // Avoid a correlated subquery here: this Android SQLite rejects outer
  // references in some subquery positions (see R35). Two plain queries + a JS
  // merge are safe.
  const rows = await d.getAllAsync<any>(
    `SELECT p.id, p.name, p.cover_photo_id,
            COUNT(DISTINCT fe.photo_id) AS count,
            cp.preview_file_id AS curated_preview,
            cp.thumb_file_id AS curated_thumb,
            cp.remote_file_id AS curated_remote
       FROM people p
       LEFT JOIN face_embeddings fe ON fe.person_id = p.id
       LEFT JOIN photos cp ON cp.id = p.cover_photo_id
      GROUP BY p.id
      ORDER BY count DESC, p.id ASC`
  );
  const covers = await d.getAllAsync<any>(
    `SELECT fe.person_id, ph.preview_file_id, ph.thumb_file_id, ph.remote_file_id
       FROM face_embeddings fe
       JOIN photos ph ON ph.id = fe.photo_id
      WHERE fe.person_id IS NOT NULL
        AND (ph.preview_file_id IS NOT NULL OR ph.thumb_file_id IS NOT NULL OR ph.remote_file_id IS NOT NULL)
      GROUP BY fe.person_id`
  );
  const coverByPerson = new Map<number, string>();
  for (const c of covers) {
    const id = Number(c.person_id);
    if (!Number.isFinite(id)) continue;
    coverByPerson.set(
      id,
      c.preview_file_id ?? c.thumb_file_id ?? c.remote_file_id
    );
  }
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name ?? null,
    cover_photo_id: r.cover_photo_id ?? null,
    cover_file_id:
      r.curated_preview ?? r.curated_thumb ?? r.curated_remote ?? coverByPerson.get(Number(r.id)) ?? null,
    count: Number(r.count) || 0,
  }));
}

export async function setPersonName(personId: number, name: string | null): Promise<void> {
  const d = await getDb();
  const clean = name?.trim().slice(0, 60) || null;
  await d.runAsync("UPDATE people SET name = ? WHERE id = ?", [clean, personId]);
}

export async function getPersonPhotos(personId: number): Promise<PhotoRow[]> {
  const d = await getDb();
  return d.getAllAsync<PhotoRow>(
    `SELECT ph.* FROM photos ph
       JOIN face_embeddings fe ON fe.photo_id = ph.id
      WHERE fe.person_id = ?
        AND ph.id NOT IN (SELECT photo_id FROM trash)
        AND ph.id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
      GROUP BY ph.id
      ORDER BY ph.taken_at DESC`,
    [personId]
  );
}

export async function getFaceEmbeddingCount(): Promise<number> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM face_embeddings"
  );
  return row?.n ?? 0;
}

/** Appends new auto-tags and refreshes the FTS row. */
export async function addPhotoTags(photoId: string, newTags: string[]): Promise<void> {
  const row = await getPhoto(photoId);
  if (!row) return;
  const set = new Set(
    (row.tags ?? "")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
  );
  for (const raw of newTags) {
    const clean = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_:-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    if (clean) set.add(clean);
  }
  const tags = [...set].join(" ");
  await updatePhoto(photoId, { tags });
  await ftsIndexPhoto({ ...row, tags });
  await recordSyncOp("photo", photoId, "tags", tags);
}

export async function getPhotosMissingSceneTags(limit = 50): Promise<PhotoRow[]> {
  const d = await getDb();
  return d.getAllAsync<PhotoRow>(
    `SELECT * FROM photos
      WHERE status IN ('uploaded','local')
        AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
        AND (tags IS NULL OR tags NOT LIKE '%scene:%')
        AND (preview_file_id IS NOT NULL OR thumb_file_id IS NOT NULL OR local_uri IS NOT NULL)
      ORDER BY taken_at DESC
      LIMIT ?`,
    [limit]
  );
}

export async function getPhotosMissingFaceIndex(limit = 25): Promise<PhotoRow[]> {
  const d = await getDb();
  return d.getAllAsync<PhotoRow>(
    `SELECT p.* FROM photos p
      WHERE p.status IN ('uploaded','local')
        AND p.id NOT IN (SELECT photo_id FROM trash)
        AND NOT EXISTS (SELECT 1 FROM face_embeddings fe WHERE fe.photo_id = p.id)
        AND (p.preview_file_id IS NOT NULL OR p.thumb_file_id IS NOT NULL OR p.local_uri IS NOT NULL)
      ORDER BY p.taken_at DESC
      LIMIT ?`,
    [limit]
  );
}

export interface FaceWrite {
  box: [number, number, number, number]; // x, y, w, h in source pixels
  embedding: number[];
}

export async function replaceFacesForPhoto(
  photoId: string,
  faces: FaceWrite[],
  model = "mobilefacenet"
): Promise<void> {
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    await d.runAsync("DELETE FROM face_embeddings WHERE photo_id = ?", [photoId]);
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      const vec = new Uint8Array(new Float32Array(f.embedding).buffer);
      await d.runAsync(
        `INSERT INTO face_embeddings
          (photo_id, face_index, person_id, dim, vec, model, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [photoId, i, null, f.embedding.length, vec, model, Date.now()]
      );
    }
  });
}

export interface StoredFace {
  photoId: string;
  faceIndex: number;
  embedding: number[];
}

export async function getAllFaceSamples(): Promise<StoredFace[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    "SELECT photo_id, face_index, vec FROM face_embeddings"
  );
  const out: StoredFace[] = [];
  for (const r of rows) {
    try {
      const bytes: Uint8Array =
        r.vec instanceof Uint8Array ? r.vec : new Uint8Array(r.vec);
      const copy = bytes.slice();
      const floats = new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
      out.push({
        photoId: String(r.photo_id),
        faceIndex: Number(r.face_index),
        embedding: Array.from(floats),
      });
    } catch {}
  }
  return out;
}

/** Replaces all people rows and assigns each face to its cluster. */
export async function savePeopleClusters(
  clusters: {
    faceKeys: string[]; // "photoId|faceIndex"
    coverPhotoId: string | null;
    name?: string | null;
  }[]
): Promise<void> {
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    await d.runAsync("DELETE FROM people");
    await d.runAsync("UPDATE face_embeddings SET person_id = NULL");
    for (const c of clusters) {
      const res = await d.runAsync(
        "INSERT INTO people (name, cover_photo_id, created_at) VALUES (?,?,?)",
        [c.name ?? null, c.coverPhotoId, Date.now()]
      );
      const personId = res.lastInsertRowId ?? 0;
      for (const key of c.faceKeys) {
        const [photoId, idx] = key.split("|");
        await d.runAsync(
          "UPDATE face_embeddings SET person_id = ? WHERE photo_id = ? AND face_index = ?",
          [personId, photoId, Number(idx)]
        );
      }
    }
  });
}

export async function renameAlbum(id: number, name: string): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE albums SET name = ? WHERE id = ?", [name, id]);
  await recordSyncOp("album", String(id), "album_name", name);
}

export interface AlbumWithCover extends AlbumRow {
  count: number;
  cover_file_id: string | null;
  cover_preview_id: string | null;
  /** Up to four newest member previews for the 2x2 cover mosaic. */
  covers: string[];
}

export async function getAlbums(): Promise<AlbumWithCover[]> {
  const d = await getDb();
  // SQLite rejects outer-column references inside a subquery's ORDER BY (device
  // test: "no such column: a.id"), so covers are resolved with plain queries.
  const rows = await d.getAllAsync<any>(
    `SELECT a.*, COUNT(ap.photo_id) as count
     FROM albums a
     LEFT JOIN album_photos ap ON ap.album_id = a.id
     GROUP BY a.id ORDER BY a.sort_order ASC, a.created_at DESC`
  );
  // Automatic cover: newest-taken non-trashed member of each album.
  const newest = await d.getAllAsync<any>(
    `SELECT ap.album_id AS album_id, p.id AS photo_id,
            p.remote_file_id, p.preview_file_id
     FROM album_photos ap
     JOIN photos p ON p.id = ap.photo_id
     JOIN (
       SELECT ap2.album_id AS album_id, MAX(p2.taken_at) AS taken_at
       FROM album_photos ap2
       JOIN photos p2 ON p2.id = ap2.photo_id
       WHERE p2.id NOT IN (SELECT photo_id FROM trash)
       GROUP BY ap2.album_id
     ) m ON m.album_id = ap.album_id AND m.taken_at = p.taken_at
     WHERE p.id NOT IN (SELECT photo_id FROM trash)`
  );
  // Curated cover wins when it is still a non-trashed member.
  const curated = await d.getAllAsync<any>(
    `SELECT a.id AS album_id, p.id AS photo_id,
            p.remote_file_id, p.preview_file_id
     FROM albums a
     JOIN album_photos ap ON ap.album_id = a.id AND ap.photo_id = a.cover_photo_id
     JOIN photos p ON p.id = ap.photo_id
     WHERE a.cover_photo_id IS NOT NULL
       AND p.id NOT IN (SELECT photo_id FROM trash)`
  );
  const coverByAlbum = new Map<number, any>();
  for (const c of newest) {
    if (!coverByAlbum.has(c.album_id)) coverByAlbum.set(c.album_id, c);
  }
  for (const c of curated) coverByAlbum.set(c.album_id, c);
  // 2x2 mosaic inputs: up to four newest non-trashed member previews per
  // album, resolved in one query and grouped in JS (no correlated subqueries).
  const mosaicRows = await d.getAllAsync<any>(
    `SELECT ap.album_id AS album_id, p.preview_file_id, p.remote_file_id
     FROM album_photos ap
     JOIN photos p ON p.id = ap.photo_id
     WHERE p.id NOT IN (SELECT photo_id FROM trash)
     ORDER BY ap.album_id ASC, p.taken_at DESC`
  );
  const mosaicByAlbum = new Map<number, string[]>();
  for (const m of mosaicRows) {
    const list = mosaicByAlbum.get(m.album_id) ?? [];
    if (list.length >= 4) continue;
    const fileId = m.preview_file_id ?? m.remote_file_id;
    if (fileId) list.push(fileId);
    mosaicByAlbum.set(m.album_id, list);
  }
  return rows.map((r) => {
    const c = coverByAlbum.get(r.id);
    return {
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      locked: r.locked,
      query: r.query ?? null,
      cover_photo_id: r.cover_photo_id ?? null,
      count: r.count,
      cover_file_id: c?.remote_file_id ?? null,
      cover_preview_id: c?.preview_file_id ?? null,
      covers: mosaicByAlbum.get(r.id) ?? [],
    };
  });
}

/** Persist the manual album order (ids in display order). */
export async function reorderAlbums(ids: number[]): Promise<void> {
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    for (let i = 0; i < ids.length; i++) {
      await d.runAsync("UPDATE albums SET sort_order = ? WHERE id = ?", [i + 1, ids[i]]);
    }
  });
}

// Curate an album/trip cover (F11). Passing null restores the newest-taken
// default. Stored on the album row so generator rebuilds (trips) don't clear it.
export async function setAlbumCover(albumId: number, photoId: string | null): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE albums SET cover_photo_id = ? WHERE id = ?", [photoId, albumId]);
  await recordSyncOp("album", String(albumId), "cover", photoId);
}

export async function getAlbumPhotos(albumId: number): Promise<PhotoRow[]> {
  const d = await getDb();
  const album = await d.getFirstAsync<{ query: string | null }>("SELECT query FROM albums WHERE id = ?", [albumId]);
  const trip = parseTripQuery(album?.query);
  if (trip) {
    if (trip.photoIds.length === 0) return [];
    const placeholders = trip.photoIds.map(() => "?").join(",");
    const rows = await d.getAllAsync<any>(
      `SELECT p.* FROM photos p
       WHERE p.id IN (${placeholders}) AND p.id NOT IN (SELECT photo_id FROM trash)
       ORDER BY p.taken_at DESC`,
      trip.photoIds
    );
    return rows.map(rowToPhoto);
  }
  const rows = await d.getAllAsync<any>(
    `SELECT p.* FROM album_photos ap JOIN photos p ON p.id = ap.photo_id
     WHERE ap.album_id = ? AND p.id NOT IN (SELECT photo_id FROM trash)
     ORDER BY p.taken_at DESC`,
    [albumId]
  );
  return rows.map(rowToPhoto);
}

interface TripAlbumQuery {
  kind: "trip";
  key: string;
  startAt: number;
  endAt: number;
  photoIds: string[];
  centerLat: number | null;
  centerLon: number | null;
}

function parseTripQuery(value: string | null | undefined): TripAlbumQuery | null {
  if (!value || value.length > 100_000) return null;
  try {
    const parsed = JSON.parse(value) as Partial<TripAlbumQuery>;
    if (
      parsed?.kind !== "trip" ||
      typeof parsed.key !== "string" ||
      !Number.isFinite(parsed.startAt) ||
      !Number.isFinite(parsed.endAt) ||
      !Array.isArray(parsed.photoIds)
    ) {
      return null;
    }
    const photoIds = parsed.photoIds.filter((id): id is string => typeof id === "string").slice(0, 5000);
    return {
      kind: "trip",
      key: parsed.key,
      startAt: parsed.startAt!,
      endAt: parsed.endAt!,
      photoIds,
      centerLat: typeof parsed.centerLat === "number" ? parsed.centerLat : null,
      centerLon: typeof parsed.centerLon === "number" ? parsed.centerLon : null,
    };
  } catch {
    return null;
  }
}

/** Rebuild generated trip albums while preserving all manually-created albums. */
export async function syncTripAlbums(): Promise<number> {
  const d = await getDb();
  const { clusterTrips } = await import("./trips");
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status IN ('uploaded','local','failed')
       AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ORDER BY taken_at ASC`
  );
  const clusters = clusterTrips(rows.map(rowToPhoto));
  const existingRows = await d.getAllAsync<{ id: number; name: string; query: string | null }>(
    "SELECT id, name, query FROM albums WHERE query IS NOT NULL AND query != ''"
  );
  const generatedIds = new Set(existingRows.map((row) => row.id));
  const usedNames = new Set(
    (await d.getAllAsync<{ id: number; name: string }>("SELECT id, name FROM albums"))
      .filter((row) => !generatedIds.has(row.id))
      .map((row) => row.name)
  );
  const existing = new Map<string, number>();
  for (const row of existingRows) {
    const parsed = parseTripQuery(row.query);
    if (parsed) existing.set(parsed.key, row.id);
  }
  const assignedNames = new Set<string>();
  const baseOccurrences = new Map<string, number>();
  const activeKeys = new Set(clusters.map((cluster) => cluster.key));
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  await d.withTransactionAsync(async () => {
    // Remove stale generated albums first so their unique names cannot block
    // a current cluster that reuses the same date label. A generated album
    // whose query no longer parses is garbage (corrupt import) — drop it too.
    for (const row of existingRows) {
      const parsed = parseTripQuery(row.query);
      if (!parsed || !activeKeys.has(parsed.key)) {
        await d.runAsync("DELETE FROM albums WHERE id = ?", [row.id]);
      }
    }
    for (const cluster of clusters) {
      const query = JSON.stringify(cluster);
      const existingId = existing.get(cluster.key);
      let displayName = cluster.name;
      const occurrence = (baseOccurrences.get(cluster.name) ?? 0) + 1;
      baseOccurrences.set(cluster.name, occurrence);
      if (occurrence > 1) displayName = `${cluster.name} · ${occurrence}`;
      if (usedNames.has(displayName) || assignedNames.has(displayName)) {
        let suffix = occurrence > 1 ? occurrence + 1 : 2;
        while (usedNames.has(`${cluster.name} · ${suffix}`) || assignedNames.has(`${cluster.name} · ${suffix}`)) suffix++;
        displayName = `${cluster.name} · ${suffix}`;
      }
      assignedNames.add(displayName);
      let albumId: number;
      if (existingId != null) {
        const current = existingById.get(existingId);
        if (current && current.query === query) {
          // Membership is byte-identical to the stored query, and album_photos
          // is fully derived from that query — skip the rewrite churn that a
          // rebuild would otherwise pay on every Collections visit. The count
          // re-check heals drift from merges that bypass this function (e.g.
          // importAllData with replace:false matching album ids).
          const count = await d.getFirstAsync<{ n: number }>(
            "SELECT COUNT(*) as n FROM album_photos WHERE album_id = ?",
            [existingId]
          );
          if ((count?.n ?? 0) === cluster.photoIds.length) {
            if (current.name !== displayName) {
              await d.runAsync("UPDATE albums SET name = ? WHERE id = ?", [displayName, existingId]);
            }
            continue;
          }
        }
        albumId = existingId;
        await d.runAsync("UPDATE albums SET name = ?, query = ? WHERE id = ?", [displayName, query, existingId]);
      } else {
        const result = await d.runAsync(
          "INSERT INTO albums (name, created_at, query) VALUES (?,?,?)",
          [displayName, Date.now(), query]
        );
        albumId = result.lastInsertRowId ?? 0;
      }
      await d.runAsync("DELETE FROM album_photos WHERE album_id = ?", [albumId]);
      for (const photoId of cluster.photoIds) {
        await d.runAsync(
          "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?,?,?)",
          [albumId, photoId, Date.now()]
        );
      }
    }
  });
  return clusters.length;
}

export async function addToAlbum(albumId: number, photoIds: string[]): Promise<void> {
  const d = await getDb();
  for (const pid of photoIds) {
    await d.runAsync(
      "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?,?,?)",
      [albumId, pid, Date.now()]
    );
    await recordSyncOp(
      "photo",
      pid,
      "membership",
      JSON.stringify({ albumId, member: true })
    );
  }
}

export async function removeFromAlbum(albumId: number, photoIds: string[]): Promise<void> {
  const d = await getDb();
  for (const pid of photoIds) {
    await d.runAsync("DELETE FROM album_photos WHERE album_id = ? AND photo_id = ?", [albumId, pid]);
    await recordSyncOp(
      "photo",
      pid,
      "membership",
      JSON.stringify({ albumId, member: false })
    );
  }
}

export async function getPhotoAlbums(photoId: string): Promise<AlbumRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    "SELECT a.* FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE ap.photo_id = ?",
    [photoId]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    locked: r.locked,
    query: r.query ?? null,
  }));
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
  reply_to_message_id?: number | null;
  priority?: number;
}): Promise<number> {
  const d = await getDb();
  let res;
  try {
    res = await d.runAsync(
      `INSERT INTO upload_queue (local_id, local_uri, filename, folder, size, taken_at, added_at,
        content_hash, upload_type, priority, state, retries, created_at, profile_id, reply_to_message_id)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'pending',0,?,?,?)`,
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
        item.priority ?? 1,
        Date.now(),
        item.profile_id ?? null,
        item.reply_to_message_id ?? null,
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
     ORDER BY CASE WHEN upload_type = 'manual' THEN 0 ELSE 1 END, priority ASC, taken_at ASC, created_at ASC
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
  // Stamp a completion time whenever a row reaches a terminal state so the
  // queue screen can show throughput. `done` is the only state we count, but
  // any terminal transition is stamped for completeness.
  const TERMINAL = ["done", "failed", "skipped", "duplicate"];
  if (
    patch.state !== undefined &&
    TERMINAL.includes(patch.state as string) &&
    !keys.includes("finished_at")
  ) {
    keys.push("finished_at");
    (patch as any).finished_at = Date.now();
  }
  const setSql = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => (patch as any)[k] ?? null);
  await d.runAsync(`UPDATE upload_queue SET ${setSql} WHERE id = ?`, [...values, id]);
}

export type UploadThroughput = {
  lastHour: number;
  perMinute: number;
  recentPerMinute: number;
  buckets: number[];
};

// Uploads completed in the last hour, plus a 12-bucket (5 min each) sparkline.
export async function getUploadThroughput(): Promise<UploadThroughput> {
  const d = await getDb();
  const now = Date.now();
  const since = now - 3_600_000;
  let rows: { finished_at: number }[] = [];
  try {
    rows = await d.getAllAsync<{ finished_at: number }>(
      `SELECT finished_at FROM upload_queue
        WHERE state = 'done' AND finished_at IS NOT NULL AND finished_at >= ?`,
      [since]
    );
  } catch {
    rows = [];
  }
  const buckets = new Array(12).fill(0) as number[];
  let recent = 0;
  for (const r of rows) {
    const age = now - r.finished_at;
    const idx = 11 - Math.min(11, Math.floor(age / 300_000));
    buckets[idx] += 1;
    if (age <= 600_000) recent += 1;
  }
  return {
    lastHour: rows.length,
    perMinute: Math.round((rows.length / 60) * 10) / 10,
    recentPerMinute: Math.round((recent / 10) * 10) / 10,
    buckets,
  };
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

// Channel-dedupe audit: groups of rows sharing one content_hash where every
// member has its own channel post — identical uploads posted twice (re-syncs,
// multi-device double ingests, pre-dedupe-era histories). The kept row and
// the deleted duplicates are decided by the caller; this only finds them.
export async function getDuplicateHashGroups(): Promise<PhotoRow[][]> {
  const d = await getDb();
  const hashes = await d.getAllAsync<{ content_hash: string }>(
    `SELECT content_hash FROM photos
     WHERE content_hash IS NOT NULL AND message_id IS NOT NULL
       AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     GROUP BY content_hash
     HAVING COUNT(*) > 1
     LIMIT 200`
  );
  const groups: PhotoRow[][] = [];
  for (const h of hashes) {
    const rows = await d.getAllAsync<any>(
      `SELECT * FROM photos
       WHERE content_hash = ? AND message_id IS NOT NULL
         AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
       ORDER BY uploaded_at DESC`,
      [h.content_hash]
    );
    const group = rows.map(rowToPhoto);
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

// Upload priority lanes: favoriting a local-only photo promotes its pending
// queue row so it lands first when a big backlog drains (overnight catch-up).
export async function prioritizeQueueForPhoto(localId: string): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    "UPDATE upload_queue SET priority = 0 WHERE local_id = ? AND state IN ('pending','running')",
    [localId]
  );
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
       SUM(CASE WHEN status IN ('skipped_too_large', 'duplicate') THEN 1 ELSE 0 END) as skipped,
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
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ORDER BY taken_at DESC`
  );
  return rows.map(rowToPhoto);
}

// Monthly ZIP export (#8): uploaded, downloadable rows taken inside the
// given calendar month (local time), oldest first. Trashed rows excluded.
export async function getUploadedPhotosInMonth(
  year: number,
  month: number // 0-based
): Promise<PhotoRow[]> {
  const d = await getDb();
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status = 'uploaded'
       AND remote_file_id IS NOT NULL
       AND taken_at >= ? AND taken_at < ?
       AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ORDER BY taken_at ASC`,
    [start, end]
  );
  return rows.map(rowToPhoto);
}

// "Free up space" candidates: backed-up rows that still claim a local copy and
// a size (size is what makes them worth listing — it sums into reclaimable
// GB). Trashed rows are excluded even though they keep status='uploaded'.
export async function getFreeUpCandidates(): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status = 'uploaded'
       AND local_id IS NOT NULL
       AND size IS NOT NULL AND size > 0
       AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ORDER BY taken_at DESC`
  );
  return rows.map(rowToPhoto);
}

// "Screenshot sunset" (#7): backed-up screenshots older than `days` whose
// local copy can still be reclaimed. The screenshot tag is set by the
// filename auto-classifier (classifyAutoTags); the space-padded token match
// targets the exact tags "screenshot"/"screenshots" — a folder merely NAMED
// "Screenshots" sanitizes to the plural tag, which is why both spellings are
// checked. Oldest first: the point is surfacing the longest-lived clutter.
export async function getScreenshotSunsetCandidates(days: number): Promise<PhotoRow[]> {
  const d = await getDb();
  // taken_at is epoch milliseconds (getAssetMeta/creationTime are ms).
  const cutoff = Date.now() - days * 86400 * 1000;
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status = 'uploaded'
       AND local_id IS NOT NULL
       AND size IS NOT NULL AND size > 0
       AND taken_at > 0 AND taken_at < ?
       AND ((' ' || COALESCE(tags, '') || ' ') LIKE '% screenshot %'
            OR (' ' || COALESCE(tags, '') || ' ') LIKE '% screenshots %')
       AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ORDER BY taken_at ASC`
  , [cutoff]);
  return rows.map(rowToPhoto);
}

// Remote /wipe candidates (#9): every backed-up row with a known local copy —
// app-trashed rows INCLUDED, because a wiped phone must not leave originals
// sitting in the system gallery either. No size requirement (unlike free-up);
// rows whose local copy is already gone simply no-op in the delete loop.
export async function getWipeLocalCandidates(): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status = 'uploaded'
       AND remote_file_id IS NOT NULL
       AND local_id IS NOT NULL
       AND local_uri IS NOT NULL`
  );
  return rows.map(rowToPhoto);
}

// After the device copy is deleted, the DB row must SURVIVE as the library
// record of the cloud copy — only the stale local_uri pointer goes (local_id
// stays so a later restore/re-scan can match the asset again).
export async function clearLocalUris(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    for (const id of ids) {
      await d.runAsync("UPDATE photos SET local_uri = NULL WHERE id = ?", [id]);
    }
  });
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

export interface StorageSummary {
  cloudBytes: number;
  cloudCount: number;
  localBytes: number;
  localCount: number;
  months: { label: string; bytes: number }[];
}

export async function getStorageSummary(): Promise<StorageSummary> {
  const d = await getDb();
  const split = await d.getFirstAsync<any>(`
    SELECT
      SUM(CASE WHEN status = 'uploaded' THEN COALESCE(size,0) ELSE 0 END) AS cloudBytes,
      SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END) AS cloudCount,
      SUM(CASE WHEN status != 'uploaded' THEN COALESCE(size,0) ELSE 0 END) AS localBytes,
      SUM(CASE WHEN status != 'uploaded' THEN 1 ELSE 0 END) AS localCount
    FROM photos
    WHERE id NOT IN (SELECT photo_id FROM trash)
  `);
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const rows = await d.getAllAsync<{ ym: string; bytes: number }>(
    `SELECT strftime('%Y-%m', COALESCE(uploaded_at, taken_at) / 1000, 'unixepoch', 'localtime') AS ym,
            COALESCE(SUM(COALESCE(size, 0)), 0) AS bytes
     FROM photos
     WHERE COALESCE(uploaded_at, taken_at) >= ?
       AND status = 'uploaded'
       AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     GROUP BY ym`,
    [since.getTime()]
  );
  const byKey = new Map(rows.map((r) => [r.ym, r.bytes]));
  const months: { label: string; bytes: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const dte = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = `${dte.getFullYear()}-${String(dte.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      label: dte.toLocaleString(undefined, { month: "short" }),
      bytes: byKey.get(key) ?? 0,
    });
  }
  return {
    cloudBytes: split?.cloudBytes ?? 0,
    cloudCount: split?.cloudCount ?? 0,
    localBytes: split?.localBytes ?? 0,
    localCount: split?.localCount ?? 0,
    months,
  };
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
    `SELECT strftime('%Y-%m', taken_at / 1000, 'unixepoch', 'localtime') AS ym,
            COUNT(*) AS count,
            COALESCE(SUM(COALESCE(size, 0)), 0) AS bytes
     FROM photos
     WHERE taken_at >= ? AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
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
  // Covers are fetched separately: SQLite rejects outer-alias references inside
  // a subquery, which made this query fail outright on device.
  const rows = await d.getAllAsync<any>(
    `SELECT strftime('%Y', taken_at / 1000, 'unixepoch', 'localtime') as key,
       COUNT(*) as count,
       MIN(taken_at) as startMs,
       MAX(taken_at) as endMs
     FROM photos
     WHERE status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     GROUP BY key ORDER BY key DESC`
  );
  const covers = await d.getAllAsync<any>(
    `SELECT strftime('%Y', taken_at / 1000, 'unixepoch', 'localtime') as key,
       preview_file_id, remote_file_id
     FROM photos
     WHERE status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ORDER BY taken_at DESC`
  );
  const coverByKey = new Map<string, any>();
  for (const c of covers) {
    if (!coverByKey.has(c.key)) coverByKey.set(c.key, c);
  }
  return rows.map((r) => ({
    key: r.key,
    label: r.key,
    startMs: r.startMs,
    endMs: r.endMs,
    count: r.count,
    cover_preview_id: coverByKey.get(r.key)?.preview_file_id ?? null,
    cover_file_id: coverByKey.get(r.key)?.remote_file_id ?? null,
  }));
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function getMonthGroups(year: number | null): Promise<PeriodGroup[]> {
  const d = await getDb();
  const yearFilter = year ? "AND strftime('%Y', taken_at / 1000, 'unixepoch', 'localtime') = ?" : "";
  const params: any[] = year ? [String(year)] : [];
  const rows = await d.getAllAsync<any>(
    `SELECT strftime('%Y-%m', taken_at / 1000, 'unixepoch', 'localtime') as key,
       COUNT(*) as count,
       MIN(taken_at) as startMs,
       MAX(taken_at) as endMs
     FROM photos
     WHERE status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ${yearFilter}
     GROUP BY key ORDER BY key DESC`,
    params
  );
  const covers = await d.getAllAsync<any>(
    `SELECT strftime('%Y-%m', taken_at / 1000, 'unixepoch', 'localtime') as key,
       preview_file_id, remote_file_id
     FROM photos
     WHERE status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     ${yearFilter}
     ORDER BY taken_at DESC`,
    params
  );
  const coverByKey = new Map<string, any>();
  for (const c of covers) {
    if (!coverByKey.has(c.key)) coverByKey.set(c.key, c);
  }
  return rows.map((r) => {
    const y = parseInt(r.key.slice(0, 4), 10);
    const m = parseInt(r.key.slice(5, 7), 10);
    return {
      key: r.key,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
      startMs: r.startMs,
      endMs: r.endMs,
      count: r.count,
      cover_preview_id: coverByKey.get(r.key)?.preview_file_id ?? null,
      cover_file_id: coverByKey.get(r.key)?.remote_file_id ?? null,
    };
  });
}

export async function getPhotosInRange(startMs: number, endMs: number): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status IN ('uploaded','local','failed')
     AND id NOT IN (SELECT photo_id FROM trash)
     AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
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
    `SELECT CAST(strftime('%Y', taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER) as year,
        COUNT(*) as count,
        MIN(taken_at) as startMs,
        MAX(taken_at) as endMs,
        (SELECT p2.preview_file_id FROM photos p2
          WHERE p2.status IN ('uploaded','local','failed')
          AND p2.id NOT IN (SELECT photo_id FROM trash)
          AND p2.id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
          AND CAST(strftime('%Y', p2.taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER) =
              CAST(strftime('%Y', p.taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER)
          AND strftime('%m-%d', p2.taken_at / 1000, 'unixepoch', 'localtime') IN (${ph})
          ORDER BY p2.taken_at DESC LIMIT 1) as cover_preview_id,
        (SELECT p3.remote_file_id FROM photos p3
          WHERE p3.status IN ('uploaded','local','failed')
          AND p3.id NOT IN (SELECT photo_id FROM trash)
          AND p3.id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
          AND CAST(strftime('%Y', p3.taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER) =
              CAST(strftime('%Y', p.taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER)
          AND strftime('%m-%d', p3.taken_at / 1000, 'unixepoch', 'localtime') IN (${ph})
          ORDER BY p3.taken_at DESC LIMIT 1) as cover_file_id
      FROM photos p
      WHERE status IN ('uploaded','local','failed')
      AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
      AND CAST(strftime('%Y', taken_at / 1000, 'unixepoch', 'localtime') AS INTEGER) < ?
      AND strftime('%m-%d', taken_at / 1000, 'unixepoch', 'localtime') IN (${ph})
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
     AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
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
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
     GROUP BY content_hash HAVING n > 1
     ORDER BY n DESC`
  );
  const groups: DuplicateGroup[] = [];
  for (const h of hashes) {
    const rows = await d.getAllAsync<any>(
      `SELECT * FROM photos WHERE content_hash = ? AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
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

// --- Near-duplicate finder (perceptual hash) persistence ---

// Batched write: the scan hashes hundreds of rows — one UPDATE per row would
// hammer the JSI bridge; chunk to keep the app responsive.
export async function setPhashBatch(items: { id: string; phash: string }[]): Promise<void> {
  if (items.length === 0) return;
  const d = await getDb();
  const BATCH = 50;
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    await d.withTransactionAsync(async () => {
      for (const it of chunk) {
        await d.runAsync(
          "UPDATE photos SET phash = ? WHERE id = ?",
          [it.phash, it.id]
        );
      }
    });
  }
}

// Rows that already carry a perceptual hash — lets a rescan skip straight to
// clustering without touching any file bytes.
export async function getPhashedIds(): Promise<Set<string>> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ id: string }>(
    "SELECT id FROM photos WHERE phash IS NOT NULL"
  );
  return new Set(rows.map((r) => r.id));
}

// All non-trashed JPEG rows (any of the library statuses) with their phash —
// the raw material for scanNearDuplicates. Rows are NOT restricted to
// 'uploaded': a burst's local-only copy is exactly the kind of near-duplicate
// worth surfacing before it's backed up.
export async function getJpegRowsForPhash(): Promise<PhotoRow[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(
    `SELECT * FROM photos
     WHERE status IN ('uploaded','local','failed')
       AND id NOT IN (SELECT photo_id FROM trash)
      AND id NOT IN (SELECT ap.photo_id FROM album_photos ap JOIN albums a ON a.id = ap.album_id WHERE a.locked = 1)
       AND (mime = 'image/jpeg'
            OR LOWER(filename) LIKE '%.jpg'
            OR LOWER(filename) LIKE '%.jpeg')
     ORDER BY taken_at DESC`
  );
  return rows.map(rowToPhoto);
}

// id→hash pairs in one query — the scan merges freshly decoded hashes over
// this map, so cached rows need no per-row reads.
export async function getAllPhashPairs(): Promise<Map<string, string>> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ id: string; phash: string }>(
    "SELECT id, phash FROM photos WHERE phash IS NOT NULL AND phash != ''"
  );
  return new Map(rows.map((r) => [r.id, r.phash]));
}

export async function exportAllData(): Promise<string> {
  const d = await getDb();
  const photos = await d.getAllAsync<any>("SELECT * FROM photos");
  const albums = await d.getAllAsync<any>("SELECT * FROM albums");
  const albumPhotos = await d.getAllAsync<any>("SELECT * FROM album_photos");
  const trash = await d.getAllAsync<any>("SELECT * FROM trash");
  const savedSearches = await d.getAllAsync<any>("SELECT * FROM saved_searches");
  const photoVersions = await d.getAllAsync<any>("SELECT * FROM photo_versions");
  const kv = await d.getAllAsync<any>("SELECT * FROM kv");
  // Active/failed queue rows let a reinstall on the same device resume where
  // it stopped instead of re-scanning blindly. Terminal rows (done/skipped/
  // duplicate) are transient and only bloat the snapshot.
  const uploadQueue = await d.getAllAsync<any>(
    `SELECT * FROM upload_queue
     WHERE state IN ('pending','running','failed')
     ORDER BY id DESC LIMIT 5000`
  );
  return JSON.stringify({
    format: "photogrambot-backup",
    version: 2,
    exported_at: Date.now(),
    photos,
    albums,
    album_photos: albumPhotos,
    trash,
    saved_searches: savedSearches,
    photo_versions: photoVersions,
    upload_queue: uploadQueue,
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
      await d.runAsync("DELETE FROM saved_searches");
      await d.runAsync("DELETE FROM photo_versions");
      await d.runAsync("DELETE FROM photos_fts");
      await d.runAsync("DELETE FROM photos");
      // Drop the OLD queue and embedding index first. The backup's own active/
      // failed queue rows are imported below (sanitized), and the embeddings
      // are a rebuildable cache that would rank photo ids which no longer
      // exist — Maintenance can rebuild them.
      await d.runAsync("DELETE FROM upload_queue");
      await d.runAsync("DELETE FROM photo_embeddings");
      // The restored index has different photo ids; old sync ops/conflicts
      // would point at rows that no longer exist.
      await d.runAsync("DELETE FROM sync_ops");
      await d.runAsync("DELETE FROM sync_conflicts");
    }
    for (const p of data.photos ?? []) {
      const res = await d.runAsync(
        `INSERT OR IGNORE INTO photos
          (id, local_id, local_uri, remote_file_id, preview_file_id, thumb_file_id,
           message_id, preview_message_id, filename, folder, width, height, size, mime,
           taken_at, added_at, uploaded_at, remote_date, content_hash, device, camera,
           tags, latitude, longitude, exif, ai_caption, duration, parts, profile_id,
           favorite, status, error, upload_type, phash, asset_mtime,
           motion_file_id, motion_message_id, ocr_text, motion_checked)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
          // phash/asset_mtime were silently dropped by older import versions —
          // carried forward now (a re-scan recomputes them, but carrying avoids
          // a full library re-decode after a restore).
          p.phash ?? null, p.asset_mtime ?? null,
          p.motion_file_id ?? null, p.motion_message_id ?? null,
          // ocr_text is tri-state: NULL = never OCR'd (retried), '' = scanned
          // and clean (never retried), text = extract. Keeping NULL and ''
          // distinct here is what stops a restore from re-OCRing the whole
          // library; motion_checked likewise prevents re-decoding every JPEG
          // in the Maintenance motion backfill.
          typeof p.ocr_text === "string" ? p.ocr_text.slice(0, 20_000) : null,
          Number.isFinite(p.motion_checked) ? p.motion_checked : null,
        ]
      );
      count += res.changes > 0 ? 1 : 0;
    }
    // Restore active/failed queue rows last. A reinstall on the same device
    // keeps MediaStore ids/URIs, so these rows resume real work; on a new
    // device they fail honestly (file missing) rather than silently
    // re-uploading untracked media. Running rows come back as pending.
    const queueRows = sanitizeQueueBackupRows(data.upload_queue);
    for (const q of queueRows) {
      const existing = await d.getFirstAsync<{ x: number }>(
        "SELECT 1 AS x FROM upload_queue WHERE local_id = ? LIMIT 1",
        [q.local_id]
      );
      if (existing) continue;
      await d.runAsync(
        `INSERT INTO upload_queue
          (local_id, local_uri, filename, folder, size, taken_at, added_at,
           content_hash, upload_type, priority, state, retries, error, created_at,
           profile_id, reply_to_message_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          q.local_id,
          q.local_uri,
          q.filename,
          q.folder,
          q.size,
          q.taken_at,
          q.added_at,
          q.content_hash,
          q.upload_type,
          q.priority,
          q.state,
          q.retries,
          q.error,
          q.created_at,
          q.profile_id,
          q.reply_to_message_id,
        ]
      );
    }
    for (const a of data.albums ?? []) {
      await d.runAsync(
        "INSERT OR IGNORE INTO albums (id, name, created_at, locked, query, cover_photo_id, sort_order) VALUES (?,?,?,?,?,?,?)",
        [
          a.id,
          a.name,
          a.created_at,
          a.locked ?? null,
          typeof a.query === "string" ? a.query.slice(0, 100_000) : null,
          typeof a.cover_photo_id === "string" ? a.cover_photo_id : null,
          Number.isFinite(a.sort_order) ? a.sort_order : 0,
        ]
      );
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
    // Version rows reference photos that must already be imported — keep only
    // sane, bounded rows and let the FK/IGNORE handle anything dangling.
    const importedVersions = Array.isArray(data.photo_versions)
      ? data.photo_versions.slice(0, 20_000)
      : [];
    for (const v of importedVersions) {
      if (!v || typeof v.photo_id !== "string" || !Number.isFinite(v.version)) continue;
      await d.runAsync(
        `INSERT OR IGNORE INTO photo_versions
          (photo_id, content_hash, remote_file_id, preview_file_id, thumb_file_id,
           message_id, preview_message_id, size, width, height, version, uploaded_at, profile_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          v.photo_id,
          typeof v.content_hash === "string" ? v.content_hash : null,
          typeof v.remote_file_id === "string" ? v.remote_file_id : null,
          typeof v.preview_file_id === "string" ? v.preview_file_id : null,
          typeof v.thumb_file_id === "string" ? v.thumb_file_id : null,
          Number.isFinite(v.message_id) ? v.message_id : null,
          Number.isFinite(v.preview_message_id) ? v.preview_message_id : null,
          Number.isFinite(v.size) ? v.size : null,
          Number.isFinite(v.width) ? v.width : null,
          Number.isFinite(v.height) ? v.height : null,
          Math.max(1, Math.floor(v.version)),
          Number.isFinite(v.uploaded_at) ? v.uploaded_at : null,
          typeof v.profile_id === "string" ? v.profile_id : null,
        ]
      );
    }
    const importedSavedSearches = Array.isArray(data.saved_searches)
      ? data.saved_searches.slice(0, 5000)
      : [];
    for (const rawSearch of importedSavedSearches) {
      if (!rawSearch || typeof rawSearch !== "object" || Array.isArray(rawSearch)) continue;
      const s = rawSearch as Record<string, unknown>;
      // Unknown/absent name rows are skipped — name is UNIQUE NOT NULL.
      if (typeof s.name !== "string" || !s.name.trim()) continue;
      let importedFilters: SearchFilters | null = null;
      if (typeof s.filters === "string" && s.filters.length <= 4096) {
        try {
          importedFilters = normalizeSearchFilters(JSON.parse(s.filters));
        } catch {
          importedFilters = null;
        }
      }
      await d.runAsync(
        `INSERT INTO saved_searches (name, query, filters, created_at) VALUES (?,?,?,?)
         ON CONFLICT(name) DO UPDATE SET query = excluded.query, filters = excluded.filters`,
        [
          s.name.trim().slice(0, 60),
          typeof s.query === "string" ? s.query.slice(0, 200) : "",
          JSON.stringify(importedFilters),
          typeof s.created_at === "number" ? s.created_at : Date.now(),
        ]
      );
    }
    // kv holds two very different things: archive-ish counters and pure
    // per-device state. Restoring the latter onto a new phone is actively
    // harmful — most visibly `remote_paused` (a phone paused with /pause
    // before the backup would come back silently never auto-syncing again) —
    // so those keys are dropped here:
    //   updates_offset  — poll cursor of the OLD device (already excluded)
    //   remote_paused   — per-device /pause gate
    //   wipe_armed_at   — a wipe arm must never travel between devices
    //   overnight_day / overnight_count — per-night catch-up budget for THIS phone
    const DEVICE_LOCAL_KV = new Set([
      "updates_offset",
      "remote_paused",
      "wipe_armed_at",
      "overnight_day",
      "overnight_count",
    ]);
    for (const k of data.kv ?? []) {
      if (typeof k?.k === "string" && typeof k.v === "string" && !DEVICE_LOCAL_KV.has(k.k)) {
        await d.runAsync("INSERT OR REPLACE INTO kv (k, v) VALUES (?,?)", [k.k, k.v]);
      }
    }
  });
  await ftsRebuild();
  return count;
}
