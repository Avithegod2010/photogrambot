import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { getHashCache, setHashCache } from "./db";

export async function hashFile(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
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

