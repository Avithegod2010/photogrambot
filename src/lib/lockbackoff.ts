// Failed-unlock backoff (security audit 2026-09-04, Low → pre-release must-do):
// an unattended locked phone must not accept unlimited PIN guesses. A counter
// + timestamp live in SecureStore so backoff survives app restarts and, more
// importantly, an attacker force-stopping the app to reset in-memory state.
//
// Every write is best-effort: a SecureStore failure degrades to no backoff,
// NEVER to a lock the owner can't get past.

import * as SecureStore from "expo-secure-store";

const COUNT_KEY = "pb_fail_count";
const TS_KEY = "pb_fail_ts";

// Backoff schedule by failed-attempt count. The first 4 misses stay instant —
// the owner mistypes too. Past that the wait grows fast; the cap is 15 min
// (with pb2 PBKDF2 at ~100-350 ms per derivation, even that is aggressive).
const BACKOFF_STEPS: { min: number; ms: number }[] = [
  { min: 20, ms: 15 * 60_000 },
  { min: 15, ms: 5 * 60_000 },
  { min: 10, ms: 60_000 },
  { min: 5, ms: 15_000 },
];

export function backoffDelayFor(count: number): number {
  for (const step of BACKOFF_STEPS) {
    if (count >= step.min) return step.ms;
  }
  return 0;
}

async function readNum(key: string): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function recordFailure(): Promise<void> {
  try {
    const count = (await readNum(COUNT_KEY)) + 1;
    await SecureStore.setItemAsync(COUNT_KEY, String(count));
    await SecureStore.setItemAsync(TS_KEY, String(Date.now()));
  } catch {
    // Counter is a rate limiter, not a safety feature — losing it is safe.
  }
}

export async function clearFailures(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(COUNT_KEY);
    await SecureStore.deleteItemAsync(TS_KEY);
  } catch {}
}

// ms of backoff remaining right now, or 0. remaining = delay(count) −
// (now − ts): the window STARTS at the last failure, so the wait applies to
// the NEXT attempt. A backward clock jump clamps to 0 (never negative); a
// forward jump that would exceed the scheduled delay is capped at it (the
// delay must grow with the count, not with wall-clock games).
export async function getBackoffRemaining(): Promise<number> {
  const count = await readNum(COUNT_KEY);
  const delay = backoffDelayFor(count);
  if (delay === 0) return 0;
  const ts = await readNum(TS_KEY);
  if (ts === 0) return 0;
  const elapsed = Date.now() - ts;
  if (elapsed < 0) return 0;
  return Math.max(0, Math.min(delay, delay - elapsed));
}
