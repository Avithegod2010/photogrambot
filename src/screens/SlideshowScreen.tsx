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
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <Text style={{ color: "#fff", textAlign: "center", marginTop: 80 }}>
          {isDecoyActive() ? "Nothing to show." : "No photos to play yet."}
        </Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.emptyClose}>
          <Text style={{ color: "#fff" }}>{tr("common.close")}</Text>
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
            >
              <Text style={styles.chromeText}>✕</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {route.params?.title ?? "Slideshow"}
            </Text>
            <Text style={styles.counter}>
              {index + 1}/{ordered.length}
            </Text>
          </View>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable onPress={prev} hitSlop={10} accessibilityLabel="Previous photo">
              <Text style={styles.chromeText}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => setPlaying((p) => !p)}
              hitSlop={10}
              accessibilityLabel={playing ? "Pause slideshow" : "Play slideshow"}
              style={styles.playButton}
            >
              <Text style={styles.playText}>{playing ? "❚❚" : "▶"}</Text>
            </Pressable>
            <Pressable onPress={next} hitSlop={10} accessibilityLabel="Next photo">
              <Text style={styles.chromeText}>›</Text>
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
  container: { flex: 1, backgroundColor: "#000" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    gap: 12,
  },
  title: { color: "#fff", flex: 1, fontSize: 14, fontWeight: "600" },
  counter: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  chromeText: { color: "#fff", fontSize: 30, lineHeight: 34, paddingHorizontal: 8 },
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
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  playButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  playText: { color: "#fff", fontSize: 17 },
  hint: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginLeft: 8 },
  emptyClose: { alignSelf: "center", marginTop: 24, padding: 12 },
});
