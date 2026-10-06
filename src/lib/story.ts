// Trip story (#4 follow-up, R30): composes a shareable text summary of a
// generated trip album and posts it to the channel — date range, photo
// count, favorites, the most-photographed places (coarse GPS grid), and the
// largest capture. Pure text via sendMessage; no uploads, no new posts per
// photo.
//
// The story builder is PURE (buildTripStoryText) so it's harness-testable;
// shareTripStory wires it to the channel.

import type { PhotoRow } from "./db";
import { sendMessage } from "./telegram";
import { getChannelId } from "./settings";
import { formatBytes, formatDate } from "./format";

export interface TripStoryStats {
  name: string;
  count: number;
  favorites: number;
  firstDay: string | null;
  lastDay: string | null;
  places: { label: string; count: number }[];
  largest: { filename: string; size: number } | null;
}

export function buildTripStoryText(s: TripStoryStats): string {
  const lines: string[] = [];
  lines.push(`Trip: ${s.name}`);
  if (s.firstDay && s.lastDay) {
    lines.push(s.firstDay === s.lastDay ? `Date: ${s.firstDay}` : `Dates: ${s.firstDay} — ${s.lastDay}`);
  }
  lines.push(`Photos: ${s.count}` + (s.favorites > 0 ? ` (${s.favorites} favorited)` : ""));
  if (s.places.length > 0) {
    lines.push(
      `Places: ${s.places.map((p) => `${p.label} (${p.count})`).join(", ")}`
    );
  }
  if (s.largest) {
    lines.push(`Largest capture: ${s.largest.filename} (${formatBytes(s.largest.size)})`);
  }
  lines.push("Shared from PhotogramBot — reply /restore to any photo in this trip to save it.");
  return lines.join("\n");
}

// Coarse place labels: ~5 km grid cells of the geotagged photos, most-shot
// first. Deliberately NOT reverse-geocoded (no network dependency, no
// third-party location lookup) — coordinates-as-place is honest and cheap.
export function summarizeTrip(name: string, photos: PhotoRow[]): TripStoryStats {
  const geo = photos.filter((p) => p.latitude != null && p.longitude != null);
  const cells = new Map<string, number>();
  for (const p of geo) {
    const key = `${(p.latitude as number).toFixed(2)}:${(p.longitude as number).toFixed(2)}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  const places = [...cells.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => {
      const [lat, lng] = key.split(":");
      return { label: `${Number(lat).toFixed(2)}°, ${Number(lng).toFixed(2)}°`, count };
    });
  const dated = photos.filter((p) => p.taken_at > 0).sort((a, b) => a.taken_at - b.taken_at);
  const largest = photos.reduce<{ filename: string; size: number } | null>((acc, p) => {
    if (!p.size) return acc;
    return !acc || p.size > acc.size ? { filename: p.filename, size: p.size } : acc;
  }, null);
  return {
    name,
    count: photos.length,
    favorites: photos.filter((p) => !!p.favorite).length,
    firstDay: dated.length ? formatDate(dated[0].taken_at) : null,
    lastDay: dated.length ? formatDate(dated[dated.length - 1].taken_at) : null,
    places,
    largest,
  };
}

// Posts the story for a trip album's photos. Returns the channel message
// status so the UI can surface a friendly error without throwing past itself.
export async function shareTripStory(name: string, photos: PhotoRow[]): Promise<boolean> {
  const channelId = await getChannelId();
  if (!channelId) throw new Error("No channel configured");
  return sendMessage(channelId, buildTripStoryText(summarizeTrip(name, photos)));
}
