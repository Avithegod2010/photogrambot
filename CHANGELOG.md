# Changelog

All notable changes to PhotogramBot. Versions follow `android/version.properties`
(`versionName`), and every published artifact increments `versionCode`.

## [1.4.0] - Material You motion & haptics

- **Material 3 navigation bar** - animated 32 dp active indicator pill behind the
  selected tab icon; bar reserves the gesture inset.
- **M3 controls** - switch with a sliding thumb and check mark, selected
  segments grow and gain a check, filter chips show a check when selected,
  dialogs/sheets use 28 dp corners and a scale/fade entrance.
- **Ripples everywhere** - every pressable now shows a Material ripple in every
  theme, including dynamic colour.
- **Haptics** (`expo-haptics`) - selection ticks for tabs/segments/chips/switches
  and the PIN keypad, light impacts for actions, medium for long-press and
  destructive confirms, success/error for outcomes. New Settings -> Appearance
  toggle, on by default. Calls are lazy and fail-soft, so a JS-only update on a
  build without the native module stays silent. **A native rebuild is required
  for haptics to be felt.**
- **Motion** - animated progress bars, sliding selection bar, rotating overview
  chevron, all reduced-motion aware and within the 240 ms budget.

## [1.3.0] - calm interface overhaul

A UI-only release. Backup, sync, encryption, remote-control and database logic
are untouched; every screen now shares one visual and accessibility system.

### Foundation
- **Design tokens** in `src/theme.ts`: a closed type scale (10/11/12/13/15/17/20/24/30),
  4-based spacing, five radii, a 120/180/240 ms motion scale, a 48 dp touch
  target, semantic status tokens and centralised overlay/fallback colours.
- **Accessible primitives** in `src/components/ui.tsx`: Button, IconButton,
  ListRow, Chip, ToggleRow, Dialog, Sheet, AppBar, SegmentedControl, Badge,
  StatusPill, ProgressBar, Stat, EmptyState, ErrorState, Section, Divider,
  Screen, SearchField. Roles, labels, states and 48 dp targets are built in.
- **Press feedback** on the UI thread (Reanimated, 120 ms, reduced-motion aware).
- **ErrorBoundary** recovery screen ("your archive is safe").
- **Static UI guard** (`tests/ui-system.test.mjs`) fails on raw hex colours,
  `Dimensions.get`, type sizes outside the scale, or missing primitive
  accessibility contracts.

### Screens
- **Gallery**: photo-first chrome, segmented Days/Months/Years, measured sticky
  date header (only after the first section scrolls), collapsible library
  overview, upload progress bar, selection bar with overflow sheet, trash
  confirmation dialog, skeleton/empty/error states.
- **Collections**: responsive 2/3/4 album grid with cover mosaics, bottom-sheet
  album/trip/search menus, trash selection with dialog confirms.
- **Settings**: search field with section jump index; destructive resets and
  SQLCipher encryption moved from system alerts to dialogs.
- **Upload queue**: trust surface with a three-stat summary, throughput card,
  semantic status pills, inline errors and retry-all.
- **Setup**: Token → Channel → Restore step rail, token show/hide, inline errors.
- **Lock**: larger keypad, fixed-height status area, panic wipe dialog.
- **Viewer, Map, People, Best Of, Similar, Search, Period screens, Folder sync,
  Sync, Slideshow, Compare, Share target, Photo info, Maintenance, Free up
  space, Remote, Destinations**: shared app bars, empty states, responsive
  grids and accessibility labels.

### Accessibility
- Every interactive element has a role, a label where needed, and a state.
- Progress and upload status announce via live regions.
- Decorative images are hidden from TalkBack.
- Arabic RTL mirrors back/chevron icons; logical padding is used throughout.
- Reduced-motion is honoured (skeleton pulse removed, theme fade skipped).

### Notes
- 78 system alerts remain; all are informational, error reports or OS-level
  prompts, except a few multi-choice confirmations still queued for migration.
- Device verification of this release was limited to the Gallery chrome because
  the dev-client bundle cache could not be refreshed in the build session.

## [1.2.0] - remote, multi-device & engineering wave

