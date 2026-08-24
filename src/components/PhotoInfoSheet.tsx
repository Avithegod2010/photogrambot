import React from "react";
import {
  Dimensions,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useTheme } from "../useTheme";
import { formatBytes, formatDate } from "../lib/format";
import type { PhotoRow } from "../lib/db";

interface TechnicalExif {
  aperture?: string | null;
  shutter?: string | null;
  iso?: number | null;
  focalLength?: string | null;
  lens?: string | null;
}

export function PhotoInfoSheet({
  photo,
  visible,
  onClose,
  theme,
}: {
  photo: PhotoRow | null;
  visible: boolean;
  onClose: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  if (!photo) return null;
  const p = photo;
  const exif: TechnicalExif | null = (() => {
    if (!p.exif) return null;
    try {
      return JSON.parse(p.exif) as TechnicalExif;
    } catch {
      return null;
    }
  })();

  const hasGps = p.latitude != null && p.longitude != null;
  const taken = new Date(p.taken_at);
  const dateHeader = taken.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeHeader = taken.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  function openInMaps() {
    if (!hasGps) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
    void Linking.openURL(url);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
          <View style={[styles.grabber, { backgroundColor: theme.colors.outline }]} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 48 }}
          >
            <View style={styles.dateBlock}>
              <Text style={[styles.dateText, { color: theme.colors.onSurface }]}>{dateHeader}</Text>
              <Text style={[styles.timeText, { color: theme.colors.onSurfaceVariant }]}>
                {timeHeader}
              </Text>
            </View>

            {hasGps ? (
              <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Location</Text>
                <Pressable onPress={openInMaps} style={styles.mapWrap}>
                  <MapView
                    style={styles.map}
                    liteMode={Platform.OS === "android"}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    rotateEnabled={false}
                    pitchEnabled={false}
                    toolbarEnabled={false}
                    initialRegion={{
                      latitude: p.latitude!,
                      longitude: p.longitude!,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    }}
                  >
                    <Marker
                      coordinate={{
                        latitude: p.latitude!,
                        longitude: p.longitude!,
                      }}
                    />
                  </MapView>
                </Pressable>
                <Pressable style={styles.mapLink} onPress={openInMaps}>
                  <Text style={[styles.coordText, { color: theme.colors.primary }]}>
                    {p.latitude!.toFixed(6)}, {p.longitude!.toFixed(6)} — open in Maps ↗
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Details</Text>
              <Row label="File name" value={p.filename} theme={theme} />
              {p.folder ? <Row label="Folder" value={p.folder} theme={theme} /> : null}
              <Row label="Size" value={formatBytes(p.size)} theme={theme} />
              {p.width && p.height ? (
                <Row label="Resolution" value={`${p.width} × ${p.height} (${((p.width * p.height) / 1_000_000).toFixed(1)} MP)`} theme={theme} />
              ) : null}
              {p.mime ? <Row label="Format" value={p.mime} theme={theme} /> : null}
              <Row
                label="Backed up"
                value={
                  p.status === "uploaded"
                    ? formatDate(p.uploaded_at)
                    : p.status === "skipped_too_large"
                      ? "Skipped — larger than 50 MB"
                      : p.status === "failed"
                        ? `Failed — ${p.error ?? "unknown"}`
                        : p.status
                }
                theme={theme}
              />
              {p.device ? <Row label="Uploaded by" value={`device ${p.device}`} theme={theme} /> : null}
              {p.content_hash ? (
                <Row label="SHA-256" value={`${p.content_hash.slice(0, 24)}…`} theme={theme} mono />
              ) : null}
            </View>

            {p.camera || exif ? (
              <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>Camera & EXIF</Text>
                {p.camera ? <Row label="Device" value={p.camera} theme={theme} /> : null}
                {exif?.lens ? <Row label="Lens" value={exif.lens} theme={theme} /> : null}
                {exif?.aperture ? <Row label="Aperture" value={`f/${exif.aperture}`} theme={theme} /> : null}
                {exif?.shutter ? <Row label="Shutter" value={`${exif.shutter} s`} theme={theme} /> : null}
                {exif?.iso ? <Row label="ISO" value={String(exif.iso)} theme={theme} /> : null}
                {exif?.focalLength ? <Row label="Focal length" value={`${exif.focalLength} mm`} theme={theme} /> : null}
                {!p.camera && !exif ? (
                  <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13 }}>
                    No EXIF data recorded for this photo.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {hasGps && !exif ? null : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  theme,
  mono,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          { color: theme.colors.onSurface },
          mono && { fontFamily: Platform.OS === "android" ? "monospace" : undefined },
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    maxHeight: "82%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    marginBottom: 14,
  },
  dateBlock: {
    alignItems: "center",
    marginBottom: 18,
  },
  dateText: {
    fontSize: 20,
    fontWeight: "800",
  },
  timeText: {
    fontSize: 14,
    marginTop: 2,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  mapWrap: {
    borderRadius: 14,
    overflow: "hidden",
  },
  map: {
    width: width - 72,
    height: 180,
  },
  mapLink: {
    marginTop: 10,
  },
  coordText: {
    fontSize: 13,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    gap: 12,
  },
  rowLabel: {
    width: 110,
    fontSize: 13.5,
    lineHeight: 19,
  },
  rowValue: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "500",
    lineHeight: 19,
  },
});
