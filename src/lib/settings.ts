import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_CAPTION_FIELDS } from "./captionFields";

export { DEFAULT_CAPTION_FIELDS, CAPTION_FIELD_LABELS } from "./captionFields";

const TOKEN_KEY = "pb_bot_token";
const CHANNEL_KEY = "pb_channel_id";
const DEVICE_KEY = "pb_device_id";
const AI_KEY = "pb_ai_api_key";
const BACKUP_PASS_KEY = "pb_backup_pass";

export type UploadQuality = "document" | "photo";
export type ThemeMode = "dark" | "amoled" | "light" | "system";
export type DateFormat = "locale" | "dmy" | "mdy" | "iso";
export type TileAspect = "square" | "original";
export type MapStyle = "standard" | "satellite" | "hybrid" | "terrain";
export type AppIconVariant = "default" | "accent" | "mono";
export type InfoDensity = "compact" | "detailed";

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
  uploadOnlyCharging: boolean;
  syncWindowStart: number;
  syncWindowEnd: number;
  excludedFolders: string[];
  theme: ThemeMode;
  dynamicColor: boolean;
  staggeredGrid: boolean;
  // Look & feel (customisation round).
  themeSchedule: boolean;
  themeScheduleStart: number;
  themeScheduleEnd: number;
  accentColor: string;
  appDisplayName: string;
  albumAccents: Record<string, string>;
  gridColumns: number;
  tileAspect: TileAspect;
  compactGrid: boolean;
  showCloudBadge: boolean;
  showVideoBadge: boolean;
  showFavoriteBadge: boolean;
  showStatusBadge: boolean;
  showDateCounts: boolean;
  mapStyle: MapStyle;
  viewerAutoHideChrome: boolean;
  viewerChromeDelaySec: number;
  infoSheetDensity: InfoDensity;
  skeletonLoading: boolean;
  widgetShowDate: boolean;
  widgetCompact: boolean;
  fontScale: number;
  dateFormat: DateFormat;
  captionFields: string[];
  appIconVariant: AppIconVariant;
  splashAccent: boolean;
  notificationAccent: boolean;
  appLock: boolean;
  trashAutoPurgeDays: number;
  dbAutoBackup: boolean;
  aiCaptions: boolean;
  aiModel: string;
  aiPrompt: string;
  includeVideos: boolean;
  dbBackupEncrypt: boolean;
  dbBackupIncludeToken: boolean;
  nearDupGuard: boolean;
  multiDestination: boolean;
  weeklyDigest: boolean;
  screenshotSunset: boolean;
  overnightCatchup: boolean;
  overnightCap: number;
  mirrorEnabled: boolean;
  mirrorProfileId: string;
  widgetFavoritesOnly: boolean;
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
  uploadOnlyCharging: false,
  syncWindowStart: 0,
  syncWindowEnd: 1440,
  excludedFolders: [],
  theme: "dark",
  dynamicColor: false,
  staggeredGrid: false,
  themeSchedule: false,
  themeScheduleStart: 20 * 60,
  themeScheduleEnd: 7 * 60,
  accentColor: "default",
  appDisplayName: "PhotogramBot",
  albumAccents: {},
  gridColumns: 3,
  tileAspect: "square",
  compactGrid: false,
  showCloudBadge: true,
  showVideoBadge: true,
  showFavoriteBadge: true,
  showStatusBadge: true,
  showDateCounts: true,
  mapStyle: "standard",
  viewerAutoHideChrome: true,
  viewerChromeDelaySec: 3,
  infoSheetDensity: "detailed",
  skeletonLoading: true,
  widgetShowDate: true,
  widgetCompact: false,
  fontScale: 1,
  dateFormat: "locale",
  captionFields: [...DEFAULT_CAPTION_FIELDS],
  appIconVariant: "default",
  splashAccent: false,
  notificationAccent: true,
  appLock: false,
  trashAutoPurgeDays: 30,
  dbAutoBackup: true,
  aiCaptions: false,
  aiModel: "gemini-2.5-flash",
  aiPrompt: DEFAULT_AI_PROMPT,
  includeVideos: false,
  dbBackupEncrypt: false,
  dbBackupIncludeToken: false,
  nearDupGuard: true,
  multiDestination: false,
  weeklyDigest: false,
  screenshotSunset: true,
  overnightCatchup: false,
  overnightCap: 500,
  mirrorEnabled: false,
  mirrorProfileId: "",
  widgetFavoritesOnly: false,
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

export async function getBackupPassphrase(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(BACKUP_PASS_KEY);
  } catch {
    return null;
  }
}

export async function setBackupPassphrase(pass: string | null): Promise<void> {
  if (pass === null || pass === "") {
    await SecureStore.deleteItemAsync(BACKUP_PASS_KEY);
  } else {
    await SecureStore.setItemAsync(BACKUP_PASS_KEY, pass);
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

// Serialize the read-modify-write. Two settings taps in the same tick used to
// both read the old blob and the second write silently discarded the first
// patch (e.g. toggling Auto sync and Wi-Fi-only quickly). The chain also keeps
// going after a failed write; the caller still sees that write's rejection.
let prefWriteChain: Promise<unknown> = Promise.resolve();

export async function savePrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const write = prefWriteChain.then(async () => {
    const current = await loadPrefs();
    const next = { ...current, ...patch };
    await AsyncStorage.setItem("pb_prefs", JSON.stringify(next));
    return next;
  });
  prefWriteChain = write.catch(() => undefined);
  return write;
}
