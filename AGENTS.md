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

## Critical Fixes (16 Rounds, ~50 Fixes)

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
| 13 | device fixes (owner-reported) | Duplicate-backup pile-up: `enqueueUploads` skipped only `status === "uploaded"`, so re-clicking "Sync full gallery now" stacked a second queue row for every in-flight/pending photo → same photo uploaded twice; fixed via `hasActiveQueuedUpload()` (`state IN ('pending','running')`) check. Owner UX asks: tapping a **local-only** photo in the viewer now shows a **Back up** action (`enqueueUploads` + `processQueue`, replaces the Save slot when there is no cloud copy); emoji glyphs replaced with symmetric `react-native-svg` icons — `TrashIcon` (viewer trash button + empty-trash placeholder) and `HeartIcon` filled/outline (viewer favorite toggle, gallery fav badge, Favorites tile) |
| 14 | device fixes (owner-reported, verified on device) | (1) **Viewer bottom bar asymmetry** for local photos: bar was `justifyContent:center` + `gap:40` with intrinsic widths, so swapping Save⇄Back up lopsided it → each action is now an equal `flex:1` slot (verified on device: 4 buttons × exactly 270 px). (2) **Upload banner total kept climbing** ("Backing up 5/10" → "Uploading 38/40"): `processQueue` set `progress.total` to the accumulating `discovered` batch sum → now snapshots pending count at run start, `total = max(startPending, discovered)` (verified live: total stayed 711 while current climbed 80→113). (3) **Queue double-enqueue race found**: watcher scan vs bootstrap/background task run in separate contexts, so the app-level `hasActiveQueuedUpload` check is not atomic — same video got 2 pending rows in the same second. Fixed structurally: migration dedupes active rows then creates partial `UNIQUE INDEX uq_queue_active_local ON upload_queue(local_id) WHERE state IN ('pending','running')`; `enqueueUpload` treats the constraint hit as already-enqueued. (4) **Pending queue didn't resume after app restart** (bootstrap only called `processQueue` when new photos were scanned) → bootstrap now always `processQueue()` when auto-sync can run (self-terminates on empty queue) |
| 15 | no-phone coding round (3 batches, each code-reviewed) | Owner's phone was busy — implemented the requested features code-only. **vsplit fix (ecf7a27)**: the 36 failed video uploads were all `Missing 'WRITE' permission` — `File.open()` defaults READ_WRITE but vsplit only reads the source; now `FileMode.ReadOnly` (parts go to cache). **Batch 1 (4507967 + review fixes 904b854)**: "Retry failed uploads" button in Maintenance (bulk requeue, UNIQUE-safe: deletes failed rows covered by an active sibling, dedupes failed-vs-failed pairs keeping the oldest, `NOT EXISTS` re-check at flip time — a failed-only dedupe initially let duplicate failed rows roll back the whole transaction, caught by code review); new **Upload queue screen** (`UploadQueueScreen`: running/pending/failed list, per-item Retry/Remove, 2 s poll, 200-row cap footer; entries from Settings → Maintenance section and Maintenance screen); db helpers `retryFailedUploads`/`getQueueItems`/`retryQueueItem`/`removeQueueItem`; icons: `RetryIcon`, icon `color` props retyped `ColorValue`. **Batch 2 (08ce92e + review minors 851324b)**: `notifyUploadsFailed` fires in foreground too (was invisible until queue screen opened; "Backup complete" still background-only on all-success); `requestNotificationPermission` moved out of the autoSync branch so manual-sync users get the banner; Settings **Storage card**: cloud/local split bar + 6-month uploaded-bytes chart (`getStorageSummary`, uploaded_at COALESCE taken_at, trash excluded, `'localtime'` month bucketing — UTC skew fix applied to existing `getMonthlyBuckets` too). **Batch 3 (0d08901, review PASS first pass)**: "Not backed up yet" toggle in gallery filter sheet (`SearchFilters.notBackedUp` → `status != 'uploaded'`, both query paths + FILTERED badge logic); ai_caption FTS indexing audited complete end-to-end (no change needed). All batches `tsc --noEmit` clean; **not yet on device — owner must reload JS/build and verify** |
| 16 | no-phone coding round 2 (Batches 4–6, each coder-pro + code-reviewer gated) | **Batch 4 (0361511 + stride fix d42871c)**: FolderSyncScreen rows are now long-pressable to exclude/include (exclude-as-you-browse; both directions, 300 ms delay, pressed-state bg — no ripple); **Backup verification pass** in Maintenance above Integrity checker — `verifyBackupSample` (maintenance.ts) stride-samples 25 uploaded rows (inclusive linspace keeps newest+oldest), per-photo `getFile` on original + preview with 60 ms spacing, reports broken filenames (≤3 + "+K more") with a "Run full check" escalation; sampledAt timestamp; zero-sample guard. **Batch 5 (fbe87c4 + review fix 56b3627)**: Gallery local-roll **infinite paging** (600/page via expo-media-library Query offset — no cursor API in the new Query builder; serial promise chain + sync guard + seen-id dedupe; skip-ahead when a raw page is all unwanted media, bounded 10 pages; refresh resets cursor; short page terminates), **staggered layout for the local grid** (LocalItem carries width/height from AssetMetadata — null-safe clamped 0.6–1.8×; honors the existing `staggeredGrid` pref), review fix seeds `appended` from page 1 so refresh doesn't always pull page 2. **Batch 6 (8b080a9, all 4 review fixes executed-verified)**: **Collections selection reachability** — album-row long-press menu gains "Select photos" (→ AlbumScreen `selectMode` param), Favorites tile long-press → same with `albumId: -1`, trash-tab long-press → selection (Restore / confirm Delete forever); selection bar mirrors GalleryScreen with conditional "Back up selected" (local-only rows via the exact Viewer `enqueueUploads(..., "manual")` + `processQueue` path); **PBKDF2 PIN hashing** — new pure-TS `src/lib/pbkdf2.ts` (HMAC-SHA256 with precomputed ipad/opad midstates, RFC 7914 §11 + RFC 4231 vectors pass, node:crypto cross-check byte-identical), applock format `pb2$<iters>$<saltHex>$<dkHex>` at 20 000 iterations, constant-time hex compare, migration-on-verify (legacy bare-hex rows upgrade in place; wrong pins never migrate; decoy migrates independently; failed upgrade write leaves legacy row valid), setters write only pb2. Review fixes: RN Android Alerts render max 3 buttons (`buttons.slice(0,3)`) — album menu dropped explicit Cancel for `cancelable:true` (4th button had made Delete album unreachable); share selection capped at 20 (binder overflow); Remove-from-album clears selectionMode too; pb2 iteration ceiling tightened to 10× configured cost (tampered near-1M row could freeze JS ~1.1 s+). All tsc clean; **not yet on device — owner must reload JS/build and verify (see Next Up item 1)**. Residual: verifyPin is now CPU-bound ~100–350 ms per derivation (up to 2× with decoy present) — confirm lock-screen feels fine on device |

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

