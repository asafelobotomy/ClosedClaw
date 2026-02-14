/**
 * TPC Waveform Decoder
 *
 * Decodes WAV files produced by the waveform encoder back into
 * signed TPC envelopes. Uses FFT-based frequency detection to
 * demodulate AFSK audio.
 *
 * WAV → PCM → AFSK demodulation → RS-FEC decode → JSON → SignedTPCEnvelope
 */

import type { AFSKParams, SignedTPCEnvelope } from "./types.js";
import { DEFAULT_AFSK_PARAMS } from "./types.js";
import { rsDecodePayload, ReedSolomonError } from "./reed-solomon.js";

const MAX_WAV_BYTES = 5 * 1024 * 1024; // Safety cap for inbound WAV payloads

// ---------------------------------------------------------------------------
// WAV parsing
// ---------------------------------------------------------------------------

export class WaveformDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaveformDecodeError";
  }
}

interface WavInfo {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
  dataOffset: number;
  dataSize: number;
}

/**
 * Parse a WAV file header and return metadata + data offset.
 */
function parseWavHeader(buf: Buffer): WavInfo {
  if (buf.length < 44) {
    throw new WaveformDecodeError("Buffer too small for WAV header");
  }

  const riff = buf.toString("ascii", 0, 4);
  const wave = buf.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new WaveformDecodeError("Not a valid WAV file");
  }

  // Find fmt sub-chunk
  let offset = 12;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let channels = 0;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < buf.length - 8) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);

    if (offset + 8 + chunkSize > buf.length) {
      throw new WaveformDecodeError("WAV chunk size exceeds buffer length");
    }

    if (chunkId === "fmt ") {
      const format = buf.readUInt16LE(offset + 8);
      if (format !== 1) {
        throw new WaveformDecodeError(`Unsupported WAV format: ${format} (expected PCM=1)`);
      }
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bitsPerSample = buf.readUInt16LE(offset + 22);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
  }

  if (dataOffset === 0) {
    throw new WaveformDecodeError("No data chunk found in WAV file");
  }

  if (dataOffset + dataSize > buf.length) {
    throw new WaveformDecodeError("WAV data chunk extends beyond buffer");
  }

  return { sampleRate, bitsPerSample, channels, dataOffset, dataSize };
}

/**
 * Extract Int16 PCM samples from a WAV buffer.
 */
function extractPcmSamples(buf: Buffer, info: WavInfo): Int16Array {
  if (info.bitsPerSample !== 16) {
    throw new WaveformDecodeError(`Unsupported bits per sample: ${info.bitsPerSample}`);
  }

  const sampleCount = info.dataSize / 2;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new WaveformDecodeError("Invalid WAV data length for 16-bit PCM");
  }
  const samples = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    samples[i] = buf.readInt16LE(info.dataOffset + i * 2);
  }

  return samples;
}

// ---------------------------------------------------------------------------
// AFSK demodulation (Goertzel algorithm)
// ---------------------------------------------------------------------------

/**
 * Goertzel algorithm: efficient single-frequency power estimation.
 * Much faster than full FFT when only checking two frequencies.
 */
