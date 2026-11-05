# Expo SDK 58 migration plan

Status: **planned, not executed.** The current release line is SDK 57. This
document is the checklist for the next big release window, when a native build
can be produced and tested.

## Why move

- SDK 58 carries fixes for the remaining `npm audit` advisories (`deepmerge`,
  `glob`, `zod`, `@expo/*` chain) that only resolve in the 58 line.
- It keeps React Native / Reanimated / Worklets / navigation on supported
  versions.
- It clears the patch drift permanently instead of pinning 57.x patches.

## Preconditions

- Clean `main`, a tagged rollback point, and a free EAS build slot.
- The release keystore decision is settled (see `docs/RELEASE.md`).
- No concurrent feature work on `android/` (the native diff is the risky part).

## Ordered steps

1. **Branch and snapshot**
   ```bash
   git switch -c chore/expo-58
   git tag pre-sdk58
   ```
2. **Upgrade the SDK packages**
   ```bash
   npx expo install expo@^58
   npx expo install --fix        # aligns every expo-* package with SDK 58
   npm install
   ```
3. **Upgrade the non-Expo native peers** to the versions SDK 58 expects:
   React, React Native, `react-native-reanimated` + `react-native-worklets`
   (they pair exactly), `react-native-gesture-handler`, `react-native-screens`,
   `react-native-safe-area-context`, `react-native-svg`, `react-native-maps`,
   `expo-video`, `expo-sqlite`, `expo-notifications`, `expo-background-task`.
   Reanimated/worklets mismatches are the most common SDK-upgrade crash.
4. **Regenerate native config carefully.** `android/` is committed and carries
   hand-maintained changes that a blind prebuild would destroy:
   - the share-target `SEND`/`SEND_MULTIPLE` filters (short form),
   - the three launcher `activity-alias` entries,
   - the widget receiver/provider,
   - splash colors and the `splashscreen_background` value,
   - `modules/share-intent` autolinking.

   Recommended: run `npx expo prebuild -p android` in a **temporary worktree**
   and diff the generated `android/` against the committed one, porting only the
   real SDK changes. Do not `--clean` the live tree.
5. **Typecheck and tests**
   ```bash
   npm run check
   node node_modules/expo/bin/cli export --platform android --output-dir "$TEMP/sdk58"
   npx expo-doctor
   ```
6. **Native build + device smoke** (the gate this plan is blocked on):
   `eas build -p android --profile preview`, install, then cover the AGENTS
   device checklist (launch, gallery, viewer, share target, widget, lock,
   notifications, upload/split video).
7. **Update CI** if the Node/JDK matrix changes, and refresh
   `docs/DEPENDENCIES.md` (the audit count should drop).
8. **Publish** only after the device smoke passes; bump `versionCode` first.

## Rollback

- `git switch main` / `git reset --hard pre-sdk58`, or revert the merge commit.
- Keep the previous APK and `latest.json` published until the new build is
  verified.
- The local SQLite schema is unchanged by the SDK upgrade; no data migration is
  expected.

## Known risk areas

| Area | Risk |
| --- | --- |
| Reanimated / Worklets pairing | High — exact-version match required |
| Committed `android/` + manual manifest | High — prebuild can drop aliases/filters/widget |
| `react-native-maps`, `expo-video`, `expo-sqlite` | Medium — native API changes |
| `react-native-android-widget` | Medium — verify SDK 58 compatibility |
| New Architecture / Hermes | Medium — bundle + startup profiling |
| EAS credentials | Low — key is independent of the SDK |

## Definition of done

- `npm run check` clean, Metro export clean, `expo-doctor` clean.
- EAS preview APK installs over the previous release (same signer).
- Device checklist for the touched native surfaces passes.
- Audit advisories reduced to the unmaintained `decode-uri-component` case.
