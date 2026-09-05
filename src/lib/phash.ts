// Perceptual hashing (dHash) for the near-duplicate finder — pure TS, zero
// deps. No pixel API exists in RN (no webview dep, expo-image-manipulator
// returns no pixels), so this module extracts the Y-plane DC coefficients
// straight out of baseline JPEG entropy data. An 8x8 block's DC coefficient
// is proportional to the block's mean luminance, giving a coarse "mean image"
// — exactly the resolution dHash wants (bursts/edits/re-saves differ in a few
// blocks; the DC grid preserves enough structure to tell them apart).

// Only the interleaved single-scan baseline layout is supported. Progressive
// (SOF2) uses a different scan grammar entirely (successive approximation
// refines DC over multiple scans) — those files return null and are simply
// excluded from the near-dup scan. Same for 12-bit precision, arithmetic
// coding, and 16-bit quantizer precision.

// Spec-style Huffman lookup (ITU-T T.81 F.2.2.3): per-length min/max code
// plus an offset that turns (code - minCode) into a values-array index.
interface HuffTable {
  minCode: Int32Array; // index [1..16]; minCode[0] unused
  maxCode: Int32Array; // maxCode[len] = -1 marks "no codes of this length"
  valOffset: Int32Array; // valOffset[len] = values-index of minCode[len]
}

function buildHuffTable(counts: Uint8Array, values: Uint8Array): HuffTable {
  const minCode = new Int32Array(17);
  const maxCode = new Int32Array(17).fill(-1);
  const valOffset = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    const count = counts[len - 1];
    if (count > 0) {
      valOffset[len] = k - code;
      minCode[len] = code;
      maxCode[len] = code + count - 1;
      k += count;
    }
    code = (code + count) << 1;
  }
  return { minCode, maxCode, valOffset };
}

// Entropy bit reader: MSB-first bits, 0xFF00 de-stuffing, RSTn consumption,
// and marker detection (an unstuffed 0xFF terminates the entropy stream).
class BitReader {
  private data: Uint8Array;
  private pos: number;
  private acc = 0; // bit accumulator
  private nbits = 0; // valid bits in acc, counted from the LSB end
  hitMarker = false; // a real marker ended the stream
  ranOffEnd = false; // the FILE itself ended without a marker

  constructor(data: Uint8Array, start: number) {
    this.data = data;
    this.pos = start;
  }

  // Pads with 1-bits past the end (spec: a hanging code must not accidentally
  // match a short valid code; encoders also pad the final partial byte).
  private fill(n: number): void {
    while (this.nbits < n) {
      if (this.pos >= this.data.length) {
        this.ranOffEnd = true;
        while (this.nbits < n) {
          this.acc = (this.acc << 1) | 1;
          this.nbits++;
        }
        return;
      }
      const b = this.data[this.pos];
      if (b === 0xff) {
        const next = this.pos + 1 < this.data.length ? this.data[this.pos + 1] : -1;
        if (next === 0x00) {
          this.pos += 2; // stuffed byte -> literal 0xFF data byte
        } else {
          // Real marker (RSTn/EOI/whatever) — entropy data ends here.
          this.hitMarker = true;
          while (this.nbits < n) {
            this.acc = (this.acc << 1) | 1;
            this.nbits++;
          }
          return;
        }
      } else {
        this.pos++;
      }
      this.acc = (this.acc << 8) | b;
      this.nbits += 8;
    }
  }

  /** Pops 1..16 raw bits. Returns the bits (1-padded past the end). */
  receive(n: number): number {
    if (n === 0) return 0;
    this.fill(n);
    this.nbits -= n;
    return (this.acc >>> this.nbits) & ((1 << n) - 1);
  }

  /** Decodes one Huffman symbol. -1 = corrupt (code longer than 16). */
  decode(t: HuffTable): number {
    let code = 0;
    for (let len = 1; len <= 16; len++) {
      code = (code << 1) | this.receive(1);
      if (t.maxCode[len] >= code) {
        // maxCode[len] === -1 (no codes this length) fails this test.
        // valOffset[len] = valuesIndex(minCode[len]) - minCode[len], so the
        // symbol is recovered in one add (libjpeg's HUFF_DECODE fast path).
        return t.valOffset[len] + code;
      }
    }
    return -1;
  }

  /** Skips to the byte boundary and consumes one RSTn if present (DRI). */
  restart(): void {
    this.acc = 0;
    this.nbits = 0;
    this.hitMarker = false;
    this.ranOffEnd = false;
    if (
      this.pos + 1 < this.data.length &&
      this.data[this.pos] === 0xff &&
      this.data[this.pos + 1] >= 0xd0 &&
      this.data[this.pos + 1] <= 0xd7
    ) {
      this.pos += 2;
    }
  }

