export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size?: number;
};

export type GitHubRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: ReleaseAsset[];
};

export type LatestManifest = {
  versionCode?: number;
  versionName?: string;
  apk?: string;
  // Lowercase or uppercase hex SHA-256 of the APK asset. releases published
  // before this field existed are refused rather than installed unverified.
  sha256?: string;
  notes?: string;
};

export type AvailableUpdate = {
  status: "available";
  current: string;
  latest: string;
  versionCode: number | null;
  apkUrl: string;
  apkName: string;
  apkSha256: string;
  notes: string | null;
  releaseUrl: string;
};

export type UpdateResolution =
  | { status: "none" }
  | { status: "refused"; reason: string }
  | { status: "available"; update: AvailableUpdate };

// The updater is the only path that downloads executable content and hands it
// to the OS installer, so the asset it accepts is tied to a policy: HTTPS
// only, on a GitHub-controlled host, with a digest published in latest.json.
// (Android's own signature check remains the final gate; these checks stop a
// release asset pointing the app at another host or at a different file.)
const TRUSTED_APK_HOSTS = new Set(["github.com"]);
const TRUSTED_APK_HOST_SUFFIX = ".githubusercontent.com";

export function apkUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "the APK download URL is malformed";
  }
  if (url.protocol !== "https:") return "the APK download URL is not HTTPS";
  if (url.username || url.password) {
    return "the APK download URL carries embedded credentials";
  }
  const host = url.hostname.toLowerCase();
  if (!TRUSTED_APK_HOSTS.has(host) && !host.endsWith(TRUSTED_APK_HOST_SUFFIX)) {
    return `the APK is hosted on ${host || "an unknown host"}, not on GitHub`;
  }
  return null;
}

export function isAllowedApkUrl(value: string): boolean {
  return apkUrlProblem(value) === null;
}

// A digest is only usable when it is exactly a SHA-256: 64 hex characters.
// Anything else means the manifest did not really publish one.
export function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

export function bytesToHex(bytes: Uint8Array): string {
  const alphabet = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += alphabet[bytes[i] >> 4] + alphabet[bytes[i] & 0x0f];
  }
  return out;
}

// Null when the downloaded bytes are the file the release published.
export function apkDigestProblem(expected: string, actualHex: string): string | null {
  const want = normalizeSha256(expected);
  if (!want) return "the release did not publish a valid SHA-256 for this APK";
  const got = normalizeSha256(actualHex);
  if (!got) return "the downloaded APK could not be hashed";
  if (got !== want) return "the downloaded APK does not match the SHA-256 published in the release";
  return null;
}

export function parseVersion(v: string): { nums: number[]; pre: string } {
  const cleaned = v.trim().replace(/^v/i, "");
  const [core, ...rest] = cleaned.split("-");
  const nums = core.split(".").map((n) => {
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  return { nums, pre: rest.join("-") };
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa.nums[i] ?? 0;
    const y = pb.nums[i] ?? 0;
    if (x !== y) return x - y;
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre !== pb.pre) return pa.pre < pb.pre ? -1 : 1;
  return 0;
}

export function pickApkRelease(releases: GitHubRelease[]): GitHubRelease | null {
  for (const release of releases) {
    if (release.draft) continue;
    if (release.assets?.some((a) => a.name.toLowerCase().endsWith(".apk"))) {
      return release;
    }
  }
  return null;
}

export function resolveUpdate(
  currentVersion: string,
  currentVersionCode: number,
  release: GitHubRelease,
  manifest: LatestManifest | null
): UpdateResolution {
  const latest =
    (manifest?.versionName && manifest.versionName) ||
    release.tag_name.replace(/^v/i, "");
  const assets = release.assets ?? [];
  const apkAssets = assets.filter((a) => a.name.toLowerCase().endsWith(".apk"));
  if (apkAssets.length === 0) return { status: "none" };

  const versionCode =
    typeof manifest?.versionCode === "number" ? manifest.versionCode : null;

  let available: boolean;
  if (versionCode !== null && currentVersionCode > 0) {
    available = versionCode > currentVersionCode;
  } else {
    available = compareVersions(latest, currentVersion) > 0;
  }
  // Version gating comes first: an installed app that is already current has
  // nothing to refuse, so it stays "up to date" even on an odd manifest.
  if (!available) return { status: "none" };

  const named = manifest?.apk
    ? apkAssets.find((a) => a.name === manifest.apk)
    : undefined;
  const apk = named ?? apkAssets[0];

  const urlProblem = apkUrlProblem(
    typeof apk.browser_download_url === "string" ? apk.browser_download_url : ""
  );
  if (urlProblem) {
    return { status: "refused", reason: `Refusing to update: ${urlProblem}.` };
  }

  const sha256 = normalizeSha256(manifest?.sha256);
  if (!sha256) {
    return {
      status: "refused",
      reason:
        "Refusing to update: the release does not publish a SHA-256 for the APK (latest.json).",
    };
  }

  return {
    status: "available",
    update: {
      status: "available",
      current: currentVersion,
      latest,
      versionCode,
      apkUrl: apk.browser_download_url,
      apkName: apk.name,
      apkSha256: sha256,
      notes: manifest?.notes ?? release.body ?? null,
      releaseUrl: release.html_url,
    },
  };
}

export function buildUpdate(
  currentVersion: string,
  currentVersionCode: number,
  release: GitHubRelease,
  manifest: LatestManifest | null
): AvailableUpdate | null {
  const resolution = resolveUpdate(
    currentVersion,
    currentVersionCode,
    release,
    manifest
  );
  return resolution.status === "available" ? resolution.update : null;
}
