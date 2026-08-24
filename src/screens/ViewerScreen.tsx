import React, { useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useLibraryStore } from "../store/useLibraryStore";
import { TelegramImage, resolvePhotoFull } from "../components/TelegramImage";
import { PhotoInfoSheet } from "../components/PhotoInfoSheet";
import type { PhotoRow } from "../lib/db";

export function ViewerScreen({ route, navigation }: { route: any; navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const photos: PhotoRow[] = route.params?.photos ?? [];
  const startIndex: number = route.params?.index ?? 0;

  const [index, setIndex] = useState(startIndex);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [infoVisible, setInfoVisible] = useState(false);
  const zoomedRef = useRef(false);
  const { toggleFavorite, trashPhotos } = useLibraryStore();

  const photo = photos[index];

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
        {photos.map((p) => {
          const r = resolvePhotoFull(p);
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
                  <TelegramImage
                    fileId={r.fileId}
                    localUri={r.localUri}
                    style={{ width, height: height * 0.92 }}
                    resizeMode="contain"
                  />
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
              <Text
                style={[
                  styles.actionIcon,
                  { color: photo.favorite ? theme.colors.favorite : "#fff" },
                ]}
              >
                {photo.favorite ? "♥" : "♡"}
              </Text>
              <Text style={styles.actionLabel}>Favorite</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={() => trashPhotos([photo.id], false).then(() => navigation.goBack())}
            >
              <Text style={[styles.actionIcon, { color: "#fff" }]}>🗑</Text>
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