  get position(): number {
    return this.pos;
  }
}

interface ScanComponent {
  id: number;
  h: number; // horizontal sampling factor (1..4)
  v: number; // vertical sampling factor
  quant: number; // quantizer table id
  dcTable: number; // DC Huffman table id (Td, from SOS)
  acTable: number; // AC Huffman table id (Ta, from SOS)
}

// Decodes one 8x8 block: DC symbol + magnitude bits, then every AC symbol
// (values discarded — only consumed to keep the bitstream aligned). Returns
// the DC DIFFERENCE, or null on a corrupt/truncated stream.
function decodeBlock(reader: BitReader, dcTable: HuffTable, acTable: HuffTable): number | null {
  const ssss = reader.decode(dcTable);
  if (ssss < 0 || ssss > 11) return null; // 8-bit precision caps DC at ssss=11
  let diff = 0;
  if (ssss > 0) {
    const bits = reader.receive(ssss);
    if (reader.ranOffEnd) return null; // truncated mid-bits
    // JPEG magnitude coding: all-zeros bits (below the midpoint) encode
    // a negative value.
    diff = bits < (1 << (ssss - 1)) ? bits - (1 << ssss) + 1 : bits;
  }
  let k = 1;
  while (k <= 63) {
    const rs = reader.decode(acTable);
    if (rs < 0) return null;
    const run = rs >> 4;
    const size = rs & 15;
    if (size === 0) {
      if (run === 15) {
        k += 16; // ZRL: sixteen zeros
        continue;
      }
      break; // EOB
    }
    k += run + 1;
    if (k > 64) return null;
    if (reader.ranOffEnd) return null;
    reader.receive(size);
    if (reader.ranOffEnd) return null;
  }
  return diff;
}

export interface DcGrid {
  grid: Float32Array; // approximate block means, 0..255, row-major
  w: number; // grid width in blocks (= ceil(imageW / 8) padded to sampling)
  h: number; // grid height in blocks
}

/**
 * Decodes the Y-plane DC coefficients of a baseline JPEG into a grid of
 * approximate block means (0..255). Supports the standard sampling layouts
 * (4:4:4, 4:2:2, 4:2:0, grayscale — anything expressible as per-component
 * h/v sampling factors, decoded generically). Returns null for progressive
 * JPEGs, unsupported SOFs, or truncated/corrupt scans — callers treat null
 * as "skipped" (fail-safe).
 */
