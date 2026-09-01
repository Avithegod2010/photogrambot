// Pure-TS PBKDF2-HMAC-SHA256. expo-crypto has no PBKDF2/HMAC primitives, and
// adding a native dependency for one function is not worth it — so this is a
// compact FIPS 180-4 SHA-256 core + RFC 2104 HMAC + RFC 2898 PBKDF2, all on
// typed arrays. With HMAC's ipad/opad midstates precomputed once per key,
// each PBKDF2 iteration costs exactly 2 SHA-256 compressions, and the
// iteration loop below runs allocation-free (word-space state, reused
// scratch blocks).

// ---------- SHA-256 constants (fractional parts of cube roots of first 64 primes)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

// Message-schedule scratch, module-level: sha256Block is synchronous and JS is
// single-threaded, so sharing one W across calls is safe and keeps the PBKDF2
// loop from allocating 40k+ arrays on a 20k-iteration derivation.
const W = new Uint32Array(64);

// FIPS 180-4 compression function: processes one 64-byte block, mutating `s`
// ([h0..h7]) in place. Seeding `s` with HMAC ipad/opad midstates instead of
// the standard IV is how the caller prepends the 64-byte key block for free.
function sha256Block(s: Uint32Array, block: Uint8Array, offset: number): void {
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4;
    W[i] = ((block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3]) >>> 0;
  }
  for (let i = 16; i < 64; i++) {
    const x = W[i - 15];
    const y = W[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
  }
  let a = s[0], b = s[1], c = s[2], d = s[3];
  let e = s[4], f = s[5], g = s[6], h = s[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0;
    d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  s[0] = (s[0] + a) >>> 0;
  s[1] = (s[1] + b) >>> 0;
  s[2] = (s[2] + c) >>> 0;
  s[3] = (s[3] + d) >>> 0;
  s[4] = (s[4] + e) >>> 0;
  s[5] = (s[5] + f) >>> 0;
  s[6] = (s[6] + g) >>> 0;
  s[7] = (s[7] + h) >>> 0;
}

// Words of `s` written big-endian into `bytes` at byte offset `byteOff`.
function storeState(bytes: Uint8Array, byteOff: number, s: Uint32Array): void {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 8; i++) dv.setUint32(byteOff + i * 4, s[i]);
}

// SHA-256 of an arbitrary byte string, returned as 32 raw bytes.
export function sha256(data: Uint8Array): Uint8Array {
  const s = SHA256_IV.slice();
  const bitLen = data.length * 8;
  // Padding: 0x80, zeros, 8-byte big-endian bit length (always ≥1 pad block).
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  for (let off = 0; off < padded.length; off += 64) sha256Block(s, padded, off);
  const out = new Uint8Array(32);
  storeState(out, 0, s);
  return out;
}

// 64-byte pad byte XORed with the (zero-padded to 64) HMAC key.
function padXor(key: Uint8Array, pad: number): Uint8Array {
  const p = new Uint8Array(64);
  for (let i = 0; i < 64; i++) p[i] = (key[i] ?? 0) ^ pad;
  return p;
}

// RFC 2104 HMAC-SHA256 via precomputed ipad/opad midstates (`keyState` =
// compression of IV⊕ipad, `keyOpadState` = compression of IV⊕opad). Caller
// must already have folded the key into those states (and hashed keys >64
// bytes first — see hmacSha256).
function hmacWithStates(
  keyState: Uint32Array,
  keyOpadState: Uint32Array,
  msg: Uint8Array
): Uint8Array {
  const s = keyState.slice();
  // Inner: message blocks after the precomputed key block.
  const padded = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  padded.set(msg);
  padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  const totalBits = (msg.length + 64) * 8;
  dv.setUint32(padded.length - 8, Math.floor(totalBits / 0x100000000));
  dv.setUint32(padded.length - 4, totalBits >>> 0);
  for (let off = 0; off < padded.length; off += 64) sha256Block(s, padded, off);
  // Outer: 32-byte digest + padding fits one 64-byte block after the opad
  // midstate (digest at [0..32), 0x80 at [32], 64-bit length at [56..64)).
  const outer = new Uint8Array(64);
  outer[32] = 0x80;
  new DataView(outer.buffer).setUint32(60, (64 + 32) * 8);
  storeState(outer, 0, s);
  const so = keyOpadState.slice();
  sha256Block(so, outer, 0);
  const out = new Uint8Array(32);
  storeState(out, 0, so);
  return out;
}

// Standalone HMAC-SHA256 (handles keys of any length). Exported for tests and
// any future caller; the PBKDF2 hot path uses precomputed states instead.
export function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const k = key.length > 64 ? sha256(key) : key;
  const ipadState = SHA256_IV.slice();
  sha256Block(ipadState, padXor(k, 0x36), 0);
  const opadState = SHA256_IV.slice();
  sha256Block(opadState, padXor(k, 0x5c), 0);
  return hmacWithStates(ipadState, opadState, msg);
}

