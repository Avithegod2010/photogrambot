# Testing

Three layers, cheapest first.

## 1. Typecheck + pure-logic tests (every change)

```bash
npm run check          # tsc --noEmit + the tests/*.test.mjs suite
npm test               # tests only
```

The suite imports the real `src/lib` modules (Node 24 strips types; the
`tests/ts-resolve-hook.mjs` shim resolves the extensionless imports Metro uses).
Pure modules are preferred: `vecmath`, `pbkdf2`, `autotags`, `format`, `caption`,
`trips`, `phash`, `motionScan`, `appearanceMath`, `backupQueue`, `crashFormat`.

## 2. Metro bundle (every change that touches UI/imports)

```bash
node node_modules/expo/bin/cli export --platform android --output-dir "$TEMP/pb-export"
```

This catches unresolvable modules, bad re-exports and platform-specific imports
before a full native build. CI runs the same command.

## 3. Maestro smoke flow (installed build)

`maestro` must be installed on the host (macOS/Linux, or WSL on Windows) and a
device/emulator must be connected. With a build installed:

```bash
maestro test .maestro/smoke.yaml
```

The flow launches the app, visits Settings (including the Appearance section),
Collections and the Gallery. It is read-only: no uploads, no deletes. It assumes
app lock is off and the library is already configured.

Add flows under `.maestro/` as more critical journeys stabilise (viewer,
share-target, upload queue). Keep them deterministic: prefer accessibility text
over coordinates, and never depend on network uploads.

## 4. Device checklist

The full manual acceptance list lives in `AGENTS.md` (Device Verification
Checklist). Features are marked "code-only" until they pass there; do not claim
device verification from a successful build or bundle.
