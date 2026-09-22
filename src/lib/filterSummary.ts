// Human-readable one-line summary of a saved search (filters + query text)
// for the Smart collections cards. Pure logic, no RN imports.
import type { SearchFilters } from "./db";
import { AUTO_TAGS } from "./autotags";

const AUTO_TAG_LABELS: Record<string, string> = {
  screenshot: "Screenshots",
  screenrec: "Screen recs",
  whatsapp: "WhatsApp",
  document: "Documents",
};

const knownAutoTags: ReadonlySet<string> = new Set<string>(AUTO_TAGS);

export function formatSearchFilterSummary(
  filters: SearchFilters | null,
  query: string
): string {
  const parts: string[] = [];
  if (query.trim()) parts.push(`“${query.trim().slice(0, 40)}”`);
  if (filters) {
    if (filters.takenWithinDays && filters.takenWithinDays > 0) {
      parts.push(`last ${filters.takenWithinDays}d`);
    }
    if (filters.hasGps) parts.push("location");
    if (filters.camera && filters.camera.trim()) parts.push(`camera ${filters.camera.trim()}`);
    if (filters.notBackedUp) parts.push("not backed up");
    if (filters.device && filters.device.trim()) parts.push(filters.device.trim());
    if (filters.mediaType === "photos") parts.push("photos");
    if (filters.mediaType === "videos") parts.push("videos");
    if (filters.sort === "size_desc") parts.push("largest first");
    if (filters.autoTag && knownAutoTags.has(filters.autoTag)) {
      parts.push(AUTO_TAG_LABELS[filters.autoTag] ?? filters.autoTag);
    }
  }
  return parts.join(" · ") || "Everything";
}
