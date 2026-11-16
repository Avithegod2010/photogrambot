# UI Migration Progress

Last updated: 2026-11-11 (UI overhaul session).

Legend: ✅ migrated · 🟡 partially migrated (chrome done, body still legacy) ·
⬜ not started · n/a not visual.

## Foundation

| Item | Status |
| --- | --- |
| Token scales in `src/theme.ts` (spacing/radius/type/motion/touch/status/overlay/fallback) | ✅ |
| Accessible primitives in `src/components/ui.tsx` (+13 new components) | ✅ |
| Reanimated press feedback (120 ms, reduced-motion aware) | ✅ |
| `useReducedMotion()` hook | ✅ |
| `ErrorBoundary` + recovery screen | ✅ |
| `Skeleton` infinite pulse removed | ✅ |
| Static guard `tests/ui-system.test.mjs` | ✅ |

## Core screens

| Screen | Status | What changed |
| --- | --- | --- |
| `SetupScreen` | ✅ | Step rail (Token → Channel → Restore), one primary action per step, show/hide token, inline live-region errors, privacy footer, 48 dp targets |
| `LockScreen` | ✅ | App bar-less centred layout, 68 dp keypad, dot row, live-region status, panic wipe moved from Alert to Dialog, no layout shift |
| `GalleryScreen` | ✅ | AppBar-style chrome, SegmentedControl, 48 dp chrome, measured sticky header (hidden until first section scrolls under), progress banner with ProgressBar, EmptyState for both rolls, selection bar + overflow Sheet, trash confirmation Dialog |
| `CloudTab` / `LibraryScreen` | ✅ | Same AppBar/segments language, responsive 3/5/6 columns, EmptyState with backup-settings action, accessible tiles |
| `CollectionsScreen` | ✅ | AppBar + segments, responsive 2/3/4 album grid, cover mosaics, long-press menus moved to Sheets, trash tab with Sheet/Dialog confirms, "Explore" list rows instead of card soup, 56 dp rows |
| `ViewerScreen` | ✅ | Full-screen canvas, icon chrome, 52 dp actions with labels/state, live-region counter, responsive dimensions, media overlay tokens |
| `SettingsScreen` | 🟡 | AppBar + **search field** with section jump index, section anchors, reset + SQLCipher moved to Dialogs. Rows still use legacy Card/partial styles in some sections (all functional). |
| `UploadQueueScreen` | ✅ | Trust surface: AppBar, 3-stat summary, throughput card, StatusPill rows, inline error banner (no Alert), EmptyState, retry-all footer |

## Other screens

| Screen | Status | Notes |
| --- | --- | --- |
| `SearchResultsScreen` | ✅ | AppBar, EmptyState, accessible tiles |
| `MapScreen` | ✅ | Floating app bar pill, EmptyState card, place sheet, accessible markers (was 0 labels) |
| `PeopleScreen` | ✅ | AppBar, responsive cluster grid, EmptyState, Dialog |
| `BestOfScreen` | ✅ | AppBar, responsive grid, favourite badge, EmptyState |
| `SimilarScreen` | ✅ | AppBar, responsive grid, EmptyState |
| `AskScreen` | 🟡 | AppBar done; message bubbles still legacy |
| `CompareScreen` | 🟡 | Header + EmptyState done; panes legacy (functional) |
| `SlideshowScreen` | ✅ | Icon controls, 48 dp, a11y labels/states, overlay tokens |
| `PeriodScreens` | ✅ | AppBar, responsive month grid, EmptyState, responsive photo grid |
| `MaintenanceScreen` | 🟡 | AppBar done; long card stack still legacy |
| `FreeUpSpaceScreen` | 🟡 | AppBar + EmptyState done; list body legacy |
| `FolderSyncScreen` | ✅ | AppBar, switch rows with single TalkBack stop |
| `DestinationsScreen` | 🟡 | AppBar done; body legacy |
| `RemoteScreen` | 🟡 | AppBar done; body legacy |
| `SyncScreen` | 🟡 | AppBar done; body legacy |
| `ShareTargetSheet` | 🟡 | Close icon + labels + responsive tiles; sheet shell legacy |
| `PhotoInfoSheet` | 🟡 | Modal semantics + responsive map; cards legacy |
| `ErrorBoundary` | ✅ | New recovery state |

## Known remaining work

1. **Settings body rows**: some sections still use ad-hoc `Text` rows rather than
   `ListRow`. Heights mostly hit 56 dp already; a follow-up pass should convert
   them for consistency.
2. **Ask / Compare / Maintenance / FreeUpSpace / Destinations / Remote / Sync
   bodies** still use legacy card internals. They build, are labelled where
   interactive, and use theme colour; they are not yet visually identical to the
   new language.
3. **Static `Alert.alert`**: 80 remaining, all informational or OS-level except a
   handful of multi-choice confirmations in Maintenance/Remote. See the guard
   output (`npm test -- ui-system`) for the live count per screen.
4. **i18n**: new Gallery strings use `tr()`; new strings on secondary screens are
   English-only. `src/lib/i18n.ts` has the keys ready for translation.
5. **Device verification is partial.** One screenshot of the new Gallery chrome
   was captured on the connected SM-S942B (segmented view switch, pill search
   field, progress banner, edge-to-edge grid). The dev client then kept serving
   a cached bundle: Metro's file-map watcher died (`Failed to start watch mode`,
   the known 8 GB-box issue), the old 8081 listener became a zombie socket, and
   a fresh Metro on 8082 never received a bundle request from the client.
   Remaining device work: force a clean Metro + dev-client reload, then capture
   Collections, Settings, UploadQueue, Lock, Setup, Viewer, Map and the empty/
   error states; run the TalkBack walk; test all four font scales, light/AMOLED,
   three accents + a custom accent, and Arabic RTL; run `npm run test:e2e`
   (Maestro) with the phone unlocked.

