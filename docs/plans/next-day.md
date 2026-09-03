# Next-Day Plan — 2026-09-04

> Written at close of 2026-09-03. Repo is clean at `c2acf5f` (master). All context lives in AGENTS.md "Next Up" — this file is the quick-start index.

## Morning focus (top 3)

1. **Device verification, Rounds 15–18 (a–n + o)** — nothing from four coding rounds has touched the phone.
   *Start here*: AGENTS.md → Next Up item 1. Fresh-JS tells: gallery selection-bar "Back up" button (R17), Device/Media/Sort filter chips (R18), Backup verification card in Maintenance (R16), Storage section (R15). Checklist items o = Batch 9/10: `/status` shows "Largest:" line; filter sheet device chips; size sort renders without key warnings.
2. **Session-start ritual first** — Metro via `PowerShell Start-Process -FilePath 'E:\Dev\run-pb-metro.cmd' -WindowStyle Hidden` (session-bound bg tasks die); `adb connect` fresh mdns port (owner may need to re-open Wireless debugging settings); `adb reverse tcp:8081 tcp:8081`.
   *Start here*: AGENTS.md → Next Up item 0 — follow it verbatim.
3. **Before ANY tap injection: verify `dumpsys activity activities | grep topResumedActivity` shows `com.photogrambot.app`** — the sibling TDLib app foreground-steals. If it steals, owner-driven testing only (Option A) or owner swipes it from Recents.
   *Start here*: AGENTS.md → Next Up item 0f + memory pb-project-status "Device-session lessons".

## After the phone work

4. **#4 security-auditor + docs sweep (permission granted in principle, pending "go")** — dispatch security-auditor over `src/lib/remote.ts` + search SQL + secretbox; general-pro accuracy review of AGENTS.md.
   *Start here*: ask owner for the go, then dispatch security-auditor subagent with the Round 17–18 files listed in AGENTS.md fixes table.
5. **AGENTS.md Round 18 row** (Batches 9–10: pbgcm2 backup encryption + structured filters) — not yet written; do it with item 4 in the same edit pass.
   *Start here*: copy the Round 17 row's format; commits 40ad8ba + c2acf5f.
6. **Phase 3 real-camera test (OWNER REQUIRED)** — photo with camera app → ✓ badge in ~10 s; then charging/Wi-Fi gates.
   *Start here*: AGENTS.md → Next Up item 2.

## Blocked / parked

- Release kit (roadmap #7) — proposed, owner picked #2/#3/#4 first; revisit after device verification.
- Drag-select in grids — needs touch iteration on device.
- C: drive: 6.5 GB free after cleanup; deep hunt (WinDirStat) is the owner's call, not project work.

## Notes for tomorrow-you

- coder-pro is working again (owner confirmed) — dispatch it first, fall back to inline only on dispatch errors.
- Reviewer gates via subagent worked every time this session; one needed a SendMessage re-prompt after empty output.
- PIN verify costs ~100–350 ms (PBKDF2 20k) and backup/restore a few seconds (600k) — expected, check device feel.
