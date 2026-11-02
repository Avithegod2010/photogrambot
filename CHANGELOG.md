# Changelog

All notable changes to PhotogramBot. Versions follow `android/version.properties`
(`versionName`), and every published artifact increments `versionCode`.

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