## Next Up (updated 2026-09-01, late evening — Rounds 15 AND 16 shipped code-only; device verification is now the critical path)

0. **Session-start ritual (5 min, before anything else)** — (a) `netstat -ano | findstr :8081` — if a zombie holds the port, kill that PID *and* its parent (`taskkill /T /F /PID <parent>`); last session's Metro died but left an unkillable zombie bound to its shell host — it dies when the session closes, so a fresh session usually starts clean. (b) Launch Metro via `<metro-launcher.cmd>` (detached), wait for `/status`. (c) `adb connect <phone-ip>:<port>` (check `adb mdns services` — the port rotates), then `adb reverse tcp:8081 tcp:8081`. (d) Cold-start the app via the deep link and confirm it's on current JS (check for the **Backup verification** card in Maintenance as the Round-16 stale-JS tell; Storage section = Round 15).
1. **Verify Rounds 15+16 on device (do this with the phone before Phase 3)** — Round 15 items: (a) **Retry failed uploads** — Maintenance top card shows the failed count (was 36 videos; those were the `Missing 'WRITE' permission` vsplit bug, root-caused and fixed — retrying should now actually upload them); press it → "Requeued N uploads" → queue drains. (b) **Upload queue screen** — Settings → Maintenance → Upload queue: counts header, per-item Retry/Remove on failed rows, Remove on pending, live 2 s refresh. (c) **Failure banner** — with the app foregrounded, make an upload fail (airplane mode mid-run works) → "Uploads failed" heads-up banner (needs notification permission granted; now requested for manual-sync users too). (d) **Storage card** — Settings → Storage: cloud vs local split bar + 6-month chart matching what actually uploaded. (e) **Not backed up yet filter** — gallery search → ☰ filters → toggle on → only cloud-badged-missing tiles remain. Round 16 items: (f) **Folder exclude** — Folder sync screen: long-press a folder → excluded (dimmed + "Excluded" suffix); long-press again → back in; Switch still works. (g) **Backup verification** — Maintenance → "Verify sample of 25" → progress then result line (0 broken expected; airplane mode → everything reports broken, which is the offline behavior, not drift). (h) **Local-roll paging** — Gallery tab: scroll past ~600 photos → footer spinner → more load; pull-to-refresh resets; staggered grid toggle in Settings (if enabled) now affects the local roll too. (i) **Collections selection** — long-press an album row → menu (Select photos / Lock / Delete album — all 3 reachable now); Select photos → grid with selection bar (Favorite / Back up on local-only / Share ≤20 / Trash); Favorites tile long-press → same; Trash tab long-press → Restore / Delete-forever selection. (j) **PIN upgrade** — unlock once with the existing PIN (legacy hash migrates silently in place, ≤ ~0.5 s pause); then lock/unlock again (fast path); decoy PIN still works; set a NEW pin → applies immediately. ⚠ Lock-screen verify now costs ~100–350 ms CPU per attempt (2× if decoy set) — confirm it doesn't feel sluggish.
2. **Phase 3 — real-camera test (OWNER REQUIRED, ~10 min)** — with the app foregrounded on the Gallery tab, take a photo with the camera app → expect ✓ cloud badge within ~10 s and the photo in the Telegram channel. (Screencap-pushed files do NOT fire the MediaLibrary watcher on this Samsung; only a real camera capture does. The watcher only lives while the app's JS is alive, so keep the app open.) Then the gates: `uploadOnlyCharging` ON → unplug → photo holds → plug → uploads; Wi-Fi-only ON + mobile data → auto-sync holds. Prefs live: `autoSync=true`, `autoSyncWifiOnly=true`, `uploadOnlyCharging=false`.
3. **Phase 4 — video beta** (owner has already enabled Video support; videos are queued) — check duration-unit flag *a* (5-min video shows 5:00 not 0:05); small video uploads as one playable file; >50 MB video → `#vsplit:` parts → Maintenance → Restore → reassembles and plays (flag *e*; the READ_ONLY open fix must hold on-device — the 36 old failures should clear via the Retry button from item 1); viewer Share → Telegram (flag *b*).
4. **Phases 5–6** — share-target from Google Photos (1 + multiple + while locked); app lock/biometric; PIN + decoy PIN against the new tab UI (now PBKDF2-backed — migration-on-first-verify); encrypted backup round-trip (flag *d*).
5. **Phases 7–9** — multi-destination, widget tap-through, map pins, filters, 6-month chart (OverviewCard still has its own copy), then the migration dry-run.
6. **Remote control via bot commands** — `/status`, `/sync`, `/pause`, remote-delete → trash via `pollUpdates` (src/lib/updates.ts — now chat-filtered).
7. **Release kit** — versionCode discipline, release build config, in-app updater (owner wants public release). Debug build is 281 MB; a release build needs signing config + shrinker pass before any public claim.
8. **Polish backlog** — ~~local-roll paging~~, ~~staggered layout for the local grid~~, ~~selection flows reachability~~ (all DONE in Rounds 15–16, pending device verification). Remaining: drag-select in the grids; a bulk "Back up selected" from Cloud-tab/search selection is still absent (per-item Back up only); FilterSheet reopens with defaults rather than applied values (pre-existing). Storage chart: DONE (Round 15).
9. Known deferred bits: ~~PBKDF2/constant-time PIN compare~~ (DONE Round 16, pending device verification); secretbox KDF standardization (needs migration layer); OCR + face recognition (last); widget ignores per-profile tokens; topics need forum-enabled group + bot admin; Bot API can't download >20 MB files. Minor accepted quirks from Round 15 review: a pending row already handed to a running batch finishes uploading even if Removed from the queue screen (benign — it ends up backed up). Round 16 accepted quirks: includeVideos mid-scroll toggle pages a different query shape against the old cursor until next refresh (bounded, self-healing); legacy PIN `===` compare is no worse than the old code (constant-time only on pb2 rows).

**Context from last session (2026-09-01 day, phone-free):** Round 15 = vsplit READ_ONLY fix (36 video failures root-caused: `File.open()` default READ_WRITE vs scoped storage), retry-failed button + upload queue screen (Batch 1; reviewer caught a failed-vs-failed UNIQUE collision that would have silently rolled back the bulk requeue — fixed with dedupe + NOT EXISTS guard), foreground failure notification + Settings storage card (Batch 2), "not backed up" search filter (Batch 3; ai_caption indexing confirmed already complete). coder-pro dispatches failed all session ("Model request failed.") — implementation went inline, code-reviewer gates ran via subagent and PASSED.

**Context from Round 16 (2026-09-01 late evening, phone-free):** Batches 4–6 all via coder-pro (infra recovered) + code-reviewer gates. Batch 4 = long-press folder exclusion + sampled backup verification (stride sampler initially missed the newest row — caught before commit). Batch 5 = local-roll 600-row offset paging + staggered local grid (reviewer traced every async interleaving: safe; minor fixed = seed appended from page 1 so refresh doesn't always pull page 2). Batch 6 = Collections selection (albums/favorites/trash) + PBKDF2 PIN hashing (pure-TS PBKDF2-HMAC-SHA256 in `src/lib/pbkdf2.ts`, RFC-vector-verified, migration-on-verify). Reviewer caught 4 issues, all fixed and adversarially CONFIRMED (the verifier executed the real RN Alert.js — confirmed `buttons.slice(0,3)` was silently deleting the album-menu's 4th button — and the real pbkdf2.ts against node:crypto, byte-identical).

**Historical notes (2026-08-31, kept for provenance):** the stale-JS incident (owner's 19:02 & 20:23 sync clicks stacked 12,324 queue rows for 1,728 photos while the device ran pre-`74ca03d` JS) and the DB surgery that cleaned it (12,324 → 1,781 rows, integrity ok, pre-surgery backup in `%TEMP%\pb-db-check\`).