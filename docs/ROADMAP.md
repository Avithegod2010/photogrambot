# PhotogramBot roadmap

This is the working backlog: **70 ideas** grouped by area, with rough effort
(S/M/L), impact, and current status. It is a living document — update the
status as items land.

**Status legend:** `done` = shipped and committed; `partial` = a useful slice
exists; `planned` = not started; `blocked` = needs a native dependency, a
model, or an owner decision.

---

## Current implementation wave (top 10)

These are being implemented now, one commit per feature. The next APK build is
intentionally deferred until the owner approves a release.

| # | Item | Status |
|---|------|--------|
| 1 | Stable release keystore guidance + APK re-sign tooling | done (owner upload step remains) |
| 2 | Persist the upload queue across reinstall + video self-repair | done |
| 3 | People clustering engine + schema + People screen | foundation (embedding model pending) |
| 4 | Sticky date headers | done |
| 5 | FLAG_SECURE + auto-lock timeout | done (native build needed) |
| 6 | Crash log + Maestro smoke tests | done |
| 7 | Bot inline keyboards + more commands | done |
| 8 | Video compression planner + settings | foundation (native transcoder pending) |
| 9 | Offline reverse geocoding | done |
| 10 | SDK 57 patch refresh + SDK 58 migration plan | partial (major upgrade planned) |

---

## 1. Backup reliability

1. **Persist the upload queue across reinstall** — queue rows in the DB
   snapshot, restored with the index. *(S/M, high)*
   — ****done****
2. **Per-folder schedules** — "Camera anytime, Screenshots at night, WhatsApp
   only on Wi-Fi". *(M, high)*
3. **Adaptive concurrency** — 1 worker on mobile data, 3 on Wi-Fi, 429-aware;
   gentle/normal/aggressive slider. *(M, high)*
4. **Expedited WorkManager uploads** — foreground-style progress for large
   catch-ups. *(M, high)*
5. **Scheduled archive verification** — rotate through 1% of the archive weekly
   and surface/repair broken rows. *(M, high)*
6. **Video self-repair** — discard a broken split `parts` chain and re-upload
   from the local file. *(M, high)*
   — ****done****
7. **Upload size/time estimator** — "~4.2 GB / ~38 min on this connection".
   *(S, medium)*
8. **Battery-aware throttling** — pause below 15% when not required to charge.
   *(S, medium)*
9. **Per-item upload history** — retries, timings, bytes, last error, and an
   explainer. *(S, medium)*
10. **Channel write audit** — detect messages manually deleted from the channel
    and mark the rows broken. *(M, high)*

## 2. Search, AI & organization

11. **People clustering** - face embeddings (Gemini opt-in / on-device TFLite).
    *(L, very high)*
   - **on-device pipeline added** — BlazeFace + MobileFaceNet, downloadable models, People screen; tensor I/O pending device validation
12. **On-device object/scene tagging** — ML Kit/TFLite "dog", "receipt",
    "whiteboard". *(L, high)*
   — **done** (MobileNetV3 on-device + opt-in Gemini tags, separate key)
13. **"Ask your photos" chat** — natural-language Q&A over captions/OCR/metadata
    with citations. *(M, high)*
   — **done**
14. **Better NL date parsing** — "last summer", "before the wedding". *(M, high)*
   — **done** (offline parser)
15. **Album rules engine** — auto-add by folder/tag/place/favorite. *(M, medium)*
   — **done** (folder/tag/favorites)
16. **Burst/duplicate grouping UI** — group near-identical shots, pick the best.
    *(M, high)*
   — **done** (existing finder + best-shot sort)
17. **Reverse geocoding** - offline place names for map, trips, stories.
    *(M, high)*
   - **done** (offline gazetteer + Indian states)
18. **Smart "best of" collections** — sharpest/most-favorited per trip/month.
    *(M, medium)*
   — **done** (Best of screen)
19. **OCR improvements** — multi-language, selectable text, copy button.
    *(M, medium)*
   — **done** (any-language + selectable + Share text)
20. **Search history & suggestions** — recent searches, "did you mean",
    one-tap saved search. *(S, medium)*
   — **done**

## 3. UI/UX & customization

21. **Sticky date headers** — floating header that follows the scroll.
    *(M, high)*
   — ****done****
22. **Pinch-to-zoom grid density** — 2–6 columns with live reflow. *(M, medium)*
   — ****done****
23. **Custom fonts** — bundle 2–3 families, pick one in Settings. *(M, medium)*
24. **Icon packs / masks** — rounded/squircle/circle + more color variants.
    *(M, medium)*
   — ****done**** (native build needed)
25. **Animated theme transitions** — cross-fade accent/theme changes.
    *(S, medium)*
26. **Slideshow / screensaver mode** — full-screen auto-advance. *(M, medium)*
   — ****done****
27. **Compare mode** — pick two photos, side-by-side pinch/pan. *(M, medium)*
   — ****done****
28. **Drag-to-reorder albums + cover collages** — 2×2 mosaic. *(M, medium)*
   — ****done****
29. **Selection tools** — select by date, invert, select-all in album. *(S, high)*
30. **Accessibility pass** — TalkBack labels, high contrast, reduce motion,
    larger targets. *(M, high)*
31. **Localization** — Hindi/Malayalam/German/etc., RTL. *(M, medium)*
   — ****done**** (core chrome, long copy English)
