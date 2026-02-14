#!/usr/bin/env python3
"""
TPC Hardware Probe: Calibration Packet Transmitter

Generates and transmits a signed TPC calibration packet through the
speaker using ultrasonic AFSK modulation (18-20 kHz carriers).

The calibration packet contains a known payload for bit-error and
packet-error-rate measurement by recv.py.

Outputs JSON to stdout for consumption by profile-selector.ts.

Dependencies: numpy, sounddevice (pip install numpy sounddevice)

Usage:
    python3 send.py --freq0 18000 --freq1 20000 [--packets 10] [--baud 150]
    python3 send.py --output calibration.wav  # Write WAV instead of playing
"""

import argparse
import hashlib
import json
import struct
import sys
import time

try:
    import numpy as np
except ImportError:
    print(json.dumps({"error": "numpy not installed. Run: pip install numpy"}), file=sys.stdout)
    sys.exit(1)

try:
    import sounddevice as sd
except ImportError:
    sd = None

# Calibration magic bytes for packet boundary detection
CALIBRATION_MAGIC = b"\xCA\x1B\xDA\x7A"
CALIBRATION_PAYLOAD = b"TPC-CALIBRATE-2026"


def generate_calibration_packet(seq: int) -> bytes:
    """
    Generate a calibration packet with known payload.

    Format:
      [4B magic][2B seq][18B payload][32B sha256][2B length]
    Total: 58 bytes
    """
    seq_bytes = struct.pack(">H", seq)
    digest = hashlib.sha256(CALIBRATION_MAGIC + seq_bytes + CALIBRATION_PAYLOAD).digest()
    packet = CALIBRATION_MAGIC + seq_bytes + CALIBRATION_PAYLOAD + digest
    length_bytes = struct.pack(">H", len(packet))
    return length_bytes + packet


def modulate_afsk_ultrasonic(
    data: bytes,
    freq0: float,
    freq1: float,
    sample_rate: int,
    baud_rate: int,
) -> np.ndarray:
    """
    AFSK modulate data using ultrasonic carrier frequencies.
    Uses UART framing: [start=0][8 data bits MSB-first][stop=1]
    """
    samples_per_bit = int(sample_rate / baud_rate)
    amplitude = 0.6  # 60% amplitude — ultrasonic needs headroom for DAC nonlinearity

    # Preamble: 32 alternating bits for receiver synchronization
    preamble = [1, 0] * 16

    # Frame each byte
    bits = list(preamble)
    for byte in data:
        bits.append(0)  # start bit
        for b in range(7, -1, -1):
            bits.append((byte >> b) & 1)
        bits.append(1)  # stop bit

    # Postamble: 16 idle bits
    bits.extend([1] * 16)

    # Generate samples with continuous phase
    total_samples = len(bits) * samples_per_bit
    samples = np.zeros(total_samples, dtype=np.float32)
    phase = 0.0

    for i, bit in enumerate(bits):
        freq = freq0 if bit == 0 else freq1
        phase_inc = 2 * np.pi * freq / sample_rate
        start_idx = i * samples_per_bit
        for s in range(samples_per_bit):
            samples[start_idx + s] = amplitude * np.sin(phase)
            phase += phase_inc

    return samples


def write_wav(path: str, samples: np.ndarray, sample_rate: int):
    """Write a mono 16-bit WAV file."""
    pcm = (samples * 32767).astype(np.int16)
    data_size = len(pcm) * 2
    with open(path, "wb") as f:
        # RIFF header
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVE")
        # fmt chunk
        f.write(b"fmt ")
        f.write(struct.pack("<I", 16))
        f.write(struct.pack("<H", 1))     # PCM
        f.write(struct.pack("<H", 1))     # mono
        f.write(struct.pack("<I", sample_rate))
        f.write(struct.pack("<I", sample_rate * 2))  # byte rate
        f.write(struct.pack("<H", 2))     # block align
        f.write(struct.pack("<H", 16))    # bits per sample
        # data chunk
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(pcm.tobytes())


def main():
    parser = argparse.ArgumentParser(description="TPC calibration packet transmitter")
    parser.add_argument("--freq0", type=float, default=18000, help="Mark frequency (Hz)")
    parser.add_argument("--freq1", type=float, default=20000, help="Space frequency (Hz)")
    parser.add_argument("--baud", type=int, default=150, help="Baud rate (bits/sec)")
    parser.add_argument("--sample-rate", type=int, default=48000, help="Sample rate (Hz)")
    parser.add_argument("--packets", type=int, default=10, help="Number of calibration packets")
    parser.add_argument("--gap-ms", type=float, default=200, help="Gap between packets (ms)")
    parser.add_argument("--output", type=str, help="Write WAV file instead of playing")
    args = parser.parse_args()

    result = {
        "probe": "send",
        "freq0_hz": args.freq0,
        "freq1_hz": args.freq1,
        "baud_rate": args.baud,
        "sample_rate": args.sample_rate,
        "num_packets": args.packets,
        "gap_ms": args.gap_ms,
        "timestamp": time.time(),
    }

    # Nyquist check
    max_freq = max(args.freq0, args.freq1)
    if args.sample_rate < max_freq * 2:
        result["success"] = False
        result["error"] = (
            f"Sample rate ({args.sample_rate} Hz) too low for "
            f"{max_freq} Hz carrier. Need at least {max_freq * 2} Hz."
        )
        print(json.dumps(result, indent=2))
        return

    try:
        # Generate all calibration packets
        all_samples = np.array([], dtype=np.float32)
        gap_samples = np.zeros(int(args.sample_rate * args.gap_ms / 1000), dtype=np.float32)
        packet_sizes = []

        for seq in range(args.packets):
            packet = generate_calibration_packet(seq)
            packet_sizes.append(len(packet))
            modulated = modulate_afsk_ultrasonic(
                packet, args.freq0, args.freq1, args.sample_rate, args.baud
            )
            all_samples = np.concatenate([all_samples, modulated, gap_samples])

        total_duration = len(all_samples) / args.sample_rate
        result["packet_size_bytes"] = packet_sizes[0]
        result["total_samples"] = len(all_samples)
        result["total_duration_s"] = round(total_duration, 3)

        if args.output:
            # Write to WAV file
            write_wav(args.output, all_samples, args.sample_rate)
            result["output_file"] = args.output
            result["success"] = True
        elif sd is not None:
            # Play through speakers
            sd.play(all_samples, samplerate=args.sample_rate)
            sd.wait()
            result["mode"] = "live_playback"
            result["success"] = True
        else:
            result["success"] = False
            result["error"] = "sounddevice not installed and no --output specified"

    except Exception as e:
        result["success"] = False
        result["error"] = str(e)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
