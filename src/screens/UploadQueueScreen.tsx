import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "../rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import {
  getQueueCounts,
  getQueueItems,
  getUploadThroughput,
  removeQueueItem,
  retryQueueItem,
  type QueueRow,
  type UploadThroughput,
} from "../lib/db";
import { processQueue } from "../lib/uploader";
import { formatBytes } from "../lib/format";
import { useLibraryStore } from "../store/useLibraryStore";
import { RetryIcon, TrashIcon, WarningIcon } from "../components/icons";
import {
  AppBar,
  Button,
  EmptyState,
  IconButton,
  Stat,
  StatusPill,
} from "../components/ui";
import { radius, spacing, typography } from "../theme";
import type { StatusKind } from "../theme";

const STATE_ORDER: Record<string, number> = { running: 0, pending: 1, failed: 2 };
const PAGE_LIMIT = 200;

function statusFor(state: QueueRow["state"]): StatusKind {
  if (state === "running") return "uploading";
  if (state === "failed") return "failed";
  return "queued";
}

export function UploadQueueScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const refreshMeta = useLibraryStore((s) => s.refreshMeta);

  const [items, setItems] = useState<QueueRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [throughput, setThroughput] = useState<UploadThroughput | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [c, rows, tp] = await Promise.all([
      getQueueCounts(),
      getQueueItems(["running", "pending", "failed"], PAGE_LIMIT),
      getUploadThroughput(),
    ]);
    setCounts(c);
    setThroughput(tp);
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
    setNotice(null);
    try {
      if (await retryQueueItem(item.id)) {
        await refresh();
        void processQueue();
      }
    } catch (e: any) {
      setNotice(e?.message ?? "Could not requeue this item.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: QueueRow) {
    setBusyId(item.id);
    setNotice(null);
    try {
      if (await removeQueueItem(item.id)) {
        await refresh();
        await refreshMeta();
      }
    } catch (e: any) {
      setNotice(e?.message ?? "Could not remove this item.");
    } finally {
      setBusyId(null);
    }
  }

  const running = counts.running ?? 0;
  const pending = counts.pending ?? 0;
  const failed = counts.failed ?? 0;
  const capped = running + pending + failed > items.length;
  const total = running + pending;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AppBar title="Upload queue" onBack={() => navigation.goBack()} theme={theme} borderless />

      <View style={[styles.summary, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.statsRow} accessibilityLiveRegion="polite">
          <Stat label="Uploading" value={String(running)} theme={theme} />
          <Stat label="Waiting" value={String(pending)} theme={theme} />
          <Stat
            label="Failed"
            value={String(failed)}
            theme={theme}
            hint={failed > 0 ? "Needs attention" : "All healthy"}
          />
        </View>
      </View>

      {throughput && throughput.lastHour > 0 ? (
        <View style={[styles.throughputRow, { backgroundColor: theme.colors.surfaceContainer }]}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallStrong, { color: theme.colors.onSurface }]}>
              {throughput.perMinute}/min this hour
            </Text>
            <Text style={[typography.caption, { color: theme.colors.onSurfaceVariant, marginTop: 2 }]}>
              {throughput.lastHour} uploaded · {throughput.recentPerMinute}/min last 10 min
            </Text>
          </View>
          <View style={styles.spark} accessible={false} importantForAccessibility="no">
            {throughput.buckets.map((n, i) => {
              const max = Math.max(1, ...throughput.buckets);
              const h = 4 + Math.round((n / max) * 20);
              return (
                <View
                  key={i}
                  style={{
                    width: 5,
                    height: h,
                    borderRadius: 2,
                    backgroundColor: n > 0 ? theme.colors.primary : theme.colors.surfaceVariant,
                    opacity: 0.4 + 0.6 * (i / throughput.buckets.length),
                  }}
                />
              );
            })}
          </View>
        </View>
      ) : null}

      {notice ? (
        <View
          style={[styles.notice, { backgroundColor: theme.colors.errorContainer }]}
          accessibilityLiveRegion="assertive"
        >
          <WarningIcon color={theme.colors.error} size={18} />
          <Text style={[typography.small, { color: theme.colors.error, flex: 1 }]}>{notice}</Text>
          <Pressable
            onPress={() => setNotice(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
            hitSlop={8}
          >
            <Text style={{ color: theme.colors.error, fontWeight: "700" }}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + 60,
        }}
        renderItem={({ item }) => {
          const busy = busyId === item.id;
          return (
            <View style={[styles.row, { backgroundColor: theme.colors.surface }]}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text
                    style={[typography.bodyStrong, { color: theme.colors.onSurface, flexShrink: 1 }]}
                    numberOfLines={1}
                  >
                    {item.filename}
                  </Text>
                  <StatusPill status={statusFor(item.state)} theme={theme} />
                </View>
                <Text
                  style={[typography.caption, { color: theme.colors.onSurfaceVariant, marginTop: 2 }]}
                  numberOfLines={1}
                >
                  {[
                    item.folder ?? "Unfiled",
                    formatBytes(item.size),
                    item.retries > 0 ? `${item.retries} retry${item.retries === 1 ? "" : "s"}` : null,
                    // Priority lanes (R27): make the lane visible so "why is my
                    // screenshot last?" has an answer.
                    item.priority === 0 ? "priority" : item.priority === 2 ? "low priority" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {item.state === "failed" && item.error ? (
                  <Text
                    style={[typography.small, { color: theme.colors.error, marginTop: spacing.xs }]}
                    numberOfLines={3}
                  >
                    {item.error}
                  </Text>
                ) : null}
              </View>
              {item.state === "failed" ? (
                <View style={styles.actions}>
                  <IconButton
                    icon={
                      busy ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : (
                        <RetryIcon color={theme.colors.primary} size={20} />
                      )
                    }
                    label={`Retry ${item.filename}`}
                    theme={theme}
                    disabled={busy}
                    onPress={() => void retry(item)}
                  />
                  <IconButton
                    icon={<TrashIcon color={theme.colors.error} size={20} />}
                    label={`Remove ${item.filename} from the queue`}
                    theme={theme}
                    disabled={busy}
                    onPress={() => void remove(item)}
                  />
                </View>
              ) : item.state === "pending" ? (
                <View style={styles.actions}>
                  <IconButton
                    icon={<TrashIcon color={theme.colors.onSurfaceVariant} size={20} />}
                    label={`Remove ${item.filename} from the queue`}
                    theme={theme}
                    disabled={busy}
                    onPress={() => void remove(item)}
                  />
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            theme={theme}
            title="Nothing waiting"
            message="Every photo on this phone is backed up. New photos join the queue automatically when Auto sync is on."
            actionLabel="Back to gallery"
            onAction={() => navigation.goBack()}
          />
        }
        ListFooterComponent={
          capped ? (
            <Text
              style={[
                typography.caption,
                { color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: spacing.sm },
              ]}
            >
              Showing the latest {PAGE_LIMIT} — the rest appear as the queue drains.
            </Text>
          ) : failed > 0 ? (
            <View style={{ marginTop: spacing.lg }}>
              <Button
                title={`Retry all ${failed} failed`}
                variant="tonal"
                theme={theme}
                onPress={() => {
                  // Requeue every failed item through the same per-item path
                  // the row buttons use, then drain once.
                  void (async () => {
                    for (const f of items.filter((i) => i.state === "failed")) {
                      await retryQueueItem(f.id).catch(() => {});
                    }
                    await refresh();
                    void processQueue();
                  })();
                }}
              />
            </View>
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
  summary: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  throughputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
  },
  spark: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    height: 24,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.control,
  },
  row: {
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
});