### Remote control & multi-device
- **Admin roles** - channel posts stay owner/admin; allowlisted Telegram
  user ids can DM the bot with `read`, `write` or `admin` roles. Destructive
  commands (`/delete`, `/wipe`, `/revoke`) require admin.
- **Inline keyboards** - paginated `/find`, delete confirmation, wipe
  confirmation, album picking, status/queue/stats/devices buttons.
- **New commands** - `/queue`, `/devices`, `/revoke`, `/unrevoke`, and
  per-device `/pause <id>` / `/resume <id>`.
- **Device management** - device list with counts/last upload, rename,
  pause/revoke this phone; revocation is cooperative and documented.
- **Webhook mode** - optional self-hosted HTTPS relay (Cloudflare Worker
  example in `docs/WEBHOOK_RELAY.md`); switch back to polling removes it.
- **Public read-only sharing** - create channel invite links and export a
  standalone HTML index of the archive.
- **Channel merge** - copy a source channel's pinned index via Telegram
  `copyMessage` (no re-upload), remap message ids and merge albums.
- **Multi-device index sync** - Lamport-clock last-write-wins for favorites,
  tags, album membership/name and covers. Ops travel as chunked `#sync_ops`
  documents; conflicts are recorded and resolvable from Settings.

### Performance & engineering
- **Crash/ANR reporting (opt-in)** - queued JS crashes and main-thread stalls
  POST to a user-configured HTTPS endpoint with the last diagnostics entries.
- **Startup profiling** - module/settings/db/nav marks stored per cold start
  and shown in Settings; heavy screens are lazy-loaded.
- **Thumbnail prefetch** - warms the first 24 Telegram previews with bounded
  concurrency.
- **Maestro smoke** - viewer + Remote & sharing flows, testIDs, and a
  manual/PR emulator workflow.
- **Backup schema guard** - tests compare `importAllData` columns against the
  schema/placeholders, assert `SELECT *` export, and fuzz the queue sanitizer.
- **EAS Update** - `expo-updates` installed, appVersion runtime policy,
  preview/production channels, manifest meta-data and docs.
- **Release automation** - tag-triggered workflow builds an EAS APK and
  publishes the APK + `latest.json`.
- **Signing preflight** - `npm run release:check-signing` verifies the local
  keystore files and prints the `eas credentials` upload step.
- **SDK 58** - target matrix and prebuild caveats documented; the upgrade is
  deliberately left to a native build window (see below).

### Not executed in this wave
- **SDK 58 upgrade** - requires regenerating the committed `android/` tree
  (RN 0.88.1, React 19.3, Reanimated 4.7.1/Worklets 0.13, Gesture Handler 3.3).
  A blind prebuild would drop the icon aliases and OpenSSL dependency; the
  exact target versions and migration order are in `docs/SDK58_MIGRATION.md`.
- **Stable keystore upload** - owner action (`eas credentials`); the preflight
  script and docs are ready.
- **FlashList swap** - image prefetch landed instead; a list swap is deferred
  until device profiling.

## [unreleased] - UI, privacy & platform wave

### Gallery & viewing
- **Pinch-to-zoom grid** - two-finger pinch reflows the gallery between 2 and 6
  columns; the choice persists.
- **Slideshow / screensaver** - full-screen cross-fade auto-advance with
  play/pause, previous/next, 3-15 s interval, optional shuffle and FLAG_SECURE.
  Entry points in Collections and album/favourites/trip headers.
- **Compare mode** - select exactly two photos to open independent pinch/pan
  panes (side-by-side in landscape, stacked in portrait), double-tap resets.
- **Album drag-reorder** - Collections gains a Reorder mode with long-press
  drag rows; order persists in `albums.sort_order`.
- **2x2 album cover mosaics** - album cards show up to four newest member
  previews, falling back to the curated/newest single cover.
- **Tablet / foldable / DeX** - a 720 dp breakpoint enables a master-detail
  gallery: tapping a tile previews it in a right-hand pane with Open.

### Security & privacy
- **SQLCipher** - opt-in encryption of the local index. The 256-bit key lives
  in Android Keystore via SecureStore; Settings re-encrypts the current
  database in place and verifies it. The key is never part of channel backups.
