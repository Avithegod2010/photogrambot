// Pure scanning core for motion-photo detection — no RN/expo imports so it
// runs in node harnesses. motion.ts wraps this with file I/O.

// Motion clips run ~1-5 MB; anything smaller is never a motion photo.
export const MIN_MOTION_BYTES = 400 * 1024;
// The MP4 box header must start within this many bytes after the image's EOI.
export const FTYP_WINDOW = 8192;

function findU16(bytes: Uint8Array, b0: number, b1: number, from: number): number {
  for (let i = from; i < bytes.length - 1; i++) {
    if (bytes[i] === b0 && bytes[i + 1] === b1) return i;
  }
  return -1;
}

// Returns the byte offset where the embedded video starts, or null.
export function locateMotionClip(bytes: Uint8Array): number | null {
  const fileSize = bytes.length;
  if (fileSize < MIN_MOTION_BYTES) return null;

  // Walk EVERY EOI (0xFFD9) that leaves at least MIN_MOTION_BYTES of tail.
  // EOIs in entropy-coded data are impossible (byte stuffing turns 0xFF into
  // FF 00), but embedded EXIF thumbnails and other containers can carry them,
  // so a miss in one EOI's ftyp window must fall through to the next.
  const sig = new TextEncoder().encode("ftyp");
  let eoi = findU16(bytes, 0xff, 0xd9, 0);
  while (eoi !== -1) {
    if (fileSize - (eoi + 2) >= MIN_MOTION_BYTES) {
      const limit = Math.min(eoi + 2 + FTYP_WINDOW, fileSize - 8);
      for (let p = eoi + 2; p < limit; p++) {
        if (
          bytes[p] === sig[0] &&
          bytes[p + 1] === sig[1] &&
          bytes[p + 2] === sig[2] &&
          bytes[p + 3] === sig[3]
        ) {
          const videoStart = p - 4;
          if (videoStart > eoi && fileSize - videoStart >= MIN_MOTION_BYTES) {
            return videoStart;
          }
        }
      }
    }
    eoi = findU16(bytes, 0xff, 0xd9, eoi + 2);
  }
  return null;
}
