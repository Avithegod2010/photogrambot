import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import { useTheme } from "../useTheme";
import { useLibraryStore } from "../store/useLibraryStore";
import { TelegramImage, resolvePhotoFull } from "../components/TelegramImage";
import { CloudUploadIcon, HeartIcon, TrashIcon } from "../components/icons";
import { PhotoInfoSheet } from "../components/PhotoInfoSheet";
import { savePhotoToDevice } from "../lib/restore";
import { getCachedTelegramFile } from "../lib/media";
import { tokenForPhoto } from "../lib/destinations";
import { isVideoMime } from "../lib/format";
import type { PhotoRow } from "../lib/db";

function CloudVideo({
  fileId,
  mime,
  profileId,
}: {
  fileId: string;
  mime: string | null;
  profileId?: string | null;
}) {
  const width = Dimensions.get("window").width;
  const height = Dimensions.get("window").height;
  const style = { width, height: height * 0.92 };
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUri(null);
    setFailed(false);
    (async () => {
      try {
        const token = profileId ? await tokenForPhoto({ profile_id: profileId }) : null;
        const u = await getCachedTelegramFile(fileId, "mp4", token);
        if (alive) setUri(u);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fileId, profileId]);

  const player = useVideoPlayer(uri, () => {});

  if (failed) {
    return (
      <View style={[style, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: "#fff", fontSize: 13 }}>Could not download video. Tap Save to restore it.</Text>
      </View>
    );
  }
  if (!uri) {
    return (
      <View style={[style, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  return (
    <VideoView
      style={style}
      player={player}
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}

export function ViewerScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const photos: PhotoRow[] = route.params?.photos ?? [];
  const startIndex: number = route.params?.index ?? 0;

  const [index, setIndex] = useState(startIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const zoomedRef = useRef(false);
  const { toggleFavorite, trashPhotos } = useLibraryStore();

  const photo = photos[index];
  const hasCloudCopy = !!(
    photo &&
    (photo.remote_file_id || photo.preview_file_id || photo.thumb_file_id)
  );

  async function onSave() {
    if (!photo || saving) return;
    setSaving(true);
    try {
      await savePhotoToDevice(photo);
      Alert.alert("Saved", "Photo saved to your device gallery.");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not download the photo.");
    } finally {
      setSaving(false);
    }
  }

  const isVideo = isVideoMime(photo?.mime) || (photo?.duration ?? 0) > 0;

  async function onBackupNow() {
    // Local-only photo (opened from the gallery roll) — enqueue it for the
    // normal upload pipeline without leaving the viewer.
    if (!photo || backingUp || !photo.local_id) return;
    setBackingUp(true);
    try {
      const { enqueueUploads, processQueue } = await import("../lib/uploader");
      const n = await enqueueUploads(
        [
          {
            local_id: photo.local_id,
            filename: photo.filename,
            folder: photo.folder,
            size: photo.size,
            width: photo.width,
            height: photo.height,
            taken_at: photo.taken_at,
            added_at: photo.added_at,
          },
        ],
        "manual"
      );
      if (n > 0) void processQueue();
      Alert.alert(
        n > 0 ? "Back up started" : "Already backing up",
        n > 0
          ? "This photo was queued for upload to your channel."
          : "This photo is already queued or backed up."
      );
    } catch (e: any) {
      Alert.alert("Back up failed", e?.message ?? "Could not queue the photo.");
    } finally {
      setBackingUp(false);
    }
  }

  async function onShareVideo() {
    if (!photo) return;
    const fileId = photo.remote_file_id ?? photo.preview_file_id ?? photo.thumb_file_id;
    if (!fileId) return;
    try {
      const token = await tokenForPhoto(photo);
      const uri = await getCachedTelegramFile(fileId, "mp4", token);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: photo.mime ?? "video/mp4",
          dialogTitle: "Open in Telegram",
        });
      }
    } catch (e: any) {
      Alert.alert("Share failed", e?.message ?? "Could not prepare the video.");
    }
  }

  const swipeUp = Gesture.Pan()
    .activeOffsetY([-24, 24])
    .failOffsetX([-36, 36])
    .enabled(!infoVisible)
    .onEnd((e) => {
      if (e.translationY < -50 && !zoomedRef.current) {
        setInfoVisible(true);
      }
    });

  const width = Dimensions.get("window").width;
  const height = Dimensions.get("window").height;

  const resolved = useMemo(
    () => (photo ? resolvePhotoFull(photo) : { fileId: null, localUri: null }),
    [photo]
  );

  if (!photo) {
    return <View style={[styles.container, { backgroundColor: "#000" }]} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          if (i !== index) setIndex(i);
        }}
        contentOffset={{ x: startIndex * width, y: 0 }}
      >
        {photos.map((p, i) => {
          const r = resolvePhotoFull(p);
          const video = isVideoMime(p.mime) || (p.duration ?? 0) > 0;
          const active = i === index;
          return (
            <GestureDetector key={p.id} gesture={swipeUp}>
              <ScrollView
                style={{ width, height }}
                maximumZoomScale={4}
                minimumZoomScale={1}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                centerContent
                onScroll={(e) => {
                  zoomedRef.current = (e.nativeEvent.zoomScale ?? 1) > 1.05;
                }}
                scrollEventThrottle={100}
              >
                <Pressable onPress={() => setChromeVisible((v) => !v)}>
                  {!active ? (
                    // Off-screen pages stay placeholders — mounting every
                    // CloudVideo would download every video at once.
                    <View style={{ width, height: height * 0.92 }} />
                  ) : video && r.fileId ? (
                    <CloudVideo fileId={r.fileId} mime={p.mime} profileId={p.profile_id} />
                  ) : (
                    <TelegramImage
                      fileId={r.fileId}
                      localUri={r.localUri}
                      profileId={p.profile_id}
                      style={{ width, height: height * 0.92 }}
                      resizeMode="contain"
                    />
                  )}
                </Pressable>
              </ScrollView>
            </GestureDetector>
          );
        })}
      </ScrollView>

      {chromeVisible ? (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
            <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
              <Text style={[styles.iconText, { color: "#fff" }]}>←</Text>
            </Pressable>
            <Text style={[styles.counter, { color: "#fff" }]}>
              {index + 1} / {photos.length}
            </Text>
            <Pressable onPress={() => setInfoVisible(true)} style={styles.iconBtn}>
              <Text style={[styles.iconText, { color: "#fff" }]}>ⓘ</Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.bottomBar,
              { backgroundColor: "rgba(0,0,0,0.55)", paddingBottom: insets.bottom + 10 },
            ]}
          >
            <Pressable style={styles.actionBtn} onPress={() => void toggleFavorite(photo)}>
              <HeartIcon
                color={
                  photo.favorite
                    ? typeof theme.colors.favorite === "string"
                      ? theme.colors.favorite
                      : "#FF8FA3"
                    : "#fff"
                }
                size={22}
                filled={!!photo.favorite}
              />
              <Text style={styles.actionLabel}>Favorite</Text>
            </Pressable>
            {hasCloudCopy ? (
              <Pressable style={styles.actionBtn} onPress={() => void onSave()}>
                <Text style={[styles.actionIcon, { color: "#fff" }]}>
                  {saving ? "…" : "⬇"}
                </Text>
                <Text style={styles.actionLabel}>Save</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.actionBtn} onPress={() => void onBackupNow()}>
                <CloudUploadIcon
                  color="#fff"
                  size={22}
                />
                <Text style={styles.actionLabel}>
                  {backingUp ? "Queued…" : "Back up"}
                </Text>
              </Pressable>
            )}
            {isVideo && (photo.remote_file_id ?? photo.thumb_file_id) ? (
              <Pressable style={styles.actionBtn} onPress={() => void onShareVideo()}>
                <Text style={[styles.actionIcon, { color: "#fff" }]}>↗</Text>
                <Text style={styles.actionLabel}>Share</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.actionBtn}
              onPress={() => trashPhotos([photo.id], false).then(() => navigation.goBack())}
            >
              <TrashIcon color="#fff" size={22} />
              <Text style={styles.actionLabel}>Trash</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => setInfoVisible(true)}>
              <Text style={[styles.actionIcon, { color: "#fff" }]}>ⓘ</Text>
              <Text style={styles.actionLabel}>Info</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <PhotoInfoSheet
        photo={photo}
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 22,
  },
  counter: {
    fontSize: 14,
    fontWeight: "600",
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
    paddingTop: 10,
  },
  actionBtn: {
    alignItems: "center",
    minWidth: 70,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionLabel: {
    color: "#fff",
    fontSize: 11,
    marginTop: 2,
  },
});