32. **Tablet/foldable/DeX layouts** — two-pane gallery + viewer. *(L, high)*
   — ****done**** (two-pane gallery)
33. **More widgets** — "On this day", slideshow, 2×2 mosaic, quick capture.
    *(M, medium)*
   — ****done**** (native build needed)
34. **Notification controls** — quiet hours, progress-only vs completion.
    *(S, medium)*

## 4. Security & privacy

35. **SQLCipher** — encrypt the local index; key in Android Keystore. *(L, high)*
   — ****done**** (native build needed)
36. **FLAG_SECURE in viewer/lock** — block screenshots and recents thumbnails.
    *(S, high)*
   — ****done**** (native build needed)
37. **Auto-lock timeout options** — immediate / 30 s / 1 min / 5 min. *(S, high)*
   — ****done****
38. **Duress/decoy refinements** — separate decoy bot/channel, fake albums,
    panic wipe. *(M, high)*
   — ****done****
39. **Passphrase strength meter + recovery key** — avoid a permanent lockout.
    *(M, high)*
   — ****done****
40. **Key rotation** — re-encrypt the pinned DB backup with a new passphrase.
    *(M, medium)*
   — ****done****
41. **Certificate pinning** — `api.telegram.org`, `api.github.com`. *(M, medium)*
   — ****done**** (native build needed)
42. **Audit-log export** — share break-in/diagnostics as a file. *(S, medium)*
   — ****done****
43. **Per-album locks on every entry point** — search, memories, map, widgets.
    *(M, high)*
   — ****done****

## 5. Remote control & multi-device

44. **More bot commands** — `/stats`, `/last`, `/search`, `/favorite`, `/album`,
    `/help`, `/ping`. *(M, high)*
   — ****done****
45. **Inline keyboards** — status/sync/pause/queue buttons. *(M, high)*
   — ****done****
46. **Webhook mode** — optional, lower battery/network than long polling.
    *(M, medium)*
47. **Admin allowlist** — multiple admins, read-only vs destructive roles.
    *(S, medium)*
48. **True multi-device index sync** — CRDT/last-write-wins for
    favorites/albums/tags. *(L, very high)*
49. **Device management** — names, last sync, revoke, per-device pause.
    *(M, high)*
50. **Channel merge/migration** — merge archives, remap message IDs. *(L, medium)*
51. **Public read-only channel mode** — family access without the bot.
    *(M, medium)*

## 6. Performance & engineering

52. **Expo SDK 58 + dependency refresh** — clears advisories and patch drift.
    *(L, high)*
   — ****partial** — SDK 57 patches refreshed; SDK 58 planned**
53. **Stable release keystore** — upload `pb-release.keystore` to EAS; every APK
    shares one signer. *(S, very high)*
   — ****tooling done** — owner upload step remains**
54. **Crash/ANR reporting** — opt-in, privacy-first, attaches diagnostics.
    *(M, high)*
   — ****partial** — local crash log; no remote reporting**
55. **Detox/Maestro smoke tests** — launch → gallery → viewer → settings in CI.
    *(L, high)*
   — ****partial** — Maestro flow written; CI emulator not wired**
56. **DB migration tests + backup round-trip fuzzing** — automated. *(M, high)*
57. **FlashList + image prefetch** — smoother 3k+ photo grids. *(M, medium)*
58. **Startup profiling** — Hermes bytecode, lazy screens, cold-start budget.
    *(M, medium)*
59. **EAS Update (OTA)** — JS-only fixes without a full APK. *(M, high)*
60. **Release automation** — CI builds/publishes on tag. *(M, medium)*

## 7. New product features

61. **On-device video compression/transcoding** — shrink 4K before splitting.
    *(L, very high)*
   — ****partial** — planner/settings; native transcoder pending**
62. **Non-destructive photo editing** — crop/rotate/filters with version history.
    *(L, high)*
63. **Import from Google Photos Takeout / Apple Photos** — hash-match + metadata.
    *(L, high)*
64. **Year-in-review** — auto highlight video/story. *(M, high)*
65. **Shared/collaborative albums** — invite via Telegram link. *(L, medium)*
66. **Automated free-up-space rules** — delete local copies after N days, keep
    favorites/albums. *(M, high)*
67. **Archive health dashboard** — coverage, broken rows, repairs, duplicates,
    storage saved. *(M, high)*
68. **"On this day" widget + quick actions** — sync now, open favorites.
    *(S, medium)*
69. **Wear OS / quick capture** — later. *(L, low)*
70. **Standalone desktop/web viewer** — read-only browser/Electron over the
    channel. *(L, high)*

---

## Recommended order after the current wave

1. #53 stable keystore + #59 OTA — makes releases cheap.
2. #1 queue persistence + #6 video repair — the reliability base.
3. #11 people clustering — the biggest missing Google-Photos feature.
4. #21 sticky headers + #30 accessibility — polish the main surface.
5. #36/#37 privacy toggles — cheap, high trust.
6. #54/#55 crash + smoke tests — make every future round safer.
7. #44/#45 bot keyboards — unlock the remote-control surface.
8. #61 video compression — saves channel space and time.
9. #17 reverse geocoding — map/trips/search at once.
10. #52 SDK 58 — clears the audit backlog.
