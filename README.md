<div align="center">

<h1>PhotogramBot</h1>

<p><strong>Use your own Telegram bot to back up photos and videos to a private channel.</strong></p>

<p><strong><a href="https://github.com/Avithegod2010/photogrambot/releases/download/v1.4.0-preview.1/photogrambot-1.4.0-preview-resigned.apk">⬇️ Download preview APK</a></strong> · <a href="#in-app-setup">🤖 Set up your bot</a> · <a href="https://github.com/Avithegod2010/photogrambot/releases/tag/v1.4.0-preview.1">Preview release notes</a></p>

<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="readme-hero.png" />
  <img src="readme-hero.gif" width="820" alt="An illustration of photos moving from a phone via a bot to a locked Telegram channel" />
</picture>

<p><sub>Android · v1.4.0-preview.1</sub></p>

</div>

<a name="in-app-setup"></a>

## 🤖 In-app setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and create a **private Telegram channel** you control.
2. Add the bot to the channel as an admin with permission to post messages.
3. In PhotogramBot, paste the bot token and tap **Verify**. Choose the detected channel or enter its channel ID.
4. Start a backup. Once an item appears in the archive, open it and use **Save** to try restoring the original.

> [!NOTE]
> The preview APK uses a debug signing key. Check the [release notes](https://github.com/Avithegod2010/photogrambot/releases/tag/v1.4.0-preview.1) before installing over an existing build.

<a name="highlights"></a>

<a name="features"></a>

## 📷 Features

| 📤 Back up originals | 📷 Browse your gallery | 📥 Restore files |
| --- | --- | --- |
| Send a preview and full-quality photo to your channel. Pause for Wi-Fi or charging and retry individual items. | Use albums, favorites, trips and search through the local gallery index. | Save individual originals, restore missing items or move the library with an encrypted index. |

<details>
<summary>More gallery and maintenance tools</summary>

- Share photos and videos from Android apps, prioritize uploads and pause with low storage.
- Group photos by date or location, browse the map and use on-device image search tools.
- Use a PIN or biometrics to lock the app. Check archive health, find duplicates and export the library index as CSV.
- Customize gallery columns, accents, themes, captions and the home-screen photo widget.

</details>

<a name="how-it-works"></a>

<a name="backup--restore-explained"></a>

## 📦 Backup & restore explained

| What you want to recover | Where it lives | How to restore it |
| --- | --- | --- |
| One original | A document in your Telegram channel | Open it in the app and tap **Save**. |
| Missing originals | Your Telegram media archive | Use **Maintenance → Restore all originals**. |
| Albums, favorites and the library index on a new phone | An encrypted index backup pinned in your channel | On your old phone, use **Maintenance → Backup to channel**. On the new phone, restore it with the passphrase when the setup wizard detects it. |

<a name="privacy"></a>

## 🔒 Privacy

The bot token is stored on-device in Android’s secure storage, and your media goes to the channel you choose. The optional Gemini features can send data to Google when enabled with your own key. [Security policy](SECURITY.md) · [AI processing details](docs/ON_DEVICE_AI.md)

## Known limitations

- For originals larger than 20 MB that the hosted Bot API can’t return to the app, download the document directly in Telegram.
- Video uploads in parts and multi-destination mirroring are experimental. Android is the supported platform.

<a name="building"></a>

## 🛠️ Building

<details>
<summary>Build and test locally</summary>

Use Node.js 20 or newer, JDK 17 and the Android SDK. The `android/` project is already checked in.

```bash
npm ci
npx expo run:android
```

Run `npm run check` for TypeScript and tests. [Release building and signing](docs/RELEASE.md) · [Project architecture](docs/ARCHITECTURE.md)

</details>

## Project links

[Changelog](CHANGELOG.md) · [MIT license](LICENSE) · [Photogram for a personal Telegram account](https://github.com/Avithegod2010/photogram)
