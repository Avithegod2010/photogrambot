import * as SecureStore from "expo-secure-store";
import { kvGet, kvSet } from "./db";
import { getBotToken } from "./settings";

export const DEFAULT_PROFILE_ID = "default";

export interface DestProfile {
  id: string;
  name: string;
  channelId: string;
  channelTitle?: string;
}

const PROFILES_KEY = "dest_profiles";
const RULES_KEY = "dest_rules";
const TOKEN_KEY_PREFIX = "pb_dest_token_";

const tokenCache = new Map<string, string>();

export async function listProfiles(): Promise<DestProfile[]> {
  try {
    const raw = await kvGet(PROFILES_KEY);
    const parsed = raw ? (JSON.parse(raw) as DestProfile[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeProfiles(profiles: DestProfile[]): Promise<void> {
  await kvSet(PROFILES_KEY, JSON.stringify(profiles));
}

export async function saveProfile(profile: DestProfile, token: string): Promise<void> {
  const profiles = await listProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) profiles[idx] = profile;
  else profiles.push(profile);
  await writeProfiles(profiles);
  tokenCache.set(profile.id, token);
  await SecureStore.setItemAsync(`${TOKEN_KEY_PREFIX}${profile.id}`, token);
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = await listProfiles().then((ps) => ps.filter((p) => p.id !== id));
  await writeProfiles(profiles);
  tokenCache.delete(id);
  try {
    await SecureStore.deleteItemAsync(`${TOKEN_KEY_PREFIX}${id}`);
  } catch {}
  const rules = await listRules();
  let changed = false;
  for (const folder of Object.keys(rules)) {
    if (rules[folder] === id) {
      delete rules[folder];
      changed = true;
    }
  }
  if (changed) await kvSet(RULES_KEY, JSON.stringify(rules));
}

export async function listRules(): Promise<Record<string, string>> {
  try {
    const raw = await kvGet(RULES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export async function setRule(folder: string, profileId: string | null): Promise<void> {
  const rules = await listRules();
  if (profileId) rules[folder] = profileId;
  else delete rules[folder];
  await kvSet(RULES_KEY, JSON.stringify(rules));
}

export async function profileIdForFolder(folder: string | null | undefined): Promise<string | null> {
  if (!folder) return null;
  const rules = await listRules();
  const hit = rules[folder] ?? rules[folder.toLowerCase()];
  return hit ?? null;
}

export async function getProfileToken(profileId: string): Promise<string | null> {
  if (profileId === DEFAULT_PROFILE_ID) return getBotToken();
  const cached = tokenCache.get(profileId);
  if (cached) return cached;
  try {
    const raw = await SecureStore.getItemAsync(`${TOKEN_KEY_PREFIX}${profileId}`);
    if (raw) {
      tokenCache.set(profileId, raw);
      return raw;
    }
  } catch {}
  return null;
}

export interface Destination {
  token: string;
  channelId: string;
}

export async function resolveDestination(
  profileId: string | null | undefined
): Promise<Destination | null> {
  if (!profileId || profileId === DEFAULT_PROFILE_ID) {
    const token = await getBotToken();
    const channelId = await (async () => {
      const { getChannelId } = await import("./settings");
      return getChannelId();
    })();
    if (!token || !channelId) return null;
    return { token, channelId };
  }
  const profiles = await listProfiles();
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return null;
  const token = await getProfileToken(profileId);
  if (!token) return null;
  return { token, channelId: profile.channelId };
}

export async function tokenForPhoto(photo: { profile_id?: string | null }): Promise<string | null> {
  if (!photo.profile_id || photo.profile_id === DEFAULT_PROFILE_ID) return getBotToken();
  return getProfileToken(photo.profile_id);
}

export function newProfileId(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}
