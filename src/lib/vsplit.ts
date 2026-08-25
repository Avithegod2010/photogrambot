import { File, Paths } from "expo-file-system";
import { escapeHtml } from "./format";
import { sendDocument } from "./telegram";

// Bot API asymmetry: uploads go up to 50 MB, but bots can only DOWNLOAD
// files up to 20 MB via getFile. Parts must be downloadable for restore,
// so they stay safely under the 20 MB download limit.
export const VIDEO_PART_BYTES = 19 * 1024 * 1024;

export interface VideoPart {
  file_id: string;
  size: number;
}

export function buildVideoPartCaption(
  hash: string,
  index: number,
  total: number,
  filename: string
): string {
  return `🧩 <b>[Part ${index}/${total}]</b> #vsplit:${hash} #part:${index}/${total} 📁 <code>${escapeHtml(
    filename
  )}</code>`.slice(0, 1024);
}

const PART_RE = /#vsplit:([a-fA-F0-9]{64})\s*#part:(\d+)\/(\d+)/;

export function parseVideoPartCaption(caption?: string | null): {
  hash: string;
  index: number;
  total: number;
} | null {
  if (!caption) return null;
  const m = caption.match(PART_RE);
  if (!m) return null;
  return { hash: m[1].toLowerCase(), index: parseInt(m[2], 10), total: parseInt(m[3], 10) };
}

export async function splitAndUploadVideo(
  channelId: string,
  fileUri: string,
  opts: {
    hash: string;
    filename: string;
    messageThreadId?: number;
    token?: string;
    resumeParts?: VideoPart[];
    onPartsChanged?: (parts: VideoPart[]) => void;
    onProgress?: (bytesSent: number, totalBytes: number) => void;
    onPartUploaded?: (index: number, total: number) => void;
    signal?: AbortSignal;
  }
): Promise<{ parts: VideoPart[]; thumbFileId: string | null }> {
  const file = new File(fileUri);
  if (!file.exists) throw new Error("Video file missing on device");
  const total = Math.max(1, Math.ceil(file.size / VIDEO_PART_BYTES));
  const resume = opts.resumeParts ?? [];
  let thumbFileId: string | null = null;
  if (resume.length >= total) {
    // Everything already uploaded in a previous attempt.
    return { parts: resume.slice(0, total), thumbFileId };
  }
  const parts: VideoPart[] = [...resume];
  const handle = file.open();
  try {
    if (resume.length > 0) {
      // Skip past bytes already uploaded in a previous attempt.
      handle.offset = resume.length * VIDEO_PART_BYTES;
    }
    for (let i = resume.length + 1; i <= total; i++) {
      if (opts.signal?.aborted) throw new Error("Cancelled");
      const bytes = handle.readBytes(VIDEO_PART_BYTES);
      const tmp = new File(Paths.cache, `pb_vpart_${Date.now()}_${i}.bin`);
      tmp.write(bytes);
      try {
        const message = await sendDocument(channelId, tmp.uri, {
          caption: buildVideoPartCaption(opts.hash, i, total, opts.filename),
          filename: `${opts.filename}.part${String(i).padStart(2, "0")}`,
          mime: "application/octet-stream",
          messageThreadId: opts.messageThreadId,
          token: opts.token,
          onProgress: opts.onProgress,
          signal: opts.signal,
        });
        if (!message.document) throw new Error(`Part ${i} upload returned no document`);
        parts.push({ file_id: message.document.file_id, size: bytes.length });
        // Part 1's auto-thumbnail is ~the video's first frame — good tile.
        if (!thumbFileId) thumbFileId = message.document.thumbnail?.file_id ?? null;
      } finally {
        try { tmp.delete(); } catch {}
      }
      opts.onPartsChanged?.(parts);
      opts.onPartUploaded?.(i, total);
    }
  } finally {
    try { handle.close(); } catch {}
  }
  return { parts, thumbFileId };
}
