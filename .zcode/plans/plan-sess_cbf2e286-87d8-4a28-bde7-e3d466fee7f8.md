# Plan: Record the ideas menu + device-restart resume state

You asked for ideas; you haven't picked one yet, so this plan only **documents** them — no feature code. When you later say "do Free up space" (or any other), that becomes its own planned batch.

## 1. AGENTS.md — add a "Roadmap ideas (backlog, uncommitted)" section
Append after the existing "Current Roadmap" notes, listing the ideas in priority order with one-line rationales:

**Flagship candidates:**
1. **Free up space** (top recommendation) — list local photos whose originals are verified backed up (builds on `verifyBackupSample`), select + delete from device, show reclaimable GB. Google Photos' killer feature; the natural endpoint of a backup app.
2. **AI caption backfill** — Maintenance action: staggered Gemini captions for the existing ~2,000-row library; makes full history searchable.
3. **Near-duplicate finder** — perceptual hash (dHash, pure TS) beyond exact-hash matching + "delete from channel too" reclaim action.
4. **On-device face grouping + OCR** — ML Kit, privacy-safe, the deferred "Phase 2".
5. **Trips & events auto-albums** — time+GPS clustering smart collections.

**Release track:**
6. Finish release APK (TLS build failure diagnosis; `android/` untracked decision; APK size; sideload guide).
7. In-app updater via channel version marker.

**Quality:**
8. node:test suite for pure modules (pbkdf2/secretbox/caption/remote parsing — zero new deps).
9. Privacy folders (second auth gate on chosen albums).
10. Weekly digest bot post.

## 2. AGENTS.md Next Up item 0 — note the device restart
One line: device was shut down 2026-09-05; on resume, wireless-debugging likely needs re-binding (open Developer options → Wireless debugging), fresh mdns port, `adb reverse tcp:8081 tcp:8081` before any cold start.

## 3. Note in-progress work (no action)
The inherited Batch A1 (Settings tab button, Months/Years local+DB merge, viewer bar symmetry, swipe-down info) sits partially implemented in the working tree — it resumes as its own batch when you say continue; tsc was interrupted mid-run.

## Verification
- AGENTS.md diff only; tsc not needed (no code touched); commit as "docs: roadmap ideas + device-restart note".
