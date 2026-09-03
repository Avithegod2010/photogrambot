import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { bytesToHex, hexToBytes, pbkdf2Sha256, utf8 } from "./pbkdf2";

const PIN_KEY = "pb_pin_hash";
const DECOY_KEY = "pb_decoy_pin_hash";

// PBKDF2 cost: 20000 iterations = ~40000 SHA-256 compressions per derivation
// in the pure-TS core (2 per iteration, ipad/opad midstates precomputed).
// Measured ~30-45 ms in desktop Node; Hermes on a mid-range Android runs
// ~3-8x slower, so expect roughly 100-350 ms — at/under the ~300 ms lock-screen
// budget, while making offline brute-force 20000x costlier than the old single
// unsalted SHA-256. Never lower it; raising it is safe for old rows (each row
// stores its own iteration count).
const PBKDF2_ITERATIONS = 20000;

// Stored format: `pb2$<iterations>$<saltHex>$<dkHex>` — self-describing so a
// future cost bump reads parameters off each row instead of a global. Legacy
// rows are bare lowercase SHA-256 hex (no "$", 64 chars), which is how the
// two formats are told apart. Hash values are secrets — never logged.
const PB2_PREFIX = "pb2$";

let decoyActive = false;

function newHash(pin: string): string {
  const salt = new Uint8Array(16);
  Crypto.getRandomValues(salt);
  const dk = pbkdf2Sha256(utf8(pin), salt, PBKDF2_ITERATIONS, 32);
  return `${PB2_PREFIX}${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(dk)}`;
}

// Parses/validates a pb2$ row; null for anything malformed — a tampered or
// corrupted value must verify as a plain miss, never crash or hang the lock
// screen. The ceiling is tight on purpose (10× the configured cost): only
// newHash() writes rows, so anything far above the current constant is a
// tampered value, and a pure-TS derivation near it would freeze the JS thread
// for seconds on every unlock attempt.
function parsePb2(stored: string): { iterations: number; salt: Uint8Array; dkHex: string } | null {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pb2") return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS * 10) return null;
  if (!/^[0-9a-f]{32}$/.test(parts[2])) return null;
  if (!/^[0-9a-f]{64}$/.test(parts[3])) return null;
  return { iterations, salt: hexToBytes(parts[2]), dkHex: parts[3] };
}

// Constant-time fixed-length hex compare: XOR-fold every char, no early
// return. The lengths fold in too — they can only differ for malformed rows,
// so nothing about the secret is revealed by timing.
function ctEqualHex(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function readHash(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

// Checks `pin` against one stored row and returns the role on match.
// Legacy bare-hex rows that match are transparently re-hashed into the pb2
// format and written back to the same key (migration-on-verify — each key
// upgrades independently on its first successful verify). Two verifies racing
// on that write are benign: each writes a fresh salted hash of the SAME pin,
// so whichever write lands last, the pin still verifies.
async function checkOne(
  pin: string,
  stored: string | null,
  key: string,
  role: "real" | "decoy"
): Promise<"real" | "decoy" | null> {
  if (!stored) return null;
  if (stored.startsWith(PB2_PREFIX)) {
    const parsed = parsePb2(stored);
    if (!parsed) return null;
    const dk = pbkdf2Sha256(utf8(pin), parsed.salt, parsed.iterations, 32);
    return ctEqualHex(bytesToHex(dk), parsed.dkHex) ? role : null;
  }
  // Legacy: single unsalted SHA-256 ("photogrambot:<pin>"). Both sides are
  // fixed-length 64-char hex, so the shared constant-time compare costs
  // nothing; any match migrates the row to pb2 immediately anyway.
  const legacy = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `photogrambot:${pin}`);
  if (!ctEqualHex(legacy, stored)) return null;
  try {
    await SecureStore.setItemAsync(key, newHash(pin));
  } catch {
    // Upgrade write failed — the legacy row stays valid; next verify retries.
  }
  return role;
}

export async function setPin(pin: string | null): Promise<void> {
  if (!pin) {
    await SecureStore.deleteItemAsync(PIN_KEY).catch(() => {});
    return;
  }
  await SecureStore.setItemAsync(PIN_KEY, newHash(pin));
}

export async function setDecoyPin(pin: string | null): Promise<void> {
  if (!pin) {
    await SecureStore.deleteItemAsync(DECOY_KEY).catch(() => {});
    return;
  }
  await SecureStore.setItemAsync(DECOY_KEY, newHash(pin));
}

export async function hasAnyPin(): Promise<boolean> {
  return !!(await readHash(PIN_KEY)) || !!(await readHash(DECOY_KEY));
}

export async function getPinExists(): Promise<boolean> {
  return !!(await readHash(PIN_KEY));
}

export async function getDecoyExists(): Promise<boolean> {
  return !!(await readHash(DECOY_KEY));
}

export type PinVerifyResult = "real" | "decoy" | "none";

export async function verifyPin(pin: string): Promise<PinVerifyResult> {
  const [pinHash, decoyHash] = await Promise.all([readHash(PIN_KEY), readHash(DECOY_KEY)]);
  if (await checkOne(pin, pinHash, PIN_KEY, "real")) return "real";
  if (await checkOne(pin, decoyHash, DECOY_KEY, "decoy")) return "decoy";
  return "none";
}

export function isDecoyActive(): boolean {
  return decoyActive;
}

export function setDecoyActive(active: boolean): void {
  decoyActive = active;
}
