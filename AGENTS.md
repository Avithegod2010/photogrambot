# PhotogramBot — Agent Ownership Rules

This folder (`photogrambot`) is **PhotogramBot**, the Telegram Bot API version.

- **Engine**: Bot API via `api.telegram.org` — bot token + channel id configured in-app
- **Package name**: `com.photogrambot.app`
- **Sibling folder**: `..\photogram` is a DIFFERENT app (TDLib version) owned by another agent

## Strict rules for ANY AI agent working in this folder

1. **Boundary**: Work ONLY inside this folder. Never read, write, move, or delete anything inside `photogram-tdlib`.
2. **Your architecture lives here** — continue building on it, do not replace it with TDLib:
   - `src/lib/telegram.ts` (Bot API client), `uploader.ts`, `sync.ts`, `backup.ts`, `maintenance.ts`
   - `src/screens/GalleryScreen.tsx`, `SetupScreen.tsx`, `ViewerScreen.tsx`, `FolderSyncScreen.tsx`, `CollectionsScreen.tsx`, `LockScreen.tsx`, `MapScreen.tsx`, `PeriodScreens.tsx`, `MaintenanceScreen.tsx`
   - stores: `useLibraryStore`, `useSettingsStore`, `useSetupStore`, `useUploadStore`
   - widget files at root: `RandomPhotoWidget.tsx`, `widget-task-handler.tsx`, `widgetData.ts`
   - `app.config.ts` with android-widget plugin config
3. **Secrets**: never commit bot tokens or channel ids into git; keep them in gitignored local config or expo-secure-store at runtime.
4. Before coding, make sure `node_modules` exists — run `npm install` in THIS folder if it doesn't.
5. Expo SDK 57: read exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

---

## Project Identity

**PhotogramBot** — a Telegram Bot API photo/video backup app with a Google Photos–like interface.

- **Engine**: Bot API via `api.telegram.org` — bot token + channel id configured in-app
- **Package name**: `com.photogrambot.app`
- **Tech stack**: Expo SDK 57, React Native, SQLite (expo-sqlite), Zustand, Bot API (no TDLib)
- **Repo location**: `photogrambot`

---

## Architecture Overview

### Core Modules (`src/lib/`)
| File | Purpose |
|------|---------|
| `telegram.ts` | Bot API client (task uploads, timeouts, media groups, token threading) |
| `uploader.ts` | Queue, workers, backoff, previews, AI captions, topics, video splits |
| `db.ts` | SQLite schema, migrations, all queries, FTS |
| `sync.ts` | Scanning, permissions, auto-sync gating (Wi-Fi, charging) |
| `backup.ts` | DB backup/restore, encryption, pinned message |
| `maintenance.ts` | Duplicate finder, integrity checker, restore-to-device |
| `media.ts` | Preview generation, thumbnail caching, metadata extraction |
| `hash.ts` | Streaming MD5 for large files, SHA-256 for small |
| `caption.ts` | Safe caption assembly (no mid-tag cuts), tag sanitization |
| `format.ts` | Formatting utilities (bytes, duration, dates, escapeHtml) |
| `ai.ts` | Gemini captioning via REST (60s timeout) |
| `settings.ts` | Preferences, SecureStore, device IDs, prefs merge |
| `secretbox.ts` | AES-256-GCM encrypted backups (expo-crypto AES-GCM) |
| `applock.ts` | PIN/decoy PIN hashing, verification |
| `destinations.ts` | Multi-destination profiles, folder routing rules |
| `biometrics.ts` | Album lock / app lock via expo-local-authentication |
| `watcher.ts` | Camera watcher (MediaLibrary listener + debounce) |
| `background.ts` | Background sync task (expo-background-task / WorkManager) |
| `updates.ts` | Bot API long-polling for remote commands / multi-device |
| `notify.ts` | Upload progress/completion notifications (background only) |
| `vsplit.ts` | 19 MB video split upload + reassembly |
| `restore.ts` | Save-to-device + bulk restore (reassembles split parts) |

### Stores (`src/store/`)
| Store | Purpose |
|-------|---------|
| `useLibraryStore` | Gallery data, pagination, search, favorites, albums, trash |
| `useSettingsStore` | Preferences, device ID, SecureStore tokens |
| `useSetupStore` | Bot token / channel onboarding flow |
| `useUploadStore` | Upload progress, queue control, cancel |