## Verification performed

> **2026-11-17 — first real UI verification on hardware (1.4.0 / versionCode 6,
> installed build, `com.photogrambot.app`, firstInstallTime untouched at
> 2026-08-30 19:18:11).** Driven over wireless adb by bounds from
> `uiautomator dump`, screenshots reviewed frame by frame.
>
> **Verified working:**
> - **M3 navigation bar active indicator** — the tonal pill sits behind the
>   active tab icon and moves correctly between Gallery / Cloud / Collections /
>   Settings.
> - **M3 switches** — ON renders green with the trailing check mark, OFF is the
>   grey track + white thumb.
> - **Segmented controls** — Days/Months/Years, theme, text size, grid columns
>   all show the selected-pill treatment.
> - **Cloud tab** — grid, per-tile backed-up check, right-edge **date scrubber**
>   with month dots (Nov 2026 → Jul 2024). Cloud thumbnails load (first paint
>   shows empty tiles for a few seconds, then fill).
> - **Settings search** — typing `theme` filters to "Appearance · Jump to
>   section"; jumping works (needs a second tap when the keyboard is open).
> - **Light theme** — full light palette, cards, accent swatches, custom hex
>   field.
> - **AMOLED theme** — true-black background, white status icons.
> - **Dark theme** — restored to the device's original setting afterwards.
> - **Text size: Extra large** — every chip row reflows to multiple lines, no
>   truncation, no clipped labels. Reset to Default afterwards.
> - **Arabic RTL** — full mirror: tab bar order reversed (المعرض at the right),
>   header reversed, segmented controls reversed, Collections grids mirrored,
>   section headers translated. "Restart required" dialog is correct (Android
>   only re-lays out on the next launch). Reset to English afterwards.
> - **Reduced motion** — with all three animation scales set to 0 the app cold
>   starts and renders normally (no blank frame, no crash). Scales restored.
>
> **Issues found on hardware (all NEW, none previously known):**
> 1. **Cold start takes ~61 s.** `Settings → Maintenance → Diagnostics` reports
>    `Last cold start: 61289 ms (app-module 212ms, settings 220ms, db 61240ms,
>    nav 61289ms)` — i.e. **all of it is database init**. Reproduced on every
>    force-stop cold start. Per-step timing has now been added to `getDb()` /
>    `migrate()` (`startup_db_steps` in kv, shown in Diagnostics as "DB init:")
>    so the next build names the exact phase. Leading hypothesis is SQLite WAL
>    recovery after a force-stop during heavy upload writes, but an FTS/schema
>    rebuild running every launch is not yet excluded.
> 2. **Status bar stays light-content in Light theme** — clock, battery and
>    network icons render white-on-white (unreadable) on both the splash and
>    every light-theme screen. Needs a status-bar style that follows the
>    resolved theme.
> 3. **Cloud date labels** overlap each other when months are close ("Mar 2025"
>    over "Jul 2024") and are low-contrast white-on-bright-photo.
> 4. **Collections trip tiles** truncate the album name ("Trip · 13 Aug 2026
>    —…") and draw the label directly over the cover photo, which is hard to
>    read on light covers.
> 5. **i18n gaps in RTL** — core chrome strings stay English while section
>    headers translate: the Collections segments read "Albums · 75" / "Trash ·
>    0", tile counts read "2 photos", and the Collections title is English.
>    Contradicts the "chrome and common actions are translated" note in
>    Settings.
> 6. **Not verified remotely:** haptics feel (needs a human finger) and ripple
>    visuals (a still cannot show them).

- `npm run check` — typecheck clean, **33/33 test files pass** (including the
  new `ui-system` guard).
- Static guard — 128 files checked, no raw hex outside the allowlist, no
  `Dimensions.get`, token contract present, primitive accessibility contract
  present.
- One on-device screenshot confirms the new Gallery chrome renders (see
  `.tmp-harness/ui-gallery-observed.png`, gitignored).
- **1.3.0 build, release and install completed:** EAS build
  `7a8d3981-d318-43d8-a95c-11358ae0d427` (commit `59898af`, versionCode 5),
  re-signed with the local debug keystore, installed with `adb install -r`
  (firstInstallTime unchanged — index preserved). GitHub prerelease
  `v1.3.0-preview.1` carries the APK + latest.json.
- **1.4.0 Material You build installed:** EAS build
  `12ba03f1-0c6d-4cdd-bd08-79296704dc1d` (commit `f1b3737`, versionCode 6),
  re-signed with the local debug keystore, installed with `adb install -r`
  (firstInstallTime unchanged). GitHub prerelease `v1.4.0-preview.1` carries the
  APK + latest.json. On-device screenshot confirms the Material 3 tab indicator
  and the reserved gesture inset; haptics feel cannot be verified remotely.
- **1.4.0 local release APK built (2026-11-16, EAS quota exhausted):**
  `android/app/build/outputs/apk/release/app-release.apk`, 54.7 MB,
  `versionName 1.4.0` / `versionCode 6`, signer
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`
  (debug keystore — installs over the existing app with `adb install -r`, data
  preserved). Built in 1h 4m with `assembleRelease`, arm64-v8a only,
  R8/shrinking off, 2 workers. **Not yet installed** — the phone was in use.
  Recipe and the two pitfalls (never `--offline`; never build alongside the
  sibling project's Gradle) are in `docs/RELEASE.md` §3.
- **Not verified on device:** every other screen, TalkBack order, RTL, 200% font
  scale, accents/themes and the Maestro smoke remain owed.