- **Recovery key** - a one-time 32-character Crockford base32 key wraps the
  backup passphrase; Settings can create/regenerate it and unlock a forgotten
  passphrase before restoring.
- **Passphrase rotation** - verifies the current passphrase against the pinned
  backup, re-encrypts the index with the new one and re-pins it; media is not
  re-uploaded. The old recovery key is invalidated.
- **Decoy connection** - a decoy session can use a separate bot token and
  channel, and Collections shows configurable fake album names instead of an
  empty list.
- **Panic wipe** - optional 2.5-second long-press on the lock-screen title
  erases the local index, cached media, SecureStore secrets and prefs. The
  channel archive is untouched.
- **Certificate pinning** - Android network-security-config pins
  api.telegram.org and api.github.com (leaf + intermediate + root, plus a
  backup root for GitHub); cleartext traffic is disabled.

### Platform & appearance
- **Icon colour and shape variants** - seven palettes x four foreground insets
  (default/rounded/squircle/circle) generate 26 launcher aliases.
- **Localization / RTL** - English, Hindi, Malayalam, German, Spanish and
  Arabic for tabs, settings sections, gallery chrome, collections and common
  actions; Arabic switches the layout to RTL after a restart.
- **Extra widgets** - On this day, 2x2 Photo mosaic, Quick capture (camera to
  upload queue) and a Slideshow launcher widget.
- **Share/quick-capture staging fix** - `enqueueUploads` now honours a staged
  `local_uri`; share-target and camera captures are not MediaLibrary ids.

## [unreleased] - customization/security continuation

### Models & people
- **Models mirrored** to the project's `models-v1` GitHub release (stable
  URLs): BlazeFace 230 KB, MobileFaceNet 5.0 MB, MobileNetV3-Small 9.7 MB,
  ImageNet labels 10 KB. Still downloaded on demand, never bundled.
- **People rename** — long-press a person card, name the cluster; the name is
  stored in the `people` table and travels with backups.
- **Automatic or manual ML** — new `autoMlIndex` switch (Settings → On-device
  AI) runs a small scene/face batch after scans when models are present;
  Maintenance keeps the manual controls.

### Security
- **Locked-album leak fix** — photos in a locked album are now excluded from
  search, memories, map, period views (counts + covers), person albums and the
  widget. Previously only the album grid itself was gated.
- **Passphrase strength meter** — length/variety score with concrete tips under
  the encrypted-backup passphrase field.
- **Diagnostics export** — Settings → Diagnostics shares a JSON file with the
  diagnostics ring buffer and break-in log (no photos/tokens/channel ids).

### UI
- **Notification controls** — per-type toggles (progress, complete, failed) and
  an optional quiet window (default 22:00–07:00).
- **Invert selection** in the gallery and album selection bars.
- **Tile accessibility labels** — TalkBack announces filename/favorite/backed-up
  state for gallery, local-roll and album tiles.
- **Theme cross-fade** — 220 ms fade when the theme or accent changes.
- **System font family** — System / Serif / Condensed / Mono via the ScaledText
  wrapper (explicit per-style families are preserved).

## [unreleased] — search, AI & organization wave

### On-device models (download on demand, not in the APK)
- **Model manager** — BlazeFace short-range (face detection), MobileFaceNet
  (192-d face embeddings), MobileNetV3-Small (scene labels) and ImageNet labels
  live in the app's document directory and are downloaded from Settings →
  On-device AI (~17 MB total). Custom per-model URLs are supported; nothing is
  bundled, so the APK stays small.
- Runtime: `react-native-fast-tflite` 3.0.1 + `react-native-nitro-modules`
  0.37.2; JPEG decode via `jpeg-js`. **Native rebuild required.**
- **People** — `faceMath` (896-anchor BlazeFace decode + NMS, 7 tests) and
  `faceEngine` (detect → crop → embed → cosine/union-find clusters) write the
  `people` / `face_embeddings` tables. Maintenance → On-device AI → **Build
  people index**; the People screen lists the clusters and their photos.
- **Scene tags** — on-device MobileNetV3 writes `scene:<label>` tags; opt-in
  Gemini vision writes `gemini:<label>` tags. Both feed full-text search.
  Settings → On-device AI stores a separate tagging API key (falls back to the
  captioning key).