function goertzelPower(
  samples: Int16Array,
  start: number,
  length: number,
  targetFreq: number,
  sampleRate: number,
): number {
  const k = Math.round((length * targetFreq) / sampleRate);
  const omega = (2 * Math.PI * k) / length;
  const coeff = 2 * Math.cos(omega);

  let s0 = 0;
  let s1 = 0;
  let s2 = 0;

  for (let i = 0; i < length; i++) {
    const idx = start + i;
    if (idx >= samples.length) break;
    s0 = (samples[idx] / 0x7fff) + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }

  // Power = s1^2 + s2^2 - coeff * s1 * s2
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Demodulate AFSK audio back to bits using Goertzel frequency detection.
 *
 * For each bit period, compares power at freq0 (mark) vs freq1 (space)
 * to determine 0 or 1.
 */
function demodulateAFSK(samples: Int16Array, params: AFSKParams): Uint8Array {
  const { freq0, freq1, sampleRate, baudRate } = params;
  const samplesPerBit = Math.floor(sampleRate / baudRate);

  // Detect bits using Goertzel frequency discrimination
  const totalBits = Math.floor(samples.length / samplesPerBit);
  const bits: number[] = [];

  for (let i = 0; i < totalBits; i++) {
    const start = i * samplesPerBit;
    const p0 = goertzelPower(samples, start, samplesPerBit, freq0, sampleRate);
    const p1 = goertzelPower(samples, start, samplesPerBit, freq1, sampleRate);
    bits.push(p1 > p0 ? 1 : 0);
  }

  // Skip idle preamble: find the first start bit (0) after initial 1s.
  // The encoder emits 16+ idle bits (all 1s) then data frames starting
  // with a start bit (0). This is standard UART framing.
  let dataStart = 0;
  // Skip leading 1s (idle)
  while (dataStart < bits.length && bits[dataStart] === 1) {
    dataStart++;
  }

  // Decode UART frames: [start=0] [b7..b0] [stop=1]
  const bytes: number[] = [];
  let pos = dataStart;

  while (pos + 10 <= bits.length) {
    // Expect start bit (0)
    if (bits[pos] !== 0) {
      pos++;
      continue;
    }

    // Read 8 data bits (MSB first)
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[pos + 1 + b];
    }

    // Expect stop bit (1)
    if (bits[pos + 9] === 1) {
      bytes.push(byte);
    }

    pos += 10;
  }

  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decode a WAV file buffer back into a signed TPC envelope.
 *
 * Pipeline: WAV → PCM → AFSK demod → RS-FEC decode → JSON → SignedTPCEnvelope
 *
 * @param wavBuffer - Complete WAV file as a Buffer
 * @param afskParams - AFSK modulation parameters (must match encoder)
 * @param eccSymbols - Reed-Solomon ECC symbol count (must match encoder)
 * @returns The decoded and verified SignedTPCEnvelope
 * @throws WaveformDecodeError on invalid WAV or demodulation failure
 * @throws ReedSolomonError on uncorrectable bit errors
 */
export function decodeFromWav(
  wavBuffer: Buffer,
  afskParams: AFSKParams = DEFAULT_AFSK_PARAMS,
  eccSymbols: number = 32,
): SignedTPCEnvelope {
  if (wavBuffer.length > MAX_WAV_BYTES) {
    throw new WaveformDecodeError("WAV buffer exceeds maximum allowed size");
  }

  // 1. Parse WAV header
  const wavInfo = parseWavHeader(wavBuffer);

  if (wavInfo.channels !== afskParams.channels) {
    throw new WaveformDecodeError(
      `Unexpected channel count ${wavInfo.channels}; expected ${afskParams.channels}`,
    );
  }

  if (wavInfo.sampleRate !== afskParams.sampleRate) {
    throw new WaveformDecodeError(
      `Unexpected sample rate ${wavInfo.sampleRate}; expected ${afskParams.sampleRate}`,
    );
  }

  if (wavInfo.bitsPerSample !== afskParams.bitsPerSample) {
    throw new WaveformDecodeError(
      `Unexpected bits per sample ${wavInfo.bitsPerSample}; expected ${afskParams.bitsPerSample}`,
    );
  }

  // 2. Extract PCM samples
  const samples = extractPcmSamples(wavBuffer, wavInfo);

  if (samples.length === 0) {
    throw new WaveformDecodeError("WAV contains no PCM samples");
  }

  // 3. Demodulate AFSK → raw bytes
  const rawBytes = demodulateAFSK(samples, afskParams);

  if (rawBytes.length < 3) {
    throw new WaveformDecodeError("Demodulated data too short");
  }

  // 4. Apply Reed-Solomon error correction
  let correctedBytes: Uint8Array;
  try {
    correctedBytes = rsDecodePayload(rawBytes, eccSymbols);
  } catch (e) {
    if (e instanceof ReedSolomonError) {
      throw new WaveformDecodeError(`FEC decode failed: ${e.message}`);
    }
    throw e;
  }

  // 5. Parse JSON
  const json = Buffer.from(correctedBytes).toString("utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new WaveformDecodeError("Decoded data is not valid JSON");
  }

  // 6. Validate structure
  if (!isSignedTPCEnvelope(parsed)) {
    throw new WaveformDecodeError("Decoded JSON is not a valid SignedTPCEnvelope");
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isSignedTPCEnvelope(value: unknown): value is SignedTPCEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;

  if (typeof obj.signature !== "string") return false;
  if (obj.scheme !== "ed25519" && obj.scheme !== "hmac") return false;

  const env = obj.envelope;
  if (typeof env !== "object" || env === null) return false;
  const envelope = env as Record<string, unknown>;

  return (
    envelope.version === 1 &&
    typeof envelope.messageId === "string" &&
    typeof envelope.timestamp === "number" &&
    typeof envelope.nonce === "string" &&
    typeof envelope.sourceAgent === "string" &&
    typeof envelope.targetAgent === "string" &&
    typeof envelope.payload === "string"
  );
}
