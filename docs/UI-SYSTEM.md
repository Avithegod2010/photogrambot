# PhotogramBot UI System

Status: implemented in `src/theme.ts` + `src/components/ui.tsx`.
This document is the contract. Screens that deviate are considered unfinished.

---

## 1. Principles

1. **Photos are the interface.** Gallery and Cloud are edge-to-edge grids. Chrome
   floats, recedes, and never boxes the media in.
2. **Colour belongs to the user.** Every colour comes from `useTheme()` — static
   dark/AMOLED/light, Material You, or a custom accent. Nothing in a screen
   declares a brand colour.
3. **Type does hierarchy, space does grouping.** Cards only when a group is real.
4. **Calm defaults, one moment per screen.** Utility screens stay quiet. Delight
   is reserved for Memories, Slideshow, Compare and Best Of.
5. **Nothing communicates by colour alone.** Every status is icon + text + colour.

---

## 2. Token table

All tokens are exported from `src/theme.ts`.

### Spacing — `spacing`

| Token | Value | Use |
| --- | --- | --- |
| `seam` | 2 | Photo-grid seams only |
| `xs` | 4 | Icon-to-label, tight pairs |
| `sm` | 8 | Inside chips, list row gaps |
| `md` | 12 | Card padding on compact rows, grid gaps |
| `lg` | 16 | Screen gutter, card padding |
| `xl` | 24 | Section separation, dialog padding |
| `xxl` | 32 | Page-level breathing room, empty states |

### Radius — `radius`

| Token | Value | Use |
| --- | --- | --- |
| `thumb` | 4 | Photo thumbnails (kept sharp) |
| `control` | 12 | Inputs, tonal blocks, small cards |
| `card` | 16 | Group cards, album tiles |
| `sheet` | 24 | Bottom sheets, dialogs |
| `pill` | 999 | Buttons, chips, badges, tabs |

### Type — `typography`

| Token | Size / line / weight | Use |
| --- | --- | --- |
| `display` | 30 / 36 / 700 | Setup hero, first-run title |
| `headline` | 24 / 30 / 700 | Large numeric / hero |
| `title` | 20 / 26 / 700 | Screen titles, app bar |
| `section` | 17 / 22 / 600 | Section headers, dialog titles |
| `body` | 15 / 21 / 400 | Primary readable text |
| `bodyStrong` | 15 / 21 / 600 | Row titles, buttons |
| `small` | 13 / 18 / 400 | Supporting text |
| `smallStrong` | 13 / 18 / 600 | Emphasised supporting text |
| `label` | 12 / 16 / 600 | Section labels, chips |
| `caption` | 11 / 14 / 500 | Metadata, counters |
| `badge` | 10 / 12 / 700 | Tiny photo badges only |

Closed set of sizes: **10 · 11 · 12 · 13 · 15 · 17 · 20 · 24 · 30**.
Weights: **400 · 500 · 600 · 700**. No half-point sizes.
`ScaledText` multiplies `fontSize`/`lineHeight` by the Appearance font scale, so
tokens stay the single source even at 200%.

### Motion — `motion`

| Token | Value | Use |
| --- | --- | --- |
| `fast` | 120 ms | Press feedback |
| `base` | 180 ms | State change (selection, chip, compare reset) |
| `slow` | 240 ms | Theme fade, navigation-scale transitions |
| `easing` | `[0.2, 0, 0, 1]` | Standard decelerate curve |

Rules: never longer than 300 ms for UI; animate `transform`/`opacity` only;
respect `useReducedMotion()`.

### Touch — `touchTarget`

`48` dp. Every pressable is at least this. `hitSlop` may only extend a target.

### Status — `StatusKind` + `STATUS_LABELS`

`local · queued · uploading · backed_up · failed · restored · duplicate`.
`statusColor(theme, kind)` maps to `onSurfaceVariant · primary · success · error`.
Rendered by `StatusPill` (dot + label) or `Badge` (tonal pill). Queue rows,
gallery badges, info sheet and digests all use this vocabulary.

### Overlay / fallback

- `overlay.*` — ripple, scrims, on-media white, media canvas, skeleton wash.
- `fallback.*` — literal strings for APIs that reject `PlatformColor`
  (tab tints, SVG `color` props). These are the only approved hex values.
- `elevation.floating` / `elevation.sheet` — the only shadows in the system.

---

## 3. Component inventory (`src/components/ui.tsx`)

| Component | Contract |
| --- | --- |
| `Button` | role=button, label defaults to title, 48 dp, pressed scale, busy/disabled state, variants filled/tonal/outlined/text/danger |
| `IconButton` | **required** `label`, 48 dp, selected + disabled state, ripple |
| `Card` | tonal group; `onPress` requires a label (defaults "Open") |
| `ListRow` | title/subtitle/leading/trailing/chevron, 56 dp, role=button, destructive variant |
| `TextField` | label→accessibilityLabel, hint, inline error with live region, selectionColor |
| `SearchField` | rounded search input with clear button |
| `ToggleRow` | role=switch, checked state, whole row toggles, visual-only switch |
| `Chip` | selectable pill, selected state, 48 dp effective target |
| `Dialog` | modal, `accessibilityViewIsModal`, hardware back, title as header, action list |
| `Sheet` | bottom sheet, scrim, grabber, close button, safe-area bottom, max height |
| `SectionLabel` | role=header, optional action, optional `onLayout` (settings jump) |
| `Section` | label + optional action + children |
| `SegmentedControl` | role=tablist/tab, selected state |
| `Divider` | hairline, RTL-aware inset |
| `Screen` | themed surface + optional safe top |
| `AppBar` | 48 dp back, title (role=header), subtitle, right slot, safe top |
| `Badge` | tonal label with optional icon, never colour-only |
| `StatusPill` | semantic status: dot + text |
| `ProgressBar` | role=progressbar, accessibilityValue |
| `Stat` | label/value/hint, spoken as one string |
| `EmptyState` | title + why + primary/secondary action + art |
| `ErrorState` | error tone, what happened, retry |
| `useReducedMotion` | system reduce-motion flag (root hook) |

Skeleton (`Skeleton.tsx`) is now a one-shot fade, not an infinite pulse.

---

## 4. Screen rules

- Every screen starts with `Screen`/`AppBar` or a media canvas. Titles use
  `typography.title`; no per-screen title sizes.
- Loading → skeleton or spinner. Empty → `EmptyState` with a next action.
  Error → `ErrorState` with retry. Never a blank screen.
- Destructive or multi-choice confirmations use `Dialog`/`Sheet`. `Alert.alert`
  is reserved for OS-level flows (permission, share sheet, unrecoverable error).
- Selection bars: count + 3 primary actions + overflow + cancel. 48 dp each.
- Settings rows are 56–64 dp and grouped by real meaning, not by widget type.
- Decoy sessions never render real names, counts, chips or accessibility labels.

## 5. Static guard

`tests/ui-system.test.mjs` fails on:

- raw hex colours outside `src/theme.ts` (allowlist: accent presets, static
  fallbacks, public HTML export, widget remote views)
- `Dimensions.get(...)` anywhere in `src/`
- missing token exports or type sizes outside the closed set
- missing primitive accessibility contracts

It also prints the remaining `Alert.alert` count per screen so the migration is
visible.
