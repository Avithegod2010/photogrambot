import type { ExpoConfig } from "expo/config";
import type { WithAndroidWidgetsParams } from "react-native-android-widget";

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
  ],
};

const config: ExpoConfig = {
  name: "PhotogramBot",
  slug: "photogrambot",
  version: "0.1.0",
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
    versionCode: 1,
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
    ],
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: "android.intent.action.SEND",
        category: ["android.intent.category.DEFAULT"],
        data: [{ mimeType: "image/*" }, { mimeType: "video/*" }],
      },
      {
        action: "android.intent.action.SEND_MULTIPLE",
        category: ["android.intent.category.DEFAULT"],
        data: [{ mimeType: "image/*" }, { mimeType: "video/*" }],
      },
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-sqlite",
    "expo-secure-store",
    "expo-media-library",
    ["react-native-android-widget", widgetConfig],
  ],
};

export default config;
