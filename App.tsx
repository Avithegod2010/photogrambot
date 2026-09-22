import React, { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useSetupStore } from "./src/store/useSetupStore";
import { useSettingsStore, useDeviceStore } from "./src/store/useSettingsStore";
import { useLibraryStore } from "./src/store/useLibraryStore";
import { useTheme } from "./src/useTheme";
import { SetupScreen } from "./src/screens/SetupScreen";
import { GalleryScreen } from "./src/screens/GalleryScreen";
import { CollectionsScreen, AlbumScreen, LibraryScreen } from "./src/screens/CollectionsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ViewerScreen } from "./src/screens/ViewerScreen";
import { FolderSyncScreen } from "./src/screens/FolderSyncScreen";
import { LockScreen } from "./src/screens/LockScreen";
import {
  MonthsOfYearScreen,
  PeriodPhotosScreen,
} from "./src/screens/PeriodScreens";
import { MapScreen } from "./src/screens/MapScreen";
import { MaintenanceScreen } from "./src/screens/MaintenanceScreen";
import { UploadQueueScreen } from "./src/screens/UploadQueueScreen";
import { FreeUpSpaceScreen } from "./src/screens/FreeUpSpaceScreen";
import { DestinationsScreen } from "./src/screens/DestinationsScreen";
import { SearchResultsScreen } from "./src/screens/SearchResultsScreen";
import { pollUpdates } from "./src/lib/updates";
import { canAutoSyncNow, scanRecentAndEnqueue } from "./src/lib/sync";
import { startCameraWatch, stopCameraWatch } from "./src/lib/watcher";
import { getSharedMedia } from "./modules/share-intent";
import { ShareTargetSheet } from "./src/components/ShareTargetSheet";
import { PhotoFrameIcon, CloudIcon, SearchIcon, GearIcon } from "./src/components/icons";
import { requestNotificationPermission } from "./src/lib/notify";
import { setDecoyActive, isDecoyActive } from "./src/lib/applock";
import {
  registerBackgroundSync,
  unregisterBackgroundSync,
} from "./src/lib/background";
import { processQueue } from "./src/lib/uploader";
import { purgeExpiredTrash, kvGet, kvSet } from "./src/lib/db";
import { uploadBackupToChannel } from "./src/lib/backup";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef<any>();

async function openPhotoFromUrl(url: string | null): Promise<void> {
  if (!url || !url.startsWith("photogrambot://photo/")) return;
  if (isDecoyActive()) return;
  const id = url.replace("photogrambot://photo/", "").split("?")[0];
  if (!id) return;
  try {
    const { getPhoto } = await import("./src/lib/db");
    const photo = await getPhoto(id);
    if (photo && navigationRef.isReady()) {
      navigationRef.navigate("Viewer", { photos: [photo], index: 0 });
    }
  } catch {}
}

function CloudTab(props: any) {
  // Telephoto-style Cloud tab — reuses LibraryScreen's uploaded-photo grid.
  return (
    <LibraryScreen
      {...props}
      route={{ ...props.route, params: { filter: "cloud", title: "Cloud", tab: true } }}
    />
  );
}

// Never rendered: the tab's tabBarButton intercepts the press and navigates
// to the stack-level Settings screen, so no dummy route ever mounts.
function SettingsTabPlaceholder() {
  return null;
}

