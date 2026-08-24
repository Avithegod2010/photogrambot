import React, { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useLibraryStore } from "../store/useLibraryStore";
import { Button, Card, SectionLabel } from "../components/ui";
import {
  findDuplicateGroups,
  checkIntegrity,
  removeBrokenPhotos,
  type DuplicateGroup,
  type IntegrityProgress,
} from "../lib/maintenance";
import { getAllUploadedPhotoIds, type PhotoRow } from "../lib/db";
import { formatBytes } from "../lib/format";
import {
  restoreAllToDevice,
  requestCancelRestore,
  type RestoreProgress,
} from "../lib/restore";

export function MaintenanceScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { stats, refreshMeta, trashPhotos } = useLibraryStore();

  const [dupes, setDupes] = useState<DuplicateGroup[]>([]);
  const [scanningDupes, setScanningDupes] = useState(false);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [integrity, setIntegrity] = useState<IntegrityProgress | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  function confirmRestore() {
    Alert.alert(
      "Restore originals to this device?",
      `Downloads up to ${stats.uploaded} backed-up photo(s) from your channel into this device's gallery. Photos already on the device are skipped. Keep the app open while it runs.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", onPress: () => void runRestore() },
      ]
    );
  }

  async function runRestore() {
    setRestoreRunning(true);
    setRestoreResult(null);
    setRestoreProgress({ done: 0, total: 0, currentFile: null, saved: 0, skipped: 0, failed: 0 });
    try {
      const result = await restoreAllToDevice(setRestoreProgress);
      setRestoreResult(
        `Restore finished — ${result.saved} saved, ${result.skipped} already on device, ${result.failed} failed.`
      );
    } catch (e: any) {
      setRestoreResult(e?.message ?? "Restore failed");
    } finally {
      setRestoreRunning(false);
    }
  }

  async function scanDuplicates() {
    setScanningDupes(true);
    try {
      setDupes(await findDuplicateGroups());
    } finally {
      setScanningDupes(false);
    }
  }

  async function runIntegrity() {
    setIntegrityRunning(true);
    setLastResult(null);
    try {
      const ids = await getAllUploadedPhotoIds();
      const { getPhoto } = await import("../lib/db");
      const photos: PhotoRow[] = [];
      for (const id of ids) {
        const p = await getPhoto(id);
        if (p) photos.push(p);
      }
      const result = await checkIntegrity(photos, setIntegrity);
      setLastResult(
        `Checked ${result.checked} photos — ${result.brokenIds.length} broken`
      );
      if (result.brokenIds.length > 0) {
        Alert.alert(
          `${result.brokenIds.length} broken photo${result.brokenIds.length === 1 ? "" : "s"}`,
          "These photos could not be reached in your Telegram channel (file may have been deleted). Remove them from the index?",
          [
            { text: "Keep", style: "cancel" },
            {
              text: "Remove",
              style: "destructive",
              onPress: async () => {
                await removeBrokenPhotos(result.brokenIds);
                await refreshMeta();
              },
            },
          ]
        );
      }
    } finally {
      setIntegrityRunning(false);
    }
  }

  async function keepOldest(group: DuplicateGroup) {
    const toTrash = group.photos.slice(1).map((p) => p.id);
    await trashPhotos(toTrash, false);
    await scanDuplicates();
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Maintenance</Text>
      </View>

      <FlatList
        data={dupes}
        keyExtractor={(g) => g.hash}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        ListHeaderComponent={
          <View>
            <SectionLabel text="Duplicate finder" theme={theme} />
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
                Finds photos with identical content (same SHA-256 hash) in your library.
                {stats.uploaded > 0 ? ` Scanning ${stats.uploaded} backed-up photos.` : ""}
              </Text>
              <Button
                title={dupes.length ? "Rescan" : "Find duplicates"}
                theme={theme}
                variant="outlined"
                busy={scanningDupes}
                onPress={scanDuplicates}
                style={{ marginTop: 12 }}
              />
              {dupes.length > 0 ? (
                <Text style={{ color: theme.colors.primary, fontWeight: "700", marginTop: 12 }}>
                  {dupes.length} duplicate group{dupes.length === 1 ? "" : "s"} found
                </Text>
              ) : null}
            </Card>

            <SectionLabel text="Integrity checker" theme={theme} />
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
                Verifies that every backed-up photo is still downloadable from your Telegram
                channel. Runs one check per photo — can take a while on large libraries.
              </Text>
              <Button
                title="Check integrity"
                theme={theme}
                variant="outlined"
                busy={integrityRunning}
                onPress={runIntegrity}
                style={{ marginTop: 12 }}
              />
              {integrity && !integrity.done ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 10 }}>
                  Checking {integrity.checked}/{integrity.total} — {integrity.broken} broken so far
                </Text>
              ) : null}
              {lastResult ? (
                <Text style={{ color: theme.colors.success, fontSize: 12.5, marginTop: 10, fontWeight: "600" }}>
                  {lastResult}
                </Text>
              ) : null}
            </Card>

            <SectionLabel text="Restore to device" theme={theme} />
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
                Downloads every backed-up photo from your Telegram channel back into this
                device's gallery. Use after importing a database backup on a new phone to
                migrate your full library.
              </Text>
              {restoreRunning ? (
                <Button
                  title="Cancel restore"
                  variant="danger"
                  theme={theme}
                  onPress={requestCancelRestore}
                  style={{ marginTop: 12 }}
                />
              ) : (
                <Button
                  title="Restore all originals"
                  variant="outlined"
                  theme={theme}
                  onPress={confirmRestore}
                  style={{ marginTop: 12 }}
                />
              )}
              {restoreProgress && (restoreRunning || restoreProgress.done > 0) ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 10 }}>
                  {restoreProgress.done}/{restoreProgress.total} processed —{" "}
                  {restoreProgress.saved} saved · {restoreProgress.skipped} skipped ·{" "}
                  {restoreProgress.failed} failed
                  {restoreProgress.currentFile ? `\n${restoreProgress.currentFile}` : ""}
                </Text>
              ) : null}
              {restoreResult ? (
                <Text style={{ color: theme.colors.success, fontSize: 12.5, marginTop: 10, fontWeight: "600" }}>
                  {restoreResult}
                </Text>
              ) : null}
            </Card>

            {dupes.length > 0 ? (
              <SectionLabel text="Duplicate groups" theme={theme} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Card theme={theme} style={{ marginBottom: 10 }}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: "700", marginBottom: 2 }}>
              {item.count} identical copies
            </Text>
            <Text
              style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, marginBottom: 8 }}
              numberOfLines={1}
            >
              {formatBytes(item.photos[0]?.size)} each · {item.hash.slice(0, 20)}…
            </Text>
            {item.photos.map((p) => (
              <View key={p.id} style={styles.dupeRow}>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, flex: 1 }} numberOfLines={1}>
                  {p.filename}
                  {p.status === "uploaded" ? "  ·  ☁" : ""}
                </Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
              <Button
                title="Keep newest, trash rest"
                variant="danger"
                theme={theme}
                onPress={() => keepOldest(item)}
              />
            </View>
          </Card>
        )}
        ListEmptyComponent={null}
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
  dupeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
  },
});
