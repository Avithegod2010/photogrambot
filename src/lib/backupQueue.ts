// Pure sanitizer for upload_queue rows carried inside a database backup.
// Keeping this dependency-free means the restore rules can be unit-tested.

export interface QueueBackupRow {
  local_id: string;
  local_uri: string;
  filename: string;
  folder: string | null;
  size: number | null;
  taken_at: number;
  added_at: number;
  content_hash: string | null;
  upload_type: string;
  priority: number;
  state: "pending" | "running" | "failed";
  retries: number;
  error: string | null;
  created_at: number;
  profile_id: string | null;
  reply_to_message_id: number | null;
}

const ALLOWED_STATES = new Set(["pending", "running", "failed"]);
const MAX_ROWS = 5000;
const MAX_TEXT = 2048;

function str(value: unknown, max = MAX_TEXT): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Normalise queue rows from a backup:
 * - only pending/running/failed rows survive;
 * - local_id + local_uri + filename are required;
 * - running rows come back as pending (a crash/restore must retry them);
 * - one row per local_id, preferring an active row over a failed one;
 * - cap at 5000 rows.
 *
 * `next_attempt_at` is deliberately NOT carried: a stale backoff from another
 * device should not delay the restored queue.
 */
export function sanitizeQueueBackupRows(raw: unknown): QueueBackupRow[] {
  if (!Array.isArray(raw)) return [];
  const out: QueueBackupRow[] = [];
  const seen = new Set<string>();
  // Active rows first, so they win the per-local_id dedupe over failed rows.
  const ordered = [...raw].sort((a, b) => {
    const rank = (r: any) => (r?.state === "failed" ? 1 : 0);
    return rank(a) - rank(b);
  });
  for (const candidate of ordered) {
    if (out.length >= MAX_ROWS) break;
    if (!candidate || typeof candidate !== "object") continue;
    const r = candidate as Record<string, unknown>;
    const state = typeof r.state === "string" ? r.state : "";
    if (!ALLOWED_STATES.has(state)) continue;
    const localId = str(r.local_id);
    const localUri = str(r.local_uri, 4096);
    const filename = str(r.filename);
    if (!localId || !localUri || !filename) continue;
    if (seen.has(localId)) continue;
    seen.add(localId);
    const priority = num(r.priority);
    out.push({
      local_id: localId,
      local_uri: localUri,
      filename,
      folder: str(r.folder),
      size: num(r.size),
      taken_at: num(r.taken_at) ?? 0,
      added_at: num(r.added_at) ?? 0,
      content_hash: str(r.content_hash, 128),
      upload_type: str(r.upload_type, 32) ?? "manual",
      priority: priority === 0 || priority === 2 ? priority : 1,
      state: state === "running" ? "pending" : (state as "pending" | "failed"),
      retries: Math.max(0, Math.min(100, num(r.retries) ?? 0)),
      error: str(r.error, 512),
      created_at: num(r.created_at) ?? Date.now(),
      profile_id: str(r.profile_id, 64),
      reply_to_message_id: num(r.reply_to_message_id),
    });
  }
  return out;
}
