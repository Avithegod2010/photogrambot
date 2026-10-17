import { Directory, File, Paths } from "expo-file-system";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { installApk, openInstallSettings } from "../../modules/share-intent";
import {
  buildUpdate,
  pickApkRelease,
  type AvailableUpdate,
  type GitHubRelease,
  type LatestManifest,
} from "./updaterLogic";

export type { AvailableUpdate } from "./updaterLogic";
export { openInstallSettings } from "../../modules/share-intent";

const OWNER = "Avithegod2010";
const REPO = "photogrambot";
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const REQUEST_TIMEOUT_MS = 12000;

const nativeConstants = Constants as unknown as { nativeBuildVersion?: string };

export const CURRENT_VERSION: string =
  (Constants.expoConfig?.version as string | undefined) ?? "0.0.0";

const expoVersionCode = Constants.expoConfig?.android?.versionCode as number | undefined;
const nativeVersionCode = nativeConstants.nativeBuildVersion
  ? parseInt(nativeConstants.nativeBuildVersion, 10)
  : undefined;
const rawVersionCode = expoVersionCode ?? nativeVersionCode ?? 0;

export const CURRENT_VERSION_CODE: number = Number.isFinite(rawVersionCode) ? rawVersionCode : 0;

export type UpdateCheck =
  | { status: "up-to-date"; current: string }
  | { status: "unsupported"; message: string }
  | { status: "error"; message: string }
  | AvailableUpdate;

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json, application/json",
        "User-Agent": "PhotogramBot-updater",
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub responded ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  if (Platform.OS !== "android") {
    return { status: "unsupported", message: "In-app updates are Android-only for now." };
  }

  let releases: GitHubRelease[];
  try {
    const body = await fetchText(`${API}/releases?per_page=30`);
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) throw new Error("Unexpected response from GitHub");
    releases = parsed as GitHubRelease[];
  } catch (e: any) {
    return {
      status: "error",
      message:
        e?.name === "AbortError"
          ? "Timed out reaching GitHub"
          : e?.message ?? "Could not check for updates",
    };
  }

  const release = pickApkRelease(releases);
  if (!release) {
    return { status: "error", message: "No release with an APK has been published yet." };
  }

  let manifest: LatestManifest | null = null;
  const manifestAsset = release.assets.find((a) => a.name === "latest.json");
  if (manifestAsset) {
    try {
      manifest = JSON.parse(await fetchText(manifestAsset.browser_download_url)) as LatestManifest;
    } catch {
      manifest = null;
    }
  }

  const update = buildUpdate(CURRENT_VERSION, CURRENT_VERSION_CODE, release, manifest);
  if (!update) return { status: "up-to-date", current: CURRENT_VERSION };
  return update;
}

export async function downloadApk(
  update: AvailableUpdate,
  onProgress?: (bytesWritten: number, totalBytes: number) => void
): Promise<File> {
  const dir = new Directory(Paths.cache, "updates");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

  const safeName = update.apkName.replace(/[^a-zA-Z0-9._-]/g, "_") || "update.apk";
  const destination = new File(dir, safeName);
  if (destination.exists) destination.delete();

  const task = File.createDownloadTask(update.apkUrl, destination, {
    onProgress: (p) => onProgress?.(p.bytesWritten, p.totalBytes),
  });
  const file = await task.downloadAsync();
  if (!file || !file.exists) {
    throw new Error("Download did not complete");
  }
  return file;
}

export async function downloadAndInstallUpdate(
  update: AvailableUpdate,
  onProgress?: (bytesWritten: number, totalBytes: number) => void
): Promise<void> {
  const file = await downloadApk(update, onProgress);
  const launched = installApk(file.uri);
  if (!launched) {
    throw new Error(
      "Could not open the installer. Allow PhotogramBot to install unknown apps in Android settings, then try again."
    );
  }
}
