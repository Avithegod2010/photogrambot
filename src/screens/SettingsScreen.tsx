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
} from "../rn";
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
  getFreeDiskBytes,
  isStorageCritical,
  thumbCacheBytes,
  pruneThumbCache,
  LOW_STORAGE_THRESHOLD_BYTES,
} from "../lib/storage";
import {
  getAiApiKey,
  setAiApiKey,
  getBackupPassphrase,
  setBackupPassphrase,
  DEFAULT_AI_PROMPT,
  DEFAULT_CAPTION_FIELDS,
  CAPTION_FIELD_LABELS,
  getTaggingApiKey,
  setTaggingApiKey,
} from "../lib/settings";
import {
  MODELS,
  allModelStatuses,
  downloadModel,
  deleteModel,
  type ModelId,
  type ModelStatus,
} from "../lib/mlModels";
import {
  ACCENT_PRESETS,
  APP_ICON_VARIANTS,
  DATE_FORMATS,
  FONT_SCALES,
  GRID_COLUMNS,
  MAP_STYLES,
  formatClock,
  isHexColor,
} from "../lib/appearance";
import { setAppIcon } from "../../modules/share-intent";
import { setPin, setDecoyPin, getPinExists, getDecoyExists } from "../lib/applock";
import { exportMonthZip } from "../lib/zipexport";
import { getUploadedPhotosInMonth } from "../lib/db";
import { exportIndexCsv } from "../lib/csvexport";
import { checkForUpdate, downloadAndInstallUpdate, openInstallSettings, CURRENT_VERSION } from "../lib/updater";
import { listProfiles, type DestProfile } from "../lib/destinations";
import {
  getBreakInLog,
  clearBreakInLog,
  type BreakInEvent,
} from "../lib/breakin";
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
  const [breakInCount, setBreakInCount] = useState(0);
  const [breakInEvents, setBreakInEvents] = useState<BreakInEvent[] | null>(null);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [capDraft, setCapDraft] = useState(String(prefs.overnightCap));
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const [thumbBytes, setThumbBytes] = useState<number | null>(null);
  const [zipDialog, setZipDialog] = useState(false);
  const [zipMonths, setZipMonths] = useState<{ label: string; year: number; month: number }[]>([]);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipNote, setZipNote] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [mirrorProfiles, setMirrorProfiles] = useState<DestProfile[]>([]);
  const [accentDraft, setAccentDraft] = useState(
    prefs.accentColor === "default" ? "" : prefs.accentColor
  );
  const [displayNameDraft, setDisplayNameDraft] = useState(prefs.appDisplayName);
  const [captionDialog, setCaptionDialog] = useState(false);
  const [captionOrder, setCaptionOrder] = useState<string[]>(DEFAULT_CAPTION_FIELDS);
  const [captionEnabled, setCaptionEnabled] = useState<Set<string>>(
    new Set(prefs.captionFields)
  );
  const [modelStatuses, setModelStatuses] = useState<ModelStatus[] | null>(null);
  const [modelBusy, setModelBusy] = useState<ModelId | null>(null);
  const [modelNote, setModelNote] = useState<string | null>(null);
  const [taggingKeyDraft, setTaggingKeyDraft] = useState("");

  useEffect(() => {
    if (prefs.multiDestination) {
      void listProfiles().then(setMirrorProfiles);
    }
  }, [prefs.multiDestination]);

  useEffect(() => {
    void getPinExists().then(setPinExists);
    void getDecoyExists().then(setDecoyExists);
    void getBreakInLog().then((l) => setBreakInCount(l.length));
  }, []);

  useEffect(() => {
    void getBackupPassphrase().then((p) => setPassDraft(p ?? ""));
    void allModelStatuses().then(setModelStatuses);
    void getTaggingApiKey().then((k) => setTaggingKeyDraft(k ?? ""));
  }, []);

  async function refreshModelStatuses() {
    setModelStatuses(await allModelStatuses());
  }

  async function downloadModelRow(id: ModelId) {
    if (modelBusy) return;
    setModelBusy(id);
    const name = MODELS.find((m) => m.id === id)?.name ?? "Model";
    setModelNote(`Downloading ${name}…`);
    try {
      await downloadModel(id, (written, total) => {
        if (total > 0) setModelNote(`Downloading ${name}… ${Math.floor((written / total) * 100)}%`);
      });
      setModelNote(`${name} downloaded.`);
      await refreshModelStatuses();
    } catch (e: any) {
      setModelNote(e?.message ?? "Download failed");
    } finally {
      setModelBusy(null);
    }
  }

  async function deleteModelRow(id: ModelId) {
    if (modelBusy) return;
    setModelBusy(id);
    try {
      await deleteModel(id);
      await refreshModelStatuses();
      setModelNote("Model deleted.");
    } finally {
      setModelBusy(null);
    }
  }

  useEffect(() => {
    setAccentDraft(prefs.accentColor === "default" ? "" : prefs.accentColor);
    setDisplayNameDraft(prefs.appDisplayName);
    // Keep excluded fields visible in the editor so they can be re-enabled.
    setCaptionOrder([
      ...prefs.captionFields,
      ...DEFAULT_CAPTION_FIELDS.filter((k) => !prefs.captionFields.includes(k)),
    ]);
    setCaptionEnabled(new Set(prefs.captionFields));
  }, [prefs.accentColor, prefs.appDisplayName, prefs.captionFields]);

  useEffect(() => {
    void refreshMeta();
    return subscribe();
  }, []);

  useEffect(() => {
    void getStorageSummary().then(setStorage);
    void getFreeDiskBytes().then(setFreeBytes);
    void thumbCacheBytes().then(setThumbBytes);
  }, [stats]);

  async function onClearThumbCache() {
    await pruneThumbCache();
    setThumbBytes(await thumbCacheBytes());
  }

  async function runUpdateCheck() {
    if (updateBusy) return;
    setUpdateBusy(true);
    setUpdateNote("Checking GitHub for the latest release…");
    try {
      const result = await checkForUpdate();
      if (result.status === "unsupported" || result.status === "error") {
        setUpdateNote(result.message);
        return;
      }
      if (result.status === "up-to-date") {
        setUpdateNote(`You're on the latest version (${result.current}).`);
        return;
      }
      setUpdateNote(null);
      const notes = result.notes?.trim();
      Alert.alert(
        `Update available: ${result.latest}`,
        `You have ${result.current}. ${
          notes ? notes.slice(0, 280) + "\n\n" : ""
        }Download and install now? The APK is fetched from GitHub Releases.`,
        [
          { text: "Later", style: "cancel", onPress: () => setUpdateNote(null) },
          {
            text: "Download",
            onPress: () => {
              void (async () => {
                setUpdateBusy(true);
                try {
                  await downloadAndInstallUpdate(result, (written, total) => {
                    const pct = total > 0 ? Math.floor((written / total) * 100) : 0;
                    setUpdateNote(`Downloading ${result.latest} — ${pct}%`);
                  });
                  setUpdateNote(
                    "Downloaded. Follow the installer to finish. If Android reports the app can't be installed, uninstall the current preview build first — your library restores from the channel backup. Otherwise allow PhotogramBot to install unknown apps in Android settings."
                  );
                } catch (e: any) {
                  setUpdateNote(e?.message ?? "Update failed");
                  Alert.alert(
                    "Couldn't open the installer",
                    "Android needs your permission to install apps from PhotogramBot. Open the setting and allow it, then tap Check again. If the installer opens but Android says the app can't be installed, uninstall the current preview build first — your library restores from the channel backup.",
                    [
                      { text: "Later", style: "cancel" },
                      { text: "Open settings", onPress: () => openInstallSettings() },
                    ]
                  );
                } finally {
                  setUpdateBusy(false);
                }
              })();
            },
          },
        ]
      );
    } catch (e: any) {
      setUpdateNote(e?.message ?? "Update check failed");
    } finally {
      setUpdateBusy(false);
    }
  }

  const MONTH_LABELS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  async function openZipDialog() {
    const now = new Date();
    const months: { label: string; year: number; month: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      try {
        const rows = await getUploadedPhotosInMonth(d.getFullYear(), d.getMonth());
        if (rows.length > 0) {
          months.push({
            label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()} · ${rows.length} photos`,
            year: d.getFullYear(),
            month: d.getMonth(),
          });
        }
      } catch {}
      if (months.length >= 8) break;
    }
    if (months.length === 0) {
      Alert.alert("Nothing to export", "No backed-up photos in the last 12 months.");
      return;
    }
    setZipMonths(months);
    setZipDialog(true);
  }

  async function runZipExport(year: number, month: number) {
    if (zipBusy) return;
    setZipBusy(true);
    setZipNote("Preparing…");
    try {
      const r = await exportMonthZip(year, month, (p) =>
        setZipNote(p.currentFile ? `Downloading ${p.downloaded + 1}/${p.total} — ${p.currentFile}` : "Packing archive…")
      );
      setZipDialog(false);
      const skipped =
        r.skippedOversize > 0 || r.skippedCap > 0
          ? ` Skipped: ${r.skippedOversize} over the bot's 20 MB download limit, ${r.skippedCap} beyond the 100 MB archive cap.`
          : "";
      Alert.alert(
        "Export shared",
        `${r.count} photos (${formatBytes(r.bytes)}) from ${MONTH_LABELS[month]} ${year} were zipped and handed to the Android share sheet.${skipped}`
      );
    } catch (e: any) {
      Alert.alert("Export failed", e?.message ?? "Unknown error");
    } finally {
      setZipBusy(false);
      setZipNote(null);
    }
  }

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

  useEffect(() => {
    setCapDraft(String(prefs.overnightCap));
  }, [prefs.overnightCap]);

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
    { key: "system", label: "Auto" },
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
          <ToggleRow
            title="Skip near-duplicate uploads"
            subtitle="Before uploading, check the photo against your backed-up library and skip it when it looks like a re-save or recompression of something you already have. Heavily-cropped or filtered edits are still uploaded."
            value={prefs.nearDupGuard}
            onChange={(v) => void update({ nearDupGuard: v })}
            theme={theme}
          />
          <View style={styles.divider} />
          <ToggleRow
            title="Overnight catch-up"
            subtitle="Drain a large backlog in bulk while you sleep: only overnight (10 PM–7 AM), on Wi-Fi, while charging, with a per-night upload cap. Work independently of Auto sync."
            value={prefs.overnightCatchup}
            onChange={(v) => void update({ overnightCatchup: v })}
            theme={theme}
          />
          {prefs.overnightCatchup ? (
            <>
              <TextField
                value={capDraft}
                onChangeText={(t) => setCapDraft(t.replace(/[^0-9]/g, ""))}
                onEndEditing={() => {
                  const n = Math.max(1, parseInt(capDraft, 10) || 500);
                  void update({ overnightCap: n });
                  setCapDraft(String(n));
                }}
                placeholder="Max photos per night (e.g. 500)"
                keyboardType="numeric"
                theme={theme}
              />
              <Text style={[styles.statusText, { color: theme.colors.onSurfaceVariant, marginTop: -4 }]}>
                Photos queued per night; the next night continues where this one stopped.
              </Text>
            </>
          ) : null}
          <View style={styles.divider} />
          <ToggleRow
            title="Video support (Beta)"
            subtitle="Also back up videos from your device. Files over 50 MB are split into parts that reassemble automatically on restore. Experimental."
            value={prefs.includeVideos}
            onChange={(v) => void update({ includeVideos: v })}
            theme={theme}
          />
          {prefs.includeVideos ? (
            <>
              <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
                Video compression
              </Text>
              <ChipRow
                options={[
                  { key: "off", label: "Off" },
                  { key: "720p", label: "720p" },
                  { key: "1080p", label: "1080p" },
                ]}
                value={prefs.videoCompression}
                onSelect={(v) => void update({ videoCompression: v as any })}
                theme={theme}
              />
              <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
                The planner is in this build; the native transcoder lands in the
                next build. Until then uploads keep the original file.
              </Text>
            </>
          ) : null}
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
            <>
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
              <View style={styles.divider} />
              <ToggleRow
                title="Mirror uploads (redundancy)"
                subtitle="Send every upload a second time to the destination below — a plain duplicate copy for safety. Mirror copies are not tracked: deleting a photo does not remove its mirror."
                value={prefs.mirrorEnabled}
                onChange={(v) => void update({ mirrorEnabled: v })}
                theme={theme}
              />
              {prefs.mirrorEnabled ? (
                <>
                  {mirrorProfiles.length === 0 ? (
                    <Text style={[styles.statusText, { color: theme.colors.onSurfaceVariant }]}>
                      No extra destinations yet — add one under Manage destinations.
                    </Text>
                  ) : (
                    mirrorProfiles.map((p) => (
                      <Pressable
                        key={p.id}
                        style={styles.destRow}
                        onPress={() => void update({ mirrorProfileId: p.id })}
                      >
                        <Text
                          style={{
                            color: prefs.mirrorProfileId === p.id ? theme.colors.primary : theme.colors.onSurface,
                            fontWeight: prefs.mirrorProfileId === p.id ? "700" : "500",
                            fontSize: 13.5,
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          {p.channelTitle || p.name}
                          {prefs.mirrorProfileId === p.id ? "  ·  mirror" : ""}
                        </Text>
                        <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
                      </Pressable>
                    ))
                  )}
                </>
              ) : null}
            </>
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
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>Theme</Text>
          <ChipRow
            options={themeOptions}
            value={prefs.theme}
            onSelect={(v) => void update({ theme: v as ThemeMode })}
            theme={theme}
          />
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
            title="Scheduled theme"
            subtitle="Use dark at night and light during the day"
            value={prefs.themeSchedule}
            onChange={(v) => void update({ themeSchedule: v })}
            theme={theme}
          />
          {prefs.themeSchedule ? (
            <>
              <StepperRow
                label="Dark starts"
                minutes={prefs.themeScheduleStart}
                onChange={(m) => void update({ themeScheduleStart: m })}
                theme={theme}
              />
              <StepperRow
                label="Light starts"
                minutes={prefs.themeScheduleEnd}
                onChange={(m) => void update({ themeScheduleEnd: m })}
                theme={theme}
              />
            </>
          ) : null}

          <View style={styles.divider} />
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
            Accent color
          </Text>
          <View style={styles.swatchRow}>
            {ACCENT_PRESETS.map((preset) => {
              const selected =
                preset.key === "default"
                  ? prefs.accentColor === "default" || !isHexColor(prefs.accentColor)
                  : prefs.accentColor === preset.color;
              return (
                <Pressable
                  key={preset.key}
                  onPress={() => {
                    setAccentDraft("");
                    void update({ accentColor: preset.key });
                  }}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: preset.color ?? theme.colors.surfaceHighest,
                      borderWidth: selected ? 3 : 1,
                      borderColor: selected ? theme.colors.onSurface : theme.colors.outline,
                    },
                  ]}
                  accessibilityLabel={`${preset.label} accent`}
                  accessibilityRole="button"
                >
                  {preset.key === "default" ? (
                    <Text style={{ fontSize: 9, color: theme.colors.onSurfaceVariant }}>Auto</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" }}>
            <TextField
              value={accentDraft}
              onChangeText={setAccentDraft}
              placeholder="#RRGGBB (custom)"
              theme={theme}
              style={{ flex: 1 }}
            />
            <Button
              title="Apply"
              variant="outlined"
              theme={theme}
              disabled={accentDraft.length > 0 && !isHexColor(accentDraft)}
              onPress={() => void update({ accentColor: isHexColor(accentDraft) ? accentDraft : "default" })}
            />
          </View>

          <View style={styles.divider} />
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
            In-app name
          </Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextField
              value={displayNameDraft}
              onChangeText={setDisplayNameDraft}
              placeholder="PhotogramBot"
              theme={theme}
              autoCapitalize="words"
              style={{ flex: 1 }}
            />
            <Button
              title="Save"
              variant="outlined"
              theme={theme}
              onPress={() => void update({ appDisplayName: displayNameDraft.trim() || "PhotogramBot" })}
            />
          </View>

          <View style={styles.divider} />
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
            Text size
          </Text>
          <ChipRow
            options={FONT_SCALES}
            value={prefs.fontScale}
            onSelect={(v) => void update({ fontScale: Number(v) })}
            theme={theme}
          />
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
            Date format
          </Text>
          <ChipRow
            options={DATE_FORMATS}
            value={prefs.dateFormat}
            onSelect={(v) => void update({ dateFormat: v as any })}
            theme={theme}
          />

          <View style={styles.divider} />
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>Grid</Text>
          <ChipRow
            options={GRID_COLUMNS.map((n) => ({ key: n, label: `${n}` }))}
            value={prefs.gridColumns}
            onSelect={(v) => void update({ gridColumns: Number(v) })}
            theme={theme}
          />
          <ChipRow
            options={[
              { key: "square", label: "Square tiles" },
              { key: "original", label: "Natural aspect" },
            ]}
            value={prefs.tileAspect}
            onSelect={(v) => void update({ tileAspect: v as any })}
            theme={theme}
          />
          <ToggleRow
            title="Compact grid"
            subtitle="Tighter gaps between photos"
            value={prefs.compactGrid}
            onChange={(v) => void update({ compactGrid: v })}
            theme={theme}
          />
          <ToggleRow
            title="Cloud badge"
            subtitle="Show the ✓ on backed-up photos"
            value={prefs.showCloudBadge}
            onChange={(v) => void update({ showCloudBadge: v })}
            theme={theme}
          />
          <ToggleRow
            title="Video badge"
            subtitle="Show the ▶ duration on videos"
            value={prefs.showVideoBadge}
            onChange={(v) => void update({ showVideoBadge: v })}
            theme={theme}
          />
          <ToggleRow
            title="Favorite badge"
            subtitle="Show the heart on favorites"
            value={prefs.showFavoriteBadge}
            onChange={(v) => void update({ showFavoriteBadge: v })}
            theme={theme}
          />
          <ToggleRow
            title="Upload-status badge"
            subtitle="Show the ! on failed photos"
            value={prefs.showStatusBadge}
            onChange={(v) => void update({ showStatusBadge: v })}
            theme={theme}
          />
          <ToggleRow
            title="Date header counts"
            subtitle="Show how many photos are under each date"
            value={prefs.showDateCounts}
            onChange={(v) => void update({ showDateCounts: v })}
            theme={theme}
          />
          <ToggleRow
            title="Loading skeletons"
            subtitle="Pulse placeholders while thumbnails download"
            value={prefs.skeletonLoading}
            onChange={(v) => void update({ skeletonLoading: v })}
            theme={theme}
          />

          <View style={styles.divider} />
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
            Map style
          </Text>
          <ChipRow
            options={MAP_STYLES}
            value={prefs.mapStyle}
            onSelect={(v) => void update({ mapStyle: v as any })}
            theme={theme}
          />
          <ToggleRow
            title="Auto-hide viewer controls"
            subtitle="Tuck the top/bottom bars away after a few seconds"
            value={prefs.viewerAutoHideChrome}
            onChange={(v) => void update({ viewerAutoHideChrome: v })}
            theme={theme}
          />
          {prefs.viewerAutoHideChrome ? (
            <ChipRow
              options={[2, 3, 5, 8].map((n) => ({ key: n, label: `${n}s` }))}
              value={prefs.viewerChromeDelaySec}
              onSelect={(v) => void update({ viewerChromeDelaySec: Number(v) })}
              theme={theme}
            />
          ) : null}
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
            Photo info
          </Text>
          <ChipRow
            options={[
              { key: "compact", label: "Compact" },
              { key: "detailed", label: "Detailed" },
            ]}
            value={prefs.infoSheetDensity}
            onSelect={(v) => void update({ infoSheetDensity: v as any })}
            theme={theme}
          />

          <View style={styles.divider} />
          <ToggleRow
            title="Notification accent color"
            subtitle="Tint upload notifications with your accent"
            value={prefs.notificationAccent}
            onChange={(v) => void update({ notificationAccent: v })}
            theme={theme}
          />
          <ToggleRow
            title="Accent splash"
            subtitle="Match the in-app loading screen to your accent"
            value={prefs.splashAccent}
            onChange={(v) => void update({ splashAccent: v })}
            theme={theme}
          />
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
            App icon
          </Text>
          <ChipRow
            options={APP_ICON_VARIANTS}
            value={prefs.appIconVariant}
            onSelect={(v) => {
              void update({ appIconVariant: v as any });
              if (!setAppIcon(String(v))) {
                Alert.alert(
                  "Icon not applied",
                  "This build predates the icon variants. Install the next preview build to switch icons."
                );
              }
            }}
            theme={theme}
          />
          <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
            If the launcher keeps the old icon, close and reopen it (or reboot).
          </Text>

          <View style={styles.divider} />
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
            Widget
          </Text>
          <ToggleRow
            title="Widget shows date"
            subtitle="Overlay the photo date on the home-screen widget"
            value={prefs.widgetShowDate}
            onChange={(v) => void update({ widgetShowDate: v })}
            theme={theme}
          />
          <ToggleRow
            title="Widget compact layout"
            subtitle="Smaller padding and rounded corners"
            value={prefs.widgetCompact}
            onChange={(v) => void update({ widgetCompact: v })}
            theme={theme}
          />
          <ToggleRow
            title="Widget shows favorites only"
            subtitle="Limit the home-screen random photo widget to favorited photos"
            value={prefs.widgetFavoritesOnly}
            onChange={(v) => void update({ widgetFavoritesOnly: v })}
            theme={theme}
          />
        </Card>

        <SectionLabel text="Channel captions" theme={theme} />
        <Card theme={theme}>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
            Choose which metadata lines appear under each upload and reorder them. The
            content hash and preview line are always kept so restore and dedupe keep working.
          </Text>
          <Button
            title="Edit caption fields"
            variant="outlined"
            theme={theme}
            style={{ marginTop: 12 }}
            onPress={() => setCaptionDialog(true)}
          />
        </Card>

        <SectionLabel text="On-device AI" theme={theme} />
        <Card theme={theme}>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
            Models are downloaded on demand and are <Text style={{ fontWeight: "700" }}>not</Text>{" "}
            included in the APK. Total is roughly 17 MB. Scene tagging and face clusters
            run locally; nothing leaves the device.
          </Text>
          {MODELS.map((m) => {
            const status = modelStatuses?.find((s) => s.id === m.id);
            return (
              <View
                key={m.id}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 14 }}>
                    {m.name}
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 1 }}>
                    {m.note}
                  </Text>
                  <Text
                    style={{
                      color: status?.downloaded ? theme.colors.primary : theme.colors.onSurfaceVariant,
                      fontSize: 11.5,
                      marginTop: 2,
                    }}
                  >
                    {status?.downloaded
                      ? `Downloaded · ${formatBytes(status.bytes)}`
                      : `Not downloaded · ~${formatBytes(m.approxBytes)}`}
                  </Text>
                </View>
                <Button
                  title={status?.downloaded ? "Delete" : "Download"}
                  variant="outlined"
                  theme={theme}
                  busy={modelBusy === m.id}
                  disabled={!!modelBusy && modelBusy !== m.id}
                  onPress={() =>
                    status?.downloaded ? void deleteModelRow(m.id) : void downloadModelRow(m.id)
                  }
                />
              </View>
            );
          })}
          {modelNote ? (
            <Text style={{ color: theme.colors.primary, fontSize: 12, marginTop: 6, fontWeight: "600" }}>
              {modelNote}
            </Text>
          ) : null}
          <View style={styles.divider} />
          <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
            Tagging API key (optional)
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 }}>
            Used only for opt-in Gemini scene tags. Falls back to the AI captioning key.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" }}>
            <TextField
              value={taggingKeyDraft}
              onChangeText={setTaggingKeyDraft}
              placeholder="Gemini API key"
              theme={theme}
              secureTextEntry
              style={{ flex: 1 }}
            />
            <Button
              title="Save"
              variant="outlined"
              theme={theme}
              onPress={() =>
                void setTaggingApiKey(taggingKeyDraft).then(() => {
                  setTaggingKeyDraft("");
                  setModelNote("Tagging key saved.");
                })
              }
            />
          </View>
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
              <Text style={[styles.groupLabel, { color: theme.colors.onSurfaceVariant }]}>
                Lock after backgrounding
              </Text>
              <ChipRow
                options={[
                  { key: 0, label: "Immediately" },
                  { key: 30, label: "30 s" },
                  { key: 60, label: "1 min" },
                  { key: 300, label: "5 min" },
                ]}
                value={prefs.autoLockTimeoutSec}
                onSelect={(v) => void update({ autoLockTimeoutSec: Number(v) })}
                theme={theme}
              />
              <ToggleRow
                title="Block screenshots in viewer & lock"
                subtitle="FLAG_SECURE: screenshots and recent-apps thumbnails are blocked"
                value={prefs.secureViewer}
                onChange={(v) => void update({ secureViewer: v })}
                theme={theme}
              />
            </>
          ) : null}
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
              <View style={styles.divider} />
              <Pressable
                style={styles.destRow}
                onPress={() => void getBreakInLog().then(setBreakInEvents)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 14 }}>
                    Break-in log
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}>
                    {breakInCount === 0
                      ? "No failed unlock attempts recorded"
                      : `${breakInCount} unlock event${breakInCount === 1 ? "" : "s"} recorded`}
                  </Text>
                </View>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
              </Pressable>
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
        <Card theme={theme}>
          <ToggleRow
            title="Screenshot sunset"
            subtitle="In Free up space, highlight screenshots older than 30 days so old clutter is one tap to clear. Uses the automatic screenshot tagging."
            value={prefs.screenshotSunset}
            onChange={(v) => void update({ screenshotSunset: v })}
            theme={theme}
          />
        </Card>
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
        <Card theme={theme} onPress={() => navigation.navigate("FreeUpSpace")}>
          <View style={styles.folderRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                Free up space
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                Delete local copies of photos that are safely backed up to your channel
              </Text>
            </View>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
          </View>
        </Card>
        <Card theme={theme} onPress={() => void openZipDialog()}>
          <View style={styles.folderRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                Export month as ZIP
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                Bundle one month's originals into a single archive and share it
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
            title="Weekly channel digest"
            subtitle="Post a weekly self-audit to the channel: library totals, queue health and a sampled check that backups are still downloadable. One message per week."
            value={prefs.weeklyDigest}
            onChange={(v) => void update({ weeklyDigest: v })}
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
              <ToggleRow
                title="Include bot token in backups"
                subtitle="Store the bot connection inside the encrypted backup. A device that restores before setup adopts it automatically; a device with a working token keeps its own."
                value={prefs.dbBackupIncludeToken}
                onChange={(v) => void update({ dbBackupIncludeToken: v })}
                theme={theme}
              />
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
          <Button
            title="Export index (CSV)"
            variant="outlined"
            theme={theme}
            onPress={() =>
              void exportIndexCsv().catch((e: any) =>
                Alert.alert("Export failed", e?.message ?? "Unknown error")
              )
            }
            style={{ marginTop: 8 }}
          />
        </Card>

        <SectionLabel text="Storage" theme={theme} />
        {storage ? <StorageCard storage={storage} theme={theme} /> : null}
        {freeBytes !== null ? (
          <Card theme={theme}>
            <View style={styles.configRow}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 13.5 }}>
                Free space on device
              </Text>
              <Text
                style={{
                  color:
                    freeBytes < LOW_STORAGE_THRESHOLD_BYTES
                      ? theme.colors.error
                      : theme.colors.onSurface,
                  fontWeight: "600",
                }}
              >
                {formatBytes(freeBytes)}
              </Text>
            </View>
            {freeBytes < LOW_STORAGE_THRESHOLD_BYTES ? (
              <Text style={[styles.statusText, { color: theme.colors.error, marginTop: 0 }]}>
                Critically low — automatic backups are paused until more space is available. Manual syncs still work.
              </Text>
            ) : null}
            <View style={styles.divider} />
            <View style={styles.configRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 13.5 }}>
                  Thumbnail cache
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}>
                  {formatBytes(thumbBytes ?? 0)} — re-downloaded on demand, always safe to clear
                </Text>
              </View>
              <Button
                title="Clear"
                variant="outlined"
                theme={theme}
                onPress={() => void onClearThumbCache()}
              />
            </View>
          </Card>
        ) : null}

        <SectionLabel text="About" theme={theme} />
        <Card theme={theme}>
          <Text style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
            {prefs.appDisplayName || "PhotogramBot"}
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
            Version {CURRENT_VERSION} · Photos are backed up to your own Telegram channel via your own bot.
            No servers, no tracking. Telegram Bot API limits: originals up to 50 MB, downloads
            up to 20 MB.
          </Text>
          <View style={styles.divider} />
          <View style={styles.configRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 13.5 }}>
                Software updates
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}>
                {updateNote ?? "Check GitHub Releases for a newer APK and install it in place."}
              </Text>
            </View>
            <Button
              title={updateBusy ? "Checking…" : "Check"}
              variant="outlined"
              theme={theme}
              disabled={updateBusy}
              onPress={() => void runUpdateCheck()}
            />
          </View>
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
        visible={captionDialog}
        theme={theme}
        title="Caption fields"
        message="Tap a field to include or exclude it. The content hash is always kept so restore and dedupe keep working."
      >
        <ScrollView style={{ maxHeight: 340, marginTop: 12 }}>
          {captionOrder.map((key, index) => {
            const label = CAPTION_FIELD_LABELS.find((f) => f.key === key)?.label ?? key;
            const enabled = key === "hash" || captionEnabled.has(key);
            const move = (delta: number) => {
              const next = [...captionOrder];
              const to = index + delta;
              if (to < 0 || to >= next.length) return;
              [next[index], next[to]] = [next[to], next[index]];
              setCaptionOrder(next);
            };
            return (
              <View key={key} style={styles.captionRow}>
                <Pressable
                  onPress={() => {
                    if (key === "hash") return;
                    const next = new Set(captionEnabled);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    setCaptionEnabled(next);
                  }}
                  style={[
                    styles.captionToggle,
                    {
                      borderColor: enabled ? theme.colors.primary : theme.colors.outline,
                      backgroundColor: enabled ? theme.colors.primaryContainer : "transparent",
                    },
                  ]}
                >
                  <Text style={{ color: enabled ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant, fontSize: 12 }}>
                    {enabled ? "✓" : ""}
                  </Text>
                </Pressable>
                <Text style={[styles.captionLabel, { color: theme.colors.onSurface }]} numberOfLines={1}>
                  {label}
                </Text>
                <Pressable onPress={() => move(-1)} hitSlop={6} disabled={index === 0}>
                  <Text style={{ color: index === 0 ? theme.colors.outline : theme.colors.primary, fontSize: 16 }}>↑</Text>
                </Pressable>
                <Pressable
                  onPress={() => move(1)}
                  hitSlop={6}
                  disabled={index === captionOrder.length - 1}
                >
                  <Text
                    style={{
                      color:
                        index === captionOrder.length - 1
                          ? theme.colors.outline
                          : theme.colors.primary,
                      fontSize: 16,
                    }}
                  >
                    ↓
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Button title="Cancel" variant="text" theme={theme} onPress={() => setCaptionDialog(false)} />
          <Button
            title="Save"
            theme={theme}
            onPress={() => {
              const fields = captionOrder.filter((k) => k === "hash" || captionEnabled.has(k));
              void update({ captionFields: fields });
              setCaptionDialog(false);
            }}
          />
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

      <Dialog
        visible={breakInEvents !== null}
        theme={theme}
        title="Break-in log"
        message={
          breakInEvents && breakInEvents.length > 0
            ? "Failed unlock attempts and decoy-PIN uses, newest first."
            : "No failed unlock attempts recorded."
        }
      >
        {breakInEvents && breakInEvents.length > 0 ? (
          <View style={{ maxHeight: 320 }}>
            <ScrollView nestedScrollEnabled>
              {breakInEvents
                .slice()
                .reverse()
                .slice(0, 30)
                .map((e, i) => (
                  <Text
                    key={`${e.t}-${i}`}
                    style={{ color: theme.colors.onSurface, fontSize: 13, paddingVertical: 4 }}
                  >
                    {fmtEventTime(e.t)} · {BREAK_IN_LABELS[e.kind]}
                  </Text>
                ))}
              {breakInEvents.length > 30 ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, paddingVertical: 4 }}>
                  …and {breakInEvents.length - 30} older events.
                </Text>
              ) : null}
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <Button
                title="Clear log"
                variant="text"
                theme={theme}
                onPress={() => {
                  void clearBreakInLog().then(() => {
                    setBreakInCount(0);
                    setBreakInEvents([]);
                  });
                }}
              />
              <Button title="Close" theme={theme} onPress={() => setBreakInEvents(null)} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 14 }}>
            <Button title="Close" theme={theme} onPress={() => setBreakInEvents(null)} />
          </View>
        )}
      </Dialog>

      <Dialog
        visible={zipDialog}
        theme={theme}
        title="Export month as ZIP"
        message="Pick a month — its backed-up originals are downloaded, zipped (up to 100 MB per archive) and handed to the share sheet."
      >
        {zipNote ? (
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginBottom: 8 }}>
            {zipNote}
          </Text>
        ) : null}
        <View style={{ maxHeight: 300 }}>
          <ScrollView nestedScrollEnabled>
            {zipMonths.map((m) => (
              <Pressable
                key={`${m.year}-${m.month}`}
                disabled={zipBusy}
                onPress={() => void runZipExport(m.year, m.month)}
                style={({ pressed }) => [
                  styles.destRow,
                  { opacity: zipBusy ? 0.5 : pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={{ color: theme.colors.onSurface, fontSize: 14 }}>{m.label}</Text>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 14 }}>
          <Button title="Close" variant="text" theme={theme} disabled={zipBusy} onPress={() => setZipDialog(false)} />
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

function ChipRow({
  options,
  value,
  onSelect,
  theme,
}: {
  options: { key: string | number; label: string }[];
  value: string | number;
  onSelect: (value: string | number) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={String(option.key)}
            onPress={() => onSelect(option.key)}
            style={[
              styles.chip,
              {
                backgroundColor: active
                  ? theme.colors.primaryContainer
                  : theme.colors.surfaceHighest,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={{
                color: active ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                fontSize: 12.5,
                fontWeight: "600",
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StepperRow({
  label,
  minutes,
  onChange,
  theme,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={{ color: theme.colors.onSurface, fontSize: 14 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          onPress={() => onChange((minutes - 30 + 1440) % 1440)}
          hitSlop={8}
          accessibilityLabel={`${label} earlier`}
          accessibilityRole="button"
        >
          <Text style={{ color: theme.colors.primary, fontSize: 20, fontWeight: "700" }}>−</Text>
        </Pressable>
        <Text style={{ color: theme.colors.onSurface, fontSize: 15, fontWeight: "600", minWidth: 48, textAlign: "center" }}>
          {formatClock(minutes)}
        </Text>
        <Pressable
          onPress={() => onChange((minutes + 30) % 1440)}
          hitSlop={8}
          accessibilityLabel={`${label} later`}
          accessibilityRole="button"
        >
          <Text style={{ color: theme.colors.primary, fontSize: 20, fontWeight: "700" }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const BREAK_IN_LABELS: Record<BreakInEvent["kind"], string> = {
  pin_fail: "Wrong PIN",
  biometric_fail: "Failed biometric",
  decoy_unlock: "Decoy PIN used",
};

function fmtEventTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
  groupLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    fontSize: 11.5,
    marginTop: 6,
    lineHeight: 16,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  captionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  captionToggle: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  captionLabel: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "500",
  },
});
