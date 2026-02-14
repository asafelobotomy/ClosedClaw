/**
 * TPC Waveform Encoder
 *
 * Encodes signed TPC envelopes into WAV files using
 * Audio Frequency-Shift Keying (AFSK / Bell 202).
 *
 * Binary 0 → 1200 Hz tone
 * Binary 1 → 2400 Hz tone
 *
 * The resulting WAV file is the non-textual, acoustically-opaque
 * representation used for TPC dead-drop transport.
 */

import type { AFSKParams, SignedTPCEnvelope } from "./types.js";
import { DEFAULT_AFSK_PARAMS } from "./types.js";
import { rsEncodePayload } from "./reed-solomon.js";

// ---------------------------------------------------------------------------
// WAV header construction
// ---------------------------------------------------------------------------

/**
 * Build a standard 44-byte WAV (RIFF) header for PCM audio.
 */
function buildWavHeader(params: {
  dataSize: number;
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}): Buffer {
  const { dataSize, sampleRate, bitsPerSample, channels } = params;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  let offset = 0;

  // RIFF header
  header.write("RIFF", offset); offset += 4;
  header.writeUInt32LE(fileSize, offset); offset += 4;
  header.write("WAVE", offset); offset += 4;

  // fmt sub-chunk
  header.write("fmt ", offset); offset += 4;
  header.writeUInt32LE(16, offset); offset += 4;          // sub-chunk size
  header.writeUInt16LE(1, offset); offset += 2;           // PCM format
  header.writeUInt16LE(channels, offset); offset += 2;
  header.writeUInt32LE(sampleRate, offset); offset += 4;
  header.writeUInt32LE(byteRate, offset); offset += 4;
  header.writeUInt16LE(blockAlign, offset); offset += 2;
  header.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data sub-chunk
  header.write("data", offset); offset += 4;
  header.writeUInt32LE(dataSize, offset);

  return header;
}

// ---------------------------------------------------------------------------
// AFSK modulation
// ---------------------------------------------------------------------------

/**
 * Generate AFSK-modulated PCM samples for a byte array.
 *
 * Each byte is transmitted MSB-first with a start bit (0) and stop bit (1).
 * This matches standard UART/Bell 202 framing for robustness.
 */
function modulateAFSK(data: Uint8Array, params: AFSKParams): Int16Array {
  const { freq0, freq1, sampleRate, baudRate } = params;
  const samplesPerBit = Math.floor(sampleRate / baudRate);
  const amplitude = 0x6000; // ~75% of Int16 max to avoid clipping

  // Preamble: 16 idle bits (all 1s = high tone) for receiver lock-in.
  // Standard UART idle is mark (1). First start bit (0) signals data start.
  const preambleBits = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

  // Frame each byte: [start=0] [b7 b6 b5 b4 b3 b2 b1 b0] [stop=1]
  const bits: number[] = [...preambleBits];
  for (let i = 0; i < data.length; i++) {
    bits.push(0); // start bit
    for (let b = 7; b >= 0; b--) {
      bits.push((data[i] >> b) & 1);
    }
    bits.push(1); // stop bit
  }

  // Postamble: 8 idle bits for clean ending
  bits.push(1, 1, 1, 1, 1, 1, 1, 1);

  // Generate PCM samples
  const totalSamples = bits.length * samplesPerBit;
  const samples = new Int16Array(totalSamples);

  let phase = 0;
  for (let i = 0; i < bits.length; i++) {
    const freq = bits[i] === 0 ? freq0 : freq1;
    const phaseIncrement = (2 * Math.PI * freq) / sampleRate;

    for (let s = 0; s < samplesPerBit; s++) {
      const sampleIdx = i * samplesPerBit + s;
      samples[sampleIdx] = Math.round(amplitude * Math.sin(phase));
      phase += phaseIncrement;
    }
  }

  return samples;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode a signed TPC envelope to a WAV file buffer.
 *
 * Pipeline: SignedEnvelope → JSON → UTF-8 → RS-FEC → AFSK → WAV
 *
 * @param signed - The signed TPC envelope to encode
 * @param afskParams - AFSK modulation parameters (optional, uses defaults)
 * @param eccSymbols - Reed-Solomon ECC symbol count (default: 32)
 * @returns Buffer containing the complete WAV file
 */
export function encodeToWav(
  signed: SignedTPCEnvelope,
  afskParams: AFSKParams = DEFAULT_AFSK_PARAMS,
  eccSymbols: number = 32,
): Buffer {
  // 1. Serialize envelope to JSON
  const json = JSON.stringify(signed);
  const jsonBytes = Buffer.from(json, "utf-8");

  // 2. Apply Reed-Solomon FEC
  const fecEncoded = rsEncodePayload(new Uint8Array(jsonBytes), eccSymbols);

  // 3. Modulate as AFSK audio
  const pcmSamples = modulateAFSK(fecEncoded, afskParams);

  // 4. Build WAV file
  const dataSize = pcmSamples.length * 2; // 16-bit samples = 2 bytes each
  const header = buildWavHeader({
    dataSize,
    sampleRate: afskParams.sampleRate,
    bitsPerSample: afskParams.bitsPerSample,
    channels: afskParams.channels,
  });

  // Combine header + PCM data
  const pcmBuffer = Buffer.from(pcmSamples.buffer, pcmSamples.byteOffset, pcmSamples.byteLength);
  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Calculate the expected WAV file size for a given payload.
 * Useful for pre-allocating buffers or estimating storage.
 */
export function estimateWavSize(
  payloadBytes: number,
  afskParams: AFSKParams = DEFAULT_AFSK_PARAMS,
  eccSymbols: number = 32,
): number {
  const maxDataPerBlock = 255 - eccSymbols;
  const numBlocks = Math.ceil(payloadBytes / maxDataPerBlock);
  const fecBytes = 2 + numBlocks * (1 + payloadBytes + eccSymbols);

  // Each byte = 10 bits (start + 8 data + stop)
  // Plus preamble (8 bits) and postamble (4 bits)
  const totalBits = 8 + fecBytes * 10 + 4;
  const samplesPerBit = Math.floor(afskParams.sampleRate / afskParams.baudRate);
  const totalSamples = totalBits * samplesPerBit;
  const dataSize = totalSamples * (afskParams.bitsPerSample / 8);

  return 44 + dataSize; // WAV header + PCM data
}