### Screens (`src/screens/`)
| Screen | Purpose |
|--------|---------|
| `GalleryScreen.tsx` | Main grid, date sections, search, filter sheet, selection bar |
| `ViewerScreen.tsx` | Full-screen pager, zoom, video player, save/share/trash |
| `CollectionsScreen.tsx` | Albums, Favorites, Trash tabs + Local/Cloud tiles |
| `SetupScreen.tsx` | Bot token + channel onboarding wizard |
| `FolderSyncScreen.tsx` | Per-folder auto-sync toggles |
| `LockScreen.tsx` | Biometric + PIN + decoy PIN entry |
| `MapScreen.tsx` | Geotagged photo clusters |
| `PeriodScreens.tsx` | Months-of-year / period photo grids (gallery jump lists cover Years) |
| `MaintenanceScreen.tsx` | Duplicate finder, integrity check, restore-to-device |
| `SettingsScreen.tsx` | All prefs, Destinations, backups, app lock, AI captions |
| `DestinationsScreen.tsx` | Multi-destination profile manager (experimental) |

### Widget (repo root)
| File | Purpose |
|------|---------|
| `RandomPhotoWidget.tsx` | Home screen widget (base64 image + tap deep link) |
| `widget-task-handler.tsx` | Headless task handler (click deep-link) |
| `widgetData.ts` | Headless data fetcher (random photo) |

### Native Module
| Path | Purpose |
|------|---------|
| `modules/share-intent/` | Kotlin share-target module (ACTION_SEND / SEND_MULTIPLE) |

---

## Feature Status

| Feature | Status | Notes |
|-------|--------|-------|
| Photo backup (preview + original) | ✅ Working | 65 KB preview + 50 MB document |
| Video backup (beta) | ⚠️ Beta | 19 MB split parts, 20 MB download limit |
| Auto-sync + camera watch | ✅ | Charging-only, WiFi-only gates |
| Share-target | ✅ | Multi-file, destination picker |
| Decoy PIN | ✅ | Biometric + PIN + decoy gallery |
| Multi-destination | ⚠️ Experimental | Per-folder routing, per-profile tokens |
| Encrypted DB backup | ✅ | AES-256-GCM, passphrase in SecureStore |
| Remote control | ❌ Planned | `/status`, `/sync`, `/pause` via getUpdates |

---

## Critical Fixes (10 Rounds, ~31 Fixes)

| Round | Scope | Key Critical Fixes |
|-------|-------|-------------------|
| 1 | `db.ts` | Backup restore lost `ai_caption`/`duration`/`parts`/`profile_id`; `getDb()` concurrent-migration crash; `INSERT OR REPLACE` cascade wiping album memberships; message-ID cross-channel scoping |
| 2 | `telegram.ts` | **20 MB bot download limit** (split parts 48→19 MB); fetch timeouts (stuck workers); safe JSON parsing; friendly oversize errors |
| 3 | uploader/vsplit | Concurrent-duplicate race → requeue; resumable split uploads with partial persistence; split thumbnails; per-run notification tallies; caption `#part:i/N` token; cancel-aware preview flush |
| 4 | background files | Channel polling ignored videos (multi-device gap) |
| 5 | security | **Base64 encoder corrupted ~2/3 of encrypted backups** (fixed); friendly wrong-passphrase error; static import cleanup |
| 6 | transforms | Streaming MD5 for large files (OOM risk); safe caption assembly + tag sanitization; Gemini 60s timeout |
| 7 | stores/App | Offline launch wiped bot token (fixed); lock flash frame; `getMe` token override |
| 8 | Gallery/Viewer | Decoy search leak; viewer lazy-loads only focused page; debounced search with stale-response guard |
| 9 | screens | Decoy leaks via Map + period views; Map's sparse photo rows |
| 10 | config | Missing `READ_MEDIA_VIDEO` + `ACCESS_MEDIA_LOCATION` |
| 11 | audit (new agent) | Decoy leaks closed: Collections Local/Cloud/Favorites tiles + `AlbumScreen`/`LibraryScreen` gates, Settings tab/gear hidden, channel-title chip hidden, period screens guarded; hash dedupe for >8 MB files (`HASH_RE`/`PART_RE` now accept `md5:<32hex>`); `getGeotagged` returns full photo rows (map favorite fix); upload-task hard timeout (600 s); non-JSON responses can't fake 401/404 (token-wipe hardening); poll filtered to configured channel; lock-flash race fixed; dead Years route removed |
| 12 | device round 1 | **First real device build + test (Samsung SM-S942B, wireless adb)** — Phases 0–2 PASSED. Build fixes: reanimated pinned **4.5.1** (SDK 57 pairing with worklets 0.10.1); share-intent Kotlin module had never compiled (resolve launch intent via `appContext.currentActivity?.intent`). Runtime fixes: Material You crash — `PlatformColor` needs full `@android:color/…` paths (bare names crash `ColorPropConverter` natively), error → `?android:attr/colorError`; photo picker silently empty when media permission denied (now requests permission in-picker, shows denied/error states); cloud thumbnails never loaded — `getCachedTelegramFile` returns a `file://` URI but TelegramImage prepended a second one (`file://file:///…`), AND `Directory.create` needs `{ intermediates: true }` for nested `photogram/thumbs` on fresh installs. 3-per-row grid fix (sub-pixel rounding — floored tile math + margin in gallery/collections/cloud). UI rework per owner: Telephoto-style tabs (Gallery 🖼 / Cloud ☁ / Collections 🔍 via `react-native-svg`, no icon fonts), Settings OFF the tab bar (gallery gear only, SVG gear), Collections Library tiles removed, Gallery tab now mirrors the phone's local roll (cloud-badged) and the ＋ upload button was removed — backups flow via auto-sync / camera-watch / "Sync full gallery now" / share-target |

