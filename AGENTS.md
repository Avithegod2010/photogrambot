# PhotogramBot — Agent Ownership Rules

This folder (`E:\Opencode CLI\Projects\photogram-bot`) is **PhotogramBot**, the Telegram Bot API version.

- Engine: Bot API via `api.telegram.org` — bot token + channel id configured in-app
- Package name: `com.photogrambot.app`
- Sibling folder: `..\photogram` is a DIFFERENT app (TDLib version) owned by another agent

## Strict rules for ANY AI agent working in this folder

1. **Boundary:** Work ONLY inside this folder. Never read, write, move, or delete anything inside `E:\Opencode CLI\Projects\photogram`.
2. **Your architecture lives here** — continue building on it, do not replace it with TDLib:
   - `src/lib/telegram.ts` (Bot API client), `uploader.ts`, `sync.ts`, `backup.ts`, `maintenance.ts`
   - `src/screens/GalleryScreen.tsx`, `SetupScreen.tsx`, `ViewerScreen.tsx`, `FolderSyncScreen.tsx`, `CollectionsScreen.tsx`, `LockScreen.tsx`, `MapScreen.tsx`, `PeriodScreens.tsx`, `MaintenanceScreen.tsx`
   - stores: `useLibraryStore`, `useSettingsStore`, `useSetupStore`, `useUploadStore`
   - widget files at root: `RandomPhotoWidget.tsx`, `widget-task-handler.tsx`, `widgetData.ts`
   - `app.config.ts` with android-widget plugin config
3. **Secrets:** never commit bot tokens or channel ids into git; keep them in gitignored local config or expo-secure-store at runtime.
4. Before coding, run `npm install` in THIS folder — node_modules was intentionally not copied here.
5. Expo SDK 57: read exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Product direction (agreed with owner)

- Vision: a Telegram-channel photo backup app like Telephoto / Chitralaya, but with a **Google Photos–like interface**.
- Upload model (already implemented, same as Chitralaya): compressed **preview photo** (~65 KB, `#hash` caption) + **original as document** with full metadata caption. Hash links the pair and powers dedupe.
- UI plan (hybrid): Google Photos browsing + a stats/overview card on top of Gallery.
  - Collections tab: two side-by-side tiles — **Local** (not-yet-uploaded photos) and **Cloud** (uploaded photos only).
  - Main Gallery: combined local + cloud; uploaded photos get a small **cloud-check badge** bottom-right (Google Photos style).
- Distribution target: **public release** (versioning discipline, icons, possibly in-app updater later).
- Feature roadmap: AI captioning (Gemini) ✅ → video support → remote control via bot commands → multi-destination profiles.
- AI captioning: Gemini REST (`generativelanguage.googleapis.com`), API key in SecureStore, model/prompt in prefs (`aiCaptions`, `aiModel`, `aiPrompt`), caption stored in `photos.ai_caption` + FTS-searchable.
