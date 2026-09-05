import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as MediaLibrary from "expo-media-library";
import { File } from "expo-file-system";
import { useTheme } from "../useTheme";
import {
  getFreeUpCandidates,
  clearLocalUris,
  type PhotoRow,
} from "../lib/db";
import { formatBytes } from "../lib/format";
import { TelegramImage, resolvePhotoThumb } from "../components/TelegramImage";

const DELETE_CHUNK = 200;
const VERIFY_SPACING_MS = 60;

interface Candidate extends PhotoRow {
  existsOnDevice: boolean;
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

export function FreeUpSpaceScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [checkProgress, setCheckProgress] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"idle" | "verifying" | "deleting">("idle");
  const [progressLine, setProgressLine] = useState<string | null>(null);
  const [resultLine, setResultLine] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setResultLine(null);
    try {
      const rows = await getFreeUpCandidates();
      const checked: Candidate[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        let exists = false;
        if (r.local_uri) {
          try {
            exists = new File(r.local_uri).exists;
          } catch {}
        }
        checked.push({ ...r, existsOnDevice: exists });
        if (i % 100 === 0) {
          setCheckProgress(`Checking ${i}/${rows.length} local copies…`);
          await new Promise((res) => setTimeout(res, 0));
        }
      }
      const present = checked.filter((c) => c.existsOnDevice);
      setCandidates(present);
      setSelection(new Set(present.map((c) => c.id)));
    } catch (e: any) {
      Alert.alert("Load failed", e?.message ?? "Could not list candidates.");
    } finally {
      setCheckProgress(null);
      setLoading(false);
    }
  }

  const totalBytes = useMemo(
    () => candidates.reduce((sum, c) => sum + (c.size ?? 0), 0),
    [candidates]
  );
  const selectedBytes = useMemo(
    () =>
      candidates
        .filter((c) => selection.has(c.id))
        .reduce((sum, c) => sum + (c.size ?? 0), 0),
    [candidates, selection]
  );

  const sections = useMemo(() => {
    const byMonth = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const k = monthKey(c.taken_at);
      const list = byMonth.get(k);
      if (list) list.push(c);
      else byMonth.set(k, [c]);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({
        key,
        label: monthLabel(key),
        items,
        bytes: items.reduce((s, c) => s + (c.size ?? 0), 0),
      }));
  }, [candidates]);

  function toggle(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function freeUp() {
    const selected = candidates.filter((c) => selection.has(c.id));
    const withRemote = selected.filter(
      (c): c is Candidate & { remote_file_id: string } => !!c.remote_file_id
    );
    const withoutRemote = selected.length - withRemote.length;
    if (withoutRemote > 0) {
      // Safety gate: a selected row without a known channel file id is never
      // deletable — this should be unreachable (candidates are 'uploaded'),
      // but the cost of being wrong is a lost original.
      Alert.alert(
        "Cannot delete",
        `${withoutRemote} selected photo${withoutRemote === 1 ? " has" : "s have"} no verified channel copy. Deselect them and try again.`
      );
      return;
    }
    Alert.alert(
      `Delete ${withRemote.length} local copies?`,
      `Your originals stay safe in your Telegram channel. Android will show a confirmation dialog before anything is deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void runFreeUp(withRemote) },
      ],
      { cancelable: true }
    );
  }

  async function runFreeUp(
    selected: (Candidate & { remote_file_id: string })[]
  ) {
    setPhase("verifying");
    try {
      // Per-photo re-verification right before deletion: getFile confirms the
      // channel copy still resolves. Failures are KEPT on device.
      const deletable: typeof selected = [];
      const failedVerify: Candidate[] = [];
      const { getFile } = await import("../lib/telegram");
      for (let i = 0; i < selected.length; i++) {
        const c = selected[i];
        setProgressLine(`Verifying ${i + 1}/${selected.length} — safe so far: ${deletable.length}`);
        try {
          await getFile(c.remote_file_id);
          deletable.push(c);
        } catch {
          failedVerify.push(c);
        }
        await new Promise((r) => setTimeout(r, VERIFY_SPACING_MS));
      }

      if (deletable.length === 0) {
        setResultLine(
          `Nothing deleted — ${failedVerify.length} photo${failedVerify.length === 1 ? "" : "s"} failed verification.`
        );
        return;
      }

      setPhase("deleting");
      let freed = 0;
      let actuallyGone = 0;
      const goneIds: string[] = [];
      for (let i = 0; i < deletable.length; i += DELETE_CHUNK) {
        const chunk = deletable.slice(i, i + DELETE_CHUNK);
        setProgressLine(`Deleting ${Math.min(i + DELETE_CHUNK, deletable.length)}/${deletable.length}…`);
        try {
          const assets = chunk.map((c) => new MediaLibrary.Asset(c.local_id!));
          await MediaLibrary.Asset.delete(assets);
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          if (msg.includes("Unavailable") || msg.includes("unavailable")) {
            Alert.alert(
              "Not supported",
              "This device doesn't allow in-app deletion. Delete photos manually from your gallery app."
            );
            break;
          }
          // User cancel / partial failure — fall through to the exists re-check.
        }
        // The system dialog may have been dismissed — count only what's gone.
        for (const c of chunk) {
          try {
            if (!new File(c.local_uri!).exists) {
              actuallyGone++;
              freed += c.size ?? 0;
              goneIds.push(c.id);
            }
          } catch {}
        }
      }

      if (goneIds.length > 0) {
        await clearLocalUris(goneIds);
      }
      const kept = failedVerify.length + (deletable.length - actuallyGone);
      setResultLine(
        `Freed ${formatBytes(freed)} — ${actuallyGone} photo${actuallyGone === 1 ? "" : "s"} deleted from device` +
          (kept > 0 ? `, ${kept} kept on device.` : ".")
      );
      setCandidates((prev) => prev.filter((c) => !goneIds.includes(c.id)));
      setSelection(new Set());
    } catch (e: any) {
      Alert.alert("Free up space failed", e?.message ?? "Something went wrong.");
    } finally {
      setPhase("idle");
      setProgressLine(null);
    }
  }

  const busy = phase !== "idle";

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Free up space</Text>
      </View>
      <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Local photos whose originals are already in your channel. Deleting them keeps the cloud copy — the photo stays in Cloud and Collections.
      </Text>

      {loading ? (
        <View style={styles.centerCol}>
          <ActivityIndicator color={theme.colors.primary} />
          {checkProgress ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 10, fontSize: 12.5 }}>
              {checkProgress}
            </Text>
          ) : null}
        </View>
      ) : candidates.length === 0 ? (
        <View style={styles.centerCol}>
          <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", paddingHorizontal: 32, lineHeight: 20 }}>
            Nothing to free — every local photo either isn't backed up yet or has no size recorded.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.summary, { backgroundColor: theme.colors.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "700", fontSize: 15 }}>
                {selection.size} selected · {formatBytes(selectedBytes)}
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}>
                {candidates.length} backed-up copies on device · {formatBytes(totalBytes)} total
              </Text>
            </View>
            <Pressable
              onPress={() =>
                setSelection(
                  selection.size === candidates.length
                    ? new Set()
                    : new Set(candidates.map((c) => c.id))
                )
              }
              hitSlop={6}
            >
              <Text style={{ color: theme.colors.primary, fontWeight: "600", fontSize: 13 }}>
                {selection.size === candidates.length ? "Clear" : "All"}
              </Text>
            </Pressable>
          </View>

          {progressLine ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, paddingHorizontal: 16, paddingVertical: 6 }}>
              {progressLine}
            </Text>
          ) : null}
          {resultLine ? (
            <Text style={{ color: theme.colors.onSurface, fontSize: 13, paddingHorizontal: 16, paddingVertical: 6, fontWeight: "600" }}>
              {resultLine}
            </Text>
          ) : null}

          <FlatList
            data={sections}
            keyExtractor={(s) => s.key}
            contentContainerStyle={{ paddingBottom: 140 }}
            renderItem={({ item }) => (
              <View>
                <Text style={[styles.monthHeader, { color: theme.colors.onSurfaceVariant }]}>
                  {item.label} · {item.items.length} · {formatBytes(item.bytes)}
                </Text>
                {item.items.map((c) => {
                  const thumb = resolvePhotoThumb(c);
                  const checked = selection.has(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.row,
                        { backgroundColor: theme.colors.surface, opacity: busy ? 0.5 : 1 },
                      ]}
                      onPress={() => !busy && toggle(c.id)}
                      disabled={busy}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: theme.colors.outline,
                            backgroundColor: checked ? theme.colors.primary : "transparent",
                          },
                        ]}
                      >
                        {checked ? (
                          <Text style={{ color: theme.colors.onPrimary, fontSize: 13, fontWeight: "800" }}>✓</Text>
                        ) : null}
                      </View>
                      <TelegramImage
                        fileId={thumb.fileId}
                        localUri={thumb.localUri}
                        style={{ width: 52, height: 52, borderRadius: 8 }}
                      />
                      <View style={{ flex: 1, marginStart: 10 }}>
                        <Text style={{ color: theme.colors.onSurface, fontSize: 13.5 }} numberOfLines={1}>
                          {c.filename}
                        </Text>
                        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}>
                          {formatBytes(c.size)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          />

          <View
            style={[
              styles.bottomBar,
              { backgroundColor: theme.colors.surfaceContainer, paddingBottom: insets.bottom + 10 },
            ]}
          >
            <Pressable
              style={[
                styles.freeBtn,
                {
                  backgroundColor: selection.size > 0 && !busy ? theme.colors.primary : theme.colors.surfaceHighest,
                  opacity: busy ? 0.7 : 1,
                },
              ]}
              disabled={selection.size === 0 || busy}
              onPress={() => void freeUp()}
            >
              <Text
                style={{
                  color: selection.size > 0 && !busy ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
                  fontWeight: "700",
                  fontSize: 14.5,
                }}
              >
                {busy
                  ? progressLine ?? "Working…"
                  : `Free up space — ${formatBytes(selectedBytes)}`}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingBottom: 4 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12.5, lineHeight: 18, paddingHorizontal: 16, paddingBottom: 10 },
  centerCol: { flex: 1, alignItems: "center", justifyContent: "center" },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 14,
  },
  monthHeader: {
    fontSize: 12.5,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    padding: 10,
    gap: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: 8,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  freeBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