export function dcGridFromJpeg(bytes: Uint8Array): DcGrid | null {
  // Minimal format gate: PNG/HEIC/WEBP all fail here in one comparison.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const quantTables: Uint8Array[] = [
    new Uint8Array(64),
    new Uint8Array(64),
    new Uint8Array(64),
    new Uint8Array(64),
  ];
  let precision = 0;
  let width = 0;
  let height = 0;
  let restartInterval = 0;
  let components: { id: number; h: number; v: number; quant: number }[] = [];
  const dcTables: (HuffTable | null)[] = [null, null, null, null];
  const acTables: (HuffTable | null)[] = [null, null, null, null];

  let pos = 2;
  while (pos + 1 < bytes.length) {
    if (bytes[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = bytes[pos + 1];
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      // Stuffed 0xff or stray RSTn outside a scan — skip both bytes.
      pos += 2;
      continue;
    }
    if (marker === 0xff) {
      pos++; // filler padding
      continue;
    }
    pos += 2;
    if (marker === 0xd8 || marker === 0x01) continue; // SOI/TEM, no payload
    if (marker === 0xd9) return null; // EOI before any scan — no image data
    if (pos + 2 > bytes.length) return null;
    const segLen = (bytes[pos] << 8) | bytes[pos + 1];
    if (segLen < 2 || pos + segLen > bytes.length) return null;
    const payload = bytes.subarray(pos + 2, pos + segLen);
    const segEnd = pos + segLen;

    if (marker === 0xdb) {
      // DQT — up to 4 tables, natural (zigzag) order, 8-bit precision only.
      let q = 0;
      while (q < payload.length) {
        const pqTq = payload[q];
        const pq = pqTq >> 4;
        const tq = pqTq & 15;
        const tableBytes = pq === 1 ? 129 : 65;
        if (tq > 3) return null;
        if (pq === 1) return null; // 16-bit quant values unsupported
        if (q + tableBytes > payload.length) return null;
        // DC lives at zigzag index 0 == natural index 0; the rest are only
        // needed for completeness of the walk (AC values are discarded).
        quantTables[tq].set(payload.subarray(q + 1, q + tableBytes));
        q += tableBytes;
      }
    } else if (marker === 0xc4) {
      // DHT — DC (Tc=0) and AC (Tc=1) tables.
      let q = 0;
      while (q < payload.length) {
        if (q + 17 > payload.length) return null;
        const tcTh = payload[q];
        const tc = tcTh >> 4;
        const th = tcTh & 15;
        let total = 0;
        for (let i = 0; i < 16; i++) total += payload[q + 1 + i];
        if (q + 17 + total > payload.length) return null;
        const table = buildHuffTable(
          payload.subarray(q + 1, q + 17),
          payload.subarray(q + 17, q + 17 + total)
        );
        if (tc === 0) dcTables[th] = table;
        else acTables[th] = table;
        q += 17 + total;
      }
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      // SOF — only baseline sequential Huffman (SOF0/SOF1) is supported.
      if (marker !== 0xc0 && marker !== 0xc1) return null;
      if (payload.length < 6) return null;
      precision = payload[0];
      if (precision !== 8) return null;
      height = (payload[1] << 8) | payload[2];
      width = (payload[3] << 8) | payload[4];
      const nComp = payload[5];
      if (nComp !== 1 && nComp !== 3) return null;
      if (payload.length < 6 + nComp * 3) return null;
      if (width === 0 || height === 0) return null;
      components = [];
      for (let c = 0; c < nComp; c++) {
        const base = 6 + c * 3;
        components.push({
          id: payload[base],
          h: payload[base + 1] >> 4,
          v: payload[base + 1] & 15,
          quant: payload[base + 2],
        });
      }
    } else if (marker === 0xdd) {
      // DRI — restart interval in MCUs.
      if (payload.length < 2) return null;
      restartInterval = (payload[0] << 8) | payload[1];
    } else if (marker === 0xda) {
      // SOS — decode the interleaved scan immediately.
      if (components.length === 0) return null;
      if (payload.length < 1) return null;
      const ns = payload[0];
      // Baseline sequential is single-scan for the full image: every SOF
      // component must appear (non-interleaved multi-scan baseline files
      // exist but are rare; they are refused rather than mis-decoded).
      if (ns !== components.length) return null;
      if (payload.length < 1 + ns * 2) return null;
      const scanComps: ScanComponent[] = [];
      for (let s = 0; s < ns; s++) {
        const cs = payload[1 + s * 2];
        const comp = components.find((c) => c.id === cs);
        if (!comp) return null;
        // One SOS byte per component: Td in the high nibble, Ta in the low.
        const tdTa = payload[2 + s * 2];
        scanComps.push({
          id: comp.id,
          h: comp.h,
          v: comp.v,
          quant: comp.quant,
          dcTable: tdTa >> 4,
          acTable: tdTa & 15,
        });
      }
      return decodeScan(
        bytes,
        segEnd,
        scanComps,
        dcTables,
        acTables,
        quantTables,
        restartInterval,
        width,
        height
      );
    }
    // Everything else (APPn, COM, ...) is skipped via segLen.
    pos = segEnd;
  }
  return null; // no SOS reached — no image data
}

