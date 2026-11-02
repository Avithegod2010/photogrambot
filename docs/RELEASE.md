# Release guide

Everything needed to cut a PhotogramBot release: build, sign, publish the APK
for the in-app updater, and upload to Google Play.

---

## 1. Versioning (single source of truth)

`android/version.properties` is the **only** place a release version is set:

```
versionCode=1
versionName=1.0.0
```

- `android/app/build.gradle` reads it for the Android `versionCode`/`versionName`.
- `app.config.ts` reads it too, so JS (`Constants.expoConfig.version`) and the
  in-app updater agree.
- **Bump `versionCode` by 1 for every artifact you publish** — the updater
  compares `versionCode` first, then falls back to semver on `versionName`
  (`src/lib/updaterLogic.ts`).

---

## 2. Keystore decision — **EAS-managed** (decided)

The app is signed by an **EAS-managed keystore**, not a locally generated one.

Why: a local release build on the dev machine fails on a JVM-specific TLS
handshake to `dl.google.com` (Gradle cannot fetch its artifacts), and EAS cloud
builds are unaffected. Adopting the EAS keystore keeps a single signing
identity across preview APKs and production AABs.

Consequences (important):

- **The local `android/pb-release.keystore` is NOT the distribution key.** Local
  `./gradlew assembleRelease` falls back to the debug keystore — fine for
  testing, never for distribution.
- **Back the EAS credentials up.** Losing the EAS keystore means you can never
  ship an update to an app already on the Play Store under that identity.
  - Download it once: `eas credentials -p android` → *Android Keystore* →
    *Download*. Store it offline (password manager / encrypted archive).
- If you ever want a self-managed key instead, run
  `eas credentials -p android` and upload `pb-release.keystore`, then rebuild.

---

## 3. Build

Cloud build (requires the owner's Expo token):

```bash
# one-time: paste the Expo access token when prompted
eas login

# installable APK (internal testing / in-app updater)
eas build -p android --profile preview

# store AAB
eas build -p android --profile production
```

`eas.json` profiles: `development` (dev client), `preview` (APK),
`production` (AAB). `appVersionSource: "local"` means EAS reads the version from
`android/version.properties`.

> [!TIP]
> With a committed `android/` directory the "computing project fingerprint"
> step has nothing to do and can hang for many minutes on a slow disk. Set
> `EAS_SKIP_AUTO_FINGERPRINT=1` before `eas build` to skip it.

Local build (debug only — no `dl.google.com` needed because deps are cached):

```bash
set JAVA_HOME=<JDK 17>
cd android
gradlew.bat assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Publish the APK for the in-app updater

The updater (`src/lib/updater.ts`) reads the repository's recent GitHub
Releases, picks the newest one that carries an `.apk` asset, and compares it
against the installed version (exactly, via `latest.json`). To publish:

1. Bump `android/version.properties` (`versionCode` + `versionName`).

2. Run the publish script — it generates `latest.json` from
   `android/version.properties`, creates the release and uploads both files:

   ```bash
   npm run release:publish -- --apk photogrambot-1.0.1.apk --tag v1.0.1 \
     --title "PhotogramBot 1.0.1" --notes-file CHANGELOG.md
   # add --prerelease for a preview APK; --dry-run validates without publishing
   ```

   The token comes from `GITHUB_TOKEN` (or `gh auth token`); it is never
   written to disk. On a failed asset upload the half-published release and
   its tag are removed, so a retry is clean.

3. The updater fetches `/releases?per_page=30`, finds the newest release with
   an APK, compares `versionCode` (falling back to semver), then downloads and
   installs the APK. Installing an APK requires the **Install unknown apps**
   permission for PhotogramBot — the Settings "Check for updates" flow detects
   a missing permission and offers to open that screen.

`latest.json` is gitignored; it is a build artifact. If you prefer doing it by
hand: `npm run release:manifest -- --apk <file> --notes "..."`, then attach the
APK and `latest.json` to a release created in the GitHub UI (or `gh release
create`).

`latest.json` is gitignored; it is a build artifact.

---

## 5. Play Store listing (draft)

**App name** (≤30 chars)
> PhotogramBot — Telegram Backup

**Short description** (≤80 chars)
> Back up your photos and videos to your own Telegram channel. Private by design.

**Full description**
> PhotogramBot turns a Telegram bot + private channel into a personal,
> unlimited cloud for your camera roll.
>
> • Automatic backup — new photos upload as you take them (Wi-Fi / charging
>   gates you control).
> • Full-resolution originals plus lightweight previews for fast browsing.
> • Everything runs through your own bot token and channel. No PhotogramBot
>   servers, no accounts, no subscriptions.
> • Browse like a gallery — date sections, search, albums, favorites, map,
>   on-this-day memories and auto-generated trips.
> • Video support (beta) with automatic splitting of large files.
> • Encrypted backups: export your index to the channel with AES-256-GCM.
> • Lock the app with biometrics and an optional decoy PIN that opens a
>   separate, empty library.
> • Share to PhotogramBot from any app (share sheet) and it lands in your
>   archive.
>
> Your backup lives in your Telegram channel, so you can restore the whole
> library to a new phone. Nothing is uploaded anywhere except your own
> channel.

**Category**  Photography
**Tags**  backup, telegram, photos, privacy, gallery
**Contact**  (owner email / GitHub issues URL)

**Data safety (draft answers)**
- Data collected: none by the developer. Photos are sent only to the user's own
  Telegram bot/channel using the user's own token.
- Data shared: none.
- Data stored on device: photo index in a local SQLite DB; the bot token in
  Android Keystore (SecureStore).
- Deletion: deleting a photo in-app removes it locally and, on request, from the
  channel.

**Content rating**  Everyone.
**Ads**  None. **In-app purchases**  None.

**Screenshots to capture** (during the device round)
1. Gallery grid with date sections and cloud-backed badges.
2. A photo open in the viewer with the bottom action bar.
3. Collections (albums + auto trips).
4. Search with the filter sheet open.
5. Free up space / Storage summary.

---

## 6. Release checklist

- [ ] Bump `versionCode` (+ `versionName` for a notable release) in
      `android/version.properties`.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx expo install --check` — dependencies aligned with SDK 57.
- [ ] `eas build -p android --profile production`.
- [ ] `eas build -p android --profile preview` → attach APK + `latest.json` to a
      new GitHub Release.
- [ ] Upload the AAB to the Play Console track (internal → closed → production).
- [ ] Verify the in-app updater: on an older build, Settings → About → Check for
      updates → downloads and installs the new APK.
- [ ] Confirm the EAS keystore is backed up offline.
