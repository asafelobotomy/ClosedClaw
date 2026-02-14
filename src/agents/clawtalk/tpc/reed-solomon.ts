/**
 * TPC Reed-Solomon Error Correction
 *
 * GF(2^8) Reed-Solomon codec for TPC payloads.
 * Provides forward error correction to survive bit-level corruption
 * in acoustic transport channels.
 *
 * Parameters:
 *   - Field: GF(2^8) with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
 *   - ECC symbols: configurable (default: 32 → can correct up to 16 byte errors)
 *   - Block size: 255 bytes max (RS standard for GF(2^8))
 */

// Primitive polynomial for GF(2^8): x^8 + x^4 + x^3 + x^2 + 1
const PRIM_POLY = 0x11d;
const FIELD_SIZE = 256;

// Pre-computed lookup tables for GF(2^8) arithmetic
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

export class ReedSolomonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReedSolomonError";
  }
}

// Initialize GF(2^8) exp/log tables
(function initGaloisField(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x = x << 1;
    if (x >= FIELD_SIZE) {
      x ^= PRIM_POLY;
    }
  }
  // Extend exp table for convenient modular arithmetic
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

function assertValidNsym(nsym: number): void {
  if (!Number.isInteger(nsym) || nsym <= 0 || nsym >= 255) {
    throw new ReedSolomonError("Invalid ECC symbol count; must be between 1 and 254");
  }
}

// ---------------------------------------------------------------------------
// GF(2^8) arithmetic
// ---------------------------------------------------------------------------

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0;
  }
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function gfDiv(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Division by zero in GF(2^8)");
  }
  if (a === 0) {
    return 0;
  }
  return EXP_TABLE[(LOG_TABLE[a] - LOG_TABLE[b] + 255) % 255];
}

function gfPow(x: number, power: number): number {
  return EXP_TABLE[(LOG_TABLE[x] * power) % 255];
}

// ---------------------------------------------------------------------------
// Polynomial operations over GF(2^8)
// ---------------------------------------------------------------------------

