#!/usr/bin/env node
// Publishes a PhotogramBot APK to GitHub Releases for the in-app updater.
//
// Usage:
//   node scripts/publish-release.mjs --apk <path> --tag v1.0.0 \
//     [--title "PhotogramBot 1.0.0"] [--notes "text" | --notes-file <path>] \
//     [--prerelease] [--dry-run]
//
// What it does:
//   1. Reads the version from android/version.properties (the single source of
//      truth) and writes latest.json next to the APK's name.
//   2. Creates a GitHub Release for --tag.
//   3. Uploads the APK and latest.json as assets.
//
// Token: GITHUB_TOKEN in the environment, or `gh auth token` if the GitHub CLI
// is logged in. The token is never written to disk.
//
// The updater (src/lib/updater.ts) picks the newest release that carries an
// .apk asset; latest.json makes the version comparison exact. Prereleases are
// fine - the updater only skips drafts.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = "Avithegod2010";
const REPO = "photogrambot";
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const has = (name) => process.argv.includes(`--${name}`);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const apkPath = arg("apk");
const tag = arg("tag");
const title = arg("title") ?? tag;
const notesFile = arg("notes-file");
const notes = notesFile ? readFileSync(notesFile, "utf8") : (arg("notes") ?? "");
const prerelease = has("prerelease");
const dryRun = has("dry-run");

if (!apkPath || !tag) {
  fail("--apk and --tag are required (see the header of this script)");
}
if (!existsSync(apkPath)) fail(`APK not found: ${apkPath}`);
if (!apkPath.toLowerCase().endsWith(".apk")) {
  fail("--apk must be an .apk file — the in-app updater only installs APKs");
}
if (!tag.startsWith("v")) fail("--tag must start with 'v' (e.g. v1.0.0)");

const propsPath = join(root, "android", "version.properties");
let props;
try {
  props = readFileSync(propsPath, "utf8");
} catch {
  fail(`Could not read ${propsPath}`);
}
const readProp = (key) => {
  const m = props.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)\\s*$`, "m"));
  return m ? m[1].trim() : undefined;
};
const versionName = readProp("versionName");
const versionCode = Number(readProp("versionCode"));
if (!versionName || !Number.isFinite(versionCode)) {
  fail("android/version.properties is missing versionName/versionCode");
}

const apkName = basename(apkPath);
const manifest = { versionCode, versionName, apk: apkName };
if (notes.trim()) manifest.notes = notes.trim();
const manifestPath = resolve(join(root, "latest.json"));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Manifest: ${JSON.stringify(manifest)}`);

if (dryRun) {
  console.log(`Dry run: would create ${tag} (${prerelease ? "prerelease" : "release"})`);
  console.log(`Dry run: would upload ${apkName} (${(statSync(apkPath).size / 1048576).toFixed(1)} MB) + latest.json`);
  process.exit(0);
}

function gitCredentialToken() {
  // Last-resort fallback for boxes where `gh` is not installed/logged in but
  // git already has a credential helper configured. GIT_TERMINAL_PROMPT=0
  // keeps a missing helper from blocking the script on an interactive prompt.
  try {
    const out = execFileSync("git", ["credential", "fill"], {
      input: "protocol=https\nhost=github.com\n\n",
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const line = out.split(/\r?\n/).find((l) => l.startsWith("password="));
    return line ? line.slice("password=".length).trim() || null : null;
  } catch {
    return null;
  }
}

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const fromGh = execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
    if (fromGh) return fromGh;
  } catch {}
  return gitCredentialToken();
}

const token = githubToken();
if (!token) {
  fail("No GitHub token. Set GITHUB_TOKEN (repo scope) or run `gh auth login`.");
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "PhotogramBot-release",
};

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${body.slice(0, 300)}`);
  }
  return res;
}

async function uploadAsset(uploadUrl, file, contentType) {
  const name = basename(file);
  const url = uploadUrl.replace(/\{.*\}/, `?name=${encodeURIComponent(name)}`);
  const bytes = readFileSync(file);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "PhotogramBot-release",
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
    },
    body: bytes,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`upload ${name} -> ${res.status} ${body.slice(0, 300)}`);
  }
  console.log(`Uploaded ${name} (${(bytes.length / 1048576).toFixed(1)} MB)`);
}

// Refuse to reuse a tag: re-running a failed publish should be an explicit
// decision, not silently overwrite assets the updater may already serve.
// The list endpoint is used instead of /releases/tags/:tag because the latter
// returns 404 for DRAFT releases — exactly the state a previous failed run or
// an old waiter script can leave behind.
const releases = await api("/releases?per_page=100").then((res) => res.json());
const collision = Array.isArray(releases) ? releases.find((r) => r.tag_name === tag) : null;
if (collision) {
  fail(
    `Release ${tag} already exists${collision.draft ? " as a DRAFT (invisible to the updater)" : ""}. ` +
      "Delete it first if you really want to republish."
  );
}

let release = null;
try {
  const res = await api("/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name: title,
      body: notes,
      prerelease,
      draft: false,
    }),
  });
  release = await res.json();
  console.log(`Created release: ${release.html_url}`);

  await uploadAsset(release.upload_url, apkPath, "application/vnd.android.package-archive");
  await uploadAsset(release.upload_url, manifestPath, "application/json");
  console.log(`Done: ${release.html_url}`);
} catch (e) {
  console.error(String(e?.message ?? e));
  if (release?.id) {
    // Leave no half-published release behind (no APK asset = invisible to the
    // updater anyway). Best effort: also drop the tag so a retry can proceed.
    console.error(`Cleaning up release ${release.id} and tag ${tag}...`);
    await api(`/releases/${release.id}`, { method: "DELETE" }).catch(() => {});
    await api(`/git/refs/tags/${encodeURIComponent(tag)}`, { method: "DELETE" }).catch(() => {});
  }
  process.exit(1);
}
