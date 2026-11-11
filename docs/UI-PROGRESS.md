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

- `npm run check` — typecheck clean, **33/33 test files pass** (including the
  new `ui-system` guard).
- Static guard — 128 files checked, no raw hex outside the allowlist, no
  `Dimensions.get`, token contract present, primitive accessibility contract
  present.
- One on-device screenshot confirms the new Gallery chrome renders (see
  `.tmp-harness/ui-gallery-observed.png`, gitignored).
- Not verified on device: every other screen, TalkBack order, RTL, 200% font
  scale, accents/themes, Maestro smoke.

