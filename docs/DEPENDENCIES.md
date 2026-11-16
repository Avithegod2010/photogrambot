# Dependencies & security advisories

This note records the state of `npm audit` and the decision around fixing it.
It is the source of truth for the "dependency hygiene" work — **do not** run
`npm audit fix` on this machine (see the warning at the bottom).

**Updated 2026-11-16** after the Dependabot cleanup: 18 advisories → **2**. See
"What was cleaned up on 2026-11-16" below.

## Current state (`npm audit`, after the 2026-11-16 cleanup, Expo SDK 57)

```
info 0  low 0  moderate 2  high 0  critical 0  total 2
```

The two that remain are `glob` 13.0.6 and `minimatch` 11.0.4, both reachable
only through `expo` → `@expo/fingerprint` and both **moderate**. Neither ships
in the APK; the affected code runs in the Expo CLI on a developer machine. They
are denial-of-service advisories driven by hostile *glob patterns*, and every
pattern in this project is a literal written by us.

**Do not force them with `overrides`.** `@expo/fingerprint` asks for `glob@^13`;
pinning 14 under it risks breaking EAS fingerprinting silently, and that kind of
failure surfaces at release time. They belong to the SDK 58 bump.


### Already at the best available version (no further non-major fix)

| Package             | Version in lockfile | Notes |
| ------------------- | ------------------ | ----- |
| `node-forge`        | `1.4.0`            | This is **Expo's own fork** (the public `node-forge` registry version is older). npm's advisory DB does not know about the fork, so it still flags the package, but there is no better version to move to within Expo 57. |
| `decode-uri-component` | ~~`0.2.2`~~ **removed** | **Resolved 2026-11-16.** The "high" advisory (quadratic replacement of percent-encoded runs) had no upstream fix — the package is unmaintained. It is now *gone from the tree entirely*: `@react-navigation/core` 7.24.0 dropped `query-string`, its only consumer. Nothing to upgrade; the dependency simply no longer exists. |

### Requires Expo SDK 58 (a deliberate, owner-gated major upgrade)

These advisories have `fixAvailable: { name: "expo", version: "58.0.23", isSemVerMajor: true }`
or only resolve through an SDK 58 bump:

- `@expo/cli`, `@expo/config`, `@expo/config-plugins`, `@expo/fingerprint`,
  `@expo/inline-modules`, `@expo/metro-config`, `@expo/prebuild-config`,
  `@expo/local-build-cache-provider` (the `glob` / `minimatch` / `deepmerge` /
  `zod` / `node-forge` chains hanging off them)
- `expo` itself
- `expo-sharing` (`58.0.22` is the fix, also a major SDK bump)
- `zod` (only fixed by the `@expo/cli` 58 line)

SDK 58 is **not** a prerequisite for shipping the preview APK and is treated as
a separate, owner-approved migration. Do not sneak it in via `npm audit fix`.

## What was cleaned up on 2026-11-16

The brief said "15 stale Dependabot branches"; five of those were already dead
remote-tracking refs (pruned with `git fetch --prune`). **Eight** PRs were
actually open. All eight are resolved and **no Dependabot branch remains on
origin** — only `main` and the intentional `feature/local-bot-api`.

**Merged (each with green CI):**

| PR | Change |
| --- | --- |
| `#7` | `actions/checkout` v4 → v7 |
| `#8` | `actions/setup-node` v4 → v7 |
| `#18` | `actions/setup-java` v4 → v5 |
| `#16` | `@react-navigation/core` 7.21.13 → 7.24.0 — **removed `query-string` + `decode-uri-component`**, clearing the high advisory and one medium |
| `#12` | `zustand` 5.0.15 → 5.0.16 |
| `#15` | `@types/node` 26.2.0 → 26.6.6 |

**Closed with a written rationale on each PR (reopenable):**

- `#10` `typescript` 6.0.3 → **7.0.2**. CI was green, but TypeScript 7 is the
  native (Go) compiler rewrite; swapping the compiler underneath a build that is
  about to go on hardware for 1.4.0 verification buys nothing. Belongs with the
  SDK 58 round, where TS/Expo CLI/Metro/RN are revalidated together.
- `#11` `@react-native-async-storage/async-storage` 2.2.0 → **3.1.1**. A major
  bump of a **native** module. Imported in only two files
  (`src/lib/settings.ts`, `src/lib/panicWipe.ts`) but it changes the on-disk
  storage backend, so it needs a native rebuild plus on-device verification that
  existing data and the panic-wipe path still work. Give it its own round; do not
  mix it into the outstanding 1.4.0 verification queue.

**Bonus CI fix (`6a6d0ac`):** `android/gradlew` was committed without the
executable bit (mode `100644`), so the Maestro smoke workflow's
`Build debug APK (x86_64)` step died in 23 s with `./gradlew: Permission denied`
(exit 126) — that workflow had never been able to build. Now `100755`. It went
unnoticed because the workflow only runs when `.maestro/**` or `maestro.yml` is
touched.

## `npm ci` in CI

The CI workflow installs with `npm ci --no-audit --no-fund` and gates the
build on `npm audit --audit-level=critical`. There are no criticals, and only
two moderate dev-only advisories remain, so CI stays green. This is
intentional: the only way to clear the last two is the SDK 58 migration above.

## Expo patch refresh (done) + SDK 58 plan

The SDK 57 patch-level refresh is now in `package.json`/`package-lock.json`
(`expo` 57.0.32, `expo-notifications`/`expo-sharing` 57.0.25, etc.). Those are
the versions the next build will install; the currently published APK was built
from the previous patch pins.

The SDK 58 major upgrade is **planned, not executed** — it needs a native build
window and careful porting of the committed `android/` manifest changes. See
`docs/SDK58_MIGRATION.md` for the ordered checklist, risks and rollback.

## Expo patch drift (superseded)

`npx expo install --check` currently reports eleven packages one patch behind
the SDK 57 recommendation (`expo` 57.0.30 → ~57.0.32, `expo-notifications`
57.0.23 → ~57.0.25, etc.). Those exact locked versions are what the published
`v1.1.0-preview.1` APK was built from, so bumping them mid-release would make
the source diverge from the artifact. The CI step is therefore
`continue-on-error: true` — it stays visible in the log but does not fail the
build. Bundle the patch refresh into the next deliberate dependency/release
round.

## `eas-cli` (build tooling, repo-external)

`eas-cli` is **not** a dependency of this repo — it is used via `npx` / a global
install. A newer line (e.g. 27.x) is available and is compatible with the SDK 57
project config; bumping it is optional and has no bearing on the shipped app's
dependency tree.

## Warning — never run `npm audit fix` here

`npm audit fix` has been observed to **crash npm natively** on this 8 GB dev box
(heap / native abort) and, on a second attempt, to fail with tar write errors and
`EPERM` on locked `node_modules` entries, leaving the lockfile untouched. Even
when it does run, the only changes it can make are the SDK-58 major bumps above
(the `--only=prod`/non-major path is already satisfied by the versions pinned in
the lockfile). Resolve these through the planned SDK 58 upgrade, not `audit fix`.
