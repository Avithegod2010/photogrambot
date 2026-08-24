import { File, Directory, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { downloadFile } from "./telegram";

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, "photogram");
  if (!dir.exists) dir.create();
  return dir;
}

function thumbDir(): Directory {
  const dir = new Directory(Paths.cache, "photogram/thumbs");
  if (!dir.exists) dir.create();
  return dir;
}

const inflight = new Map<string, Promise<string>>();

function cacheKeyFor(fileId: string): string {
  let h = 0;
  for (let i = 0; i < fileId.length; i++) {
    h = (h * 31 + fileId.charCodeAt(i)) | 0;
  }
  return `t${(h >>> 0).toString(36)}_${fileId.replace(/[^A-Za-z0-9]/g, "").slice(-12)}`;
}

export async function getCachedTelegramFile(
  fileId: string,
  ext = "jpg"
): Promise<string> {
  const path = `${thumbDir().uri}${cacheKeyFor(fileId)}.${ext}`;
  const existing = new File(path);
  if (existing.exists) return path;
  const key = `dl:${fileId}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      await downloadFile(fileId, path);
      return path;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export async function clearPhotoCache(): Promise<void> {
  const dir = new Directory(Paths.cache, "photogram");
  if (dir.exists) dir.delete();
}

export async function generatePreview(
  assetUri: string,
  targetKB: number
): Promise<{ uri: string; size: number } | null> {
  try {
    let quality = 0.8;
    let result = await manipulateAsync(
      assetUri,
      [{ resize: { width: 1280 } }],
      { compress: quality, format: SaveFormat.JPEG }
    );
    let file = new File(result.uri);
    let attempts = 0;
    while (file.size > targetKB * 1024 && attempts < 6) {
      quality = Math.max(0.2, quality - 0.15);
      result = await manipulateAsync(
        assetUri,
        [{ resize: { width: 1280 } }],
        { compress: quality, format: SaveFormat.JPEG }
      );
      file = new File(result.uri);
      attempts++;
    }
    return { uri: result.uri, size: file.size };
  } catch {
    return null;
  }
}

export interface TechnicalExifMeta {
  aperture: string | null;
  shutter: string | null;
  iso: number | null;
  focalLength: string | null;
  lens: string | null;
}

export interface AssetMeta {
  filename: string;
  localUri: string | null;
  folder: string | null;
  width: number;
  height: number;
  size: number | null;
  mime: string | null;
  takenAt: number;
  addedAt: number;
  camera: string | null;
  technical: TechnicalExifMeta | null;
  gps: { lat: number; lon: number } | null;
}

function extractTechnical(exif: Record<string, any>): TechnicalExifMeta | null {
  const aperture =
    exif.FNumber ?? exif.ApertureValue ?? exif.FNumberNumerator ?? null;
  const shutter = exif.ExposureTime ?? null;
  const iso = exif.ISOSpeedRatings ?? exif.PhotographicSensitivity ?? null;
  const focalLength = exif.FocalLength ?? exif.FocalLengthIn35mmFilm ?? null;
  const lens = exif.LensModel ?? exif.LensMake ?? null;
  const out: TechnicalExifMeta = {
    aperture: aperture != null ? String(aperture) : null,
    shutter:
      typeof shutter === "number"
        ? shutter >= 1
          ? String(Math.round(shutter * 10) / 10)
          : `1/${Math.round(1 / shutter)}`
        : shutter
          ? String(shutter)
          : null,
    iso: typeof iso === "number" ? iso : null,
    focalLength: focalLength != null ? String(Math.round(parseFloat(String(focalLength)) * 10) / 10) : null,
    lens: lens ? String(lens) : null,
  };
  const has = out.aperture || out.shutter || out.iso || out.focalLength || out.lens;
  return has ? out : null;
}

export async function getAssetMeta(assetId: string): Promise<AssetMeta> {
  const asset = new MediaLibrary.Asset(assetId);
  const info = await asset.getInfo();
  let exif: Record<string, any> = {};
  let gps: { lat: number; lon: number } | null = null;
  try {
    exif = (await asset.getExif()) ?? {};
  } catch {}
  try {
    const loc = await asset.getLocation();
    if (loc?.latitude && loc?.longitude) {
      gps = { lat: loc.latitude, lon: loc.longitude };
    }
  } catch {}
  if (!gps && typeof exif.Latitude === "number" && typeof exif.Longitude === "number") {
    gps = { lat: exif.Latitude, lon: exif.Longitude };
  }
  let camera: string | null = null;
  if (exif.Make || exif.Model) {
    camera = [exif.Make, exif.Model].filter(Boolean).join(" ").trim() || null;
  }
  let size: number | null = null;
  const uri = info.uri;
  if (uri?.startsWith("file://")) {
    try {
      size = new File(uri).size;
    } catch {}
  }
  const mime = guessMime(info.filename);
  return {
    filename: info.filename,
    localUri: uri,
    folder: null,
    width: info.width,
    height: info.height,
    size,
    mime,
    takenAt: info.creationTime ?? 0,
    addedAt: info.modificationTime ?? info.creationTime ?? 0,
    camera,
    technical: extractTechnical(exif),
    gps,
  };
}

export function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    case "bmp":
      return "image/bmp";
    case "dng":
      return "image/x-adobe-dng";
    default:
      return "image/jpeg";
  }
}

export function buildTags(
  filename: string,
  folder: string | null,
  takenAt: number,
  mime: string | null,
  camera: string | null
): string[] {
  const tags: string[] = [];
  if (mime) tags.push(mime.split("/")[1] ?? mime);
  if (folder) tags.push(folder.toLowerCase().replace(/\s+/g, "_"));
  const d = new Date(takenAt);
  tags.push(String(d.getFullYear()));
  tags.push(`${d.getFullYear()}_${d.getMonth() + 1}`);
  if (camera) {
    tags.push(camera.toLowerCase().replace(/\s+/g, "_"));
  }
  return tags;
}