- **Validation caveat:** the model URLs, input normalization and output tensor
  order are implemented but not yet verified on hardware. The pipeline fails
  soft (diagnostics + empty results) rather than crashing.

### Search & organization
- **Ask your photos** — a chat screen (Collections → Ask your photos) that
  builds a compact index of candidates (FTS → semantic → recent), asks Gemini
  with the user's key, and renders `[id]` citations as tappable thumbnails.
- **Offline natural-language dates** — `today`, `yesterday`, this/last
  week-month-year, `last summer`, month + year, `before/after`, `from X to Y`,
  Christmas, `last N days/weeks/months` and bare years. The AI sparkle applies a
  date range locally without a Gemini call.
- **Album auto-add rules** — folder contains / tag contains / favorites only,
  configured from the album style dialog and applied after every
  `runSyncNow` scan (idempotent).
- **Best of** — a Collections screen ranking the last year (or the whole
  library) by favorite, resolution and size; the duplicate finder now keeps the
  **best** copy of each group instead of an arbitrary row.
- **OCR** — Gemini extracts text in any language/script without translating; the
  info sheet shows it selectable with a **Share text** button.
- **Search history & suggestions** — recent searches appear as chips under the
  search box (tap to rerun, Clear to reset); a Levenshtein "did you mean" chip
  appears on empty results.
- **Places** — Indian cities now show their state (Kochi, Kerala; Mumbai,
  Maharashtra); other cities keep the country.

## [unreleased] — next release (top-10 wave)

### Backup reliability
- **Upload queue persistence** — database backups (format v2) now carry
  pending/running/failed queue rows; a restore on the same device resumes the
  queue instead of re-scanning blindly. A pure sanitizer caps at 5,000 rows,
  keeps one row per local id, turns `running` back into `pending`, and drops
  stale backoff.
- **Split-video self-repair** — repair now clears a broken `parts` chain and
  re-uploads from the local file (previously skipped as unrepairable). New part
  records carry their `message_id`, so the repair can delete the old part
  messages best-effort.

### Security
- **FLAG_SECURE in viewer/lock** (Settings → Privacy → Block screenshots) —
  blocks screenshots and recents thumbnails while a private photo or the lock
  screen is visible. Native change; takes effect in the next build.
- **Auto-lock timeout** — Immediately / 30 s / 1 min / 5 min after
  backgrounding, instead of always locking instantly.

### Gallery & organization
- **Sticky date headers** — a floating header follows the day-view scroll,
  shows the photo count, and taps back to the top.
- **Offline reverse geocoding** — a ~170-city gazetteer labels map clusters,
  photo info and trip stories with "City, Country" (coordinates fallback).

### Remote control
- **Inline keyboards** — `/status` and `/help` carry Sync/Pause/Resume/Stats/
  Queue buttons; callback presses are authorized via `getChatAdministrators`
  (channel admins only, 5-minute cache).
- **New commands** — `/help`, `/ping`, `/last`, `/search` (alias of `/find`),
  `/favorite` (reply toggle) and `/album <name>` (reply add/create).

### Diagnostics & testing
- **Crash log** — uncaught JS errors are recorded in the on-device diagnostics
  ring buffer (`[crash]`, message + first frames), with no network or
  third-party SDK.
- **Maestro smoke flow** — `.maestro/smoke.yaml` + `docs/TESTING.md` cover
  launch → Settings/Appearance → Collections → Gallery.

### Foundations (next build / model)
- **People clustering** — pure cosine + union-find engine, `people` /
  `face_embeddings` schema, People screen and Collections entry. The
  face-embedding model is the remaining piece; the empty state says so.
- **Video compression** — planner (target geometry/bitrate, 5% savings floor)
  and Off/720p/1080p setting. The native transcoder is the next-build piece.
- **Release keystore** — `docs/RELEASE.md` now targets uploading
  `pb-release.keystore` to EAS; `npm run release:resign` re-signs an APK for
  in-place updates (used to install 1.1.0 over the debug build without data
  loss).
