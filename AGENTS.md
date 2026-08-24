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
- Feature roadmap: AI captioning (Gemini) ✅ → video support ✅ (beta, `includeVideos` default off; ≤50 MB `sendVideo` w/ document fallback; >50 MB split into `#vsplit:` parts via `src/lib/vsplit.ts`, reassembled in restore) → share-target upload ✅ (`modules/share-intent` local Kotlin module + SEND/SEND_MULTIPLE intent filters) → security pack ✅ (AES-256-GCM encrypted DB backups via expo-crypto in `src/lib/secretbox.ts`, lockable albums w/ biometric gate) → channel organization ✅ (topics-per-folder via `createForumTopic` + kv `topic_map`; previews batched 10-at-once via `sendMediaGroup`) → gallery power tools ✅ (multi-select share via native ACTION_SEND, per-date "Select all") → multi-destination profiles ✅ (experimental, `multiDestination` pref default off; `src/lib/destinations.ts` + DestinationsScreen; per-folder rules in kv `dest_rules`, tokens in SecureStore per profile, `photos.profile_id` routes downloads/deletes to the owning bot) → remote control via bot commands.
- AI captioning: Gemini REST (`generativelanguage.googleapis.com`), API key in SecureStore, model/prompt in prefs (`aiCaptions`, `aiModel`, `aiPrompt`), caption stored in `photos.ai_caption` + FTS-searchable.
