import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "pb_bot_token";
const CHANNEL_KEY = "pb_channel_id";
const DEVICE_KEY = "pb_device_id";
const AI_KEY = "pb_ai_api_key";

export type UploadQuality = "document" | "photo";
export type ThemeMode = "dark" | "amoled" | "light";

export const DEFAULT_AI_PROMPT =
  "Describe this photo in one concise, natural sentence (max 20 words). " +
  "Only state what is visible: subjects, setting, and notable objects.";

export interface Prefs {
  uploadPreviews: boolean;
  previewTargetKB: number;
  topicPerFolder: boolean;
  autoSync: boolean;
  autoSyncWifiOnly: boolean;
  autoSyncIntervalHours: number;
  syncWindowStart: number;
  syncWindowEnd: number;
  excludedFolders: string[];
  theme: ThemeMode;
  dynamicColor: boolean;
  staggeredGrid: boolean;
  appLock: boolean;
  trashAutoPurgeDays: number;
  dbAutoBackup: boolean;
  aiCaptions: boolean;
  aiModel: string;
  aiPrompt: string;
  includeVideos: boolean;
  lastFullSyncAt: number;
  updatesOffset: number;
  deviceId: string;
  deviceName: string;
}

export const defaultPrefs: Prefs = {
  uploadPreviews: true,
  previewTargetKB: 65,
  topicPerFolder: false,
  autoSync: false,
  autoSyncWifiOnly: true,
  autoSyncIntervalHours: 6,
  syncWindowStart: 0,
  syncWindowEnd: 1440,
  excludedFolders: [],
  theme: "dark",
  dynamicColor: false,
  staggeredGrid: false,
  appLock: false,
  trashAutoPurgeDays: 30,
  dbAutoBackup: true,
  aiCaptions: false,
  aiModel: "gemini-2.5-flash",
  aiPrompt: DEFAULT_AI_PROMPT,
  includeVideos: false,
  lastFullSyncAt: 0,
  updatesOffset: 0,
  deviceId: "",
  deviceName: "",
};

export async function getBotToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setBotToken(token: string | null): Promise<void> {
  if (token === null) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getChannelId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CHANNEL_KEY);
  } catch {
    return null;
  }
}

export async function setChannelId(id: string | null): Promise<void> {
  if (id === null) {
    await SecureStore.deleteItemAsync(CHANNEL_KEY);
  } else {
    await SecureStore.setItemAsync(CHANNEL_KEY, id);
  }
}

export async function getDeviceId(): Promise<string> {
  try {
    let id = await SecureStore.getItemAsync(DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(16).slice(2, 10);
      await SecureStore.setItemAsync(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export async function getAiApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(AI_KEY);
  } catch {
    return null;
  }
}

export async function setAiApiKey(key: string | null): Promise<void> {
  if (key === null || key.trim() === "") {
    await SecureStore.deleteItemAsync(AI_KEY);
  } else {
    await SecureStore.setItemAsync(AI_KEY, key.trim());
  }
}

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem("pb_prefs");
    if (!raw) return { ...defaultPrefs };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...defaultPrefs, ...parsed };
  } catch {
    return { ...defaultPrefs };
  }
}

export async function savePrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const current = await loadPrefs();
  const next = { ...current, ...patch };
  await AsyncStorage.setItem("pb_prefs", JSON.stringify(next));
  return next;
}
