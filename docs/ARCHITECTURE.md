# Architecture overview

A concise map for contributors and AI agents. The full, chatty handover lives
in `AGENTS.md`; this is the 10-minute version.

## What it is

**PhotogramBot** backs up a phone's photos/videos to a Telegram channel the
user owns, via the Bot API. It is **not** the sibling TDLib app (`../photogram`)
— never touch that repo. Engine: `api.telegram.org`, Expo SDK 57, React Native,
SQLite (`expo-sqlite`), Zustand. Builds run through EAS cloud builds (local Gradle
builds are impractical on a small dev box — see `docs/RELEASE.md`).

## Layers

```
Telegram Bot API  <--  src/lib/telegram.ts (client)
                         ^  uploader.ts (queue/workers/backoff)
                            sync.ts (library scan, gates)
                            updates.ts (channel ingest, remote commands)
                         v
src/lib/db.ts  (SQLite schema, migrations, queries, FTS)
src/store/*    (Zustand: library, settings, setup, upload)
src/screens/*  (Gallery, Viewer, Collections, Settings, Maintenance, …)
App.tsx        (bootstrap, polling, navigation)
```

### Core library modules (`src/lib/`)
- `telegram.ts` — Bot API client, long-polling `getUpdates`, media download.
- `uploader.ts` — queue, workers, preview generation, AI captions, video splits.
- `sync.ts` — MediaLibrary scanning, auto-sync gates (Wi-Fi/charging/storage/
  remote-pause), version-history detection.
- `db.ts` — schema + migrations; every query lives here. SQLite is the source of
  truth; the channel is the backup destination.
- `updates.ts` — ingests channel posts (multi-device restore, mirror copies) and
  dispatches remote commands. **One bad update can no longer stall polling** (it
  is isolated per-update and logged to Diagnostics).
- `secretbox.ts` — `pbgcm2` encrypted backups (PBKDF2-HMAC-SHA256 600k); `pbgcm1`
  kept byte-exact as decrypt-only for legacy blobs.
- `updater.ts` / `updaterLogic.ts` — in-app updater; picks the newest release
  that carries an `.apk` asset (drafts skipped).
- Pure logic (no RN imports, directly unit-tested): `vecmath`, `pbkdf2`,
  `autotags`, `format`, `caption`, `trips`, `phash`, `motionScan`.

### Stores (`src/store/`)
`useLibraryStore`, `useSettingsStore`, `useSetupStore`, `useUploadStore`.

### Screens (`src/screens/`)
Gallery, Viewer, Collections, Setup, FolderSync, Lock, Map, Period, Maintenance,
UploadQueue, Settings, Destinations.

## Data flow

1. **Backup.** `sync.ts` scans MediaLibrary → `uploader.enqueueUploads` → workers
   send preview + original to Telegram with a metadata caption → row marked
   `uploaded`.
2. **Restore / multi-device.** `updates.ts` polls the channel, maps message ids
   back to `photos` rows; `restore.ts` reassembles split videos.
3. **Remote control.** Admin posts `/status` `/sync` `/pause` `/resume`
   `/delete` `/find` `/restore` `/wipe` in the channel; `remote.ts` acts on them.

## Testing

- `npm test` runs `tests/*.test.mjs` — each file in its own Node process. Pure
  modules are imported directly (Node 24 strips types; `tests/ts-resolve-hook.mjs`
  resolves the extensionless relative imports Metro uses).
- `npm run typecheck` runs `tsc --noEmit`.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests, `npm audit --audit-level=critical`,
  a Metro bundle, and an expo-dependency drift check on Node 24.

## Hard rules

- Work only in this folder. Never read/write the sibling TDLib repo.
- Never commit secrets (bot token, channel id, Expo token, keystore).
- Device verification is the critical path; most features are "code-only" until
  run on hardware (see `AGENTS.md`'s checklist).
- Ideas sessions and coding sessions are separate — don't implement without sign-off.