function decodeScan(
  bytes: Uint8Array,
  entropyStart: number,
  scanComps: ScanComponent[],
  dcTables: (HuffTable | null)[],
  acTables: (HuffTable | null)[],
  quantTables: Uint8Array[],
  restartInterval: number,
  width: number,
  height: number
): DcGrid | null {
  // T.81 does not require SOS order to match SOF order — find the luma
  // component (largest sampling area) and refuse streams that don't list it
  // first: this decoder's grid geometry assumes scanComps[0] is luma.
  const lumaIdx = scanComps.reduce(
    (best, c, i) => (c.h * c.v > scanComps[best].h * scanComps[best].v ? i : best),
    0
  );
  if (lumaIdx !== 0) return null;
  const isGray = scanComps.length === 1;
  const yComp = scanComps[0];
  const hMax = isGray
    ? yComp.h
    : Math.max(yComp.h, scanComps[1].h, scanComps[2].h);
  const vMax = isGray
    ? yComp.v
    : Math.max(yComp.v, scanComps[1].v, scanComps[2].v);
  const mcusWide = Math.ceil(width / (hMax * 8));
  const mcusHigh = Math.ceil(height / (vMax * 8));

  // Table ids: the SOS byte carries DC in the high nibble and AC in the LOW
  // nibble — dcTable on ScanComponent actually stores the full byte; split
  // here (kept explicit to mirror the spec's Td/Ta).
  const reader = new BitReader(bytes, entropyStart);
  const dcPred = new Int32Array(4);
  const blocksWide = mcusWide * yComp.h;
  const blocksHigh = mcusHigh * yComp.v;
  const grid = new Float32Array(blocksWide * blocksHigh);

  for (let ci = 0; ci < scanComps.length; ci++) {
    const comp = scanComps[ci];
    const dc = dcTables[comp.dcTable];
    const ac = acTables[comp.acTable];
    if (!dc || !ac) return null;
  }

  let mcusSinceRestart = 0;
  for (let my = 0; my < mcusHigh; my++) {
    for (let mx = 0; mx < mcusWide; mx++) {
      if (restartInterval > 0 && mcusSinceRestart >= restartInterval) {
        // RSTn: predictors reset, bit reader re-aligns. If no RSTn is where
        // it should be, the stream is corrupt — bail rather than desync.
        reader.restart();
        dcPred.fill(0);
        mcusSinceRestart = 0;
      }
      for (let ci = 0; ci < scanComps.length; ci++) {
        const comp = scanComps[ci];
        const dc = dcTables[comp.dcTable]!;
        const ac = acTables[comp.acTable]!;
        for (let by = 0; by < comp.v; by++) {
          for (let bx = 0; bx < comp.h; bx++) {
            const diff = decodeBlock(reader, dc, ac);
            if (diff === null) return null; // truncated / corrupt
            dcPred[ci] += diff;
            if (ci === 0) {
              // Y block: record the approximate mean. Dequantized DC/8 is the
              // block's mean offset from the 128 level shift.
              const q = quantTables[comp.quant][0];
              const mean = 128 + (dcPred[0] * q) / 8;
              const gx = mx * comp.h + bx;
              const gy = my * comp.v + by;
              grid[gy * blocksWide + gx] = mean < 0 ? 0 : mean > 255 ? 255 : mean;
            }
          }
        }
      }
      mcusSinceRestart++;
    }
  }
  // A marker (RSTn aside) or file end reached before every MCU decoded means
  // the stream truncated — the 1-bit padding can accidentally decode as valid
  // DCs, so trust only a complete scan.
  if (reader.hitMarker || reader.ranOffEnd) return null;
  return { grid, w: blocksWide, h: blocksHigh };
}

// dHash on the DC grid: nearest-neighbor downsample to 9x8, then the classic
// row-wise adjacent comparison (px[x] < px[x+1]) — 8 bits per row × 8 rows =
// 64 bits. Stored as 16 lowercase hex chars. The DC grid IS a block-mean
// image, so the downsample is at most a slight smoothing — comparable
// images produce near-identical hash structure.
export function dHashFromDc(dc: DcGrid): string {
  const W = 9;
  const H = 8;
  const sx = dc.w / W;
  const sy = dc.h / H;
  const small = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Nearest source cell (ceil keeps the last column/row in-range).
      const px = Math.min(dc.w - 1, Math.floor((x + 0.5) * sx));
      const py = Math.min(dc.h - 1, Math.floor((y + 0.5) * sy));
      small[y * W + x] = dc.grid[py * dc.w + px];
    }
  }
  let hash = 0n;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      hash = (hash << 1n) | (small[y * W + x] < small[y * W + x + 1] ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, "0");
}

/** Count of differing bits between two fixed-length hex hashes. */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      diff += x & 1;
      x >>= 1;
    }
  }
  return diff;
}

export interface HashedItem {
  id: string;
  hash: string;
}

export interface HashCluster {
  members: HashedItem[];
}

// Union-find clustering over Hamming distance. Groups are transitive: A~B
// and B~C puts A and C in one cluster even when A~C > threshold — the right
// behavior for burst sequences (shot 1~2, 2~3, but 1 vs 3 already differ).
export function clusterByDistance(
  items: HashedItem[],
  threshold: number
): HashCluster[] {
  const parent = new Int32Array(items.length);
  for (let i = 0; i < items.length; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (hammingHex(items[i].hash, items[j].hash) <= threshold) {
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) parent[rj] = ri;
      }
    }
  }
  const groups = new Map<number, HashedItem[]>();
  for (let i = 0; i < items.length; i++) {
    const r = find(i);
    const list = groups.get(r);
    if (list) list.push(items[i]);
    else groups.set(r, [items[i]]);
  }
  return Array.from(groups.values())
    .filter((g) => g.length >= 2)
    .map((members) => ({ members }));
}
