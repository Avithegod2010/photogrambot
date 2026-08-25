import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { getGeotagged, type GeotaggedPhoto } from "../lib/db";
import { isDecoyActive } from "../lib/applock";

export function MapScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const decoy = isDecoyActive();
  const [photos, setPhotos] = useState<GeotaggedPhoto[]>([]);
  const [selected, setSelected] = useState<GeotaggedPhoto[]>([]);

  useEffect(() => {
    if (decoy) {
      setPhotos([]);
      return;
    }
    getGeotagged().then(setPhotos);
  }, [decoy]);

  const initialRegion = useMemo<Region>(() => {
    if (photos.length === 0) {
      return { latitude: 20, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 };
    }
    const lats = photos.map((p) => p.latitude);
    const lons = photos.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.05),
      longitudeDelta: Math.max((maxLon - minLon) * 1.4, 0.05),
    };
  }, [photos]);

  const clusters = useMemo(() => {
    const byCoord = new Map<string, GeotaggedPhoto[]>();
    for (const p of photos) {
      const key = `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`;
      const list = byCoord.get(key) ?? [];
      list.push(p);
      byCoord.set(key, list);
    }
    return Array.from(byCoord.values());
  }, [photos]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={initialRegion}>
        {clusters.map((cluster) => (
          <Marker
            key={`${cluster[0].latitude},${cluster[0].longitude}`}
            coordinate={{ latitude: cluster[0].latitude, longitude: cluster[0].longitude }}
            onPress={() => setSelected(cluster)}
            tracksViewChanges={false}
          >
            <View
              style={[
                styles.pin,
                { backgroundColor: theme.colors.primary },
                cluster.length > 1 && { minWidth: 34, height: 34, borderRadius: 17 },
              ]}
            >
              <Text style={[styles.pinText, { color: theme.colors.onPrimary }]}>
                {cluster.length > 1 ? cluster.length : "•"}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.chip, { backgroundColor: theme.colors.surfaceContainer }]}
        >
          <Text style={{ color: theme.colors.onSurface }}>←</Text>
          <Text style={{ color: theme.colors.onSurface, fontWeight: "600", fontSize: 13 }}>
            Map · {photos.length} photos
          </Text>
        </Pressable>
      </View>

      {selected.length > 0 ? (
        <View style={[styles.bottomCard, { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.bottomHeader}>
            <Text style={{ color: theme.colors.onSurface, fontWeight: "700", flex: 1 }}>
              {selected.length} photo{selected.length === 1 ? "" : "s"} here
            </Text>
            <Pressable onPress={() => setSelected([])}>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>✕</Text>
            </Pressable>
          </View>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginBottom: 8 }}>
            {new Date(selected[0].taken_at).toLocaleDateString()} —{" "}
            {selected[selected.length - 1] &&
              new Date(selected[selected.length - 1].taken_at).toLocaleDateString()}
          </Text>
          <Pressable
            style={[styles.viewBtn, { backgroundColor: theme.colors.primaryContainer }]}
            onPress={() => {
              const full = selected.map((p) => ({
                ...p,
                thumb_file_id: p.thumb_file_id ?? null,
                local_uri: p.local_uri ?? null,
                status: "uploaded" as const,
                favorite: 0,
              }));
              navigation.navigate("Viewer", { photos: full, index: 0 });
            }}
          >
            <Text style={{ color: theme.colors.onPrimaryContainer, fontWeight: "700" }}>
              View photos
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pin: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pinText: {
    fontSize: 12,
    fontWeight: "800",
  },
  bottomCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    borderRadius: 20,
    padding: 16,
  },
  bottomHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewBtn: {
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 12,
    marginTop: 4,
  },
});
