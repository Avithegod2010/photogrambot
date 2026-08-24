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
import { Button } from "./ui";
import { enqueueUploads, processQueue } from "../lib/uploader";
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
  const [uploading, setUploading] = useState(false);
  const tile = (Dimensions.get("window").width - 8) / COLUMNS;

  async function onUpload() {
    if (uploading) return;
    setUploading(true);
    let enqueued = 0;
    const errors: string[] = [];
    try {
      const items = [];
      for (const uri of uris) {
        const rawName = uri.split("/").pop()?.split("?")[0] ?? "";
        try {
          const hasExt = /\.[a-z0-9]{2,5}$/i.test(rawName);
          const name = hasExt
            ? rawName
            : `shared_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
          const dest = new File(Paths.cache, `pb_share_${Date.now()}_${name}`);
          new File(uri).copy(dest);
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
        enqueued = await enqueueUploads(items, "manual");
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
});
