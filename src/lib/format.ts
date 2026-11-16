export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size >= 100 || i === 0 ? Math.round(size) : size.toFixed(1)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function isVideoMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith("video/");
}

export interface DateGroup {
  label: string;
  startMs: number;
}

// Imported as a type only — erased at runtime, so this module stays dependency-free.
import type { DateFormat } from "./settings";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date-only label used by gallery section headers. */
export function formatDayLabel(d: Date, format: DateFormat = "locale", includeYear = true): string {
  const year = d.getFullYear();
  switch (format) {
    case "dmy":
      return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${includeYear ? ` ${year}` : ""}`;
    case "mdy":
      return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}${includeYear ? `, ${year}` : ""}`;
    case "iso":
      return `${year}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    default:
      return includeYear
        ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${year}`
        : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
}

/** Full timestamp used by channel captions and info rows. */
export function formatTimestamp(ts: number, format: DateFormat = "locale"): string {
  const d = new Date(ts);
  switch (format) {
    case "dmy":
      return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    case "mdy": {
      const hours = d.getHours() % 12 || 12;
      const ampm = d.getHours() < 12 ? "AM" : "PM";
      return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()} ${hours}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${ampm}`;
    }
    case "iso":
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    default:
      return d.toLocaleString();
  }
}

export function dateGroupLabel(
  takenAtMs: number,
  now: Date = new Date(),
  format: DateFormat = "locale"
): string {
  const d = new Date(takenAtMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  if (takenAtMs >= startOfToday) return "Today";
  if (takenAtMs >= startOfYesterday) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return formatDayLabel(d, format, !sameYear || format === "iso");
}

export function groupPhotosByDate<T extends { taken_at: number }>(
  photos: T[],
  format: DateFormat = "locale"
): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  let currentLabel: string | null = null;
  for (const p of photos) {
    const label = dateGroupLabel(p.taken_at, new Date(), format);
    if (label !== currentLabel) {
      groups.push({ label, items: [] });
      currentLabel = label;
    }
    groups[groups.length - 1].items.push(p);
  }
  return groups;
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
