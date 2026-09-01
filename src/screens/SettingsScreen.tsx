import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useSetupStore } from "../store/useSetupStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useLibraryStore } from "../store/useLibraryStore";
import { useUploadStore } from "../store/useUploadStore";
import { Button, Card, SectionLabel, TextField, ToggleRow, Dialog } from "../components/ui";
import { formatBytes } from "../lib/format";
import { getStorageSummary, type StorageSummary } from "../lib/db";
import { runSyncNow } from "../lib/sync";
import { getBackgroundSyncInfo } from "../lib/background";
import {
  getAiApiKey,
  setAiApiKey,
  getBackupPassphrase,
  setBackupPassphrase,
  DEFAULT_AI_PROMPT,
} from "../lib/settings";
import { setPin, setDecoyPin, getPinExists, getDecoyExists } from "../lib/applock";
import {
  uploadBackupToChannel,
  restoreFromChannelPinned,
  exportToLocalFile,
  shareLocalBackup,
  localBackupPath,
  importFromLocalFile,
} from "../lib/backup";
import type { ThemeMode } from "../lib/settings";

export function SettingsScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { botUsername, channelTitle, reset } = useSetupStore();
  const { prefs, update } = useSettingsStore();
  const { stats, refreshMeta } = useLibraryStore();
  const { start, progress, subscribe } = useUploadStore();

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [restoreDialog, setRestoreDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [bgSync, setBgSync] = useState<{ available: boolean; registered: boolean } | null>(null);
  const [aiKeyDraft, setAiKeyDraft] = useState("");
  const [aiModelDraft, setAiModelDraft] = useState(prefs.aiModel);
  const [aiPromptDraft, setAiPromptDraft] = useState(prefs.aiPrompt);
  const [passDraft, setPassDraft] = useState("");
  const [pinDialogVisible, setPinDialogVisible] = useState(false);
  const pinDialogMode = useRef<"real" | "decoy">("real");
  const [pinDraft, setPinDraft] = useState("");
  const [pinExists, setPinExists] = useState(false);
  const [decoyExists, setDecoyExists] = useState(false);
  const [storage, setStorage] = useState<StorageSummary | null>(null);

  useEffect(() => {
    void getPinExists().then(setPinExists);
    void getDecoyExists().then(setDecoyExists);
  }, []);

  useEffect(() => {
    void getBackupPassphrase().then((p) => setPassDraft(p ?? ""));
  }, []);

  useEffect(() => {
    void refreshMeta();
    return subscribe();
  }, []);

  useEffect(() => {
    void getStorageSummary().then(setStorage);
  }, [stats]);

  useEffect(() => {
    if (!prefs.autoSync) {
      setBgSync(null);
      return;
    }
    void getBackgroundSyncInfo().then(setBgSync);
  }, [prefs.autoSync]);

  useEffect(() => {
    void getAiApiKey().then((k) => setAiKeyDraft(k ?? ""));
  }, []);

  useEffect(() => {
    setAiModelDraft(prefs.aiModel);
    setAiPromptDraft(prefs.aiPrompt);
  }, [prefs.aiModel, prefs.aiPrompt]);

  async function onSyncNow() {
    setSyncing(true);
    setSyncStatus("Scanning gallery…");
    try {
      const result = await runSyncNow((scanned, enqueued) =>
        setSyncStatus(`Scanned ${scanned} photos, ${enqueued} new to upload…`)
      );
      setSyncStatus(
        `Scan complete — ${result.scanned} photos, ${result.enqueued} queued for upload.`
      );
      void start();
    } catch (e: any) {
      setSyncStatus(`Sync failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  async function onBackupToChannel() {
    setBusyLabel("Backing up database to channel…");
    try {
      const ok = await uploadBackupToChannel();
      setBusyLabel(null);
      Alert.alert(
        ok ? "Backup uploaded" : "Backup failed",
        ok
          ? "The database backup was uploaded and pinned in your channel. A fresh install can restore from it."
          : "Could not upload the backup. Check the bot configuration."
      );
    } catch (e: any) {
      setBusyLabel(null);
      Alert.alert("Backup failed", e?.message ?? "Unknown error");
    }
  }

  async function onRestoreFromChannel() {
    setBusyLabel("Restoring from pinned backup…");
    try {
      const result = await restoreFromChannelPinned(true);
      await refreshMeta();
      setBusyLabel(null);
      setRestoreDialog(false);
      Alert.alert(
        "Restored",
        `${result.restored} photo records restored from the pinned channel backup.`
      );
    } catch (e: any) {
      setBusyLabel(null);
      Alert.alert("Restore failed", e?.message ?? "Unknown error");
    }
  }

  async function onExportLocal() {
    try {
      await exportToLocalFile();
      await shareLocalBackup();
    } catch (e: any) {
      Alert.alert("Export failed", e?.message ?? "Unknown error");
    }
  }

  async function onImportLocal() {
    try {
      const count = await importFromLocalFile(true);
      await refreshMeta();
      setImportDialog(false);
      Alert.alert("Restored", `${count} photo records restored from local backup.`);
    } catch (e: any) {
      Alert.alert("Import failed", e?.message ?? "No local backup found on this device.");
    }
  }

  const themeOptions: { key: ThemeMode; label: string }[] = [
    { key: "dark", label: "Dark" },
    { key: "amoled", label: "AMOLED" },
    { key: "light", label: "Light" },
  ];
  const canDynamic = Platform.OS === "android" && Number(Platform.Version) >= 31;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <SectionLabel text="Bot configuration" theme={theme} />
        <Card theme={theme}>
          <View style={styles.configRow}>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>Bot</Text>
            <Text style={{ color: theme.colors.onSurface, fontWeight: "600" }}>
              {botUsername ? `@${botUsername}` : "Not configured"}
            </Text>
          </View>
          <View style={styles.configRow}>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>Channel</Text>
            <Text style={{ color: theme.colors.onSurface, fontWeight: "600" }} numberOfLines={1}>
              {channelTitle ?? "Not configured"}
            </Text>
          </View>
          <Button
            title="Reconfigure bot"
            variant="outlined"
            theme={theme}
            style={{ marginTop: 12 }}
            onPress={() =>
              Alert.alert("Reconfigure bot?", "This clears the saved token and channel. Your photos stay safe in Telegram — you can restore the index from the pinned backup afterwards.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset",
                  style: "destructive",
                  onPress: () => void reset(),
                },
              ])
            }
          />
        </Card>

        <SectionLabel text="Backup & sync" theme={theme} />
        <Card theme={theme}>
          <Button
            title="Sync full gallery now"
            theme={theme}
            busy={syncing}
            onPress={onSyncNow}
          />
          {syncStatus ? (
            <Text style={[styles.statusText, { color: theme.colors.onSurfaceVariant }]}>
              {syncStatus}
            </Text>
          ) : null}
          {progress.running ? (
            <Text style={[styles.statusText, { color: theme.colors.primary }]}>
              Uploading {progress.current}/{progress.total}
              {progress.percent !== null ? ` — ${progress.percent}%` : ""}…
            </Text>
          ) : null}
          <View style={styles.divider} />
            <ToggleRow
              title="Auto sync"
              subtitle="Back up new photos as you take them (respects Wi-Fi-only)"
              value={prefs.autoSync}
              onChange={(v) => void update({ autoSync: v })}
              theme={theme}
          />
          {prefs.autoSync && bgSync ? (
            <Text style={[styles.statusText, { color: theme.colors.onSurfaceVariant }]}>
              {bgSync.registered
                ? "Background sync scheduled — Android runs it when battery + network allow"
                : bgSync.available
                  ? "Background sync will be scheduled on next app start"
                  : "Background sync unavailable on this device"}
            </Text>
          ) : null}
          <ToggleRow
            title="Auto-sync on Wi-Fi only"
            subtitle="Skip background sync on mobile data"
            value={prefs.autoSyncWifiOnly}
            onChange={(v) => void update({ autoSyncWifiOnly: v })}
            theme={theme}
          />
          <View style={styles.divider} />
          <ToggleRow
            title="Upload only while charging"
            subtitle="Automatic sync waits until the device is plugged in"
            value={prefs.uploadOnlyCharging}
            onChange={(v) => void update({ uploadOnlyCharging: v })}
            theme={theme}
          />
          <ToggleRow
            title="Upload low-res preview first"
            subtitle="Faster grid loading; the original always follows"
            value={prefs.uploadPreviews}
            onChange={(v) => void update({ uploadPreviews: v })}
            theme={theme}
          />
          <View style={styles.divider} />
          <ToggleRow
            title="Video support (Beta)"
            subtitle="Also back up videos from your device. Files over 50 MB are split into parts that reassemble automatically on restore. Experimental."
            value={prefs.includeVideos}
            onChange={(v) => void update({ includeVideos: v })}
            theme={theme}
          />
          <View style={styles.divider} />
          <ToggleRow
            title="Organize by folder (topics)"
            subtitle="Create a Telegram forum topic per folder and post uploads there. Needs a topics-enabled group where the bot can manage topics."
            value={prefs.topicPerFolder}
            onChange={(v) => void update({ topicPerFolder: v })}
            theme={theme}
          />
          <View style={styles.divider} />
          <ToggleRow
            title="Multiple destinations (Experimental)"
            subtitle="Back up to several bot/channel pairs — e.g. a personal archive and a family one — with per-folder routing."
            value={prefs.multiDestination}
            onChange={(v) => void update({ multiDestination: v })}
            theme={theme}
          />
          {prefs.multiDestination ? (
            <Pressable style={styles.destRow} onPress={() => navigation.navigate("Destinations")}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 14 }}>
                  Manage destinations
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}>
                  Add bot/channel pairs and folder routing rules
                </Text>
              </View>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
            </Pressable>
          ) : null}
        </Card>

        <SectionLabel text="AI captioning (Gemini)" theme={theme} />
        <Card theme={theme}>
          <ToggleRow
            title="AI captions"
            subtitle="Describe new photos with Gemini; captions are searchable"
            value={prefs.aiCaptions}
            onChange={(v) => void update({ aiCaptions: v })}
            theme={theme}
          />
          {prefs.aiCaptions ? (
            <>
              <View style={styles.divider} />
              <TextField
                value={aiKeyDraft}
                onChangeText={setAiKeyDraft}
                onEndEditing={() => void setAiApiKey(aiKeyDraft)}
                placeholder="Gemini API key"
                secureTextEntry
                theme={theme}
              />
              <View style={{ height: 8 }} />
              <TextField
                value={aiModelDraft}
                onChangeText={setAiModelDraft}
                onEndEditing={() => void update({ aiModel: aiModelDraft.trim() || "gemini-2.5-flash" })}
                placeholder="Model (e.g. gemini-2.5-flash)"
                theme={theme}
              />
              <View style={{ height: 8 }} />
              <TextField
                value={aiPromptDraft}
                onChangeText={setAiPromptDraft}
                onEndEditing={() => void update({ aiPrompt: aiPromptDraft.trim() || DEFAULT_AI_PROMPT })}
                placeholder="Caption prompt"
                multiline
                theme={theme}
                style={{ minHeight: 80, textAlignVertical: "top" }}
              />
              <Text style={[styles.statusText, { color: theme.colors.onSurfaceVariant, marginTop: 6 }]}>
                Uses the upload preview image. Saved automatically when you finish editing.
              </Text>
            </>
          ) : null}
        </Card>

        <SectionLabel text="Folder synchronisation" theme={theme} />
        <Card theme={theme} onPress={() => navigation.navigate("FolderSync")}>
          <View style={styles.folderRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                Choose folders
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                {prefs.excludedFolders.length === 0
                  ? "All photo folders are being synced"
                  : `${prefs.excludedFolders.length} folder(s) excluded from sync`}
              </Text>
            </View>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
          </View>
        </Card>

        <SectionLabel text="Appearance" theme={theme} />
        <Card theme={theme}>
          <View style={styles.themeRow}>
            {themeOptions.map((opt) => (
              <Button
                key={opt.key}
                title={opt.label}
                theme={theme}
                variant={prefs.theme === opt.key ? "filled" : "outlined"}
                style={{ flex: 1 }}
                onPress={() => void update({ theme: opt.key })}
              />
            ))}
          </View>
          <View style={styles.divider} />
          <ToggleRow
            title="Material You colors"
            subtitle={
              canDynamic
                ? "Theme the app with your wallpaper's colors (Android 12+)"
                : "Requires Android 12 or newer"
            }
            value={prefs.dynamicColor && canDynamic}
            onChange={(v) => void update({ dynamicColor: v })}
            theme={theme}
          />
          <ToggleRow
            title="Staggered grid"
            subtitle="Show photos at their natural aspect ratio in the day view"
            value={prefs.staggeredGrid}
            onChange={(v) => void update({ staggeredGrid: v })}
            theme={theme}
          />
        </Card>

        <SectionLabel text="Privacy & security" theme={theme} />
        <Card theme={theme}>
          <ToggleRow
            title="App lock"
            subtitle="Require biometric or device PIN unlock when opening the app"
            value={prefs.appLock}
            onChange={(v) => void update({ appLock: v })}
            theme={theme}
          />
          {prefs.appLock ? (
            <>
              <View style={styles.divider} />
              <View style={styles.buttonGrid}>
                <Button
                  title={pinExists ? "Change PIN" : "Set PIN"}
                  variant="outlined"
                  theme={theme}
                  onPress={() => {
                    pinDialogMode.current = "real";
                    setPinDialogVisible(true);
                  }}
                />
                <Button
                  title={decoyExists ? "Change decoy PIN" : "Set decoy PIN"}
                  variant="outlined"
                  theme={theme}
                  onPress={() => {
                    pinDialogMode.current = "decoy";
                    setPinDialogVisible(true);
                  }}
                />
              </View>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginTop: 6 }}>
                The decoy PIN opens an empty gallery — use it when someone insists on seeing the app.
              </Text>
            </>
          ) : null}
        </Card>

        <Dialog
          visible={pinDialogVisible}
          theme={theme}
          title={pinDialogMode.current === "decoy" ? "Set decoy PIN" : "Set PIN"}
          message="4–8 digits. Leave empty to remove."
        >
          <TextField
            value={pinDraft}
            onChangeText={(t) => setPinDraft(t.replace(/[^0-9]/g, "").slice(0, 8))}
            placeholder="PIN"
            secureTextEntry
            keyboardType="numeric"
            theme={theme}
          />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <Button title="Cancel" variant="text" theme={theme} onPress={() => setPinDialogVisible(false)} />
            <Button
              title="Save"
              theme={theme}
              onPress={async () => {
                const pin = pinDraft.trim();
                if (pinDialogMode.current === "decoy") {
                  await setDecoyPin(pin || null);
                  setDecoyExists(!!pin);
                } else {
                  await setPin(pin || null);
                  setPinExists(!!pin);
                }
                setPinDraft("");
                setPinDialogVisible(false);
              }}
            />
          </View>
        </Dialog>

        <SectionLabel text="Maintenance" theme={theme} />
        <Card theme={theme} onPress={() => navigation.navigate("Maintenance")}>
          <View style={styles.folderRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                Duplicate finder & integrity checker
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                Find identical photos, verify channel files are still downloadable
              </Text>
            </View>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
          </View>
        </Card>
        <Card theme={theme} onPress={() => navigation.navigate("UploadQueue")}>
          <View style={styles.folderRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                Upload queue
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                Pending, running and failed uploads — retry or remove items
              </Text>
            </View>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
          </View>
        </Card>

        <SectionLabel text="Database" theme={theme} />
        <Card theme={theme}>
          <View style={styles.statsGrid}>
            <Stat label="Backed up" value={String(stats.uploaded)} theme={theme} />
            <Stat label="Pending" value={String(stats.pending)} theme={theme} />
            <Stat label="Failed" value={String(stats.failed)} theme={theme} />
            <Stat label="Skipped" value={String(stats.skipped)} theme={theme} />
            <Stat label="Favorites" value={String(stats.favorites)} theme={theme} />
            <Stat label="Trashed" value={String(stats.trashed)} theme={theme} />
            <Stat label="Library size" value={formatBytes(stats.totalBytes)} theme={theme} />
          </View>
          <View style={styles.divider} />
          <ToggleRow
            title="Auto database backup"
            subtitle="Upload an index backup to the channel daily and pin it"
            value={prefs.dbAutoBackup}
            onChange={(v) => void update({ dbAutoBackup: v })}
            theme={theme}
          />
          <View style={styles.divider} />
          <ToggleRow
            title="Encrypt DB backups"
            subtitle="AES-256-GCM with a passphrase. Anyone with channel access cannot read the index without it. Keep the passphrase safe — encrypted backups cannot be restored without it."
            value={prefs.dbBackupEncrypt}
            onChange={(v) => {
              if (!v) void setBackupPassphrase(null);
              void update({ dbBackupEncrypt: v });
            }}
            theme={theme}
          />
          {prefs.dbBackupEncrypt ? (
            <>
              <TextField
                value={passDraft}
                onChangeText={setPassDraft}
                onEndEditing={() => void setBackupPassphrase(passDraft || null)}
                placeholder="Backup passphrase"
                secureTextEntry
                theme={theme}
              />
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginTop: 4 }}>
                Saved on this device. Enter the same passphrase on a new phone before restoring.
              </Text>
            </>
          ) : null}
          <View style={styles.buttonGrid}>
            <Button title="Backup to channel" variant="outlined" theme={theme} onPress={onBackupToChannel} />
            <Button title="Restore from channel" variant="outlined" theme={theme} onPress={() => setRestoreDialog(true)} />
          </View>
          <View style={styles.buttonGrid}>
            <Button title="Export to file" variant="outlined" theme={theme} onPress={onExportLocal} />
            <Button title="Import local backup" variant="outlined" theme={theme} onPress={() => setImportDialog(true)} />
          </View>
        </Card>

        <SectionLabel text="Storage" theme={theme} />
        {storage ? <StorageCard storage={storage} theme={theme} /> : null}

        <SectionLabel text="About" theme={theme} />
        <Card theme={theme}>
          <Text style={{ color: theme.colors.onSurface, fontWeight: "700" }}>PhotogramBot</Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
            Version 0.2.0 · Photos are backed up to your own Telegram channel via your own bot.
            No servers, no tracking. Telegram Bot API limits: originals up to 50 MB, downloads
            up to 20 MB.
          </Text>
        </Card>

        <View style={{ height: 60 }} />
      </ScrollView>

      <Dialog
        visible={restoreDialog}
        theme={theme}
        title="Restore from channel"
        message="This replaces the local index with the pinned channel backup. Photos are not re-downloaded — they stay in Telegram."
      >
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Button title="Cancel" variant="text" theme={theme} onPress={() => setRestoreDialog(false)} />
          <Button title="Restore" theme={theme} onPress={onRestoreFromChannel} />
        </View>
      </Dialog>

      <Dialog
        visible={importDialog}
        theme={theme}
        title="Import local backup"
        message={`Replace the local index with ${localBackupPath().split("/").pop()}? The backup must have been exported on this device before.`}
      >
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Button title="Cancel" variant="text" theme={theme} onPress={() => setImportDialog(false)} />
          <Button title="Import" theme={theme} onPress={onImportLocal} />
        </View>
      </Dialog>

      {busyLabel ? (
        <View style={[styles.busyOverlay, { backgroundColor: theme.colors.scrim }]}>
          <Card theme={theme} style={{ alignItems: "center", minWidth: 240 }}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={{ color: theme.colors.onSurface, marginTop: 12 }}>{busyLabel}</Text>
          </Card>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.stat}>
      <Text style={{ color: theme.colors.onSurface, fontWeight: "700", fontSize: 16 }}>{value}</Text>
      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function StorageCard({
  storage,
  theme,
}: {
  storage: StorageSummary;
  theme: ReturnType<typeof useTheme>;
}) {
  const totalBytes = storage.cloudBytes + storage.localBytes;
  const cloudPct = totalBytes > 0 ? storage.cloudBytes / totalBytes : 0;
  const maxMonth = Math.max(...storage.months.map((m) => m.bytes), 0);
  const monthsWithUploads = storage.months.some((m) => m.bytes > 0);
  return (
    <Card theme={theme}>
      <View style={styles.splitBar}>
        <View
          style={{
            flex: cloudPct,
            backgroundColor: theme.colors.primary,
            borderTopLeftRadius: 8,
            borderBottomLeftRadius: 8,
          }}
        />
        <View
          style={{
            flex: 1 - cloudPct,
            backgroundColor: theme.colors.outlineVariant,
            borderTopRightRadius: 8,
            borderBottomRightRadius: 8,
          }}
        />
      </View>
      <View style={[styles.configRow, { marginTop: 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 13.5 }}>
            In cloud
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
            {formatBytes(storage.cloudBytes)} · {storage.cloudCount} item
            {storage.cloudCount === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 13.5 }}>
            On device only
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
            {formatBytes(storage.localBytes)} · {storage.localCount} item
            {storage.localCount === 1 ? "" : "s"}
          </Text>
        </View>
      </View>
      {monthsWithUploads ? (
        <>
          <View style={styles.divider} />
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginBottom: 6 }}>
            Backed up per month — last 6 months
          </Text>
          <View style={styles.chartRow}>
            {storage.months.map((m, i) => (
              <View key={i} style={styles.chartCol}>
                <View style={styles.chartBarArea}>
                  <View
                    style={[
                      styles.chartBar,
                      {
                        height: `${Math.max(4, Math.round((m.bytes / maxMonth) * 100))}%`,
                        backgroundColor: m.bytes > 0 ? theme.colors.primary : theme.colors.outlineVariant,
                      },
                    ]}
                  />
                </View>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 9.5 }}>{m.label}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  configRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    gap: 12,
  },
  statusText: {
    fontSize: 12.5,
    marginTop: 10,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(128,128,128,0.2)",
    marginVertical: 8,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  themeRow: {
    flexDirection: "row",
    gap: 8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  splitBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 8,
    overflow: "hidden",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    height: 80,
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  chartBarArea: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  chartBar: {
    width: "60%",
    borderRadius: 4,
  },
  stat: {
    width: "33.3%",
    alignItems: "center",
    paddingVertical: 8,
  },
  buttonGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  destRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  busyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