- **SDK 57 patch refresh** — `expo` 57.0.32, `expo-notifications`/`expo-sharing`
  57.0.25, etc. The SDK 58 major upgrade is planned in
  `docs/SDK58_MIGRATION.md` and awaits a build window.

## [1.1.0] — customisation

A look-and-feel release: 21 appearance and layout controls, most of them
reachable from Settings → Appearance.

### Theme & colour
- **Accent colour picker** — eight presets plus a custom `#RRGGBB` field. The
  accent drives the primary buttons, chips, tab bar, selection bar and upload
  banner. Containers/foregrounds are derived with a luminance-aware blend so
  light and dark modes stay legible.
- **Dark / AMOLED / Light / Auto** plus an optional **scheduled theme**
  (dark at night, light by day, with editable 30-minute start/end steps).
  AMOLED stays AMOLED through the night half of the schedule.
- **Per-album accent colour** — the album header gains a colour dot that opens
  an “Album style” dialog (accents + reset cover). Chosen accents also tint the
  album cards in Collections.
- **Custom in-app name** — renames the gallery header, splash, setup, lock
  screen, share sheet and About card. (The Android launcher label remains a
  build-time `strings.xml` value.)

### Gallery layout
- **Grid density** — 2 / 3 / 4 / 5 columns.
- **Aspect-ratio modes** — square tiles or natural aspect, plus a **compact
  grid** with tighter gaps.
- **Date-section headers** — photo counts per date, plus a draggable
  **date scrubber** on the right edge of the day view that jumps to a section.
- **Tile badge toggles** — cloud ✓, video ▶, favourite ♥ and failed-upload !
  can each be hidden independently.
- **Cover-photo curation** — long-press a photo in an album → “Set as cover”,
  and “Reset cover to newest” from the album style dialog (the existing
  selection-bar Set cover still works).

### Surfaces & chrome
- **Map style picker** — standard / satellite / hybrid / terrain.
- **Viewer chrome auto-hide** — Google Photos-style timed hiding with a
  2 / 3 / 5 / 8 second delay, or keep it always on.
- **Photo info density** — compact (hides empty/low-value rows) or detailed.
- **Empty-state illustrations** — themed inline artwork for empty gallery,
  search, album and trash screens.
- **Loading skeletons** — pulsing placeholders while cloud thumbnails load.

### Widget & notifications
- **Widget appearance** — date overlay on/off and a compact layout; the widget
  also switches to compact automatically at small sizes.
- **Notification accent colour** — upload progress/completion/failure
  notifications are tinted with the current accent.

### Typography & locale
- **Font scale** — Small / Default / Large / Extra large, applied app-wide via
  a Text wrapper (all UI text, including nested text).
- **Date format** — System / `31.12.2026` / `12/31/2026` / ISO, used by gallery
  headers, saved-search results and channel captions.
- **Caption template editor** — include/exclude and reorder every metadata line
  in the channel caption (the content hash is always kept for restore/dedupe).

### Branding
- **App icon variants** — Default / Accent / Monochrome launcher icons via
  Android activity-aliases and a native `setAppIcon` toggle.
- **Accent splash** — the in-app cold-start screen can match the accent colour
  and uses the custom app name.

### Testing & docs
- New `tests/customisation.test.mjs` (20 checks) covers schedule resolution
  (including midnight wrap), colour math, accent validation, date formats,
  album accents and caption field filtering/ordering/hash-keeping.
- Version bumped to **1.1.0 / versionCode 3**.

## [unreleased] — repository tooling

No shipped-feature changes yet — all of this is no-phone, code-only work.

- Committed the Node test suite (`tests/*.test.mjs`) — the eleven `.tmp-harness`
  checks plus new `pure-logic` (real `vecmath`/`pbkdf2`/`autotags`/`format`/
  `caption`/`trips`/`phash` modules) and `invisible-chars` regression tests for
  the R34 U+200B SQL bug. `npm test` runs each file in its own process; CI
  (Node 24) runs typecheck, tests, a critical-level audit gate, a Metro bundle,
  and an expo dependency-drift check.
