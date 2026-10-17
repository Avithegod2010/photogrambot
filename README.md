<div align="center">

<img src="assets/icon.png" alt="PhotogramBot" width="120" height="120" />

# PhotogramBot

**Back up your phone's photos and videos to your own private Telegram channel — wrapped in a Google Photos–style app.**

[![Platform: Android](https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white)](#known-limitations)
[![Expo SDK 57](https://img.shields.io/badge/Expo_SDK-57-000020?logo=expo&logoColor=white)](https://docs.expo.dev/versions/v57.0.0/)
[![React Native 0.86](https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react&logoColor=white)](https://reactnative.dev)
[![Telegram Bot API](https://img.shields.io/badge/Telegram-Bot_API-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

PhotogramBot turns a private Telegram channel into your personal, free photo archive. It uploads a compressed **preview** plus the **full-quality original** of every photo, indexes everything in a local SQLite library, and lets you browse, search, and restore it all from a native Android app.

There is **no middleman server** — the app talks directly to `api.telegram.org`, and your bot token never leaves your device.

> [!TIP]
> Everything is yours: the storage (your channel), the index (your phone), and the credentials (your keychain). No accounts, no subscriptions, no telemetry.

## Table of contents

- [Highlights](#highlights)
- [Features](#features)
- [Privacy](#privacy)
- [Building](#building)
- [Publishing releases (in-app updater)](#publishing-releases-in-app-updater)
- [In-app setup](#in-app-setup)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Known limitations](#known-limitations)
- [License](#license)

## Highlights

| | |
| --- | --- |
| **Zero-cost archive** | Telegram is the storage backend — nothing to host or pay for |
| **Full quality** | A fast preview *and* the untouched original are both kept |
| **Yours alone** | The archive lives in a channel **you** own; the token stays on-device |
| **Google Photos feel** | Timeline, albums, trips, memories, map, and rich search |
| **Privacy-first** | No analytics, no trackers, no telemetry |
| **Disaster-ready** | Encrypted channel backup plus a one-tap migration wizard for a new phone |

## Features

**Backup engine**

- Auto-sync of your full local roll, plus camera-watch (new photos upload within seconds) — gated by Wi-Fi-only and charging-only options
- Share-target: send photos or videos straight from Google Photos or any app
- Upload queue with per-item retry, backoff, live progress, cancel, and **priority lanes** (camera shots first, screenshots last, favorites jump the queue)
- Videos backed up as ~19 MB re-assemblable parts (beta), with resumable split uploads
- Duplicate-safe uploads (content hashes) plus a perceptual-hash guard that skips re-saves and recompressions
- **Overnight catch-up**: a bulk backlog drain while the phone charges at night (Wi-Fi + charging + per-night cap)
- **Self-repair**: uploads that go unreachable in the channel are re-uploaded automatically while the local file still exists
- **Motion photos**: the embedded video inside a motion JPEG is extracted and backed up as a companion clip

**Browsing & organization**

- Gallery (local roll with cloud badges), a Cloud timeline, and Collections tabs
- Albums, Favorites, and Trash with restore — plus *delete from Telegram too*; range-select and drag-paint multi-select
- Months / Years / period views, a map of geotagged photos, and on-this-day memories
- **Trips & events** — auto-generated albums that group photos by time gaps and location jumps, with one-tap **story summaries** posted to your channel
- Search: full-text (filename, folder, device, camera, AI captions, **screenshot OCR text**), structured filters (date, media type, device, size sort, not-backed-up), saved smart collections, natural-language search ("photos of documents from last month", optional Gemini), and a meaning-based semantic fallback (optional Gemini embeddings)

**Safety & maintenance**

- AES-256-GCM **encrypted database backup** to your own channel (PBKDF2-HMAC-SHA256, 600k iterations) — restore everything on a new phone via the in-app **migration wizard**
- App lock: biometric, PIN, and a **decoy PIN** that opens an empty gallery, with failed-unlock backoff and a **break-in log**
- Remote control from Telegram: `/status`, `/sync`, `/pause`, `/resume`, reply-`/delete`, `/find <words>`, reply-`/restore`, and a two-step `/wipe` that erases local copies from a lost phone while the archive stays safe
- **Low-storage guard**: automatic backups pause below 500 MB free; thumbnail cache with one-tap clear
- **Channel digest**: periodic stats, a backup-verification sample, and archive-health tallies posted to your channel
- Maintenance: backup verification sampler, integrity checker, near-duplicate finder, channel-dedupe audit, in-app diagnostics log, "find similar", free-up-space (including a screenshot-sunset view of 30+ day-old screenshots), and monthly ZIP export
- **Multi-channel mirror** (experimental): re-send every upload to a second bot/channel for redundancy
- **Index export (CSV)**: your whole library index as a spreadsheet — no lock-in
- Home-screen widget showing a random photo from your library (optionally favorites only)
- Material You theming, a themed app icon, and upload notifications that deep-link to the queue

## Privacy

- Your bot token is stored in the device keychain (SecureStore) — never in the cloud, never in a backup's plaintext, never logged
- The only network peers are `api.telegram.org` and — only if you enable AI features — Google's Gemini API with your own key
- Your archive lives in a Telegram channel **you own**; nothing is uploaded anywhere else
- No analytics, no trackers, no telemetry

## Building

### Prerequisites

- Node.js 20+ (developed on Node 24)
- JDK 17 (`JAVA_HOME` must point at it)
- Android SDK (Platform Tools, current build tools)
- A Telegram bot: create one with [@BotFather](https://t.me/BotFather), add it to a private channel as **admin**, and grab the token

### Debug build

```bash
npm install
npx expo run:android
```

The `android/` project is committed, so no prebuild step is needed. Debug builds are signed with the standard debug keystore. You can also build directly:

```bash
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Release build (your own signing)

Release signing is opt-in and machine-local — the two secret files are gitignored and must never be committed:

1. `android/app/pb-release.keystore` — your release keystore
2. `android/pb-release-signing.properties` — with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`

Without them, a release APK still builds and installs (signed with the debug keystore) — fine for testing, not for distribution.

`android/version.properties` is the single source of truth for the release version — bump `versionCode` (and `versionName`) there for every release artifact. Both the native build (`android/app/build.gradle`) and `app.config.ts` read that same file, so the two can never drift.

### Cloud builds (EAS)

`eas.json` ships with three profiles: `development`, `preview` (installable APK), and `production` (store AAB). Cloud builds sidestep any local Gradle or network issues — log in with `eas login` (or `EXPO_TOKEN`), then:

```bash
eas build -p android --profile preview
```

> [!NOTE]
> EAS generates and manages its own keystore for cloud builds unless you upload yours via `eas credentials`.

### Publishing releases (in-app updater)

The app can update itself from GitHub Releases. Settings → About → **Software updates** checks the latest release of this repo, downloads the attached `.apk`, and hands it to the Android installer (the app will ask you to allow "install unknown apps" the first time).

For an exact version comparison, attach a **`latest.json`** next to the APK:

```bash
# bump android/version.properties first (versionCode + versionName)
npm run release:manifest -- --apk photogrambot-1.0.1.apk --notes "What's new"
```

Then create the release and upload both files:

```bash
gh release create v1.0.1 photogrambot-1.0.1.apk latest.json --title "v1.0.1" --notes-file CHANGELOG.md
```

Without `latest.json` the updater falls back to comparing the release tag's semantic version against the installed version. `android/version.properties` is the single source of truth for `versionCode` / `versionName`.

## In-app setup

Paste the bot token → **Verify** → the app detects your channel (or paste the `-100…` channel ID) → done. Everything after that runs on-device.

## How it works

```text
  Phone                                Telegram channel (you own it)
  ┌──────────────┐    preview +    ┌──────────────────────────────┐
  │  upload      │───  original ─▶ │  photo preview                │
  │  queue       │                 │  original document            │
  │  workers     │◀── restore ──── │  video parts (~19 MB)         │
  └──────┬───────┘                 │  encrypted DB backup (pinned) │
         │ writes                  └──────────────────────────────┘
         ▼
  ┌──────────────┐
  │  local SQLite │  index: metadata, hashes, GPS, tags, FTS
  │  library      │  → gallery, search, albums, trips, memories
  └──────────────┘
```

1. **Capture** — auto-sync, camera-watch, or the share-target hand files to the upload queue.
2. **Upload** — a worker posts a preview *and* the original to your channel; videos are split into resumable parts.
3. **Index** — metadata, hashes, GPS, and tags are written to a local SQLite/FTS library.
4. **Browse & restore** — the app renders that library, and originals are pulled back down on demand.

## Tech stack

Expo SDK 57 · React Native 0.86 · TypeScript · expo-sqlite (FTS5) · Zustand · Reanimated · react-native-maps · react-native-android-widget

## Project layout

| Path | What lives there |
| --- | --- |
| `src/lib/` | Bot API client, upload queue/workers, SQLite schema + migrations, sync, crypto (AES-GCM secretbox, pure-TS PBKDF2, pHash), remote control, backup |
| `src/screens/` | Gallery, Viewer, Collections, Setup, Settings, Maintenance, Map, Lock, … |
| `src/store/` | Zustand stores (library, settings, setup, upload) |
| `modules/share-intent/` | Native Kotlin share-target module |
| `RandomPhotoWidget.tsx` + root files | Home-screen widget |
| `android/` | Committed native project (single source of truth for `versionCode`) |

`AGENTS.md` documents the project's conventions, history, and the rules for AI-assisted development of this repo.

## Known limitations

- The Bot API cannot **download** files larger than 20 MB — oversized originals are still backed up (downloadable via the Telegram app); the app shows a friendly error when restoring them
- Video backup is beta: parts are ~19 MB, and restoration reassembles them
- Topics require a forum-enabled group with the bot as admin
- The widget uses the default destination profile only
- Multi-destination is experimental and off by default
- Android is the supported platform; the iOS config exists but is untested

## License

[MIT](LICENSE)
