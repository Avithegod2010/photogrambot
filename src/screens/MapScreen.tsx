import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "../rn";
import MapView, { Marker, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../useTheme";
import { useSettingsStore } from "../store/useSettingsStore";
import { getGeotagged, type GeotaggedPhoto } from "../lib/db";
import { isDecoyActive } from "../lib/applock";
import { placeLabel } from "../lib/places";
import { Button, EmptyState, IconButton } from "../components/ui";
import { ArrowLeftIcon, CloseIcon, MapPinIcon } from "../components/icons";
import { radius, spacing, touchTarget, typography, elevation } from "../theme";

export function MapScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const mapStyle = useSettingsStore((s) => s.prefs.mapStyle);
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

  const place = selected.length > 0 ? placeLabel(selected[0].latitude, selected[0].longitude) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        mapType={mapStyle}
        accessibilityLabel={`Map with ${clusters.length} photo locations`}
      >
        {clusters.map((cluster) => (
          <Marker
            key={`${cluster[0].latitude},${cluster[0].longitude}`}
            coordinate={{ latitude: cluster[0].latitude, longitude: cluster[0].longitude }}
            onPress={() => setSelected(cluster)}
            tracksViewChanges={false}
            accessibilityLabel={
              cluster.length > 1
                ? `${cluster.length} photos at ${placeLabel(cluster[0].latitude, cluster[0].longitude) ?? "this place"}`
                : `Photo at ${placeLabel(cluster[0].latitude, cluster[0].longitude) ?? "this place"}`
            }
          >
            <View
              style={[
                styles.pin,
                { backgroundColor: theme.colors.primary },
                cluster.length > 1 && styles.pinCluster,
              ]}
            >
              <Text style={[typography.label, { color: theme.colors.onPrimary }]}>
                {cluster.length > 1 ? cluster.length : "•"}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={[styles.topPill, elevation.floating, { backgroundColor: theme.colors.surface }]}>
          <IconButton
            icon={<ArrowLeftIcon color={theme.colors.onSurface} size={20} />}
            label="Back"
            theme={theme}
            onPress={() => navigation.goBack()}
            style={styles.topIcon}
          />
          <Text style={[typography.bodyStrong, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {photos.length} photo{photos.length === 1 ? "" : "s"} on the map
          </Text>
        </View>
      </View>

      {photos.length === 0 && !decoy ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyCard, elevation.floating, { backgroundColor: theme.colors.surface }]}>
            <EmptyState
              compact
              theme={theme}
              art={<MapPinIcon color={theme.colors.primary} size={40} />}
              title="No places yet"
              message="Photos taken with location data appear here as pins. Turn on location tagging in your camera app."
            />
          </View>
        </View>
      ) : null}

      {selected.length > 0 ? (
        <View
          style={[
            styles.bottomCard,
            elevation.floating,
            { backgroundColor: theme.colors.surface, paddingBottom: insets.bottom + spacing.md },
          ]}
        >
          <View style={styles.bottomHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.section, { color: theme.colors.onSurface }]}>
                {selected.length} photo{selected.length === 1 ? "" : "s"} here
              </Text>
              {place ? (
                <Text style={[typography.smallStrong, { color: theme.colors.primary }]} numberOfLines={1}>
                  {place}
                </Text>
              ) : null}
              <Text style={[typography.caption, { color: theme.colors.onSurfaceVariant }]}>
                {new Date(selected[0].taken_at).toLocaleDateString()} —{" "}
                {new Date(selected[selected.length - 1].taken_at).toLocaleDateString()}
              </Text>
            </View>
            <IconButton
              icon={<CloseIcon color={theme.colors.onSurfaceVariant} size={20} />}
              label="Close place details"
              theme={theme}
              onPress={() => setSelected([])}
            />
          </View>
          <Button
            title="View photos"
            theme={theme}
            onPress={() => {
              // Rows come from getGeotagged as complete photo rows — the
              // viewer gets real favorite/status/camera/exif, no overrides.
              navigation.navigate("Viewer", { photos: selected, index: 0 });
            }}
            style={{ marginTop: spacing.md }}
          />
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
  topPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingEnd: spacing.lg,
    paddingStart: spacing.xs,
    minHeight: touchTarget,
  },
  topIcon: {
    width: 40,
    height: 40,
  },
  pin: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  pinCluster: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
  },
  emptyWrap: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xxl,
  },
  emptyCard: {
    borderRadius: radius.card,
    padding: spacing.sm,
  },
  bottomCard: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: 0,
    borderTopStartRadius: radius.sheet,
    borderTopEndRadius: radius.sheet,
    padding: spacing.lg,
  },
  bottomHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
});