- Second review sweep hardened real bugs: per-update isolation in channel
  polling (a single poison update could stall polling forever), overnight scans
  no longer advance `lastFullSyncAt` early, background/overnight tasks resume a
  pending queue even on an empty scan, `savePrefs` is serialized (two quick
  toggles could drop a patch), camera-watch events arriving mid-scan are
  retried, destination rule blobs reject array-shaped tampering, empty videos
  are rejected before upload, and the release publisher requires a real `.apk`,
  detects DRAFT tag collisions, and falls back to git credentials for its token.
- Documentation: `docs/ARCHITECTURE.md`, `docs/DEPENDENCIES.md` (audit state —
  the only non-major-fixable advisories are already at their best versions; the
  rest require Expo SDK 58), `docs/STORE.md` (privacy policy + store copy +
  production AAB steps), `SECURITY.md`, `CONTRIBUTING.md`, issue/PR templates, and
  Dependabot.
- Removed the stale draft release `v1.0.0-preview.1` (pre-R37 APK, invisible to
  the updater).
- README: added a "Backup & restore explained" section (channel-as-archive vs
  encrypted index backup, and the per-photo / bulk / new-phone migration restore
  paths), and refreshed the CI badge.

## [1.0.0] — preview

First build with an installable, EAS-signed APK. Android only; iOS configuration
exists but is untested.

### Backup and restore
- Photo backup sends a compressed preview plus the untouched original as a
  document, with a metadata caption (date, size, camera, GPS, tags) to your own
  Telegram channel.
- Video backup (beta) splits files into ~19 MB parts and reassembles them on
  restore; playback and sharing work from the in-app viewer.
- Automatic backup with a camera watcher, Wi-Fi/charging-only gates, a
  low-storage guard, per-folder include/exclude rules and an overnight
  catch-up window.
- Encrypted database backups (AES-256-GCM, PBKDF2-HMAC-SHA256 600k) pinned in
  the channel, with an optional bot token inside the backup for a fresh device.
- Restore rebuilds the index from the pinned backup and relinks local files by
  hash instead of re-uploading them.
- Album-, favorites- and trip-scoped restore fills gaps without duplicates.

### Library and search
- Gallery with dates, months/years jump lists, memories ("on this day") and a
  paginated local roll that mirrors the phone's own gallery.
- Full-text search over filenames, folders, tags, cameras and AI captions, plus
  OCR text extracted from screenshots; structured filters (date range, media
  type, device, location, not-backed-up, size/date sorting) and saved searches.
- Semantic search over Gemini embeddings, used as a fallback when word search
  finds nothing.
- Perceptual-hash tooling: near-duplicate finder, "find similar" in the viewer,
  and an upload guard that skips re-saves and recompressions of photos already
  backed up.
- Albums, favorites, trash, trip albums generated from GPS/time clusters, and
  curated album covers with narrative trip summaries.

### Security and privacy
- App lock with biometrics, a PIN and a decoy PIN that opens an empty library.
- Failed-unlock backoff and a break-in log (failed PINs, hard biometric
  rejections, decoy unlocks).
- Remote control from the channel: `/status`, `/stats`, `/sync`, `/pause`,
  `/resume`, `/delete`, `/find`, `/restore` and a two-step `/wipe` that erases
  local copies while the channel archive survives.

### Tools
- Maintenance: backup verification, integrity checks, self-repair from local
  copies, duplicate cleanup, free-up-space batches, screenshot sunset, channel
  dedupe, OCR and motion-clip backfills, diagnostics log.
- Monthly ZIP export, full index CSV export and per-photo/per-version restore.
- Home-screen widget (all photos or favorites only) and an in-app updater fed by
  GitHub Releases.

### Fixed in this build
- The share target never resolved: Expo's intent-filter plugin was given
  fully-qualified action names, producing
  `android.intent.action.android.intent.action.SEND`. Sharing a photo to
  PhotogramBot now opens the upload sheet.
- The near-duplicate guard re-enqueued the same photo on every scan; it now
  marks the photo itself, and turning the guard off releases skipped photos
  instead of stranding them.
- Backup restore dropped `ocr_text` and `motion_checked` (screenshot search and
  motion-backfill markers), carried per-device state such as the remote
  `/pause` flag to a new phone, and left the stale upload queue and embedding
  index behind on a replace-restore.
