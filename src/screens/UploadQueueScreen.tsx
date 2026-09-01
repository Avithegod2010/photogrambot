import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import {
  getQueueCounts,
  getQueueItems,
  removeQueueItem,
  retryQueueItem,
  type QueueRow,
} from "../lib/db";
import { processQueue } from "../lib/uploader";
import { formatBytes } from "../lib/format";
import { useLibraryStore } from "../store/useLibraryStore";
import { RetryIcon, TrashIcon } from "../components/icons";

const STATE_ORDER: Record<string, number> = { running: 0, pending: 1, failed: 2 };
const PAGE_LIMIT = 200;

export function UploadQueueScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const refreshMeta = useLibraryStore((s) => s.refreshMeta);

  const [items, setItems] = useState<QueueRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const [c, rows] = await Promise.all([
      getQueueCounts(),
      getQueueItems(["running", "pending", "failed"], PAGE_LIMIT),
    ]);
    setCounts(c);
    setItems(
      [...rows].sort((a, b) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9))
    );
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  async function retry(item: QueueRow) {
    setBusyId(item.id);
    try {
      if (await retryQueueItem(item.id)) {
        await refresh();
        void processQueue();
      }
    } catch (e: any) {
      Alert.alert("Retry failed", e?.message ?? "Could not requeue this item.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: QueueRow) {
    setBusyId(item.id);
    try {
      if (await removeQueueItem(item.id)) {
        await refresh();
        await refreshMeta();
      }
    } catch (e: any) {
      Alert.alert("Remove failed", e?.message ?? "Could not remove this item.");
    } finally {
      setBusyId(null);
    }
  }

  const running = counts.running ?? 0;
  const pending = counts.pending ?? 0;
  const failed = counts.failed ?? 0;
  const capped = running + pending + failed > items.length;

  function stateChip(state: QueueRow["state"]) {
    const map: Record<string, { label: string; color: ColorValue }> = {
      running: { label: "Uploading", color: theme.colors.primary },
      pending: { label: "Pending", color: theme.colors.onSurfaceVariant },
      failed: { label: "Failed", color: theme.colors.error },
    };
    const s = map[state] ?? { label: state, color: theme.colors.onSurfaceVariant };
    return <Text style={{ color: s.color, fontSize: 11, fontWeight: "700" }}>{s.label}</Text>;
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Upload queue</Text>
      </View>
      <View style={styles.countsRow}>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, fontWeight: "600" }}>
          Uploading {running}
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, fontWeight: "600" }}>
          Pending {pending}
        </Text>
        <Text
          style={{
            color: failed > 0 ? theme.colors.error : theme.colors.onSurfaceVariant,
            fontSize: 12.5,
            fontWeight: "600",
          }}
        >
          Failed {failed}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: theme.colors.surface }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text
                  style={{
                    color: theme.colors.onSurface,
                    fontWeight: "600",
                    fontSize: 14,
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {item.filename}
                </Text>
                {stateChip(item.state)}
              </View>
              <Text
                style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}
                numberOfLines={1}
              >
                {[
                  item.folder ?? "Unfiled",
                  formatBytes(item.size),
                  item.retries > 0 ? `${item.retries} retry${item.retries === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {item.state === "failed" && item.error ? (
                <Text
                  style={{ color: theme.colors.error, fontSize: 12, marginTop: 4, lineHeight: 16 }}
                  numberOfLines={2}
                >
                  {item.error}
                </Text>
              ) : null}
            </View>
            {item.state === "failed" ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void retry(item)}
                  disabled={busyId === item.id}
                  style={styles.iconBtn}
                  hitSlop={8}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <RetryIcon color={theme.colors.primary} size={20} />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => void remove(item)}
                  disabled={busyId === item.id}
                  style={styles.iconBtn}
                  hitSlop={8}
                >
                  <TrashIcon color={theme.colors.error} size={20} />
                </Pressable>
              </View>
            ) : item.state === "pending" ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void remove(item)}
                  disabled={busyId === item.id}
                  style={styles.iconBtn}
                  hitSlop={8}
                >
                  <TrashIcon color={theme.colors.onSurfaceVariant} size={20} />
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <Text
            style={{
              color: theme.colors.onSurfaceVariant,
              fontSize: 13.5,
              textAlign: "center",
              marginTop: 40,
            }}
          >
            Queue is empty — nothing is waiting to upload.
          </Text>
        }
        ListFooterComponent={
          capped ? (
            <Text
              style={{
                color: theme.colors.onSurfaceVariant,
                fontSize: 12,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              Showing the latest {PAGE_LIMIT} — the rest appear as the queue drains.
            </Text>
          ) : null
        }
      />
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
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
  },
  countsRow: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
