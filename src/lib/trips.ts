import type { PhotoRow } from "./db";

export interface TripCluster {
  key: string;
  name: string;
  startAt: number;
  endAt: number;
  photoIds: string[];
  centerLat: number | null;
  centerLon: number | null;
}

export interface TripClusterOptions {
  maxGapHours?: number;
  maxDistanceKm?: number;
  minPhotos?: number;
}

const EARTH_RADIUS_KM = 6371;

function distanceKm(a: PhotoRow, b: PhotoRow): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function tripName(startAt: number, endAt: number): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const first = start.toLocaleDateString(undefined, opts);
  const last = end.toLocaleDateString(undefined, opts);
  return first === last ? `Trip · ${first}` : `Trip · ${first} – ${last}`;
}

/**
 * Groups a chronologically ordered library into event/trip clusters. A new
 * cluster starts after a long time gap or a large geotag jump. The input is
 * not mutated, and clusters smaller than minPhotos are intentionally omitted
 * so ordinary one-off photos do not create noisy albums.
 */
export function clusterTrips(rows: PhotoRow[], options: TripClusterOptions = {}): TripCluster[] {
  const maxGapMs = (options.maxGapHours ?? 36) * 60 * 60 * 1000;
  const maxDistance = options.maxDistanceKm ?? 150;
  const minPhotos = Math.max(2, Math.floor(options.minPhotos ?? 3));
  const sorted = rows
    .filter((row) => row.id && Number.isFinite(row.taken_at) && row.taken_at > 0)
    .slice()
    .sort((a, b) => a.taken_at - b.taken_at || a.id.localeCompare(b.id));
  const clusters: PhotoRow[][] = [];
  let current: PhotoRow[] = [];

  for (const row of sorted) {
    const previous = current[current.length - 1];
    const gap = previous ? row.taken_at - previous.taken_at : 0;
    const distance = previous ? distanceKm(previous, row) : null;
    const movedFar = distance != null && distance > maxDistance && gap > 6 * 60 * 60 * 1000;
    if (previous && (gap > maxGapMs || movedFar)) {
      if (current.length >= minPhotos) clusters.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length >= minPhotos) clusters.push(current);

  return clusters.map((photos) => {
    const first = photos[0];
    const last = photos[photos.length - 1];
    const geotagged = photos.filter((p) => p.latitude != null && p.longitude != null);
    const centerLat = geotagged.length
      ? geotagged.reduce((sum, p) => sum + p.latitude!, 0) / geotagged.length
      : null;
    const centerLon = geotagged.length
      ? geotagged.reduce((sum, p) => sum + p.longitude!, 0) / geotagged.length
      : null;
    return {
      key: `${first.id}:${first.taken_at}`,
      name: tripName(first.taken_at, last.taken_at),
      startAt: first.taken_at,
      endAt: last.taken_at,
      photoIds: photos.map((p) => p.id),
      centerLat,
      centerLon,
    };
  });
}
