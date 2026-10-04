# PhotogramBot — Agent Ownership Rules

This folder (`E:\Opencode CLI\Projects\photogram-bot`) is **PhotogramBot**, the Telegram Bot API version.

- **Engine**: Bot API via `api.telegram.org` — bot token + channel id configured in-app
- **Package name**: `com.photogrambot.app`
- **Sibling folder**: `..\photogram` is a DIFFERENT app (TDLib version) owned by another agent

## Strict rules for ANY AI agent working in this folder

1. **Boundary**: Work ONLY inside this folder. Never read, write, move, or delete anything inside `E:\Opencode CLI\Projects\photogram`.
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
- **Repo location**: `E:\Opencode CLI\Projects\photogram-bot`

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
| `secretbox.ts` | AES-256-GCM encrypted backups (pbgcm2 PBKDF2-600k, pbgcm1 legacy decrypt) |
| `pbkdf2.ts` | Pure-TS PBKDF2-HMAC-SHA256 (RFC-vector-verified; powers applock PIN + secretbox) |
| `remote.ts` | Bot-command remote control (/status /sync /pause /resume /delete) |
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
| `UploadQueueScreen.tsx` | Upload queue: running/pending/failed, per-item Retry/Remove |
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
| Encrypted DB backup | ✅ | AES-256-GCM; `pbgcm2` = PBKDF2-HMAC-SHA256 600k (R18), legacy `pbgcm1` decrypt-only |
| Remote control | ✅ Code-only (R17) | `/status` `/sync` `/pause` `/resume` + reply-`/delete` via `src/lib/remote.ts`; channel-post-only authz; device smoke test pending |

---

