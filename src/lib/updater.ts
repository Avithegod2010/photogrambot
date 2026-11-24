import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { installApk, openInstallSettings } from "../../modules/share-intent";
import {
  apkDigestProblem,
  bytesToHex,
  isAllowedApkUrl,
  normalizeSha256,
  pickApkRelease,
  resolveUpdate,
  type AvailableUpdate,
  type GitHubRelease,
  type LatestManifest,
} from "./updaterLogic";

export type { AvailableUpdate } from "./updaterLogic";
export { openInstallSettings } from "../../modules/share-intent";

// Thrown when an update is refused by policy (untrusted host, missing or
// mismatched digest). The caller shows this as a refusal, not as an installer
// permission problem.
export class UpdateRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateRejectedError";
  }
}

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

  const update = resolveUpdate(CURRENT_VERSION, CURRENT_VERSION_CODE, release, manifest);
  if (update.status === "refused") {
    return { status: "error", message: update.reason };
  }
  if (update.status === "none") return { status: "up-to-date", current: CURRENT_VERSION };
  return update.update;
}

async function sha256OfFile(file: File): Promise<string> {
  const bytes = await file.bytes();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function downloadApk(
  update: AvailableUpdate,
  onProgress?: (bytesWritten: number, totalBytes: number) => void
): Promise<File> {
  if (!isAllowedApkUrl(update.apkUrl)) {
    throw new UpdateRejectedError(
      "Refusing to download: the update APK is not hosted on GitHub."
    );
  }
  if (!normalizeSha256(update.apkSha256)) {
    throw new UpdateRejectedError(
      "Refusing to download: the release did not publish a valid SHA-256 for the APK."
    );
  }

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

  // Never hand the file to the installer before it matches the digest the
  // release published. A mismatch (or an unreadable file) is refused.
  let actualHex: string;
  try {
    actualHex = await sha256OfFile(file);
  } catch {
    try {
      file.delete();
    } catch {}
    throw new UpdateRejectedError(
      "Update blocked: the downloaded APK could not be verified, so it was not installed."
    );
  }
  const digestProblem = apkDigestProblem(update.apkSha256, actualHex);
  if (digestProblem) {
    try {
      file.delete();
    } catch {}
    throw new UpdateRejectedError(`Update blocked: ${digestProblem}. Nothing was installed.`);
  }

  const launched = installApk(file.uri);
  if (!launched) {
    throw new Error(
      "Could not open the installer. Allow PhotogramBot to install unknown apps in Android settings, then try again."
    );
  }
}
