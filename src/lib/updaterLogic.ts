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
  notes?: string;
};

export type AvailableUpdate = {
  status: "available";
  current: string;
  latest: string;
  versionCode: number | null;
  apkUrl: string;
  apkName: string;
  notes: string | null;
  releaseUrl: string;
};

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

export function buildUpdate(
  currentVersion: string,
  currentVersionCode: number,
  release: GitHubRelease,
  manifest: LatestManifest | null
): AvailableUpdate | null {
  const latest =
    (manifest?.versionName && manifest.versionName) ||
    release.tag_name.replace(/^v/i, "");
  const assets = release.assets ?? [];
  const apkByName = manifest?.apk
    ? assets.find((a) => a.name === manifest.apk && a.browser_download_url)
    : undefined;
  const apk = apkByName ?? assets.find((a) => a.name.toLowerCase().endsWith(".apk"));
  if (!apk) return null;

  const versionCode =
    typeof manifest?.versionCode === "number" ? manifest.versionCode : null;

  let available: boolean;
  if (versionCode !== null && currentVersionCode > 0) {
    available = versionCode > currentVersionCode;
  } else {
    available = compareVersions(latest, currentVersion) > 0;
  }
  if (!available) return null;

  return {
    status: "available",
    current: currentVersion,
    latest,
    versionCode,
    apkUrl: apk.browser_download_url,
    apkName: apk.name,
    notes: manifest?.notes ?? release.body ?? null,
    releaseUrl: release.html_url,
  };
}
