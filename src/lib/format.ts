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

export interface DateGroup {
  label: string;
  startMs: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function dateGroupLabel(takenAtMs: number, now: Date = new Date()): string {
  const d = new Date(takenAtMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  if (takenAtMs >= startOfToday) return "Today";
  if (takenAtMs >= startOfYesterday) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = MONTHS[d.getMonth()];
  return sameYear ? `${month} ${d.getDate()}` : `${d.getDate()} ${month} ${d.getFullYear()}`;
}

export function groupPhotosByDate<T extends { taken_at: number }>(
  photos: T[]
): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  let currentLabel: string | null = null;
  for (const p of photos) {
    const label = dateGroupLabel(p.taken_at);
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
