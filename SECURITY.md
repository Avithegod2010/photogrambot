# Security policy

## Supported versions

Only the latest published `main` build (preview APK via the in-app updater or the
current Play/Test track) receives fixes. There are no long-term support branches.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

- Email the maintainer through GitHub (Avithegod2010) with a description, steps
  to reproduce, and impact.
- Or open a private security advisory via the repository's "Security" tab
  (GitHub Advisories) if you have the permissions.

You can expect an acknowledgement within a few days. Because this is a solo
maintained, single-user backup app, "disclosure" is usually a matter of shipping
a fixed build to the updater channel quickly.

## Scope

PhotogramBot is a personal backup utility. The sensitive data is **your media in
your own Telegram channel** plus locally-stored credentials:

- Bot token, channel id, AI key, and backup passphrase live in Android Keystore
  (`expo-secure-store`) and are never transmitted except the channel id/token,
  which go only to `api.telegram.org` to perform the backup.
- Database backups are encrypted client-side (AES-256-GCM, PBKDF2-HMAC-SHA256)
  with a passphrase you set; the passphrase is never sent anywhere.
- The "decoy PIN" feature presents a separate, empty gallery; it is a privacy
  convenience, not a hardened multi-user sandbox.

## Out of scope / known limitations

- The app is not a multi-user service; there is no server-side account.
- People/face clustering is intentionally not implemented (no on-device face
  embedding model) — see `AGENTS.md`.
- iOS builds have never been produced or tested.
