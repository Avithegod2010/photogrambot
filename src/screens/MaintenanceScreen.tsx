import React, { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useLibraryStore } from "../store/useLibraryStore";
import { Button, Card, SectionLabel, Dialog } from "../components/ui";
import {
  findDuplicateGroups,
  checkIntegrity,
  removeBrokenPhotos,
  verifyBackupSample,
  repairBrokenUploads,
  scanNearDuplicates,
  autoTagBackfill,
  dedupeChannelPostGroups,
  type DuplicateGroup,
  type IntegrityProgress,
  type NearDupGroup,
  type NearDupProgress,
  type AutoTagProgress,
  type VerificationProgress,
  type VerificationResult,
} from "../lib/maintenance";
import {
  getAllUploadedPhotoIds,
  getQueueCounts,
  retryFailedUploads,
  addToTrash,
  markTrashRemoteDeleted,
  getDuplicateHashGroups,
  type PhotoRow,
} from "../lib/db";
import { formatBytes, formatDate } from "../lib/format";
import { processQueue } from "../lib/uploader";
import {
  restoreAllToDevice,
  requestCancelRestore,
  type RestoreProgress,
} from "../lib/restore";
import { getChannelId, getAiApiKey } from "../lib/settings";
import { deleteMessage } from "../lib/telegram";
import { tokenForPhoto } from "../lib/destinations";
import { embedIndexBackfill } from "../lib/semsearch";
import { getDiagLog, clearDiagLog, type DiagEvent } from "../lib/diaglog";
import { getEmbeddingCoverage } from "../lib/db";
import type { EmbedBackfillProgress } from "../lib/semsearch";

