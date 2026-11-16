import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "../rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { Button, Card, SectionLabel, AppBar } from "../components/ui";
import {
  getSyncConflicts,
  pendingSyncOpCount,
  resolveSyncConflict,
  type SyncConflict,
} from "../lib/db";
import { publishSyncOps } from "../lib/deviceSync";
import { pollUpdates } from "../lib/updates";

function describe(c: SyncConflict): string {
  if (c.field === "membership") return "Album membership";
  if (c.field === "album_name") return "Album name";
  if (c.field === "favorite") return "Favorite";
  if (c.field === "tags") return "Tags";
  if (c.field === "cover") return "Album cover";
  return c.field;
}

export function SyncScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setConflicts(await getSyncConflicts(100));
    setPending(await pendingSyncOpCount());
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <AppBar title="Index sync" onBack={() => navigation.goBack()} theme={theme} borderless />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <SectionLabel text="Sync status" theme={theme} />
        <Card theme={theme}>
          <Text style={{ color: theme.colors.onSurface, fontSize: 14 }}>
            {pending} local change{pending === 1 ? "" : "s"} waiting to publish
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12.5, marginTop: 4 }}>
            Favorites, tags, album membership/name and covers sync between devices through small
            #sync_ops documents in the channel. Photos themselves never move.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Button
              title={busy === "publish" ? "Publishing…" : "Publish now"}
              variant="outlined"
              theme={theme}
              disabled={!!busy}
              onPress={() => {
                setBusy("publish");
                void publishSyncOps()
                  .then((n) => {
                    Alert.alert("Sync", n > 0 ? `Published ${n} changes.` : "Nothing to publish.");
                    return refresh();
                  })
                  .catch((e: any) => Alert.alert("Sync", e?.message ?? "Publish failed."))
                  .finally(() => setBusy(null));
              }}
            />
            <Button
              title={busy === "pull" ? "Checking…" : "Check channel"}
              variant="outlined"
              theme={theme}
              disabled={!!busy}
              onPress={() => {
                setBusy("pull");
                void pollUpdates()
                  .then((r) => {
                    Alert.alert(
                      "Sync",
                      `${r.processed} updates processed, ${r.commands} commands.`
                    );
                    return refresh();
                  })
                  .catch((e: any) => Alert.alert("Sync", e?.message ?? "Check failed."))
                  .finally(() => setBusy(null));
              }}
            />
          </View>
        </Card>

        <SectionLabel text="Conflicts" theme={theme} />
        <Card theme={theme}>
          {conflicts.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
              No unresolved conflicts. Last-write-wins resolves changes automatically; disagreements
              appear here so you can override the result.
            </Text>
          ) : (
            conflicts.map((c) => (
              <View key={c.id} style={[styles.conflict, { borderTopColor: theme.colors.outlineVariant }]}>
                <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 }}>
                  {describe(c)} · {c.entity} {c.entity_id.slice(0, 12)}
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2 }}>
                  Local: {c.local_value ?? "—"}
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
                  Remote ({c.remote_device ?? "?"}): {c.remote_value ?? "—"}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Button
                    title="Keep local"
                    variant="outlined"
                    theme={theme}
                    onPress={() => {
                      void resolveSyncConflict(c.id, "local").then(() => void refresh());
                    }}
                  />
                  <Button
                    title="Use remote"
                    variant="outlined"
                    theme={theme}
                    onPress={() => {
                      void resolveSyncConflict(c.id, "remote").then(() => void refresh());
                    }}
                  />
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
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
  conflict: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 10,
  },
});
