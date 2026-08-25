import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { getHashCache, setHashCache } from "./db";

// Reading a large file fully into memory as base64 (file.base64()) spikes
// RAM ~2.5x the file size — risky for 50 MB videos. Large files use the
// native streaming MD5 instead; the prefix keeps algorithms distinguishable
// and dedupe consistent (same file always takes the same path).
const STREAM_HASH_THRESHOLD = 8 * 1024 * 1024;

export async function hashFile(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    if (file.size > STREAM_HASH_THRESHOLD) {
      const md5 = file.md5;
      return md5 ? `md5:${md5}` : null;
    }
    const base64 = await file.base64();
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      base64
    );
    return digest;
  } catch {
    return null;
  }
}

export async function hashFileCached(
  localId: string,
  uri: string,
  modificationTimeMs: number | null
): Promise<string | null> {
  if (modificationTimeMs && modificationTimeMs > 0) {
    const cached = await getHashCache(localId, modificationTimeMs);
    if (cached) return cached;
  }
  const hash = await hashFile(uri);
  if (hash && modificationTimeMs && modificationTimeMs > 0) {
    await setHashCache(localId, modificationTimeMs, hash);
  }
  return hash;
}