## Critical Fixes (22 Rounds, ~80 Fixes)

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
| 17 | no-phone coding round 3 (phone busy all session; implemented inline after coder-pro outage — "captcha verify failed" on every dispatch; reviewer gates via subagent) | **Batch 7 (42b0f35, review PASS + minor fixed)**: gallery selection bar gains conditional **"Back up selected"** (hasBackable memo; local-only rows via the exact Collections/Viewer enqueue path); **FilterSheet now re-seeds from applied filters on every open** (effect on `visible`; useState initializers only fired on first mount — the long-standing reopen-with-defaults quirk); **includeVideos pref flip reloads the local roll** (selector + ref-guarded effect → loadLocal; closes the Round 16 mid-scroll cursor-shape residual); legacy PIN compare now uses `ctEqualHex`; review-found **real bug fixed: "All"/section select-all buttons wrote the store's selection while the screen renders local state — "All" highlighted nothing** (both now setSelection locally). **Batch 8 (e7c22e9, review CHANGES REQUESTED → all 4 fixed)**: **Remote control via bot commands** (roadmap #6 done): `src/lib/remote.ts` — post `/status` (library+queue+paused summary), `/sync` (runSyncNow + counts), `/pause` (kv `remote_paused` → `canAutoSyncNow` returns false, the single gate shared by watcher/background/bootstrap — in-flight batch finishes, new auto work holds), `/resume` (clear + top-up scan), `/delete` **as reply** to a backup message (trashes locally + deletes channel messages); hooked into `pollUpdates` after the channel filter (admin-authenticated by channel membership; commands disabled if channelId unset); `sendMessage` added to telegram.ts (plain text, best-effort); TgMessage gained `text`/`reply_to_message`; App.tsx foreground polling (60 s + on-active, shared in-flight guard with bootstrap, no polling while decoy). Review caught: **replying to the PREVIEW message deleted the preview twice and left the 50 MB original forever** (getPhotoByMessageId matches both ids) — now deletes the deduped set of all known ids; plus honest-gate comment, channelId hardening, decoy poll skip. All tsc clean; **not yet on device — needs bot-command smoke test with the phone** |
| 18 | no-phone coding round 4 (owner-approved menu 2→3→4; coder-pro delivered Batches 9+10; general-pro subagent provider was down — docs sweep done inline) | **Batch 9 — secretbox KDF standardization (40ad8ba, review PASS)**: encrypted backups now encrypt as **`pbgcm2`** = AES-256-GCM keyed by PBKDF2-HMAC-SHA256 **600 000 iterations** (`PBKDF2_BACKUP_ITERATIONS`, ~0.66 s desktop V8, multi-second on Hermes — rare interactive operation, OWASP-aligned) from the RFC-verified `pbkdf2.ts`; legacy **`pbgcm1` kept byte-exact as a decrypt-only path** (saltB64 STRING + RAW passphrase are the old key material — never "clean up" `legacyDeriveKey`; ciphertext lives only in the channel so there is nothing local to migrate; next fresh backup naturally upgrades). 16/16 harness checks (node:crypto AES-GCM stub, unicode 206 KB payload, pbgcm1 compat, 11-vector pbkdf2 cross-check). Review nit fixed: `AESSealedData.fromParts` moved inside the try/catch so invalid base64 surfaces as the friendly "Wrong passphrase or corrupted backup" error. **Batch 10 — structured search filters (c2acf5f, review CHANGES REQUESTED → all 3 fixed)**: `SearchFilters` gained `device` (exact match on the uploader-device column), `mediaType` (photos/videos via mime prefix — null-mime rows excluded by design), `sort: "size_desc"` (COALESCE size DESC); all in the shared conds array so **both** searchPhotos paths (plain + FTS) get them; db helpers `getDistinctDevices`/`getLargestUploaded(3)`; FilterSheet gains Device/Media/Sort chip rows (`FilterChipRow` generic, per-open device load, **Device row hidden in decoy sessions** — device names must not leak), body wrapped in a ScrollView (maxHeight 70 %, keyboardShouldPersistTaps) ; remote `/status` gained a "Largest:" line. 27/27 node:sqlite SQL tests. Review fixes: size sort interleaves dates → **duplicate FlatList section keys** (search keyExtractor now `${i}:${label}` like the local roll); a throw in the Largest read could kill the /status reply AND skip updates-offset persistence (→ whole-batch command replay) — now try/catch-contained; applied-but-unlisted device merged back into chip options. coder-pro also fixed in passing: all-empty Apply passes null (FILTERED badge no longer lingers). **Security audit (2026-09-04, subagent)**: surface largely clean (FTS quoting verified empirically; no token leakage; PBKDF2 paths sound). Fixes applied from findings: **commands now honor `u.channel_post` ONLY** (chat-membership authz would have let any member of a group-configured chat drive the device — Medium), and **`sendMessage` reply_parameters is now a nested object** (stringified form 400s silently in JSON-body calls — every status reply would have vanished; Info). Low finding documented, not fixed: no failed-unlock backoff on LockScreen (added to Known Limitations — do it before public release). Device tests owed: `/status` reply actually arrives (validates the reply_parameters fix), restore a pbgcm1 backup, device chips + size sort in the filter sheet |
| 19+20 | device round 2 (a/b/g/d/f + duration units PASS) + owner UI round | **Device findings:** (a) Retry requeued 146 then 231 mechanically; (b) Upload queue screen live (counts, per-item state/retry counts); (g) Backup verification sampled 25 → 1 genuinely unreachable (IMG-20250430-WA0286.jpg, timestamped); (d) Storage card renders (4.0 GB cloud / 2004 items, 6-month chart); (f) folder long-press exclude/re-include works both directions; duration badges show real m:ss (▶ 1:02, ▶ 0:16). **The big find — video uploads all failed with "Unsupported FormDataPart implementation": expo/fetch (`expo/src/winter/fetch/convertFormData.ts`) rejects RN-style `{uri}` FormData parts, so the old FormData-fetch fallback was dead AND masked the primary error. Fixed (0f62be5): `sendFileViaTask` stages `content://` sources to cache up front (videos from MediaStore are content:// — photos are file:// which is why they always worked); fallback replaced with a staged re-upload chaining the original error. VERIFIED on device: videos upload, ▶ tile in library, 0 FormData errors; residual 29 fails = terminal "File missing on device" (source files genuinely gone — the "Papa phone" folder; candidates for auto-skip polish). **Lock-screen failed-attempt backoff** (dd85e65, review PASS): SecureStore counter+ts, schedule 5/10/15/20 failures → 15 s/1 m/5 m/15 m, pad disabled during countdown, biometric success clears, decoy parity; review minor fixed (19a32eb submitPin in-flight guard); accepted residual: rolling the system clock back defeats it (owner-favorable fail-open, needs device access anyway). **Owner UI round (c34283a):** Settings as 4th tab-bar button via `tabBarButton` (decoy-guarded, navigates to stack Settings; gallery gear kept); Months/Years now span local roll + DB (`src/lib/localPeriods.ts` — the DB-only queries rendered "Nothing here yet" for local-heavy libraries; PeriodJumpList + MonthsOfYearScreen merge DB groups with local MediaLibrary buckets, PeriodPhotosScreen merges `getPhotosInRange` + `getLocalPhotosInRange` with local rows rendered via a per-tile lazy URI thumb); viewer bottom bar all-SVG icons (DownloadIcon/ShareIcon/InfoIcon added — the mixed text-glyph/SVG bar had labels sitting at different line-heights); swipe up OR down pops the info sheet (Google Photos style); PhotoInfoSheet shows ai_caption. Release-kit state: signing config + version.properties live in the UNTRACKED android/ folder; 3 assembleRelease attempts failed on TLS handshake to dl.google.com (curl fine — JVM-TLS-specific); device was shut down 2026-09-05 (re-bind wireless debugging on resume) |
| 21 | no-phone coding round 5 (features #1+#3 from the ideas menu; coder-pro infra down again — implemented inline after the second AI's dispatch timed out; reviewer gate via subagent) | **Free up space (8d6e531)** — Settings → Maintenance → Free up space + Maintenance entry: lists uploaded rows with verified-present local copies (`getFreeUpCandidates`), month-grouped checkbox list with per-month totals and select-all; per-photo `getFile` re-verification before deletion (failures KEPT on device); `MediaLibrary.Asset.delete` static call in 200-row chunks (Android system delete dialog; user cancel tolerated via exists re-check); `clearLocalUris` keeps the DB row as the cloud-copy record so nothing re-uploads. **Near-duplicate finder (same commit)** — `src/lib/phash.ts`: pure-TS baseline-JPEG DC-coefficient decoder (marker parser, canonical Huffman tables, bit reader with 0xFF de-stuffing + RSTn, generic per-component MCU walk incl. 4:2:0/4:2:2, luma-first invariant asserted, per-file quant tables, marker-guarded success path — truncation fail-safes to null); 64-bit dHash over a 9×8 nearest-neighbor downsample of the Y-block-mean grid; Hamming + union-find clustering (threshold 8/64, transitive); `phash` column caches hashes across rescans; bytes from local file (FileMode.ReadOnly readBytes) or channel thumbnail fallback, 25 MB decode cap. Maintenance UI: "Find near-duplicates" with progress; per-group "Keep newest, trash rest" (local trash) and "Delete from channel too" (channel messages deleted + `addToTrash`+`markTrashRemoteDeleted` — rows SURVIVE so auto-sync never re-uploads; review caught hard-delete resurrecting duplicates). Decoder verified 14/14 in a synthetic baseline-JPEG harness (4:4:4 exactness ±2, 4:2:0 sub-sampled chroma with nonzero diffs, PNG/progressive/truncated negatives, dHash+clustering semantics) — all initial failures were harness bugs. Review: 3 majors + 5 minors fixed (cached-rescan clustering so rescans don't erase results, trash-instead-of-hard-delete, luma-first check, per-file quant tables, end-of-scan marker guard, O(n²) clustering yields, error-guarded delete loop). NOT device-verified — first run on a ~2k library takes minutes (JS-thread decode with 15 ms yields; progress line shows). Also this session: lock-backoff review PASS + minor 19a32eb; release build attempt #3 with TLS flags died at 50 min (same dl.google.com handshake) |
| 22 | Search & organization (Batch A+B+C complete) | **Batch A** search intelligence committed in `215b1b2`, with hardening/security fixes in `172bf46`: NL search, saved searches/smart collections, auto-tags, structured filters, decoy gating; tsc clean and code/security review findings addressed. **Batch B** committed in `854e75c`: Cloud timeline scrubber and Viewer → Find similar photos using the phash index. **Batch C (this session)** Trips & events auto-albums complete: `src/lib/trips.ts` `clusterTrips()` (36 h gap OR >150 km jump spanning >6 h splits, min 3 photos, haversine centers, date-range names); db.ts `albums.query` TEXT migration + defensive `parseTripQuery()` (100 KB / 5 000-id caps) + `syncTripAlbums()` (transactional rebuild, UNIQUE-name collision suffixing, byte-identical-query skip with album_photos count re-check to heal restore-merge drift, stale/unparseable generated albums self-heal) + trip-aware `getAlbumPhotos()` + backup/restore round-trips `query`; CollectionsScreen "Trips & events" section (decoy-gated, syncs on focus, long-press → Select photos) and AlbumScreen `isTrip` route param hiding the per-photo "Remove" button (membership is generator-owned; removal was a silent no-op). 18/18 node harness on clusterTrips; project tsc clean. Review gate ran INLINE (subagent provider down all session — dispatches failed with provider-not-found). NOT device-verified. |

---

## Current Roadmap (updated 2026-10-05)

1. **Device verification round** — Batch A/B/C plus earlier native features need real-device smoke tests: photo/video upload, share-target, Destinations, encrypted backup round-trip, background sync, timeline scrubber, Find similar, and Trips & events (check a multi-day geotagged stretch produces a trip album; delete-then-resync is NOT possible from the UI — generated trips can't be deleted; trip tiles show cover photos when the newest member has cloud copies).
2. **Release kit** — versionCode discipline, in-app updater, release build config (owner wants public release).
3. **Polish backlog** — upload notifications, storage chart, widget tap-through, drag-select, charging-only uploads.
4. **Known deferred bits**: OCR + face recognition (deliberately last), widget ignores per-profile tokens (default-profile photos only), topics need forum-enabled group + bot admin, Bot API can't download files >20 MB (oversize originals must be saved via the Telegram app — friendly error shown).

---

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

## Next Up (updated 2026-10-05 — AI HANDOFF POINT; device verification remains)

> **2026-10-05 HANDOVER SUMMARY:** Batches A, B, and C are all committed and gated (A: `215b1b2`+`172bf46`, B: `854e75c`, C: this session's feat commit — see the Round 22 row for details). tsc clean; Batch C's clusterTrips passed an 18/18 node harness; review ran INLINE because the subagent provider was down all session (dispatch attempts fail with provider-not-found — retry subagent gates when it returns). **Critical path**: device verification → release kit.

**Immediate next steps**:
1. **Run device verification** — everything in the Device Verification Checklist (Phases 3–9), plus the Batch A/B checks and the Batch C checks listed in the roadmap: trip album appears for a multi-day geotagged stretch, hidden when photos are trashed (next Collections visit), trip tiles show cloud covers, "Select photos" selection bar has NO Remove button inside a trip album.
2. **Re-run the review gates via subagent when the provider recovers** — one code-reviewer pass over the Batch C files (trips.ts, db.ts syncTripAlbums/parseTripQuery/getAlbumPhotos, CollectionsScreen trips wiring) and one batch-security-auditor sweep (parseTripQuery JSON handling, SQL parameterization in the IN-clause path, importAllData query cap) to replace the inline pass.
3. **Release kit** after device work.

**Device work owed**:
Everything in the Device Verification Checklist (Phases 3–9) remains owed from previous rounds, plus the Batch A/B/C checks.

**Release build blocker**:
`assembleRelease` fails ~46-50 min on TLS handshake to dl.google.com (JVM-TLS-specific; curl works; a 4th attempt with full log capture may still be running — check `/tmp/pb-release-build.log`). Whole `android/` folder UNTRACKED (signing machine-local). Consider committing android/ or a setup script before public release.

**Coordination**:
Batches A/B/C are committed; nothing in-flight. `.mimosa/` and `.tmp-harness/` are gitignored. A second AI also commits here — re-read this file before starting work, and verify `git status` before committing.

**Session-start ritual** (5 min, before anything else):
(a) `netstat -ano | findstr :8081` — if a zombie holds the port, kill that PID *and* its parent (`taskkill /T /F /PID <parent>`);
(b) Launch Metro via `E:\Dev\run-pb-metro.cmd` — durable launch is PowerShell `Start-Process -FilePath 'E:\Dev\run-pb-metro.cmd' -WindowStyle Hidden`;
(c) `adb connect <phone-ip>:<port>` (check `adb mdns services` — the port rotates AND goes stale; if refused, ask the owner to open Settings → Developer options → Wireless debugging to re-bind);
(d) `adb reverse tcp:8081 tcp:8081` — the reverse is wiped by every adb reconnect; re-check `adb reverse --list` after any reconnect and before every cold start;
(e) Cold-start the app via the deep link and confirm it's on current JS (check for the Backup verification card in Maintenance as the Round-16 stale-JS tell);
(f) **Before ANY tap/input injection, verify the foreground package is `com.photogrambot.app`** — the SIBLING app (`com.photogram.app`) steals foreground repeatedly; if it holds foreground, only owner-driven testing is safe.

---

## Device & Build Environment (learned 2026-08-31 — read before building)

| Thing | Value |
|-------|-------|
| JDK | `E:\Dev\jdk\jdk-17.0.20+8` — export `JAVA_HOME` before any Gradle build (system PATH has only Java 8) |
| Android SDK | `E:\Dev\android-sdk` (`ANDROID_HOME` already set); `adb` on PATH |
| Node | `E:\Tools\nodejs` (v24) on PATH |
| Test device | Samsung SM-S942B (Galaxy S25 Ultra) over **wireless adb** — serial is an mDNS name with spaces; `npx expo run:android` cannot parse it and dies at device detection |
| Build+install flow | `cd android && ./gradlew assembleDebug` (JDK 17 env), then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. First build took ~3 h; incremental ≈ 5 min |
| Metro | **Port 8081 = this project. Port 8083 = sibling TDLib project's Metro — loading our app from 8083 fails with "TdLibModule not linked".** Stable launcher: `E:\Dev\run-pb-metro.cmd` (starts detached). Run `adb reverse tcp:8081 tcp:8081` after every wireless-adb reconnect, then launch `photogrambot://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` |
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
- Lock-screen backoff uses SecureStore counters and bounded delays; rolling the system clock back can defeat the delay (owner-favorable fail-open).

---