function Tabs() {
  const theme = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:
          typeof theme.colors.primary === "string"
            ? (theme.colors.primary as string)
            : "#A8C7FA",
        tabBarInactiveTintColor:
          typeof theme.colors.onSurfaceVariant === "string"
            ? (theme.colors.onSurfaceVariant as string)
            : "#C4C6D0",
        tabBarStyle: {
          backgroundColor: theme.colors.surfaceContainer,
          borderTopColor: theme.colors.outlineVariant,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="GalleryTab"
        component={GalleryScreen}
        options={{ title: "Gallery", tabBarIcon: ({ color }) => <PhotoFrameIcon color={color} /> }}
      />
      <Tab.Screen
        name="CloudTab"
        component={CloudTab}
        options={{ title: "Cloud", tabBarIcon: ({ color }) => <CloudIcon color={color} /> }}
      />
      <Tab.Screen
        name="CollectionsTab"
        component={CollectionsScreen}
        options={{ title: "Collections", tabBarIcon: ({ color }) => <SearchIcon color={color} /> }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsTabPlaceholder}
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <GearIcon color={color} />,
          tabBarButton: (props) => (
            <Pressable
              {...(props as any)}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => {
                // A decoy session must not expose the real settings entry.
                if (!isDecoyActive()) navigationRef.navigate("Settings");
              }}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function Splash() {
  const theme = useTheme();
  return (
    <View style={[styles.splash, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator color="#A8C7FA" />
      <Text style={[styles.splashText, { color: theme.colors.onSurfaceVariant }]}>
        Starting PhotogramBot…
      </Text>
    </View>
  );
}

function Root({ locked, initialized }: { locked: boolean; initialized: boolean }) {
  const step = useSetupStore((s) => s.step);
  // Stay on the splash until stores are loaded so an app-locked device never
  // flashes the gallery for a frame before the lock engages.
  if (!initialized || step === "loading") return <Splash />;
  if (locked) return <LockScreen onUnlock={() => setUnlocked()} />;
  if (step === "ready") {
    return (
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          void Linking.getInitialURL().then(openPhotoFromUrl);
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={Tabs} />
          <Stack.Screen
            name="Viewer"
            component={ViewerScreen}
            options={{ presentation: "fullScreenModal", animation: "fade" }}
          />
          <Stack.Screen name="Album" component={AlbumScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="FolderSync" component={FolderSyncScreen} />
          <Stack.Screen name="Map" component={MapScreen} options={{ presentation: "fullScreenModal" }} />
          <Stack.Screen name="MonthsOfYear" component={MonthsOfYearScreen} />
          <Stack.Screen name="PeriodPhotos" component={PeriodPhotosScreen} />
          <Stack.Screen name="Maintenance" component={MaintenanceScreen} />
          <Stack.Screen name="UploadQueue" component={UploadQueueScreen} />
          <Stack.Screen name="FreeUpSpace" component={FreeUpSpaceScreen} />
          <Stack.Screen name="Destinations" component={DestinationsScreen} />
          <Stack.Screen name="SearchResults" component={SearchResultsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }
  return <SetupScreen />;
}

let globalUnlock: (() => void) | null = null;
function setUnlocked() {
  globalUnlock?.();
}

export default function App() {
  const initialize = useSetupStore((s) => s.initialize);
  const step = useSetupStore((s) => s.step);
  const loadSettings = useSettingsStore((s) => s.load);
  const ensureDeviceId = useDeviceStore((s) => s.ensureDeviceId);
  const appLock = useSettingsStore((s) => s.prefs.appLock);
  const [locked, setLocked] = useState(appLock);
  const [initialized, setInitialized] = useState(false);
  const [sharedUris, setSharedUris] = useState<string[]>([]);

  useEffect(() => {
    if (step !== "ready" || locked) return;
    const check = () => {
      const { uris } = getSharedMedia();
      if (uris.length > 0) setSharedUris(uris);
    };
    check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    const urlSub = Linking.addEventListener("url", ({ url }) => {
      void openPhotoFromUrl(url);
    });
    return () => {
      sub.remove();
      urlSub.remove();
    };
  }, [step, locked]);

  useEffect(() => {
    globalUnlock = () => setLocked(false);
    return () => {
      globalUnlock = null;
    };
  }, []);

  useEffect(() => {
    if (initialized) setLocked(appLock);
  }, [appLock, initialized]);

  useEffect(() => {
    (async () => {
      await loadSettings();
      await ensureDeviceId();
      await initialize();
      // Resolve the lock state from freshly loaded prefs BEFORE the first
      // non-splash paint, or an app-locked device flashes the gallery a frame.
      setLocked(useSettingsStore.getState().prefs.appLock);
      setInitialized(true);
    })();
  }, []);

  useEffect(() => {
    if (step !== "ready" || locked) return;
    // While the app is foregrounded, poll the bot for remote commands
    // (/status /sync /pause /resume /delete) every 60 s and on each
    // foreground transition. getUpdates' server-side offset already
    // dedupes; the in-flight guard prevents overlapping local runs.
    void pollUpdatesOnce();
    const timer = setInterval(() => {
      // A decoy session must look exactly like the owner's absence — no
      // channel activity (no /sync drain, no bot replies) while it's active.
      if (!isDecoyActive()) void pollUpdatesOnce();
    }, 60_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !isDecoyActive()) void pollUpdatesOnce();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [step, locked]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && useSettingsStore.getState().prefs.appLock) {
        setDecoyActive(false);
        setLocked(true);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (step !== "ready" || locked) return;
    const timer = setTimeout(() => {
      void bootstrapBackgroundTasks();
    }, 1500);
    return () => clearTimeout(timer);
  }, [step, locked]);

  const autoSyncEnabled = useSettingsStore((s) => s.prefs.autoSync);
  useEffect(() => {
    if (step !== "ready" || locked) return;
    if (autoSyncEnabled) {
      void startCameraWatch();
      void registerBackgroundSync();
    } else {
      stopCameraWatch();
      void unregisterBackgroundSync();
    }
  }, [autoSyncEnabled, step, locked]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Root locked={locked} initialized={initialized} />
        {sharedUris.length > 0 ? (
          <ShareTargetSheet uris={sharedUris} onClose={() => setSharedUris([])} />
        ) : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

let bootstrapping = false;

// Foreground remote-control polling shares one in-flight guard with the
// bootstrap pass — overlapping getUpdates runs could double-execute commands.
let pollingUpdates = false;
async function pollUpdatesOnce(): Promise<void> {
  if (pollingUpdates) return;
  pollingUpdates = true;
  try {
    await pollUpdates();
  } catch {
  } finally {
    pollingUpdates = false;
  }
}

async function bootstrapBackgroundTasks(): Promise<void> {
  if (bootstrapping) return;
  bootstrapping = true;
  try {
    const { prefs } = useSettingsStore.getState();
    await purgeExpiredTrash(prefs.trashAutoPurgeDays);
    // The failure banner must reach manual-sync users too — permission is
    // global, not an auto-sync feature.
    void requestNotificationPermission();
    try {
      await pollUpdatesOnce();
    } catch {}
    if (prefs.autoSync) {
      if (await canAutoSyncNow(prefs)) {
        const since = Math.max(
          prefs.lastFullSyncAt,
          Date.now() - prefs.autoSyncIntervalHours * 3600 * 1000
        );
        await scanRecentAndEnqueue(since);
        // Resume whatever is already pending too — a cold start with a large
        // backlog must not sit idle just because nothing new was scanned.
        void processQueue();
      }
      void startCameraWatch();
      void registerBackgroundSync();
    } else {
      stopCameraWatch();
      void unregisterBackgroundSync();
    }
    if (prefs.dbAutoBackup) {
      const lastBackup = await kvGet("last_auto_backup");
      const last = lastBackup ? parseInt(lastBackup, 10) : 0;
      if (Date.now() - last > 24 * 3600 * 1000) {
        try {
          await uploadBackupToChannel();
          await kvSet("last_auto_backup", String(Date.now()));
        } catch {}
      }
    }
    useLibraryStore.getState().refreshMeta();
  } finally {
    bootstrapping = false;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  splashText: {
    fontSize: 13,
  },
});