---

## Current Roadmap (saved 2026-08-25)

1. **Device verification round (do first)** — 6+ native features shipped untested (expo-video, share-intent Kotlin module + intent filters, background-task, expo-network, multi-destination). Needs fresh `npx expo run:android` build, then smoke-test: photo/video upload, share-target from another app, Destinations screen, encrypted backup round-trip, background sync trigger. Owner asked for a step-by-step checklist.
2. **Remote control via bot commands** — last major roadmap feature: `/status`, `/sync`, `/pause`, remote-delete → trash via existing `pollUpdates` (src/lib/updates.ts) infra.
3. **Release kit** — versionCode discipline, in-app updater, release build config (owner wants public release).
4. **Polish backlog** — upload notifications, search filters, storage chart, widget tap-through, decoy PIN, drag-select, charging-only uploads.
5. Known deferred bits: OCR + face recognition (deliberately last), widget ignores per-profile tokens (default-profile photos only), topics need forum-enabled group + bot admin, Bot API can't download files >20 MB (oversize originals must be saved via the Telegram app — friendly error shown).

> **2026-08-30:** Round 11 (independent audit) landed — see the fixes table. All fixes are code-verifiable only; the device verification round remains #1. Deliberately deferred in Round 11: PBKDF2/constant-time PIN hashing and secretbox KDF standardization (would invalidate existing PINs/backups without a migration layer).

> **2026-08-31:** Device verification round 1 done — **Phases 0–2 PASS on real hardware** (see checklist status note + Round 12 fixes). UI reworked to the owner's Telephoto-style spec: Gallery tab = local phone roll (cloud-badged), Cloud tab = backed-up library, Collections = albums/favorites/trash, Settings reachable via gallery gear only, ＋ upload button removed. **The app has never been used more than one session — keep walking Phases 3–9 before adding features.** Roadmap priority order below is unchanged otherwise.

## Device Verification Checklist

> **2026-08-31 — device round 1 COMPLETE for Phases 0–2** (Samsung SM-S942B, wireless adb, debug build): fresh build ✅, launches past splash ✅ (getDb race fix validated), setup flow ✅ (bot `@Photogramtestingbot`, channel "Photogram"), 4 photo uploads ✅ (preview + original + metadata caption in channel), offline token retention ✅, Material You theming ✅, picker ✅ (after permissions), new tab UI ✅, local-roll gallery ✅, cloud thumbnails ✅ (4 JPEGs verified in app cache). **Continue at Phase 3.** The phone has a secure lock — adb cannot dismiss the keyguard; ask the owner to unlock it.

**Phase 0 — Fresh build (required)**
> Old APKs won't work: `expo-video`, the share-intent Kotlin module, intent filters, `background-task`, `expo-network`, `expo-battery`, `expo-notifications` are all new native code.

```
npx expo run:android
```
- [ ] Build succeeds (watch the Kotlin compile of `modules/share-intent`)
- [ ] App launches past "Starting PhotogramBot…" splash without crashing *(validates the getDb race fix)*

