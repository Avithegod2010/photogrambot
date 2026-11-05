# Dependencies & security advisories

This note records the state of `npm audit` and the decision around fixing it.
It is the source of truth for the "dependency hygiene" work — **do not** run
`npm audit fix` on this machine (see the warning at the bottom).

## Current state (`npm audit`, post-commit at Expo SDK 57)

```
info 0  low 2  moderate 10  high 6  critical 0  total 18
```

Every advisory traces back to the Expo 57 toolchain (`@expo/cli`,
`@expo/config`, `@expo/config-plugins`, `@expo/fingerprint`, `@expo/metro-config`)
and the navigation stack (`@react-navigation/core` → `query-string`).

### Already at the best available version (no further non-major fix)

| Package             | Version in lockfile | Notes |
| ------------------- | ------------------ | ----- |
| `node-forge`        | `1.4.0`            | This is **Expo's own fork** (the public `node-forge` registry version is older). npm's advisory DB does not know about the fork, so it still flags the package, but there is no better version to move to within Expo 57. |
| `decode-uri-component` | `0.2.2`         | The latest release of an **unmaintained** module. The "high" advisory (quadratic replacement of percent-encoded runs) has no upstream fix — it would only be resolved by `@react-navigation/core` dropping the dependency in a future major. Real-world risk here is low: the app parses only its own deep-link scheme, not attacker-controlled web input. |

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

## `npm ci` in CI

The CI workflow installs with `npm ci --no-audit --no-fund` and gates the
build on `npm audit --audit-level=critical`. There are no criticals, so CI
stays green even though 18 non-critical advisories remain. This is intentional:
the only way to clear them is the SDK 58 migration above.

## Expo patch drift (CI advisory)

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