export function MaintenanceScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { stats, refreshMeta, trashPhotos } = useLibraryStore();

  const [dupes, setDupes] = useState<DuplicateGroup[]>([]);
  const [scanningDupes, setScanningDupes] = useState(false);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [integrity, setIntegrity] = useState<IntegrityProgress | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [verifyRunning, setVerifyRunning] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState<VerificationProgress | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairNote, setRepairNote] = useState<string | null>(null);
  const [diagVisible, setDiagVisible] = useState(false);
  const [diagEvents, setDiagEvents] = useState<DiagEvent[]>([]);
  const [dedupeGroups, setDedupeGroups] = useState<PhotoRow[][] | null>(null);
  const [dedupeBusy, setDedupeBusy] = useState(false);
  const [dedupeNote, setDedupeNote] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [motionBusy, setMotionBusy] = useState(false);
  const [motionProgress, setMotionProgress] = useState<{ done: number; total: number } | null>(null);
  const [motionNote, setMotionNote] = useState<string | null>(null);
  const [motionError, setMotionError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgress | null>(null);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const [semBusy, setSemBusy] = useState(false);
  const [semProgress, setSemProgress] = useState<EmbedBackfillProgress | null>(null);
  const [semNote, setSemNote] = useState<string | null>(null);
  const [semError, setSemError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [nearDups, setNearDups] = useState<NearDupGroup[]>([]);
  const [scanningNear, setScanningNear] = useState(false);
  const [nearProgress, setNearProgress] = useState<NearDupProgress | null>(null);
  const [nearError, setNearError] = useState<string | null>(null);
  const [nearNote, setNearNote] = useState<string | null>(null);
  const [tagging, setTagging] = useState(false);
  const [tagProgress, setTagProgress] = useState<AutoTagProgress | null>(null);
  const [tagNote, setTagNote] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);

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

  async function runVerify() {
    setVerifyRunning(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      setVerifyResult(await verifyBackupSample(25, setVerifyProgress));
    } catch (e: any) {
      setVerifyError(e?.message ?? "Verification failed — try again.");
    } finally {
      setVerifyRunning(false);
    }
  }

  async function runRepair() {
    if (!verifyResult || verifyResult.broken.length === 0) return;
    setRepairing(true);
    setRepairNote(null);
    try {
      const r = await repairBrokenUploads(verifyResult.broken, (done, total, current) =>
        setRepairNote(current ? `Repairing ${done + 1}/${total} — ${current}` : `Checked ${done}/${total}`)
      );
      if (r.enqueued > 0) {
        void processQueue();
        Alert.alert(
          "Repair queued",
          `${r.enqueued} photo${r.enqueued === 1 ? "" : "s"} queued for re-upload` +
            (r.skipped > 0 ? `; ${r.skipped} skipped (no local copy on this device)` : "") +
            ". The replaced channel messages are cleaned up once the fresh copies land."
        );
        setVerifyResult(null);
      } else {
        Alert.alert(
          "Nothing repairable",
          "None of the broken photos have a local copy to re-upload from. They can only be re-saved by opening them in the Telegram app."
        );
      }
    } catch (e: any) {
      Alert.alert("Repair failed", e?.message ?? "Unknown error");
    } finally {
      setRepairing(false);
      setRepairNote(null);
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

  async function scanNear() {
    setScanningNear(true);
    setNearError(null);
    setNearNote(null);
    setNearProgress({ decoded: 0, cached: 0, total: 0, skipped: 0, currentFile: null, done: false });
    try {
      const result = await scanNearDuplicates(setNearProgress);
      setNearDups(result.groups);
      const bits: string[] = [`${result.groups.length} near-duplicate group${result.groups.length === 1 ? "" : "s"}`];
      if (result.skipped > 0) bits.push(`${result.skipped} skipped (no local copy or > 25 MB)`);
      if (result.decodeFailed > 0) bits.push(`${result.decodeFailed} undecodable (non-baseline JPEG)`);
      setNearNote(bits.join(" · "));
    } catch (e: any) {
      setNearError(e?.message ?? "Near-duplicate scan failed.");
    } finally {
      setScanningNear(false);
      setNearProgress(null);
    }
  }

  async function runAutoTag() {
    setTagging(true);
    setTagError(null);
    setTagNote(null);
    setTagProgress({ current: 0, total: 0, tagged: 0, currentFile: null, done: false });
    try {
      const result = await autoTagBackfill(setTagProgress);
      setTagNote(
        result.tagged === 0
          ? `All ${result.scanned} photos already tagged.`
          : `Tagged ${result.tagged} photo${result.tagged === 1 ? "" : "s"} — searchable now.`
      );
    } catch (e: any) {
      setTagError(e?.message ?? "Auto-tagging failed.");
    } finally {
      setTagging(false);
      setTagProgress(null);
    }
  }

  async function runEmbedIndex() {
    setSemBusy(true);
    setSemError(null);
    setSemNote(null);
    setSemProgress(null);
    try {
      const apiKey = await getAiApiKey();
      if (!apiKey) {
        setSemError("Add a Gemini API key in Settings → AI captions first.");
        return;
      }
      const coverage = await getEmbeddingCoverage();
      if (coverage.missing === 0) {
        setSemNote(`All ${coverage.embedded} backed-up photos are indexed.`);
        return;
      }
      setSemProgress({ done: 0, total: coverage.missing });
      const result = await embedIndexBackfill(apiKey, setSemProgress, coverage.missing);
      setSemNote(
        `Indexed ${result.embedded} photo${result.embedded === 1 ? "" : "s"}${
          result.failed ? ` — ${result.failed} skipped (API errors, run again later)` : ""
        }. Meaning-based search now fills in when word search comes up empty.`
      );
    } catch (e: any) {
      setSemError(e?.message ?? "Indexing failed.");
    } finally {
      setSemBusy(false);
      setSemProgress(null);
    }
  }

  function removeNearGroupExceptFirst(group: NearDupGroup, alsoChannel: boolean) {
    const keep = group.photos[0];
    const rest = group.photos.slice(1);
    if (!alsoChannel) {
      // Local-only cleanup — same semantics as the exact-dup keepOldest.
      void trashPhotos(
        rest.map((p) => p.id),
        false
      ).then(() => setNearDups((prev) => prev.filter((g) => g !== group)));
      return;
    }
    Alert.alert(
      `Delete ${rest.length} duplicate copies from the channel too?`,
      "This permanently removes their messages from Telegram (including for other devices) and moves them to the app's trash so they never re-upload. The newest copy is kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete for good",
          style: "destructive",
          onPress: () => void (async () => {
            try {
              const channelId = await getChannelId();
              for (const p of rest) {
                if (channelId && p.message_id) {
                  const token = await tokenForPhoto(p);
                  await deleteMessage(channelId, p.message_id, token ?? undefined);
                  if (p.preview_message_id) {
                    await deleteMessage(channelId, p.preview_message_id, token ?? undefined);
                  }
                }
                // Trash (not hard-delete): the row must survive so auto-sync
                // keeps skipping the local file — a hard delete would let the
                // next scan re-upload the duplicate we just removed.
                await addToTrash(p.id);
                await markTrashRemoteDeleted(p.id);
              }
              await refreshMeta();
              setNearDups((prev) => prev.filter((g) => g !== group));
            } catch (e: any) {
              Alert.alert("Delete failed", e?.message ?? "Could not delete the duplicates.");
            }
          })(),
        },
      ],
      { cancelable: true }
    );
  }

  useEffect(() => {
    const refreshFailedCount = () =>
      void getQueueCounts().then((c) => setFailedCount(c.failed ?? 0));
    void refreshFailedCount();
    // Stack screens stay mounted — re-check when returning from the queue screen.
    return navigation.addListener("focus", refreshFailedCount);
  }, [navigation]);

  async function retryFailed() {
    setRetrying(true);
    setRetryResult(null);
    setRetryError(null);
    try {
      const n = await retryFailedUploads();
      if (n > 0) void processQueue();
      setRetryResult(
        n > 0
          ? `Requeued ${n} upload${n === 1 ? "" : "s"}.`
          : "Nothing to requeue — every failed item already has a newer queue entry."
      );
      setFailedCount((await getQueueCounts()).failed ?? 0);
      await refreshMeta();
    } catch (e: any) {
      setRetryError(e?.message ?? "Requeue failed — try again.");
    } finally {
      setRetrying(false);
    }
  }

  async function openDiagLog() {
    setDiagEvents(await getDiagLog());
    setDiagVisible(true);
  }

  async function runOcrBackfill() {
    if (ocrBusy) return;
    setOcrBusy(true);
    setOcrNote(null);
    setOcrError(null);
    try {
      const { ocrScreenshotBackfill } = await import("../lib/ocr");
      const r = await ocrScreenshotBackfill((p) =>
        setOcrNote(
          p.currentFile
            ? `Reading ${p.done + 1}/${p.total} — text found in ${p.found} so far`
            : `Finished`
        )
      );
      setOcrNote(
        r.done === 0
          ? "Nothing pending — every screenshot has been read."
          : `Read ${r.done} screenshot${r.done === 1 ? "" : "s"} — text extracted from ${r.found}` +
              (r.failed > 0 ? `, ${r.failed} failed (retried next run)` : "") +
              "."
      );
    } catch (e: any) {
      setOcrError(e?.message ?? "OCR failed — try again.");
    } finally {
      setOcrBusy(false);
    }
  }

  async function runMotionBackfill() {
    if (motionBusy) return;
    setMotionBusy(true);
    setMotionNote(null);
    setMotionError(null);
    setMotionProgress({ done: 0, total: 0 });
    try {
      const { backfillMotionClips } = await import("../lib/maintenance");
      const r = await backfillMotionClips((done, total) => setMotionProgress({ done, total }));
      if (r.scanned === 0) {
        setMotionNote("Nothing to scan — every backed-up photo has been checked.");
      } else {
        setMotionNote(
          `Scanned ${r.scanned}: ${r.extracted} motion clip${r.extracted === 1 ? "" : "s"} uploaded` +
            `, ${r.empty} had none` +
            (r.skipped > 0 ? `, ${r.skipped} skipped (no local copy)` : "") +
            (r.failed > 0 ? `, ${r.failed} failed (retried next run)` : "") +
            "."
        );
      }
    } catch (e: any) {
      setMotionError(e?.message ?? "Motion scan failed — try again.");
    } finally {
      setMotionBusy(false);
      setMotionProgress(null);
    }
  }

  async function runChannelDedupeScan() {    setDedupeBusy(true);
    setDedupeNote(null);
    try {
      const groups = await getDuplicateHashGroups();
      setDedupeGroups(groups);
      setDedupeNote(
        groups.length === 0
          ? "No duplicate posts found — every backed-up photo has exactly one channel copy."
          : `${groups.length} duplicate group${groups.length === 1 ? "" : "s"} found.`
      );
    } catch (e: any) {
      setDedupeNote(`Scan failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setDedupeBusy(false);
    }
  }

  async function runChannelDedupeClean() {
    if (!dedupeGroups || dedupeGroups.length === 0) return;
    setDedupeBusy(true);
    try {
      const r = await dedupeChannelPostGroups(dedupeGroups, (done, total) =>
        setDedupeNote(`Cleaning ${done + 1}/${total}…`)
      );
      setDedupeGroups(null);
      setDedupeNote(
        `Cleaned: ${r.deleted} duplicate post${r.deleted === 1 ? "" : "s"} removed` +
          (r.failed > 0 ? `, ${r.failed} failed` : "") +
          "."
      );
      await refreshMeta();
    } catch (e: any) {
      setDedupeNote(`Clean failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setDedupeBusy(false);
    }
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
        data={[
          ...dupes.map((g) => ({ type: "exact" as const, key: `x_${g.hash}`, exact: g })),
          ...nearDups.map((g, i) => ({ type: "near" as const, key: `n_${i}_${g.photos[0]?.id}`, near: g })),
        ]}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        ListHeaderComponent={
          <View>
            <SectionLabel text="Upload queue" theme={theme} />
            <Card theme={theme} onPress={() => navigation.navigate("UploadQueue")}>
              <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                    Pending & failed uploads
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                    Inspect the queue, retry or remove individual items
                  </Text>
                </View>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
              </View>
            </Card>
            <Card theme={theme} onPress={() => void openDiagLog()}>
              <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                    Diagnostics
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                    Recent upload, scan and background failures
                  </Text>
                </View>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
              </View>
            </Card>
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                Channel dedupe
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2, lineHeight: 18 }}>
                Find identical photos posted to the channel more than once and keep a single copy of each.
              </Text>
              <Button
                title={dedupeGroups ? "Rescan" : "Scan for duplicates"}
                theme={theme}
                variant="outlined"
                busy={dedupeBusy}
                onPress={runChannelDedupeScan}
                style={{ marginTop: 10 }}
              />
              {dedupeNote ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 8 }}>
                  {dedupeNote}
                </Text>
              ) : null}
              {dedupeGroups && dedupeGroups.length > 0 ? (
                <Button
                  title={`Keep one copy each — clean ${dedupeGroups.length} group${dedupeGroups.length === 1 ? "" : "s"}`}
                  variant="danger"
                  theme={theme}
                  busy={dedupeBusy}
                  onPress={runChannelDedupeClean}
                  style={{ marginTop: 10 }}
                />
              ) : null}
            </Card>
            <Card theme={theme} onPress={() => navigation.navigate("FreeUpSpace")}>
              <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                    Free up space
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                    Delete local copies of photos that are safely backed up
                  </Text>
                </View>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
              </View>
            </Card>
            {failedCount > 0 ? (
              <Card theme={theme} style={{ marginTop: 10 }}>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
                  {failedCount} upload{failedCount === 1 ? "" : "s"} failed after all retries.
                  Requeue them to try again.
                </Text>
                <Button
                  title="Retry failed uploads"
                  theme={theme}
                  variant="outlined"
                  busy={retrying}
                  onPress={retryFailed}
                  style={{ marginTop: 12 }}
                />
                {retryResult ? (
                  <Text
                    style={{
                      color: theme.colors.success,
                      fontSize: 12.5,
                      marginTop: 10,
                      fontWeight: "600",
                    }}
                  >
                    {retryResult}
                  </Text>
                ) : null}
                {retryError ? (
                  <Text
                    style={{
                      color: theme.colors.error,
                      fontSize: 12.5,
                      marginTop: 10,
                      fontWeight: "600",
                    }}
                  >
                    {retryError}
                  </Text>
                ) : null}
              </Card>
            ) : null}

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
              <Button
                title={nearDups.length ? "Rescan near-duplicates" : "Find near-duplicates"}
                theme={theme}
                variant="outlined"
                busy={scanningNear}
                onPress={scanNear}
                style={{ marginTop: 10 }}
              />
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, marginTop: 8 }}>
                Near-duplicates catches bursts, edits and re-saves by comparing image structure
                (JPEGs only — PNG/HEIC skipped; thumbnails are downloaded for cloud-only photos).
              </Text>
              {nearProgress && !nearProgress.done ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 10 }}>
                  Hashing {nearProgress.decoded + nearProgress.cached}/{nearProgress.total} —{" "}
                  {nearProgress.skipped} skipped
                </Text>
              ) : null}
              {nearNote ? (
                <Text style={{ color: theme.colors.primary, fontWeight: "700", marginTop: 10, fontSize: 12.5 }}>
                  {nearNote}
                </Text>
              ) : null}
              {nearError ? (
                <Text style={{ color: theme.colors.error, fontSize: 12.5, marginTop: 10, fontWeight: "600" }}>
                  {nearError}
                </Text>
              ) : null}
              {dupes.length > 0 ? (
                <Text style={{ color: theme.colors.primary, fontWeight: "700", marginTop: 12 }}>
                  {dupes.length} duplicate group{dupes.length === 1 ? "" : "s"} found
                </Text>
              ) : null}
            </Card>

            <SectionLabel text="Auto-tags" theme={theme} />
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
                Tags screenshots, WhatsApp saves, screen recordings and documents by filename
                pattern so they're filterable (Gallery → ☰ → Type). New backups are tagged
                automatically; this backfills your existing library.
              </Text>
              <Button
                title="Tag library"
                theme={theme}
                variant="outlined"
                busy={tagging}
                onPress={runAutoTag}
                style={{ marginTop: 12 }}
              />
              {tagProgress ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 10 }}>
                  {tagProgress.done
                    ? `Scanned ${tagProgress.total} — ${tagProgress.tagged} tagged`
                    : `Tagging ${tagProgress.current}/${tagProgress.total || "…"} — ${tagProgress.tagged} tagged`}
                </Text>
              ) : null}
              {tagNote ? (
                <Text style={{ color: theme.colors.primary, fontWeight: "700", marginTop: 10, fontSize: 12.5 }}>
                  {tagNote}
                </Text>
              ) : null}
              {tagError ? (
                <Text style={{ color: theme.colors.error, fontSize: 12.5, marginTop: 10, fontWeight: "600" }}>
                  {tagError}
                </Text>
              ) : null}
            </Card>

            <SectionLabel text="Screenshot text (OCR)" theme={theme} />
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
                Extracts the visible text from your backed-up screenshots via Gemini so word
                search finds content inside them ("wifi password", order numbers). Uses your
                Gemini key — one small request per screenshot; run again to pick up new ones.
              </Text>
              <Button
                title={ocrBusy ? "Extracting…" : "Extract text from screenshots"}
                theme={theme}
                variant="outlined"
                busy={ocrBusy}
                onPress={runOcrBackfill}
                style={{ marginTop: 12 }}
              />
              {ocrNote ? (
                <Text style={{ color: theme.colors.primary, fontWeight: "700", marginTop: 10, fontSize: 12.5 }}>
                  {ocrNote}
                </Text>
              ) : null}
              {ocrError ? (
                <Text style={{ color: theme.colors.error, fontSize: 12.5, marginTop: 10, fontWeight: "600" }}>
                  {ocrError}
                </Text>
              ) : null}
            </Card>

            <SectionLabel text="Motion clips" theme={theme} />
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
                Google/Samsung motion photos carry a short video inside the JPEG. New backups get
                their clip automatically; this scans photos backed up earlier and uploads any missing
                clips as a #{""}motion reply so they're playable again. Needs the local copy still on
                this phone.
              </Text>
              <Button
                title={motionBusy ? "Scanning…" : "Extract motion clips"}
                theme={theme}
                variant="outlined"
                busy={motionBusy}
                onPress={() => void runMotionBackfill()}
                style={{ marginTop: 12 }}
              />
              {motionProgress ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 10 }}>
                  Scanning {motionProgress.done}/{motionProgress.total || "…"}
                </Text>
              ) : null}
              {motionNote ? (
                <Text style={{ color: theme.colors.primary, fontWeight: "700", marginTop: 10, fontSize: 12.5 }}>
                  {motionNote}
                </Text>
              ) : null}
              {motionError ? (
                <Text style={{ color: theme.colors.error, fontSize: 12.5, marginTop: 10, fontWeight: "600" }}>
                  {motionError}
                </Text>
              ) : null}
            </Card>

            <SectionLabel text="Semantic search" theme={theme} />
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
                Indexes what each backed-up photo is about — AI captions, names, folders and tags —
                so searching can find photos by meaning ("food at night", "someone holding a baby")
                even when no word matches. Uses your Gemini key; the first pass takes a while on
                big libraries and new photos are picked up by running it again.
              </Text>
              <Button
                title={semProgress ? "Indexing…" : "Build search index"}
                theme={theme}
                variant="outlined"
                busy={semBusy}
                onPress={runEmbedIndex}
                style={{ marginTop: 12 }}
              />
              {semProgress ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 10 }}>
                  Indexed {semProgress.done}/{semProgress.total || "…"}
                </Text>
              ) : null}
              {semNote ? (
                <Text style={{ color: theme.colors.primary, fontWeight: "700", marginTop: 10, fontSize: 12.5 }}>
                  {semNote}
                </Text>
              ) : null}
              {semError ? (
                <Text style={{ color: theme.colors.error, fontSize: 12.5, marginTop: 10, fontWeight: "600" }}>
                  {semError}
                </Text>
              ) : null}
            </Card>

            <SectionLabel text="Backup verification" theme={theme} />
            <Card theme={theme}>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, lineHeight: 19 }}>
                Fast trust check — samples 25 backed-up photos and confirms the channel still
                serves them. The full checker scans everything.
              </Text>
              <Button
                title="Verify sample of 25"
                theme={theme}
                variant="outlined"
                busy={verifyRunning}
                onPress={runVerify}
                style={{ marginTop: 12 }}
              />
              {verifyProgress && !verifyProgress.done ? (
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 10 }}>
                  Checking {verifyProgress.checked}/{verifyProgress.total} —{" "}
                  {verifyProgress.broken} broken so far
                </Text>
              ) : null}
              {verifyResult ? (
                <>
                  <Text
                    style={{
                      color: verifyResult.broken.length > 0 ? theme.colors.error : theme.colors.success,
                      fontSize: 12.5,
                      marginTop: 10,
                      fontWeight: "600",
                    }}
                  >
                    {verifyResult.checked === 0
                      ? "Nothing backed up yet — nothing to verify."
                      : verifyResult.broken.length === 0
                        ? `Sampled ${verifyResult.checked} — all reachable`
                        : `Sampled ${verifyResult.checked} — ${verifyResult.broken.length} not reachable: ${verifyResult.broken
                            .slice(0, 3)
                            .map((b) => b.filename)
                            .join(", ")}${verifyResult.broken.length > 3 ? `, +${verifyResult.broken.length - 3} more` : ""}`}
                  </Text>
                  {verifyResult.checked > 0 ? (
                    <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, marginTop: 4 }}>
                      Verified {formatDate(verifyResult.sampledAt)}
                    </Text>
                  ) : null}
                  {verifyResult.broken.length > 0 ? (
                    <>
                      <Button
                        title="Repair from local copies"
                        theme={theme}
                        variant="outlined"
                        busy={repairing}
                        onPress={runRepair}
                        style={{ marginTop: 12 }}
                      />
                      {repairNote ? (
                        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 6 }}>
                          {repairNote}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                  {verifyResult.broken.length > 0 ? (
                    <Button
                      title="Run full check"
                      theme={theme}
                      variant="outlined"
                      busy={integrityRunning}
                      onPress={runIntegrity}
                      style={{ marginTop: 12 }}
                    />
                  ) : null}
                </>
              ) : null}
              {verifyError ? (
                <Text
                  style={{
                    color: theme.colors.error,
                    fontSize: 12.5,
                    marginTop: 10,
                    fontWeight: "600",
                  }}
                >
                  {verifyError}
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

            {dupes.length > 0 || nearDups.length > 0 ? (
              <SectionLabel
                text={
                  dupes.length > 0 && nearDups.length > 0
                    ? "Duplicate groups (exact + near)"
                    : dupes.length > 0
                      ? "Duplicate groups"
                      : "Near-duplicate groups"
                }
                theme={theme}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          item.type === "exact" ? (
            <Card theme={theme} style={{ marginBottom: 10 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "700", marginBottom: 2 }}>
                {item.exact.count} identical copies
              </Text>
              <Text
                style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, marginBottom: 8 }}
                numberOfLines={1}
              >
                {formatBytes(item.exact.photos[0]?.size)} each · {item.exact.hash.slice(0, 20)}…
              </Text>
              {item.exact.photos.map((p) => (
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
                  onPress={() => keepOldest(item.exact)}
                />
              </View>
            </Card>
          ) : (
            <Card theme={theme} style={{ marginBottom: 10 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "700", marginBottom: 2 }}>
                {item.near.photos.length} near-identical copies
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, marginBottom: 8 }} numberOfLines={1}>
                Perceptual match · kept copy: {item.near.photos[0]?.filename}
              </Text>
              {item.near.photos.map((p, idx) => (
                <View key={p.id} style={styles.dupeRow}>
                  <Text
                    style={{
                      color: idx === 0 ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                      fontSize: 12,
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {idx === 0 ? "★ " : ""}
                    {p.filename}
                    {p.status === "uploaded" ? "  ·  ☁" : ""}
                  </Text>
                </View>
              ))}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                <Button
                  title="Keep newest, trash rest"
                  variant="danger"
                  theme={theme}
                  onPress={() => removeNearGroupExceptFirst(item.near, false)}
                />
                <Button
                  title="Delete from channel too"
                  variant="danger"
                  theme={theme}
                  onPress={() => removeNearGroupExceptFirst(item.near, true)}
                />
              </View>
            </Card>
          )
        }
        ListEmptyComponent={null}
      />

      <Dialog
        visible={diagVisible}
        theme={theme}
        title="Diagnostics"
        message={
          diagEvents.length > 0
            ? "Recent operational failures, newest first. Safe to clear anytime."
            : "No failures recorded."
        }
      >
        {diagEvents.length > 0 ? (
          <View style={{ maxHeight: 320 }}>
            <ScrollView nestedScrollEnabled>
              {diagEvents
                .slice()
                .reverse()
                .map((e, i) => (
                  <Text key={`${e.t}-${i}`} style={{ color: theme.colors.onSurface, fontSize: 12.5, paddingVertical: 4 }}>
                    {fmtDiagTime(e.t)} · [{e.kind}] {e.msg}
                  </Text>
                ))}
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <Button
                title="Clear"
                variant="text"
                theme={theme}
                onPress={() => {
                  void clearDiagLog().then(() => {
                    setDiagEvents([]);
                  });
                }}
              />
              <Button title="Close" theme={theme} onPress={() => setDiagVisible(false)} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 14 }}>
            <Button title="Close" theme={theme} onPress={() => setDiagVisible(false)} />
          </View>
        )}
      </Dialog>
    </View>
  );
}

function fmtDiagTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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
