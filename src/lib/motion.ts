// Motion-photo support (#7, R27): Android motion photos are JPEGs with a
// short MP4 embedded after the image data (Google's Motion Photo / MicroVideo
// format and Samsung's Motion Photo both follow this shape — the video bytes
// trail the still image, optionally with vendor trailers after it).
//
// The backed-up document already preserves the whole original file
// byte-exactly, so nothing is lost without this module — what it adds is
// extracting the clip as a first-class item: uploaded as a reply to the
// photo's document with a #motion caption, listed in the info sheet, and
// saveable back to the gallery.
//
// Detection is deliberately conservative (see motionScan.ts): anything that
// doesn't look like JPEG + trailing MP4 fails to null and the photo simply
// backs up without a companion clip.

import { File, Paths, FileMode } from "expo-file-system";
import { locateMotionClip, MIN_MOTION_BYTES } from "./motionScan";

// Reading the whole JPEG to scan it — cap at a size where that stays cheap.
const MAX_SCAN_BYTES = 80 * 1024 * 1024;

export interface MotionClip {
  uri: string;
  size: number;
}

// Extracts the embedded motion clip to a cache file, or null when the JPEG
// doesn't carry one. The caller owns the returned file's lifetime.
export async function extractMotionVideo(fileUri: string): Promise<MotionClip | null> {
  let handle: ReturnType<File["open"]> | null = null;
  let out: File | null = null;
  let done = false;
  try {
    const src = new File(fileUri);
    if (!src.exists || src.size < MIN_MOTION_BYTES || src.size > MAX_SCAN_BYTES) return null;
    handle = src.open(FileMode.ReadOnly);
    const bytes = handle.readBytes(src.size);
    const videoStart = locateMotionClip(bytes);
    if (videoStart === null) return null;
    const clip = bytes.slice(videoStart);
    out = new File(Paths.cache, `pb_motion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
    const outHandle = out.open(FileMode.WriteOnly);
    try {
      outHandle.writeBytes(clip);
    } finally {
      try {
        outHandle.close();
      } catch {}
    }
    done = true;
    return { uri: out.uri, size: clip.length };
  } catch {
    return null;
  } finally {
    try {
      handle?.close();
    } catch {}
    // Failure paths must not leak a half-written clip.
    if (out && !done) {
      try {
        out.delete();
      } catch {}
    }
  }
}
