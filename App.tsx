import React, { useEffect, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useSetupStore } from "./src/store/useSetupStore";
import { useSettingsStore, useDeviceStore } from "./src/store/useSettingsStore";
import { useLibraryStore } from "./src/store/useLibraryStore";
import { useTheme } from "./src/useTheme";
import { SetupScreen } from "./src/screens/SetupScreen";
import { GalleryScreen } from "./src/screens/GalleryScreen";
import { CollectionsScreen, AlbumScreen } from "./src/screens/CollectionsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ViewerScreen } from "./src/screens/ViewerScreen";
import { FolderSyncScreen } from "./src/screens/FolderSyncScreen";
import { LockScreen } from "./src/screens/LockScreen";
import {
  PeriodScreen,
  MonthsOfYearScreen,
  PeriodPhotosScreen,
} from "./src/screens/PeriodScreens";
import { MapScreen } from "./src/screens/MapScreen";
import { MaintenanceScreen } from "./src/screens/MaintenanceScreen";
import { pollUpdates } from "./src/lib/updates";
import { canAutoSyncNow, scanRecentAndEnqueue } from "./src/lib/sync";
import { startCameraWatch, stopCameraWatch } from "./src/lib/watcher";
import {
  registerBackgroundSync,
  unregisterBackgroundSync,
} from "./src/lib/background";
import { processQueue } from "./src/lib/uploader";
import { purgeExpiredTrash, kvGet, kvSet } from "./src/lib/db";
import { uploadBackupToChannel } from "./src/lib/backup";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ fontSize: 20, color, lineHeight: 24 }}>{glyph}</Text>;
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
        options={{ title: "Gallery", tabBarIcon: ({ color }) => <TabIcon glyph="▦" color={color} /> }}
      />
      <Tab.Screen
        name="CollectionsTab"
        component={CollectionsScreen}
        options={{ title: "Collections", tabBarIcon: ({ color }) => <TabIcon glyph="☰" color={color} /> }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ title: "Settings", tabBarIcon: ({ color }) => <TabIcon glyph="⚙" color={color} /> }}
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

function Root({ locked }: { locked: boolean }) {
  const step = useSetupStore((s) => s.step);
  if (locked) return <LockScreen onUnlock={() => setUnlocked()} />;
  if (step === "loading") return <Splash />;
  if (step === "ready") {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={Tabs} />
          <Stack.Screen
            name="Viewer"
            component={ViewerScreen}
            options={{ presentation: "fullScreenModal", animation: "fade" }}
          />
          <Stack.Screen name="Album" component={AlbumScreen} />
          <Stack.Screen name="FolderSync" component={FolderSyncScreen} />
          <Stack.Screen name="Map" component={MapScreen} options={{ presentation: "fullScreenModal" }} />
          <Stack.Screen name="Years" component={(props: any) => <PeriodScreen {...props} mode="years" />} />
          <Stack.Screen name="MonthsOfYear" component={MonthsOfYearScreen} />
          <Stack.Screen name="PeriodPhotos" component={PeriodPhotosScreen} />
          <Stack.Screen name="Maintenance" component={MaintenanceScreen} />
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
      setInitialized(true);
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && useSettingsStore.getState().prefs.appLock) {
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
        <Root locked={locked} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

let bootstrapping = false;

async function bootstrapBackgroundTasks(): Promise<void> {
  if (bootstrapping) return;
  bootstrapping = true;
  try {
    const { prefs } = useSettingsStore.getState();
    await purgeExpiredTrash(prefs.trashAutoPurgeDays);
    try {
      await pollUpdates();
    } catch {}
    if (prefs.autoSync) {
      if (await canAutoSyncNow(prefs)) {
        const since = Math.max(
          prefs.lastFullSyncAt,
          Date.now() - prefs.autoSyncIntervalHours * 3600 * 1000
        );
        const enqueued = await scanRecentAndEnqueue(since);
        if (enqueued > 0) void processQueue();
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
