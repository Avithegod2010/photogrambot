import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useSettingsStore } from "../store/useSettingsStore";
import { listDeviceFolders, type DeviceFolder } from "../lib/sync";

export function FolderSyncScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, update } = useSettingsStore();
  const [folders, setFolders] = useState<DeviceFolder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDeviceFolders()
      .then(setFolders)
      .finally(() => setLoading(false));
  }, []);

  const excluded = new Set(prefs.excludedFolders);

  function toggleFolder(name: string, include: boolean) {
    const next = new Set(excluded);
    if (include) next.delete(name);
    else next.add(name);
    void update({ excludedFolders: Array.from(next) });
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Text
          style={{ color: theme.colors.onSurface, fontSize: 20 }}
          onPress={() => navigation.goBack()}
        >
          ←
        </Text>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Folder sync</Text>
      </View>
      <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Folders switched off are never uploaded by auto-sync. Turn a folder off to exclude it.
      </Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => {
            const isExcluded = excluded.has(item.name);
            return (
              <View style={[styles.row, { backgroundColor: theme.colors.surface }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "600" }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                    {item.count} photo{item.count === 1 ? "" : "s"}
                  </Text>
                </View>
                <Switch
                  value={!isExcluded}
                  onValueChange={(v) => toggleFolder(item.name, v)}
                  trackColor={{ false: theme.colors.surfaceHighest, true: theme.colors.primaryContainer }}
                  thumbColor={!isExcluded ? theme.colors.primary : theme.colors.onSurfaceVariant}
                />
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 14,
  },
});
