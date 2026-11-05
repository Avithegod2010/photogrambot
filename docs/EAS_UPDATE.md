# EAS Update (OTA)

PhotogramBot is wired for EAS Update so JS-only fixes can ship without a new
APK.

## Configuration

- `app.config.ts` sets `runtimeVersion.policy = "appVersion"` and the EAS
  Update URL for project `421f1e6b-cda7-4f20-a6f1-dc972c76c0f4`.
- `eas.json` build profiles carry channels: `development`, `preview`,
  `production`.
- The committed `android/` manifest carries the matching
  `expo.modules.updates.*` meta-data and `@string/expo_runtime_version`
  (`1.1.0`). A native build with `expo-updates` installed is required once;
  after that, updates are JS-only.

## Publish an update

```bash
# Preview channel (the APK published on GitHub Releases)
npx eas update --branch preview --message "Fix viewer crash"

# Production channel (Play build)
npx eas update --branch production --message "Fix viewer crash"
```

Requires `EXPO_TOKEN` (or `eas login`). Bump `versionName` in
`android/version.properties` when a native change ships — the runtime version
is derived from it, so old APKs won't receive a JS bundle built for a new
native surface.

## Verify

- Open the app once online; `expo-updates` checks on launch.
- The update downloads in the background and applies on the next cold start.
- If the app is offline or the update fails, the embedded bundle keeps
  running (`fallbackToCacheTimeout: 0`).

## Caveats

- EAS Update only ships JS/assets. Native changes (new modules, manifest,
  permissions, SQLCipher, widgets) still need a new APK.
- Updates must be built from the same runtime version as the installed app.
- Keep the channel name in sync with the EAS build profile.