// RFC 2898 PBKDF2-HMAC-SHA256. dkLen may span multiple 32-byte digest blocks
// (T_1..T_n, RFC 8018 §5.2 step 3); the primary caller derives 32 bytes, so
// the T_1 fast path covers every real iteration and extra blocks are chained
// in the same loop with per-block one-off U_1 seeds.
export function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  dkLen: number
): Uint8Array {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error("pbkdf2: bad iteration count");
  if (dkLen < 1 || dkLen % 1 !== 0) throw new Error("pbkdf2: bad dkLen");
  // RFC 2104: keys longer than the 64-byte block are hashed first.
  const pw = password.length > 64 ? sha256(password) : password;
  const ipadState = SHA256_IV.slice();
  sha256Block(ipadState, padXor(pw, 0x36), 0);
  const opadState = SHA256_IV.slice();
  sha256Block(opadState, padXor(pw, 0x5c), 0);

  // U_1 = HMAC(P, S || INT(1)) — one-off generic path (salt is arbitrary len).
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  new DataView(first.buffer).setUint32(salt.length, 1);
  const u1 = hmacWithStates(ipadState, opadState, first);

  // U_j = HMAC(P, U_{j-1}); T_i = U_1 ⊕ … ⊕ U_c — fast path: U is always
  // exactly 32 bytes, so both compressions run on reused scratch blocks.
  const innerBlock = new Uint8Array(64);
  const innerDv = new DataView(innerBlock.buffer);
  innerBlock[32] = 0x80; // 32-byte msg → single padded block, tail fixed
  innerDv.setUint32(60, (64 + 32) * 8);
  const outerBlock = new Uint8Array(64);
  outerBlock[32] = 0x80;
  new DataView(outerBlock.buffer).setUint32(60, (64 + 32) * 8);
  const st = new Uint32Array(8);
  const u = new Uint32Array(8);
  const dv1 = new DataView(u1.buffer);
  for (let i = 0; i < 8; i++) u[i] = dv1.getUint32(i * 4);

  const blocks = Math.ceil(dkLen / 32);
  const dkWords = new Uint32Array(8 * blocks); // accumulators: XOR of U_1..U_c
  const seeds = new Uint32Array(8 * blocks); // per-block U_1 words
  seeds.set(u);
  for (let b = 2; b <= blocks; b++) {
    // U_1 of block b = HMAC(P, S || INT(b)) via the generic path.
    const fb = new Uint8Array(salt.length + 4);
    fb.set(salt);
    new DataView(fb.buffer).setUint32(salt.length, b);
    const ub = hmacWithStates(ipadState, opadState, fb);
    const dvb = new DataView(ub.buffer);
    for (let i = 0; i < 8; i++) seeds[8 * (b - 1) + i] = dvb.getUint32(i * 4);
  }
  dkWords.set(seeds);
  // Chain states U_n per block — initialized from U_1 seeds ONCE (block 1's
  // chain lives in `u`); hashing seeds again inside the loop would re-derive
  // U_2 forever and the XOR would never advance past U_1⊕U_2.
  const chains = new Uint32Array(seeds); // chains[8(b-1)..] = U_n of block b

  for (let n = 1; n < iterations; n++) {
    for (let i = 0; i < 8; i++) innerDv.setUint32(i * 4, u[i]);
    st.set(ipadState);
    sha256Block(st, innerBlock, 0);
    storeState(outerBlock, 0, st);
    st.set(opadState);
    sha256Block(st, outerBlock, 0);
    for (let i = 0; i < 8; i++) {
      u[i] = st[i];
      dkWords[i] ^= st[i];
    }
    for (let b = 2; b <= blocks; b++) {
      const base = 8 * (b - 1);
      for (let i = 0; i < 8; i++) innerDv.setUint32(i * 4, chains[base + i]);
      st.set(ipadState);
      sha256Block(st, innerBlock, 0);
      storeState(outerBlock, 0, st);
      st.set(opadState);
      sha256Block(st, outerBlock, 0);
      for (let i = 0; i < 8; i++) {
        chains[base + i] = st[i];
        dkWords[base + i] ^= st[i];
      }
    }
  }

  const dkBytes = new Uint8Array(blocks * 32);
  const dkDv = new DataView(dkBytes.buffer);
  for (let w = 0; w < dkWords.length; w++) dkDv.setUint32(w * 4, dkWords[w]);
  return dkBytes.slice(0, dkLen);
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) throw new Error("bad hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Hand-rolled UTF-8 (surrogate-pair aware) — no TextEncoder dependency
// question on any JS engine this app ships on.
export function utf8(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return new Uint8Array(out);
}
