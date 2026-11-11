import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "../rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useSettingsStore } from "../store/useSettingsStore";
import { Button, Card, Dialog, SectionLabel, TextField, ToggleRow, AppBar } from "../components/ui";
import { parseRemoteAdmins, type RemoteAdmin, type RemoteRole } from "../lib/remoteAuth";
import {
  getDeviceSummaries,
  isDeviceRevoked,
  setDeviceAlias,
  setDeviceRevoked,
  type DeviceSummary,
} from "../lib/devices";
import { configureWebhook, disableWebhookMode, webhookStatus } from "../lib/webhook";
import { createReadOnlyInvite, sharePublicIndex } from "../lib/publicArchive";
import { mergeChannelArchive } from "../lib/channelMerge";
import { pendingSyncOpCount, getSyncConflicts } from "../lib/db";
import { formatDate } from "../lib/format";

const ROLE_OPTIONS: RemoteRole[] = ["read", "write", "admin"];

export function RemoteScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { prefs, update } = useSettingsStore();
  const admins = parseRemoteAdmins(prefs.remoteAdmins);

  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [revoked, setRevoked] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DeviceSummary | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [adminDialog, setAdminDialog] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminRole, setAdminRole] = useState<RemoteRole>("read");
  const [relayUrl, setRelayUrl] = useState(prefs.webhookRelayUrl);
  const [relaySecret, setRelaySecret] = useState(prefs.webhookSecret);
  const [webhookNote, setWebhookNote] = useState<string | null>(null);
  const [sourceChannel, setSourceChannel] = useState("");
  const [sourceToken, setSourceToken] = useState("");
  const [mergePass, setMergePass] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeNote, setMergeNote] = useState<string | null>(null);
  const [pendingOps, setPendingOps] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);

  async function refresh() {
    const summary = await getDeviceSummaries();
    setDevices(summary.rows);
    setRevoked(await isDeviceRevoked());
    setPendingOps(await pendingSyncOpCount());
    setConflictCount((await getSyncConflicts(100)).length);
  }

  useEffect(() => {
    void refresh();
    void webhookStatus()
      .then((s) => {
        if (s.telegramUrl) {
          setWebhookNote(`Telegram webhook: ${s.telegramUrl} · ${s.pending} pending`);
        } else {
          setWebhookNote("Telegram webhook: not set (long polling)");
        }
      })
      .catch(() => {});
  }, []);

  function addAdmin() {
    const id = Number(adminId.trim());
    if (!Number.isSafeInteger(id) || id <= 0) {
      Alert.alert("Invalid id", "Telegram user ids are positive numbers.");
      return;
    }
    if (admins.some((a) => a.id === id)) {
      Alert.alert("Already added", "That user is already in the allowlist.");
      return;
    }
    const next: RemoteAdmin[] = [
      ...admins,
      { id, role: adminRole, name: adminName.trim() || undefined },
    ];
    void update({ remoteAdmins: next });
    setAdminDialog(false);
    setAdminId("");
    setAdminName("");
    setAdminRole("read");
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AppBar title="Remote & sharing" onBack={() => navigation.goBack()} theme={theme} borderless />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <SectionLabel text="Remote admins" theme={theme} />
        <Card theme={theme}>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 }}>
            Channel posts always work for admins. These Telegram user ids can also message the bot
            directly; assign read (reports), write (sync/favorites/albums) or admin (delete/wipe).
          </Text>
          {admins.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, marginTop: 10 }}>
              No allowlisted users.
            </Text>
          ) : (
            admins.map((a) => (
              <View key={a.id} style={[styles.row, { borderTopColor: theme.colors.outlineVariant }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.onSurface, fontWeight: "600" }}>
                    {a.name ?? `User ${a.id}`}
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                    {a.id} · {a.role}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove admin ${a.id}`}
                  onPress={() => {
                    const next = admins.filter((x) => x.id !== a.id);
                    void update({ remoteAdmins: next });
                  }}
                >
                  <Text style={{ color: theme.colors.error }}>Remove</Text>
                </Pressable>
              </View>
            ))
          )}
          <Button
            title="Add admin"
            variant="outlined"
            theme={theme}
            style={{ marginTop: 12 }}
            onPress={() => setAdminDialog(true)}
          />
        </Card>

        <SectionLabel text="Devices" theme={theme} />
        <Card theme={theme}>
          {devices.map((d) => (
            <View key={d.id} style={[styles.row, { borderTopColor: theme.colors.outlineVariant }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.onSurface, fontWeight: "600" }}>
                  {d.name}
                  {d.isThis ? " · this phone" : ""}
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                  {d.id} · {d.count} photos
                  {d.lastSeen ? ` · last ${formatDate(d.lastSeen)}` : ""}
                  {d.revoked ? " · REVOKED" : ""}
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Rename device ${d.name ?? d.id}`}
                onPress={() => {
                  setRenameTarget(d);
                  setRenameDraft(d.name);
                }}
              >
                <Text style={{ color: theme.colors.primary }}>Rename</Text>
              </Pressable>
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Button title="Refresh" variant="outlined" theme={theme} onPress={() => void refresh()} />
            <Button
              title={revoked ? "Unrevoke this device" : "Revoke this device"}
              variant={revoked ? "outlined" : "danger"}
              theme={theme}
              onPress={() => setRevokeConfirm(true)}
            />
          </View>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginTop: 6 }}>
            Revocation is cooperative — all devices share the bot token. Send
            "/revoke &lt;deviceId&gt;" in the channel and the target phone applies it.
          </Text>
        </Card>

        <SectionLabel text="Multi-device index sync" theme={theme} />
        <Card theme={theme} onPress={() => navigation.navigate("Sync")}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 15 }}>
                Favorites, tags, albums & covers
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 2 }}>
                {pendingOps} pending · {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
              </Text>
            </View>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>›</Text>
          </View>
        </Card>

        <SectionLabel text="Webhook relay (optional)" theme={theme} />
        <Card theme={theme}>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 }}>
            Instead of long polling, point Telegram at a small HTTPS relay and let the app fetch
            updates from it. The relay worker is documented in docs/WEBHOOK_RELAY.md. Leave this
            off to keep polling.
          </Text>
          <TextField
            value={relayUrl}
            onChangeText={setRelayUrl}
            placeholder="https://relay.example.workers.dev"
            theme={theme}
            autoCapitalize="none"
          />
          <View style={{ height: 8 }} />
          <TextField
            value={relaySecret}
            onChangeText={setRelaySecret}
            placeholder="Relay secret (8+ characters)"
            secureTextEntry
            theme={theme}
          />
          {webhookNote ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 8 }}>
              {webhookNote}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button
              title="Enable webhook"
              variant="outlined"
              theme={theme}
              onPress={() => {
                void configureWebhook(relayUrl, relaySecret)
                  .then(() => {
                    setWebhookNote("Webhook enabled. Updates come from the relay.");
                    Alert.alert("Webhook enabled", "Telegram now posts updates to the relay.");
                  })
                  .catch((e: any) =>
                    Alert.alert("Webhook", e?.message ?? "Could not enable the webhook.")
                  );
              }}
            />
            <Button
              title="Back to polling"
              variant="text"
              theme={theme}
              onPress={() => {
                void disableWebhookMode().then(() => {
                  setWebhookNote("Telegram webhook removed; long polling is active.");
                });
              }}
            />
          </View>
        </Card>

        <SectionLabel text="Public read-only" theme={theme} />
        <Card theme={theme}>
          <ToggleRow
            title="Share the archive without the bot"
            subtitle="Creates family invite links and a standalone HTML index. The channel itself remains read-only for guests."
            value={prefs.publicReadOnly}
            onChange={(v) => void update({ publicReadOnly: v })}
            theme={theme}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Button
              title="Create invite link"
              variant="outlined"
              theme={theme}
              onPress={() => {
                void createReadOnlyInvite()
                  .then(async (link) => {
                    try {
                      await Share.share({ message: link });
                    } catch {
                      Alert.alert("Invite link", link);
                    }
                  })
                  .catch((e: any) => Alert.alert("Invite link", e?.message ?? "Could not create."));
              }}
            />
            <Button
              title="Export HTML index"
              variant="outlined"
              theme={theme}
              onPress={() => {
                void sharePublicIndex().catch((e: any) =>
                  Alert.alert("Export index", e?.message ?? "Could not export.")
                );
              }}
            />
          </View>
        </Card>

        <SectionLabel text="Merge another channel" theme={theme} />
        <Card theme={theme}>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, lineHeight: 18 }}>
            Copies a source channel's pinned backup index into this library and copies each message
            with Telegram's copyMessage (no re-upload). The bot must be a member/admin of the
            source channel. Duplicate hashes are skipped.
          </Text>
          <TextField
            value={sourceChannel}
            onChangeText={setSourceChannel}
            placeholder="Source channel id (-100…)"
            theme={theme}
          />
          <View style={{ height: 8 }} />
          <TextField
            value={sourceToken}
            onChangeText={setSourceToken}
            placeholder="Source bot token (optional)"
            secureTextEntry
            theme={theme}
          />
          <View style={{ height: 8 }} />
          <TextField
            value={mergePass}
            onChangeText={setMergePass}
            placeholder="Backup passphrase (if encrypted)"
            secureTextEntry
            theme={theme}
          />
          {mergeNote ? (
            <Text style={{ color: theme.colors.primary, fontSize: 12, marginTop: 8 }}>{mergeNote}</Text>
          ) : null}
          <Button
            title={mergeBusy ? "Merging…" : "Merge channel"}
            theme={theme}
            disabled={mergeBusy || !sourceChannel.trim()}
            style={{ marginTop: 12 }}
            onPress={() => {
              Alert.alert(
                "Merge channel?",
                "New photos are copied into this channel and indexed. Existing photos with the same hash are skipped.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Merge",
                    onPress: () => {
                      setMergeBusy(true);
                      setMergeNote("Starting…");
                      void mergeChannelArchive({
                        sourceChannelId: sourceChannel.trim(),
                        sourceToken: sourceToken.trim() || undefined,
                        passphrase: mergePass || undefined,
                        onProgress: (done, total) => setMergeNote(`Copying ${done}/${total}…`),
                      })
                        .then((r) => {
                          setMergeNote(
                            `Done: ${r.copied} copied, ${r.skipped} skipped, ${r.failed} failed, ${r.albums} albums.`
                          );
                          void refresh();
                        })
                        .catch((e: any) => setMergeNote(`Merge failed: ${e?.message ?? "unknown"}`))
                        .finally(() => setMergeBusy(false));
                    },
                  },
                ]
              );
            }}
          />
        </Card>
      </ScrollView>

      <Dialog
        visible={adminDialog}
        theme={theme}
        title="Add remote admin"
        message="The user must message the bot once so Telegram delivers their id."
      >
        <TextField
          value={adminId}
          onChangeText={setAdminId}
          placeholder="Telegram user id"
          keyboardType="numeric"
          theme={theme}
        />
        <View style={{ height: 8 }} />
        <TextField
          value={adminName}
          onChangeText={setAdminName}
          placeholder="Name (optional)"
          theme={theme}
        />
        <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
          {ROLE_OPTIONS.map((r) => (
            <Pressable
              key={r}
              onPress={() => setAdminRole(r)}
              accessibilityRole="button"
              accessibilityLabel={`Set role ${r}`}
              accessibilityState={{ selected: adminRole === r }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor:
                  adminRole === r ? theme.colors.primaryContainer : theme.colors.surfaceHighest,
              }}
            >
              <Text
                style={{
                  color:
                    adminRole === r ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
                  fontSize: 12,
                }}
              >
                {r}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <Button title="Cancel" variant="text" theme={theme} onPress={() => setAdminDialog(false)} />
          <Button title="Add" theme={theme} onPress={addAdmin} />
        </View>
      </Dialog>

      <Dialog visible={!!renameTarget} theme={theme} title="Rename device">
        <TextField
          value={renameDraft}
          onChangeText={setRenameDraft}
          placeholder="Device name"
          theme={theme}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <Button title="Cancel" variant="text" theme={theme} onPress={() => setRenameTarget(null)} />
          <Button
            title="Save"
            theme={theme}
            onPress={() => {
              if (renameTarget) {
                void setDeviceAlias(renameTarget.id, renameDraft).then(() => {
                  setRenameTarget(null);
                  void refresh();
                });
              }
            }}
          />
        </View>
      </Dialog>
      <Dialog
        visible={revokeConfirm}
        theme={theme}
        title={revoked ? "Unrevoke this device?" : "Revoke this device?"}
        message={
          revoked
            ? "Automatic uploads can resume."
            : "Automatic uploads stop on this phone. The channel archive is untouched. Only the target device can apply this; a compromised device could ignore it."
        }
        onClose={() => setRevokeConfirm(false)}
        actions={[
          { label: "Cancel", onPress: () => setRevokeConfirm(false), variant: "text" },
          {
            label: revoked ? "Unrevoke" : "Revoke",
            variant: revoked ? "tonal" : "danger",
            onPress: () => {
              setRevokeConfirm(false);
              void setDeviceRevoked(!revoked).then(() => void refresh());
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
    marginTop: 4,
  },
});
