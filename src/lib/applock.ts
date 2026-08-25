import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const PIN_KEY = "pb_pin_hash";
const DECOY_KEY = "pb_decoy_pin_hash";

let decoyActive = false;

async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `photogrambot:${pin}`);
}

async function readHash(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setPin(pin: string | null): Promise<void> {
  if (!pin) {
    await SecureStore.deleteItemAsync(PIN_KEY).catch(() => {});
    return;
  }
  await SecureStore.setItemAsync(PIN_KEY, await hashPin(pin));
}

export async function setDecoyPin(pin: string | null): Promise<void> {
  if (!pin) {
    await SecureStore.deleteItemAsync(DECOY_KEY).catch(() => {});
    return;
  }
  await SecureStore.setItemAsync(DECOY_KEY, await hashPin(pin));
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
  const hashed = await hashPin(pin);
  if (pinHash && hashed === pinHash) return "real";
  if (decoyHash && hashed === decoyHash) return "decoy";
  return "none";
}

export function isDecoyActive(): boolean {
  return decoyActive;
}

export function setDecoyActive(active: boolean): void {
  decoyActive = active;
}
