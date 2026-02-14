#!/usr/bin/env python3
"""
TPC Hardware Probe: Calibration Packet Receiver

Records audio from the microphone and attempts to demodulate
ultrasonic AFSK calibration packets transmitted by send.py.

Computes Packet Error Rate (PER) and Bit Error Rate (BER).

Outputs JSON to stdout for consumption by profile-selector.ts.

Dependencies: numpy, sounddevice (pip install numpy sounddevice)

Usage:
    python3 recv.py --freq0 18000 --freq1 20000 --duration 10.0 --expected 10
    python3 recv.py --input captured.wav --expected 10
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

CALIBRATION_MAGIC = b"\xCA\x1B\xDA\x7A"
CALIBRATION_PAYLOAD = b"TPC-CALIBRATE-2026"


def goertzel(samples: np.ndarray, target_freq: float, sample_rate: int) -> float:
    """Goertzel algorithm: efficient single-frequency power detection."""
    n = len(samples)
    k = int(0.5 + n * target_freq / sample_rate)
    w = 2 * np.pi * k / n
    coeff = 2 * np.cos(w)
    s0 = s1 = s2 = 0.0
    for sample in samples:
        s0 = float(sample) + coeff * s1 - s2
        s2 = s1
        s1 = s0
    power = s1 * s1 + s2 * s2 - coeff * s1 * s2
    return power / (n * n)


def demodulate_afsk(
    samples: np.ndarray,
    freq0: float,
    freq1: float,
    sample_rate: int,
    baud_rate: int,
) -> bytes:
    """
    AFSK demodulate: extract bits using Goertzel at mark/space frequencies.
    Returns raw demodulated bytes.
    """
    samples_per_bit = int(sample_rate / baud_rate)
    num_bits = len(samples) // samples_per_bit

    bits = []
    for i in range(num_bits):
        start = i * samples_per_bit
        end = start + samples_per_bit
        chunk = samples[start:end]

        p0 = goertzel(chunk, freq0, sample_rate)
        p1 = goertzel(chunk, freq1, sample_rate)

        bits.append(0 if p0 > p1 else 1)

    # Extract bytes from UART framing
    raw_bytes = bytearray()
    i = 0
    while i < len(bits):
        # Look for start bit (0)
        if bits[i] == 0:
            # Extract 8 data bits (MSB-first)
            if i + 9 >= len(bits):
                break
            byte_val = 0
            for b in range(8):
                byte_val = (byte_val << 1) | bits[i + 1 + b]
            # Check stop bit
            if bits[i + 9] == 1:
                raw_bytes.append(byte_val)
                i += 10  # start + 8 data + stop
            else:
                # Framing error — skip this bit
                i += 1
        else:
            # Idle bit — skip
            i += 1

    return bytes(raw_bytes)


def extract_packets(raw_data: bytes) -> list:
    """Extract calibration packets from demodulated byte stream."""
    packets = []
    i = 0
    while i < len(raw_data) - 2:
        # Each packet starts with 2-byte big-endian length, then the packet body
        # But first try to find the magic bytes
        magic_idx = raw_data.find(CALIBRATION_MAGIC, i)
        if magic_idx == -1:
            break

        # The length prefix is 2 bytes before the magic
        if magic_idx < 2:
            i = magic_idx + 1
            continue

        length = struct.unpack(">H", raw_data[magic_idx - 2 : magic_idx])[0]
        packet_start = magic_idx - 2
        packet_end = packet_start + 2 + length

        if packet_end > len(raw_data):
            # Incomplete packet
            i = magic_idx + 1
            continue

        packet_body = raw_data[packet_start + 2 : packet_end]

        # Parse packet: [4B magic][2B seq][18B payload][32B sha256]
        if len(packet_body) < 56:
            i = magic_idx + 1
            continue

        magic = packet_body[0:4]
        seq = struct.unpack(">H", packet_body[4:6])[0]
        payload = packet_body[6:24]
        received_hash = packet_body[24:56]

        # Verify integrity
        expected_hash = hashlib.sha256(magic + packet_body[4:6] + payload).digest()
        valid = received_hash == expected_hash
        payload_match = payload == CALIBRATION_PAYLOAD

        packets.append({
            "seq": seq,
            "valid_hash": valid,
            "payload_match": payload_match,
            "intact": valid and payload_match,
        })

        i = packet_end

    return packets


def read_wav(path: str) -> tuple:
    """Read a WAV file and return (samples, sample_rate)."""
    with open(path, "rb") as f:
        riff = f.read(4)
        if riff != b"RIFF":
            raise ValueError(f"Not a WAV file: got {riff!r}")
        f.read(4)
        f.read(4)  # WAVE

        sample_rate = 48000
        bits_per_sample = 16
        data = b""

        while True:
            chunk_id = f.read(4)
            if len(chunk_id) < 4:
                break
            chunk_size = struct.unpack("<I", f.read(4))[0]
            if chunk_id == b"fmt ":
                fmt_data = f.read(chunk_size)
                sample_rate = struct.unpack("<I", fmt_data[4:8])[0]
                bits_per_sample = struct.unpack("<H", fmt_data[14:16])[0]
            elif chunk_id == b"data":
                data = f.read(chunk_size)
            else:
                f.read(chunk_size)

    if bits_per_sample == 16:
        samples = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
    else:
        raise ValueError(f"Unsupported bits per sample: {bits_per_sample}")

    return samples, sample_rate


def main():
    parser = argparse.ArgumentParser(description="TPC calibration packet receiver")
    parser.add_argument("--freq0", type=float, default=18000, help="Mark frequency (Hz)")
    parser.add_argument("--freq1", type=float, default=20000, help="Space frequency (Hz)")
    parser.add_argument("--baud", type=int, default=150, help="Baud rate (bits/sec)")
    parser.add_argument("--sample-rate", type=int, default=48000, help="Sample rate (Hz)")
    parser.add_argument("--duration", type=float, default=10.0, help="Recording duration (seconds)")
    parser.add_argument("--expected", type=int, default=10, help="Expected number of packets")
    parser.add_argument("--input", type=str, help="WAV file to analyze instead of live recording")
    args = parser.parse_args()

    result = {
        "probe": "recv",
        "freq0_hz": args.freq0,
        "freq1_hz": args.freq1,
        "baud_rate": args.baud,
        "expected_packets": args.expected,
        "timestamp": time.time(),
    }

    try:
        if args.input:
            samples, sample_rate = read_wav(args.input)
            result["source"] = args.input
            result["sample_rate"] = sample_rate
        elif sd is not None:
            # Live recording
            result["source"] = "live_recording"
            result["sample_rate"] = args.sample_rate
            result["duration_s"] = args.duration
            recording = sd.rec(
                int(args.duration * args.sample_rate),
                samplerate=args.sample_rate,
                channels=1,
                dtype="float32",
            )
            sd.wait()
            samples = recording.flatten()
            sample_rate = args.sample_rate
        else:
            result["success"] = False
            result["error"] = "sounddevice not installed and no --input specified"
            print(json.dumps(result, indent=2))
            return

        # Demodulate
        raw_data = demodulate_afsk(samples, args.freq0, args.freq1, sample_rate, args.baud)
        result["demodulated_bytes"] = len(raw_data)

        # Extract and verify packets
        packets = extract_packets(raw_data)
        result["packets_found"] = len(packets)
        result["packets_intact"] = sum(1 for p in packets if p["intact"])
        result["packets_corrupted"] = sum(1 for p in packets if not p["intact"])
        result["packet_details"] = packets

        # Compute PER (Packet Error Rate)
        total_expected = args.expected
        lost = max(0, total_expected - len(packets))
        corrupted = sum(1 for p in packets if not p["intact"])
        total_errors = lost + corrupted

        result["packets_lost"] = lost
        result["per"] = round(total_errors / max(total_expected, 1), 4)
        result["per_percent"] = round(100 * total_errors / max(total_expected, 1), 2)

        # Quality assessment
        per = result["per"]
        if per == 0:
            result["quality"] = "excellent"
        elif per < 0.1:
            result["quality"] = "good"
        elif per < 0.3:
            result["quality"] = "marginal"
        else:
            result["quality"] = "poor"

        result["success"] = True

    except Exception as e:
        result["success"] = False
        result["error"] = str(e)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
