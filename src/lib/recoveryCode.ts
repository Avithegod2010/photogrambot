// Crockford base32 recovery-key codec (pure, dependency-free).
//
// A recovery key is 20 random bytes (160 bits) rendered as 32 characters in
// groups of four. It is a SECOND way to unlock the backup passphrase: the
// passphrase is encrypted with the recovery key and the blob is stored on the
// device. Losing both the passphrase and the recovery key is unrecoverable.

export const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function encodeRecoveryKey(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += RECOVERY_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += RECOVERY_ALPHABET[(value << (5 - bits)) & 31];
  return groupRecoveryKey(out);
}

export function groupRecoveryKey(raw: string): string {
  const groups: string[] = [];
  for (let i = 0; i < raw.length; i += 4) groups.push(raw.slice(i, i + 4));
  return groups.join("-");
}

/**
 * Accepts dashes, spaces, lower case and the usual Crockford confusions
 * (O→0, I/L→1). Returns the canonical grouped key, or null when invalid.
 */
export function normalizeRecoveryKey(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  if (cleaned.length !== 32) return null;
  for (const ch of cleaned) {
    if (!RECOVERY_ALPHABET.includes(ch)) return null;
  }
  return groupRecoveryKey(cleaned);
}

export function isRecoveryKey(input: string): boolean {
  return normalizeRecoveryKey(input) !== null;
}
