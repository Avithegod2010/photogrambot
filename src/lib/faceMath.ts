// Pure BlazeFace short-range math: anchor generation, decode, NMS. Keeping it
// dependency-free makes the geometry testable without a device.

export interface BlazeAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FaceBox {
  x: number; // top-left, normalized 0..1
  y: number;
  w: number;
  h: number;
  score: number;
}

/** MediaPipe BlazeFace short-range anchor set: 896 anchors for a 128×128 input. */
export function blazeAnchors(
  input = 128,
  minScale = 0.1484375,
  maxScale = 0.75,
  strides = [8, 16, 16, 16],
  offset = 0.5
): BlazeAnchor[] {
  const anchors: BlazeAnchor[] = [];
  const numLayers = strides.length;
  for (let layer = 0; layer < numLayers; layer++) {
    const feat = Math.ceil(input / strides[layer]);
    let lastSame = layer;
    while (lastSame < numLayers - 1 && strides[lastSame] === strides[lastSame + 1]) {
      lastSame++;
    }
    const scale = minScale + ((maxScale - minScale) * layer) / (numLayers - 1);
    for (let y = 0; y < feat; y++) {
      for (let x = 0; x < feat; x++) {
        const ax = (x + offset) / feat;
        const ay = (y + offset) / feat;
        anchors.push({ x: ax, y: ay, w: scale, h: scale });
        const nextScale =
          lastSame === numLayers - 1
            ? 1.0
            : minScale + ((maxScale - minScale) * (lastSame + 1)) / (numLayers - 1);
        anchors.push({ x: ax, y: ay, w: nextScale, h: nextScale });
      }
    }
  }
  return anchors;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function decodeBlazeFace(
  regressors: Float32Array | number[],
  scores: Float32Array | number[],
  anchors: BlazeAnchor[],
  opts: { minScore?: number; inputSize?: number } = {}
): FaceBox[] {
  const minScore = opts.minScore ?? 0.5;
  const inputSize = opts.inputSize ?? 128;
  const reg = Array.from(regressors);
  const score = Array.from(scores);
  const out: FaceBox[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const s = sigmoid(score[i] ?? -20);
    if (s < minScore) continue;
    const base = i * 16;
    if (base + 3 >= reg.length) break;
    const a = anchors[i];
    const x = (reg[base] / inputSize) * a.w + a.x;
    const y = (reg[base + 1] / inputSize) * a.h + a.y;
    const w = (reg[base + 2] / inputSize) * a.w;
    const h = (reg[base + 3] / inputSize) * a.h;
    out.push({ x, y, w, h, score: s });
  }
  return out;
}

function iou(a: FaceBox, b: FaceBox): number {
  const ax1 = a.x - a.w / 2;
  const ay1 = a.y - a.h / 2;
  const ax2 = a.x + a.w / 2;
  const ay2 = a.y + a.h / 2;
  const bx1 = b.x - b.w / 2;
  const by1 = b.y - b.h / 2;
  const bx2 = b.x + b.w / 2;
  const by2 = b.y + b.h / 2;
  const iw = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const ih = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Greedy NMS; returns boxes sorted by score. */
export function nms(boxes: FaceBox[], iouThreshold = 0.3): FaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];
  for (const box of sorted) {
    if (kept.every((k) => iou(k, box) <= iouThreshold)) kept.push(box);
  }
  return kept;
}

/** Clamp a normalized box to [0,1] and convert to source-pixel crop coords. */
export function toPixelCrop(
  box: FaceBox,
  width: number,
  height: number,
  padding = 0.2
): { originX: number; originY: number; width: number; height: number } {
  const cx = box.x * width;
  const cy = box.y * height;
  const w = box.w * width;
  const h = box.h * height;
  const padW = w * padding;
  const padH = h * padding;
  const x1 = Math.max(0, Math.floor(cx - w / 2 - padW));
  const y1 = Math.max(0, Math.floor(cy - h / 2 - padH));
  const x2 = Math.min(width, Math.ceil(cx + w / 2 + padW));
  const y2 = Math.min(height, Math.ceil(cy + h / 2 + padH));
  return { originX: x1, originY: y1, width: Math.max(2, x2 - x1), height: Math.max(2, y2 - y1) };
}
