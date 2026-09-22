import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { File, Paths } from "expo-file-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useSettingsStore } from "../store/useSettingsStore";
import { Button } from "./ui";
import { enqueueUploads, processQueue } from "../lib/uploader";
import { listProfiles } from "../lib/destinations";
import { clearSharedMedia } from "../../modules/share-intent";

const COLUMNS = 4;

export function ShareTargetSheet({
  uris,
  onClose,
}: {
  uris: string[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const multiDest = useSettingsStore((s) => s.prefs.multiDestination);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [destId, setDestId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const tile = (Dimensions.get("window").width - 8) / COLUMNS;

  React.useEffect(() => {
    if (multiDest) {
      void listProfiles().then((ps) => setProfiles(ps.map((p) => ({ id: p.id, name: p.name }))));
    }
  }, [multiDest]);

  async function onUpload() {
    if (uploading) return;
    setUploading(true);
    let enqueued = 0;
    const errors: string[] = [];
    try {
      const items = [];
      for (let itemIndex = 0; itemIndex < uris.length; itemIndex++) {
        const uri = uris[itemIndex];
        const rawName = uri.split("/").pop()?.split("?")[0] ?? "";
        try {
          const hasExt = /\.[a-z0-9]{2,5}$/i.test(rawName);
          const name = hasExt
            ? rawName
            : `shared_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
          const unique = `${Date.now()}_${itemIndex}_${Math.random().toString(36).slice(2, 8)}`;
          const dest = new File(Paths.cache, `pb_share_${unique}_${name}`);
          // copy() is async — awaiting also makes dest.size truthful below and
          // prevents the queue racing an incomplete staged file.
          await new File(uri).copy(dest);
          items.push({
            local_id: `share_${uri}`,
            local_uri: dest.uri,
            filename: name,
            folder: "Shared",
            size: dest.size || null,
            width: null,
            height: null,
            taken_at: Date.now(),
            added_at: Date.now(),
          });
        } catch {
          errors.push(rawName || "a file");
        }
      }
      if (items.length > 0) {
        enqueued = await enqueueUploads(items, "manual", destId);
      }
    } catch (e: any) {
      Alert.alert("Import failed", e?.message ?? "Could not import shared files.");
    }
    clearSharedMedia();
    setUploading(false);
    onClose();
    if (enqueued > 0) void processQueue();
    if (errors.length > 0) {
      Alert.alert("Some files skipped", `${errors.length} shared file(s) could not be imported.`);
    }
  }

  function onCancel() {
    clearSharedMedia();
    onClose();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 18 }}>✕</Text>
          </Pressable>
          <Text style={{ color: theme.colors.onSurface, fontWeight: "700", fontSize: 16, flex: 1, textAlign: "center" }}>
            Shared with PhotogramBot
          </Text>
          <View style={{ width: 18 }} />
        </View>
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 }}>
          {uris.length} item{uris.length === 1 ? "" : "s"} shared from another app. Upload them to your Telegram channel?
        </Text>
        {multiDest && profiles.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
            {profiles.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setDestId(destId === p.id ? null : p.id)}
                style={[
                  styles.destChip,
                  {
                    backgroundColor:
                      destId === p.id ? theme.colors.primaryContainer : theme.colors.surfaceHighest,
                  },
                ]}
              >
                <Text
                  style={{
                    color: destId === p.id ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <ScrollView contentContainerStyle={{ padding: 4 }}>
          <View style={styles.grid}>
            {uris.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={{ width: tile, height: tile, margin: 1, borderRadius: 8, backgroundColor: theme.colors.surfaceContainer }}
                resizeMode="cover"
              />
            ))}
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {uploading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <Button title="Cancel" variant="text" theme={theme} onPress={onCancel} />
              <Button title={`Upload ${uris.length}`} theme={theme} onPress={() => void onUpload()} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  destChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
