// Video-compression planner (pure). The native transcoder is the build-gated
// piece; this module decides whether compressing is worthwhile and what the
// target geometry/bitrate should be, so the encoder has a single contract.

export type VideoCompressionTarget = "off" | "720p" | "1080p";

export interface CompressionPlan {
  target: Exclude<VideoCompressionTarget, "off">;
  width: number;
  height: number;
  bitrateKbps: number;
  estimatedBytes: number;
  savingsPct: number;
}

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/**
 * Returns a plan only when the target is enabled, the source is meaningfully
 * larger than the target, and the estimated output is smaller than the source.
 */
export function planVideoCompression(input: {
  width: number;
  height: number;
  durationMs: number;
  sizeBytes: number;
  target: VideoCompressionTarget;
}): CompressionPlan | null {
  const { width, height, durationMs, sizeBytes, target } = input;
  if (target !== "720p" && target !== "1080p") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;

  const targetHeight = target === "720p" ? 720 : 1080;
  // Already at or below the target: no reason to re-encode.
  if (height <= targetHeight * 1.05) return null;

  const scale = targetHeight / height;
  const outWidth = even(width * scale);
  const outHeight = even(targetHeight);
  // Practical bitrate caps for archival playback; audio adds ~128 kbps.
  const videoKbps = target === "720p" ? 2500 : 5000;
  const bitrateKbps = videoKbps + 128;
  const estimatedBytes = Math.round((bitrateKbps * 1000 * durationMs) / 1000 / 8);
  if (estimatedBytes >= sizeBytes * 0.95) return null;

  return {
    target,
    width: outWidth,
    height: outHeight,
    bitrateKbps,
    estimatedBytes,
    savingsPct: Math.round((1 - estimatedBytes / sizeBytes) * 100),
  };
}
