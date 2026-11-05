import fs from "fs";
import path from "path";
import type { ExpoConfig } from "expo/config";
import type { WithAndroidWidgetsParams } from "react-native-android-widget";

// android/version.properties (COMMITTED) is the single source of truth for the
// release version. Read it here so app.config.ts can never drift from the native
// build (android/app/build.gradle reads the same file).
function readReleaseVersion(): { versionCode: number; versionName: string } {
  try {
    const raw = fs.readFileSync(
      path.resolve(__dirname, "android", "version.properties"),
      "utf8",
    );
    const get = (key: string): string | undefined =>
      raw.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, "m"))?.[1];
    const versionCode = parseInt(get("versionCode") ?? "1", 10);
    return {
      versionCode: Number.isFinite(versionCode) && versionCode > 0 ? versionCode : 1,
      versionName: get("versionName") ?? "1.0.0",
    };
  } catch {
    return { versionCode: 1, versionName: "1.0.0" };
  }
}

const releaseVersion = readReleaseVersion();

const widgetConfig: WithAndroidWidgetsParams = {
  widgets: [
    {
      name: "RandomPhoto",
      label: "PhotogramBot",
      description: "Shows a random photo from your PhotogramBot gallery",
      minWidth: "180dp",
      minHeight: "180dp",
      resizeMode: "horizontal|vertical",
      updatePeriodMillis: 6 * 60 * 60 * 1000,
    },
    {
      name: "OnThisDay",
      label: "On this day",
      description: "A photo taken on today's date in an earlier year",
      minWidth: "180dp",
      minHeight: "180dp",
      resizeMode: "horizontal|vertical",
      updatePeriodMillis: 24 * 60 * 60 * 1000,
    },
    {
      name: "Mosaic",
      label: "Photo mosaic",
      description: "A 2x2 mosaic of photos from your archive",
      minWidth: "250dp",
      minHeight: "250dp",
      resizeMode: "horizontal|vertical",
      updatePeriodMillis: 6 * 60 * 60 * 1000,
    },
    {
      name: "QuickCapture",
      label: "Quick capture",
      description: "Open the camera and back up a shot immediately",
      minWidth: "110dp",
      minHeight: "110dp",
      resizeMode: "horizontal|vertical",
      updatePeriodMillis: 24 * 60 * 60 * 1000,
    },
  ],
};

const config: ExpoConfig = {
  name: "PhotogramBot",
  slug: "photogrambot",
  version: releaseVersion.versionName,
  scheme: "photogrambot",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#101014",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.photogrambot.app",
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        "PhotogramBot needs access to your photos to back them up to your Telegram channel.",
      NSPhotoLibraryAddUsageDescription:
        "PhotogramBot needs permission to save photos back to your library.",
    },
  },
  android: {
    package: "com.photogrambot.app",
    versionCode: releaseVersion.versionCode,
    adaptiveIcon: {
      backgroundColor: "#101014",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: [
      "READ_MEDIA_IMAGES",
      "READ_MEDIA_VIDEO",
      "ACCESS_MEDIA_LOCATION",
      "READ_EXTERNAL_STORAGE",
      "CAMERA",
    ],
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: "SEND",
        category: ["DEFAULT"],
        data: [{ mimeType: "image/*" }, { mimeType: "video/*" }],
      },
      {
        action: "SEND_MULTIPLE",
        category: ["DEFAULT"],
        data: [{ mimeType: "image/*" }, { mimeType: "video/*" }],
      },
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  extra: {
    eas: {
      projectId: "421f1e6b-cda7-4f20-a6f1-dc972c76c0f4",
    },
  },
  plugins: [
    // SQLCipher is compiled in so Settings can encrypt the local index on
    // demand. Existing databases stay plaintext until the user opts in.
    ["expo-sqlite", { useSQLCipher: true }],
    "expo-secure-store",
    "expo-media-library",
    ["react-native-android-widget", widgetConfig],
    // TFLite runtime for the downloadable on-device models. Models are NOT
    // bundled in the APK; they are downloaded from Settings.
    "react-native-fast-tflite",
    // Android certificate pinning for api.telegram.org + api.github.com.
    "./plugins/withCertificatePinning",
    [
      "expo-image-picker",
      {
        cameraPermission:
          "PhotogramBot uses the camera for quick capture from the home-screen widget.",
      },
    ],
  ],
};

export default config;
