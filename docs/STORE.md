# Store listing & privacy

This document is the working draft for a Google Play (and later, optional iOS)
listing. It doubles as the **privacy policy** text that the Play Console
requires before the app can be published.

The app is currently shipped as a self-hosted **preview APK** through the
in-app updater (GitHub Releases) rather than the Play Store. The store track is
still a release blocker — see the "Production release" section.

## Privacy policy

**PhotogramBot** is a personal photo/video backup app. It does not collect, sell,
or transmit your data to any first-party server.

- **What it stores.** Your media is uploaded to a Telegram **channel that you
  own and control** using a bot token you provide. That channel is the backup
  destination; the developer never receives a copy. App preferences, the bot
  token, the channel id, and the AI captioning key are kept in the device's
  secure storage (Android Keystore via `expo-secure-store`).
- **Encryption.** Database backups can be optionally encrypted with a
  passphrase you choose (AES-256-GCM, key derived with PBKDF2-HMAC-SHA256 at
  600 000 iterations). The passphrase is never transmitted.
- **Third parties.**
  - **Telegram** — receives your media and its metadata captions (the only
    network destination for backups).
  - **Google Gemini** — used *only* if you opt in to AI captions or screenshot
    OCR, and *only* for the image/text you explicitly choose to analyze.
  - No analytics, no crash-reporting SDKs, no advertising identifiers.
- **Permissions.** Photo/media library (to back up your library), notifications
  (upload progress), and background execution (scheduled syncs). Each is
  requested at the point of use and can be revoked from system settings.
- **Your rights.** Uninstalling the app removes its local index. The cloud copy
  in your Telegram channel remains until you delete it there. The app's
  "Free up space" and trash features let you manage what stays on the device
  versus in the channel.
- **Children.** Not directed at children; not knowingly used to collect data
  from anyone under 13.

## Listing copy (draft)

- **Short description.** Back up your phone's photos and videos to your own
  Telegram channel — a private, searchable, Google Photos-style archive you
  control.
- **Key features.** Auto-sync over Wi-Fi + charging, original + preview
  backups, smart collections and trips, on-device search, encrypted channel
  backups, app lock with decoy mode, share-sheet backup, and remote control
  from Telegram.
- **Data safety section.** Data encrypted in transit (Telegram) and optionally
  at rest (your passphrase). No data shared with third parties except Telegram
  (backup destination) and Google Gemini (only if AI captions are enabled).

## Production release (Play Console)

The Play track has **not** been started. When the time comes:

1. Build the AAB with the EAS production profile:
   `eas build -p android --profile production`
   (EAS generates its own upload keystore for cloud builds unless you upload
   the local `pb-release.keystore` via `eas credentials`).
2. Upload the AAB to the Play Console internal/closed track and roll out.
3. Decide on the keystore: adopt the EAS-managed key permanently, or back up
   the local `pb-release.keystore`. **Do not** start the production track until
   the release-blocking items (device verification, in-app updater, keystore
   decision) are closed.

> This command is documented only — it is **not** run as part of the
> no-phone work. The current published artifact is the preview APK from the
> in-app updater.
