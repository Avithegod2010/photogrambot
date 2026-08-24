import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import {
  defaultPrefs,
  loadPrefs,
  savePrefs,
  type Prefs,
  type ThemeMode,
} from "../lib/settings";

interface DeviceIdState {
  deviceId: string;
  ensureDeviceId: () => Promise<string>;
}

const DEVICE_KEY = "pb_device_id";

function randomId(): string {
  const chars = "abcdef0123456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export const useDeviceStore = create<DeviceIdState>((set, get) => ({
  deviceId: "",
  ensureDeviceId: async () => {
    if (get().deviceId) return get().deviceId;
    let id = await SecureStore.getItemAsync(DEVICE_KEY);
    if (!id) {
      id = randomId();
      await SecureStore.setItemAsync(DEVICE_KEY, id);
    }
    set({ deviceId: id });
    return id;
  },
}));

interface SettingsState {
  prefs: Prefs;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Prefs>) => Promise<void>;
  setTheme: (mode: ThemeMode) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  prefs: { ...defaultPrefs },
  loaded: false,
  load: async () => {
    const prefs = await loadPrefs();
    set({ prefs, loaded: true });
  },
  update: async (patch) => {
    const prefs = await savePrefs(patch);
    set({ prefs });
  },
  setTheme: async (mode) => {
    const prefs = await savePrefs({ theme: mode });
    set({ prefs });
  },
}));