/** Multiply two polynomials in GF(2^8)[x] */
function polyMul(p: Uint8Array, q: Uint8Array): Uint8Array {
  const result = new Uint8Array(p.length + q.length - 1);
  for (let j = 0; j < q.length; j++) {
    for (let i = 0; i < p.length; i++) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
}

/** Evaluate polynomial at point x in GF(2^8) */
function polyEval(poly: Uint8Array, x: number): number {
  let y = poly[0];
  for (let i = 1; i < poly.length; i++) {
    y = gfMul(y, x) ^ poly[i];
  }
  return y;
}

/** Build RS generator polynomial for nsym ECC symbols */
function buildGenerator(nsym: number): Uint8Array {
  let g: Uint8Array = new Uint8Array([1]);
  for (let i = 0; i < nsym; i++) {
    g = polyMul(g, new Uint8Array([1, gfPow(2, i)]));
  }
  return g;
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Reed-Solomon encode: appends nsym ECC bytes to the data.
 *
 * @param data - Input data (max 223 bytes for nsym=32)
 * @param nsym - Number of ECC symbols (default: 32, corrects up to nsym/2 errors)
 * @returns Encoded data with ECC appended (data.length + nsym bytes)
 */
export function rsEncode(data: Uint8Array, nsym: number = 32): Uint8Array {
  assertValidNsym(nsym);
  if (data.length + nsym > 255) {
    throw new ReedSolomonError(
      `RS block too large: ${data.length} data + ${nsym} ecc > 255. Split into blocks.`,
    );
  }

  const gen = buildGenerator(nsym);

  // Polynomial division: data * x^nsym mod generator
  const padded = new Uint8Array(data.length + nsym);
  padded.set(data);

  for (let i = 0; i < data.length; i++) {
    const coef = padded[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        padded[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }

  // Result: original data + remainder (ECC bytes)
  const result = new Uint8Array(data.length + nsym);
  result.set(data);
  result.set(padded.subarray(data.length), data.length);
  return result;
}

// ---------------------------------------------------------------------------
// Syndromes
// ---------------------------------------------------------------------------

/** Compute syndromes for received message */
function calcSyndromes(msg: Uint8Array, nsym: number): Uint8Array {
  const synd = new Uint8Array(nsym);
  for (let i = 0; i < nsym; i++) {
    synd[i] = polyEval(msg, gfPow(2, i));
  }
  return synd;
}

/** Check if syndromes are all zero (no errors) */
function syndromesClean(synd: Uint8Array): boolean {
  return synd.every((s) => s === 0);
}

// ---------------------------------------------------------------------------
// Berlekamp-Massey algorithm
// ---------------------------------------------------------------------------

/** Find error locator polynomial using Berlekamp-Massey */
function berlekampMassey(synd: Uint8Array, nsym: number): Uint8Array {
  // Standard BM algorithm using LSB-first polynomials internally:
  //   index i = coefficient of x^i, so C[0]=1 always.
  // Converted to MSB-first on output for polyEval/findErrors compatibility.

  const C = new Uint8Array(nsym + 1);
  C[0] = 1;
  const B = new Uint8Array(nsym + 1);
  B[0] = 1;
  let L = 0;
  let m = 1;
  let b = 1;

  for (let n = 0; n < nsym; n++) {
    // Discrepancy: d = S[n] + sum_{i=1}^{L} C[i]*S[n-i]
    let d = synd[n];
    for (let i = 1; i <= L; i++) {
      d ^= gfMul(C[i], synd[n - i]);
    }

    if (d === 0) {
      m++;
    } else if (2 * L <= n) {
      const T = new Uint8Array(C);
      const coeff = gfDiv(d, b);
      for (let i = m; i <= nsym; i++) {
        C[i] ^= gfMul(coeff, B[i - m]);
      }
      L = n + 1 - L;
      B.set(T);
      b = d;
      m = 1;
    } else {
      const coeff = gfDiv(d, b);
      for (let i = m; i <= nsym; i++) {
        C[i] ^= gfMul(coeff, B[i - m]);
      }
      m++;
    }
  }

  // Convert LSB-first C[0..L] to MSB-first [C[L], C[L-1], ..., C[0]]
  const result = new Uint8Array(L + 1);
  for (let i = 0; i <= L; i++) {
    result[i] = C[L - i];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Error location (Chien search)
// ---------------------------------------------------------------------------

/** Find error positions using Chien search */
function findErrors(errLoc: Uint8Array, msgLen: number): number[] {
  const errs = errLoc.length - 1;
  const positions: number[] = [];

  // sigma(x) has roots at alpha^{-power_k} where power_k = msgLen-1-arrayPos.
  // Test each power position j = 0..msgLen-1 by evaluating sigma(alpha^{-j}).
  for (let j = 0; j < msgLen; j++) {
    const x = EXP_TABLE[(255 - j) % 255]; // alpha^{-j}
    if (polyEval(errLoc, x) === 0) {
      positions.push(msgLen - 1 - j);
    }
  }

  if (positions.length !== errs) {
    throw new ReedSolomonError(`Could not locate all errors: found ${positions.length} of ${errs}`);
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Forney algorithm (error magnitude)
// ---------------------------------------------------------------------------

/** Compute error magnitudes using Forney algorithm */
function forneyAlgorithm(
  synd: Uint8Array,
  errLoc: Uint8Array,
  errPos: number[],
  msgLen: number,
): Uint8Array {
  const nsym = synd.length;

  // Build syndrome polynomial S(x) = S_0 + S_1*x + ... + S_{nsym-1}*x^{nsym-1}
  // MSB-first: [S_{nsym-1}, ..., S_1, S_0]
  const sMsb = new Uint8Array(nsym);
  for (let i = 0; i < nsym; i++) {
    sMsb[i] = synd[nsym - 1 - i];
  }

  // Error evaluator: Omega(x) = S(x) * sigma(x) mod x^nsym
  const product = polyMul(sMsb, errLoc);
  const omega = product.subarray(product.length - nsym);

  // X_k (error locator values): X_k = alpha^{power_k} where power_k = msgLen-1-pos
  const X: number[] = [];
  for (const pos of errPos) {
    X.push(gfPow(2, msgLen - 1 - pos));
  }

  // Compute error magnitudes: e_k = Omega(X_k^{-1}) / errLocPrime_k
  const magnitudes = new Uint8Array(msgLen);
  for (let i = 0; i < X.length; i++) {
    const xiInv = gfDiv(1, X[i]);

    // errLocPrime = product_{j!=i} (1 + X_j / X_i)
    let errLocPrime = 1;
    for (let j = 0; j < X.length; j++) {
      if (j !== i) {
        errLocPrime = gfMul(errLocPrime, 1 ^ gfMul(xiInv, X[j]));
      }
    }

    const y = polyEval(omega, xiInv);
    magnitudes[errPos[i]] = gfDiv(y, errLocPrime);
  }

  return magnitudes;
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

/**
 * Reed-Solomon decode: detect and correct errors.
 *
 * @param encoded - Encoded data (data + ECC)
 * @param nsym - Number of ECC symbols (must match encode)
 * @returns Original data with errors corrected
 * @throws ReedSolomonError if too many errors to correct
 */
export function rsDecode(encoded: Uint8Array, nsym: number = 32): Uint8Array {
  assertValidNsym(nsym);
  if (encoded.length > 255) {
    throw new ReedSolomonError(`RS block too large: ${encoded.length} > 255`);
  }

  const msg = new Uint8Array(encoded);
  const synd = calcSyndromes(msg, nsym);

  if (syndromesClean(synd)) {
    // No errors detected
    return msg.subarray(0, msg.length - nsym);
  }

  const errLoc = berlekampMassey(synd, nsym);
  const errCount = errLoc.length - 1;

  if (errCount * 2 > nsym) {
    throw new ReedSolomonError(
      `Too many errors to correct: ${errCount} errors, can correct at most ${Math.floor(nsym / 2)}`,
    );
  }

  const errPos = findErrors(errLoc, msg.length);
  const errMag = forneyAlgorithm(synd, errLoc, errPos, msg.length);

  // Apply corrections
  for (let i = 0; i < msg.length; i++) {
    msg[i] ^= errMag[i];
  }

  // Verify correction
  const checkSynd = calcSyndromes(msg, nsym);
  if (!syndromesClean(checkSynd)) {
    throw new ReedSolomonError("Correction failed: residual syndromes non-zero");
  }

  return msg.subarray(0, msg.length - nsym);
}

// ---------------------------------------------------------------------------
// Block-level encoding for large payloads
// ---------------------------------------------------------------------------

/** Maximum data bytes per RS block (255 - nsym) */
function maxDataPerBlock(nsym: number): number {
  assertValidNsym(nsym);
  return 255 - nsym;
}

/**
 * Encode a large payload by splitting into RS blocks.
 * Output format: [2-byte block count BE] [block1] [block2] ... [blockN]
 * Each block: [1-byte data length] [RS-encoded data (data + nsym bytes)]
 */
export function rsEncodePayload(data: Uint8Array, nsym: number = 32): Uint8Array {
  assertValidNsym(nsym);
  if (data.length === 0) {
    throw new ReedSolomonError("Payload too short: no data to encode");
  }

  const maxData = maxDataPerBlock(nsym);
  const numBlocks = Math.ceil(data.length / maxData);
  if (numBlocks > 1024) {
    throw new ReedSolomonError("Payload too large: exceeds 1024 RS blocks");
  }
  const blocks: Uint8Array[] = [];

  for (let i = 0; i < numBlocks; i++) {
    const start = i * maxData;
    const end = Math.min(start + maxData, data.length);
    const block = data.subarray(start, end);
    const encoded = rsEncode(block, nsym);
    // Prefix each block with its data length (1 byte)
    const prefixed = new Uint8Array(1 + encoded.length);
    prefixed[0] = block.length;
    prefixed.set(encoded, 1);
    blocks.push(prefixed);
  }

  // Calculate total size
  const totalSize = 2 + blocks.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalSize);

  // 2-byte block count (big-endian)
  result[0] = (numBlocks >> 8) & 0xff;
  result[1] = numBlocks & 0xff;

  let offset = 2;
  for (const block of blocks) {
    result.set(block, offset);
    offset += block.length;
  }

  return result;
}

/**
 * Decode a multi-block RS payload.
 * @throws ReedSolomonError if any block has uncorrectable errors
 */
export function rsDecodePayload(encoded: Uint8Array, nsym: number = 32): Uint8Array {
  assertValidNsym(nsym);
  if (encoded.length < 2) {
    throw new ReedSolomonError("Payload too short: missing block count header");
  }

  const numBlocks = (encoded[0] << 8) | encoded[1];
  if (numBlocks === 0) {
    throw new ReedSolomonError("Payload declares zero blocks");
  }
  if (numBlocks > 1024) {
    throw new ReedSolomonError("Payload too large: exceeds 1024 RS blocks");
  }

  const minSize = 2 + numBlocks * (1 + nsym);
  if (encoded.length < minSize) {
    throw new ReedSolomonError(
      `Truncated payload: expected at least ${minSize} bytes for ${numBlocks} blocks`,
    );
  }

  const blocks: Uint8Array[] = [];
  let offset = 2;

  for (let i = 0; i < numBlocks; i++) {
    if (offset >= encoded.length) {
      throw new ReedSolomonError(
        `Truncated payload: expected ${numBlocks} blocks, ended at block ${i}`,
      );
    }

    const dataLen = encoded[offset];
    offset += 1;

    const maxData = maxDataPerBlock(nsym);
    if (dataLen > maxData) {
      throw new ReedSolomonError(
        `Invalid block ${i}: data length ${dataLen} exceeds maximum ${maxData}`,
      );
    }

    const blockLen = dataLen + nsym;
    if (offset + blockLen > encoded.length) {
      throw new ReedSolomonError(
        `Truncated block ${i}: need ${blockLen} bytes, have ${encoded.length - offset}`,
      );
    }

    const block = encoded.subarray(offset, offset + blockLen);
    const decoded = rsDecode(block, nsym);
    blocks.push(decoded);
    offset += blockLen;
  }

  if (offset !== encoded.length) {
    throw new ReedSolomonError("Extraneous data found after final RS block");
  }

  // Concatenate decoded blocks
  const totalLen = blocks.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const block of blocks) {
    result.set(block, pos);
    pos += block.length;
  }

  return result;
}
