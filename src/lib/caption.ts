import { escapeHtml, formatDuration } from "./format";

export interface CaptionMeta {
  filename: string;
  path?: string | null;
  size?: number | null;
  width?: number | null;
  height?: number | null;
  mime?: string | null;
  duration?: number | null;
  dateTaken?: number | null;
  dateAdded?: number | null;
  camera?: string | null;
  technical?: TechnicalExif | null;
  gps?: { lat: number; lon: number } | null;
  tags: string[];
  device?: string | null;
  deviceName?: string | null;
  hash?: string | null;
  aiDescription?: string | null;
  // Set on version-history uploads — the channel-visible "which edit is this" marker.
  versionTag?: number | null;
}

export interface TechnicalExif {
  aperture?: string | null;
  shutter?: string | null;
  iso?: number | null;
  focalLength?: string | null;
  lens?: string | null;
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatSize(bytes?: number | null): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

export function buildCaption(meta: CaptionMeta): string {
  const parts: string[] = [];
  if (meta.versionTag && meta.versionTag > 1) {
    parts.push(`✏️ <b>Edited version #v${meta.versionTag}</b> — replies to the previous upload`);
  }
  parts.push(`📁 <b>File:</b> <code>${escapeHtml(meta.filename)}</code>`);
  if (meta.path) {
    parts.push(`📍 <b>Path:</b> <code>${escapeHtml(meta.path)}</code>`);
  }
  const sizeRes: string[] = [];
  const sizeStr = formatSize(meta.size ?? null);
  if (sizeStr) sizeRes.push(`💾 <b>Size: ${sizeStr}</b>`);
  if (meta.width && meta.height) sizeRes.push(`🖼 <b>Res: ${meta.width}×${meta.height}</b>`);
  if (sizeRes.length) parts.push(sizeRes.join("  ·  "));
  if (meta.duration && meta.duration > 0) {
    parts.push(`⏱ <b>Duration:</b> ${formatDuration(meta.duration)}`);
  }
  if (meta.dateTaken) {
    parts.push(`📅 <b>Date taken:</b> <code>${formatDate(meta.dateTaken)}</code>`);
  }
  if (meta.dateAdded) {
    parts.push(`🕒 <b>Date added:</b> <code>${formatDate(meta.dateAdded)}</code>`);
  }
  if (meta.camera) {
    parts.push(`📱 <b>Camera:</b> <i>${escapeHtml(meta.camera)}</i>`);
  }
  if (meta.technical) {
    const tech: string[] = [];
    if (meta.technical.aperture) tech.push(`f/${meta.technical.aperture}`);
    if (meta.technical.shutter) tech.push(`${meta.technical.shutter}s`);
    if (meta.technical.iso) tech.push(`ISO ${meta.technical.iso}`);
    if (meta.technical.focalLength) tech.push(`${meta.technical.focalLength}mm`);
    if (tech.length) parts.push(`🎛 <b>Exposure:</b> ${tech.join(" · ")}`);
    if (meta.technical.lens) {
      parts.push(`🔍 <b>Lens:</b> <i>${escapeHtml(meta.technical.lens)}</i>`);
    }
  }
  if (meta.gps) {
    parts.push(`🌍 <b>Coords:</b> <code>${meta.gps.lat.toFixed(6)}, ${meta.gps.lon.toFixed(6)}</code>`);
  }
  if (meta.aiDescription) {
    parts.push(`🤖 <i>${escapeHtml(meta.aiDescription)}</i>`);
  }
  const tagLine: string[] = meta.tags.map((t) => `#${t}`);
  if (meta.device) {
    tagLine.push(`#device:${meta.device}`);
  }
  if (tagLine.length) {
    parts.push(tagLine.join(" "));
  }
  if (meta.hash) {
    parts.push(`#hash: ${meta.hash}`);
  }
  // Telegram caps captions at 1024 and rejects unbalanced HTML — assemble
  // greedily line-by-line instead of blind-slicing mid-tag.
  const out: string[] = [];
  let length = 0;
  for (const part of parts) {
    const sep = out.length > 0 ? 1 : 0;
    if (length + sep + part.length > 1000) continue;
    out.push(part);
    length += sep + part.length;
  }
  return out.join("\n");
}

export function buildPreviewCaption(hash: string | null, sizeBytes: number, versionTag?: number | null): string {
  const sizeStr = formatSize(sizeBytes);
  const tag = versionTag && versionTag > 1 ? ` #v${versionTag}` : "";
  return hash
    ? `<b>[Preview ${sizeStr}]</b> #hash: ${hash}${tag}`.slice(0, 1024)
    : `<b>[Preview ${sizeStr}]</b>${tag}`.slice(0, 1024);
}

// Large files (>8 MB) hash as "md5:<32 hex>"; small ones as bare 64-hex SHA-256.
const HASH_RE = /#hasREDACTED_PATH*(md5:[a-fA-F0-9]{32}|[a-fA-F0-9]{64})/;
const DEVICE_RE = /#device:([A-Za-z0-9_-]+)/;
const COORDS_RE = /Coords:<\/b>\s*<code>(-?\d+\.?\d*),\s*(-?\d+\.?\d*)<\/code>/;
const EXPOSURE_RE = /Exposure:<\/b>\s*([^<\n]+)/;
const LENS_RE = /Lens:<\/b>\s*<i>([^<]+)<\/i>/;

export interface ParsedCaption {
  hash: string | null;
  device: string | null;
  tags: string[];
  coords: { lat: number; lon: number } | null;
  technical: TechnicalExif | null;
  isPreview: boolean;
  isDbBackup: boolean;
}

export function parseCaption(caption?: string | null): ParsedCaption {
  const text = caption ?? "";
  const hashMatch = text.match(HASH_RE);
  const deviceMatch = text.match(DEVICE_RE);
  const coordsMatch = text.match(COORDS_RE);
  const exposureMatch = text.match(EXPOSURE_RE);
  const lensMatch = text.match(LENS_RE);
  const tags: string[] = [];
  const tagRe = /#([a-zA-Z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(text)) !== null) {
    const tag = m[1];
    if (tag !== "hash" && tag !== "db_backup") tags.push(tag);
  }
  let technical: TechnicalExif | null = null;
  if (exposureMatch || lensMatch) {
    technical = { aperture: null, shutter: null, iso: null, focalLength: null, lens: lensMatch ? lensMatch[1].trim() : null };
    if (exposureMatch) {
      const exp = exposureMatch[1];
      const ap = exp.match(/f\/([\d.]+)/);
      const sh = exp.match(/([\d/.]+)s/);
      const iso = exp.match(/ISO\s*(\d+)/i);
      const fo = exp.match(/([\d.]+)mm/);
      if (ap) technical.aperture = ap[1];
      if (sh) technical.shutter = sh[1];
      if (iso) technical.iso = parseInt(iso[1], 10);
      if (fo) technical.focalLength = fo[1];
    }
  }
  return {
    hash: hashMatch ? hashMatch[1] : null,
    device: deviceMatch ? deviceMatch[1] : null,
    tags,
    coords: coordsMatch ? { lat: parseFloat(coordsMatch[1]), lon: parseFloat(coordsMatch[2]) } : null,
    technical,
    isPreview: /\[Preview/.test(text),
    isDbBackup: /#db_backup/.test(text),
  };
}
