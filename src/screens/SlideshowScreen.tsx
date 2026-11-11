import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "../rn";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useT } from "../useT";
import { useSettingsStore } from "../store/useSettingsStore";
import { TelegramImage } from "../components/TelegramImage";
import { getPhotosByUploadStatus, type PhotoRow } from "../lib/db";
import { isVideoMime } from "../lib/format";
import { isDecoyActive } from "../lib/applock";
import { setSecureFlag } from "../../modules/share-intent";
import { ChevronRightIcon, CloseIcon, PauseIcon, PlayIcon } from "../components/icons";
import { overlay, touchTarget } from "../theme";

/**
 * Full-screen slideshow / screensaver. Auto-advances through photos with a
 * cross-fade, pauses on tap, and never shows locked-album or video rows.
 * Audio is intentionally not bundled — the phone's own media player can play
 * music alongside this screen.
 */
export function SlideshowScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const secureViewer = useSettingsStore((s) => s.prefs.secureViewer);
  const intervalSec = useSettingsStore((s) => s.prefs.slideshowIntervalSec);
  const shuffle = useSettingsStore((s) => s.prefs.slideshowShuffle);

  const provided: PhotoRow[] = route.params?.photos ?? [];
  const [photos, setPhotos] = useState<PhotoRow[]>(
    provided.filter((p) => !isVideoMime(p.mime))
  );
  const [index, setIndex] = useState(route.params?.startIndex ?? 0);
  const [playing, setPlaying] = useState(true);
  const [chrome, setChrome] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide private photos from screenshots/recents while the slideshow runs.
  useEffect(() => {
    setSecureFlag(secureViewer);
    return () => {
      setSecureFlag(false);
    };
  }, [secureViewer]);

  useEffect(() => {
    if (photos.length > 0) return;
    void (async () => {
      try {
        const rows = (await getPhotosByUploadStatus("uploaded"))
          .filter((p) => !isVideoMime(p.mime))
          .slice(0, 500);
        setPhotos(shuffle ? shuffleRows(rows) : rows);
      } catch {
        setPhotos([]);
      }
    })();
  }, [photos.length, shuffle]);

  const current = photos[index] ?? null;
  const ordered = photos;

  function fadeTo(nextIndex: number) {
    if (ordered.length === 0) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setIndex(((nextIndex % ordered.length) + ordered.length) % ordered.length);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    });
  }

  function next() {
    fadeTo(index + 1);
  }

  function prev() {
    fadeTo(index - 1);
  }

  useEffect(() => {
    if (!playing || ordered.length < 2) return;
    const timer = setInterval(() => {
      fadeTo(index + 1);
    }, Math.max(2, intervalSec) * 1000);
    return () => clearInterval(timer);
  }, [playing, index, ordered.length, intervalSec]);

  function showChrome() {
    setChrome(true);
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setChrome(false), 3500);
  }

  useEffect(() => {
    showChrome();
    return () => {
      if (chromeTimer.current) clearTimeout(chromeTimer.current);
    };
  }, []);

  if (!current) {
    return (
      <View style={[styles.container, { backgroundColor: overlay.mediaCanvas }]}>
        <Text style={{ color: overlay.onMedia, textAlign: "center", marginTop: 80 }}>
          {isDecoyActive() ? "Nothing to show." : "No photos to play yet."}
        </Text>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.emptyClose}
          accessibilityRole="button"
          accessibilityLabel="Close slideshow"
        >
          <Text style={{ color: overlay.onMedia }}>{tr("common.close")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.container}
      onPress={() => {
        setPlaying((p) => !p);
        showChrome();
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
        <TelegramImage
          fileId={current.remote_file_id ?? current.preview_file_id}
          localUri={current.local_uri}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
        />
      </Animated.View>

      {chrome ? (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              accessibilityLabel="Close slideshow"
              accessibilityRole="button"
              style={styles.control}
            >
              <CloseIcon color={overlay.onMedia} size={22} />
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {route.params?.title ?? "Slideshow"}
            </Text>
            <Text style={styles.counter} accessibilityLiveRegion="polite">
              {index + 1}/{ordered.length}
            </Text>
          </View>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              onPress={prev}
              hitSlop={10}
              accessibilityLabel="Previous photo"
              accessibilityRole="button"
              style={styles.control}
            >
              <ChevronRightIcon color={overlay.onMedia} size={24} />
            </Pressable>
            <Pressable
              onPress={() => setPlaying((p) => !p)}
              hitSlop={10}
              accessibilityLabel={playing ? "Pause slideshow" : "Play slideshow"}
              accessibilityRole="button"
              accessibilityState={{ selected: playing }}
              style={styles.playButton}
            >
              {playing ? (
                <PauseIcon color={overlay.onMedia} size={22} />
              ) : (
                <PlayIcon color={overlay.onMedia} size={22} />
              )}
            </Pressable>
            <Pressable
              onPress={next}
              hitSlop={10}
              accessibilityLabel="Next photo"
              accessibilityRole="button"
              style={[styles.control, { transform: [{ scaleX: -1 }] }]}
            >
              <ChevronRightIcon color={overlay.onMedia} size={24} />
            </Pressable>
            <Text style={styles.hint}>
              {playing ? `${Math.max(2, intervalSec)}s · tap to pause` : "Paused"}
            </Text>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

function shuffleRows(rows: PhotoRow[]): PhotoRow[] {
  const out = [...rows];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: overlay.mediaCanvas },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 10,
    backgroundColor: overlay.mediaScrimSoft,
    gap: 12,
  },
  title: { color: overlay.onMedia, flex: 1, fontSize: 14, fontWeight: "600" },
  counter: { color: overlay.onMediaMuted, fontSize: 12 },
  control: {
    width: touchTarget,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    paddingTop: 12,
    backgroundColor: overlay.mediaScrimSoft,
  },
  playButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: overlay.onMediaSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { color: overlay.onMediaMuted, fontSize: 11, marginLeft: 8 },
  emptyClose: { alignSelf: "center", marginTop: 24, padding: 12 },
});