**Phase 1 — Setup**
- [ ] Paste bot token → Verify → Detect channel (or paste `-100…` ID) → gallery appears
- [ ] **Offline test** ⚠ *(Round 7)*: force-stop app → airplane mode ON → relaunch → should still reach the gallery, token **not** wiped

**Phase 2 — Core photo uploads** *(2026-08-31: PASSED. The ＋ button no longer exists — uploads flow via auto-sync, camera-watch, "Sync full gallery now" in Settings, or share-target. The old picker flow below still applies to the auto-sync pipeline)*
- [x] Channel check: compressed preview photo (`[Preview …] #hash:`) **+** original document with full metadata caption
- [x] Uploaded tiles get the ✓ cloud badge bottom-right (Gallery local roll + Cloud tab)
- [ ] Re-upload of an identical item is marked duplicate, not re-uploaded

**Phase 3 — Auto-sync & camera watch**
- [ ] Settings → **Auto sync** ON → take a photo with the camera → uploads within ~10 s (camera watch)
- [ ] Settings → **Upload only while charging** ON → unplug → take photo → nothing uploads; plug in → it uploads
- [ ] Wi-Fi-only ON + mobile data → auto-sync holds

**Phase 4 — Video (beta) ⚠**
- [ ] Settings → **Video support (Beta)** ON
- [ ] Picker/folder sync now lists videos with `▶ m:ss` badges → **⚠ CHECK UNITS: does a 5-min video show 5:00 or 0:05?** (review flag *a*)
- [ ] Small video (<50 MB) → uploads as **one playable video** in channel; plays in the in-app viewer
- [ ] Large video (>50 MB) → channel receives multiple ~19 MB `#vsplit:` parts; **Maintenance → Restore all originals** → video reassembles into the gallery and plays *(review flag *e* — this was 100% broken before the fix)*
- [ ] Viewer **↗ Share** → Android share sheet → pick Telegram → uploads manually up to 2 GB *(review flag *b*)*

**Phase 5 — Share-target**
- [ ] From Google Photos, share **1 photo** → PhotogramBot appears in the share sheet → thumbnail sheet → Upload → lands in channel
- [ ] Share **multiple** items → all listed → uploads
- [ ] Share while app-locked → unlock → sheet appears after unlock

**Phase 6 — Security**
- [ ] **App lock** ON → background the app → relaunch → lock screen; biometric unlock
- [ ] Set **PIN + decoy PIN** → lock → enter decoy PIN → empty gallery, dead search, empty Map/Months/Collections; real PIN → everything back
- [ ] **Encrypted backups** ⚠ *(review flag *d* — encoder was rewritten)*: set passphrase → *Backup to channel* → then *Restore from channel* → index restored; wrong passphrase → "Wrong passphrase or corrupted backup"

**Phase 7 — Multi-destination (experimental)**
- [ ] Enable toggle → **Manage destinations** → add 2nd bot+channel → upload via picker with destination chip → lands in 2nd channel; folder rule → auto-sync routes
- [ ] Both destinations' photos show thumbnails correctly in the gallery

**Phase 8 — Background & misc**
- [ ] Background the app mid-upload → **notification** appears (progress + completion)
- [ ] **Widget**: add RandomPhotoWidget → photo shows → tap → opens *that* photo in the viewer *(review flag *b*)*
- [ ] Map shows pins; tap a cluster → View photos → correct thumbs
- [ ] Search text + **☰ filters** (date range, has location, camera) work; "FILTERED" badge clears
- [ ] Overview card: 6-month chart bars render
- [ ] (Optional) Gemini key → AI captioning → `🤖 …` line in channel caption, searchable

**Phase 9 — Migration dry-run**
- [ ] *Backup to channel* → *Restore from channel* on the same device → library intact (albums, favorites, AI captions)

---

**If anything crashes:** `adb logcat --pid=$(adb shell pidof com.photogrambot.app)` and send me the stack — every failure above maps to a specific module I reviewed.

---

## Device & Build Environment (learned 2026-08-31 — read before building)

