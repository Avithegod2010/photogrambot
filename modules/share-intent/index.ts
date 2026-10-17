import { requireNativeModule } from "expo-modules-core";

type ShareIntentModuleType = {
  getSharedMedia: () => { uris: string[]; text: string | null };
  clearSharedMedia: () => void;
  shareMedia: (uris: string[], mime: string) => boolean;
  installApk: (filePath: string) => boolean;
  openInstallSettings: () => boolean;
};

const mod = requireNativeModule<ShareIntentModuleType>("ShareIntent");

export function getSharedMedia(): { uris: string[]; text: string | null } {
  try {
    return mod.getSharedMedia();
  } catch {
    return { uris: [], text: null };
  }
}

export function clearSharedMedia(): void {
  try {
    mod.clearSharedMedia();
  } catch {}
}

export function shareMedia(uris: string[], mime: string): boolean {
  try {
    return mod.shareMedia(uris, mime);
  } catch {
    return false;
  }
}

export function installApk(filePath: string): boolean {
  try {
    return mod.installApk(filePath);
  } catch {
    return false;
  }
}

export function openInstallSettings(): boolean {
  try {
    return mod.openInstallSettings();
  } catch {
    return false;
  }
}