| Thing | Value |
|-------|-------|
| JDK | `<jdk-17>` — export `JAVA_HOME` before any Gradle build (system PATH has only Java 8) |
| Android SDK | `<android-sdk>` (`ANDROID_HOME` already set); `adb` on PATH |
| Node | `<nodejs>` (v24) on PATH |
| Test device | Samsung SM-S942B (Galaxy S25 Ultra) over **wireless adb** — serial is an mDNS name with spaces; `npx expo run:android` cannot parse it and dies at device detection |
| Build+install flow | `cd android && ./gradlew assembleDebug` (JDK 17 env), then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. First build took ~3 h; incremental ≈ 5 min |
| Metro | **Port 8081 = this project. Port 8083 = sibling TDLib project's Metro — loading our app from 8083 fails with "TdLibModule not linked".** Stable launcher: `<metro-launcher.cmd>` (starts detached). Run `adb reverse tcp:8081 tcp:8081` after every wireless-adb reconnect, then launch `photogrambot://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` |
| Metro pitfalls | A zombie process holding 8081 answers `/status` but serves **stale bundles** (`netstat -ano \| findstr :8081`, kill the PID). CI mode (`CI=1`) never re-reads changed files (metro-file-map persisted cache) — only fresh watch mode is correct. If watch mode dies with "Failed to start watch mode", delete `%TEMP%\metro-cache` and `%TEMP%\metro-file-map-expo-*` and restart (fresh crawl takes ~7 min behind Defender) |
| Dev client | PhotogramBot debug build IS the dev client. If it shows "problem loading" / "crashed last time", check Metro first, then retry; the launcher's server list entry also works |
| Device quirks | Secure lock — adb cannot dismiss keyguard, ask the owner to unlock. Screen timeout was extended to 10 min for testing. UI dumps via `uiautomator dump` + `run-as com.photogrambot.app` for app-private files |

---

## How to Run / Test

```bash
npx expo run:android   # fresh build required (new native deps)
```

Follow the checklist above in order. Report back especially on the **6 ⚠ items** — those are the behaviors code review couldn't verify. Good luck! 🚀

---

## Key Files a New Agent Should Know

| File | Purpose |
|------|---------|
| `src/lib/db.ts` | All SQL, migrations, queries |
| `src/lib/telegram.ts` | Bot API client (task uploads, timeouts, media groups) |
| `src/lib/uploader.ts` | Queue, workers, backoff, previews, AI, video splits |
| `src/lib/sync.ts` | Scanning, permissions, auto-sync gating |
| `src/lib/secretbox.ts` | AES-256-GCM backup encryption |
| `src/store/useLibraryStore.ts` | Gallery data, pagination, search |
| `src/components/TelegramImage.tsx` | Thumbnail/preview loading |
| `modules/share-intent/` | Kotlin share-target module |

---

## Known Limitations / Deferred
- Widget ignores per-profile tokens (default-profile photos only)
- Topics need forum-enabled group + bot admin
- Bot API can't download files >20 MB (oversize originals must be saved via the Telegram app — friendly error shown)
- OCR + face recognition (deliberately last)
- Multi-destination is experimental, off by default
- Bot API can't download files >20 MB (oversize originals must be saved via the Telegram app — friendly error shown)

---

## Next Up (updated 2026-08-31 — give this list back to the owner when they return)

1. **Continue the device checklist at Phase 3 (do first)** — auto-sync + camera watch, then Phase 4 video beta (⚠ review flag *a*: duration units; flag *e*: >50 MB split + restore round-trip), Phase 5 share-target, Phase 6 security/decoy **against the new UI** (decoy now also hides the gallery gear, Cloud/Collections are gated), Phase 7 multi-destination, Phase 8 widget/map/filters/chart, Phase 9 encrypted-backup round-trip (⚠ flag *d*).
2. **Remote control via bot commands** — `/status`, `/sync`, `/pause`, remote-delete → trash via `pollUpdates` (src/lib/updates.ts — now chat-filtered, good foundation).
3. **Release kit** — versionCode discipline, release build config, in-app updater (owner wants public release). Note the debug build is 281 MB; a release build needs signing config + shrinker pass before any public claim.
4. **Polish backlog** — local-roll paging (currently capped at 2000/2400 MediaLibrary assets), staggered layout for the local grid, selection flows (albums/trash) currently only reachable via search results / Cloud tab — decide UX, widget tap-through, storage chart.
5. Known deferred bits: PBKDF2/constant-time PIN compare + secretbox KDF standardization (need a migration layer), OCR + face recognition (last), widget ignores per-profile tokens, topics need forum-enabled group + bot admin, Bot API can't download >20 MB files.