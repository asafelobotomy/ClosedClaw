#!/usr/bin/env python3
"""
TPC Hardware Probe: SNR Analysis

Analyzes a recorded audio signal to measure Signal-to-Noise Ratio (SNR)
and frequency response in the ultrasonic band (17-22 kHz).

Can analyze:
  1. A pre-recorded WAV file (from sweep.py --record)
  2. A live recording from the microphone

Outputs JSON to stdout for consumption by profile-selector.ts.

Dependencies: numpy, sounddevice (pip install numpy sounddevice)

Usage:
    python3 analyze.py --input recording.wav
    python3 analyze.py --live --duration 2.0 --band-start 17000 --band-end 22000
"""

import argparse
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
    sd = None  # Optional for WAV file analysis


def read_wav(path: str) -> tuple:
    """Read a WAV file and return (samples, sample_rate, channels)."""
    with open(path, "rb") as f:
        # RIFF header
        riff = f.read(4)
        if riff != b"RIFF":
            raise ValueError(f"Not a WAV file: expected RIFF, got {riff!r}")
        f.read(4)  # file size
        wave = f.read(4)
        if wave != b"WAVE":
            raise ValueError(f"Not a WAV file: expected WAVE, got {wave!r}")

        sample_rate = 44100
        channels = 1
        bits_per_sample = 16
        data = b""

        while True:
            chunk_id = f.read(4)
            if len(chunk_id) < 4:
                break
            chunk_size = struct.unpack("<I", f.read(4))[0]

            if chunk_id == b"fmt ":
                fmt_data = f.read(chunk_size)
                audio_format = struct.unpack("<H", fmt_data[0:2])[0]
                channels = struct.unpack("<H", fmt_data[2:4])[0]
                sample_rate = struct.unpack("<I", fmt_data[4:8])[0]
                bits_per_sample = struct.unpack("<H", fmt_data[14:16])[0]
            elif chunk_id == b"data":
                data = f.read(chunk_size)
            else:
                f.read(chunk_size)

    if not data:
        raise ValueError("No audio data found in WAV file")

    # Convert to float32 array
    if bits_per_sample == 16:
        samples = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
    elif bits_per_sample == 32:
        samples = np.frombuffer(data, dtype=np.int32).astype(np.float32) / 2147483648.0
    else:
        raise ValueError(f"Unsupported bits per sample: {bits_per_sample}")

    if channels > 1:
        samples = samples.reshape(-1, channels)[:, 0]  # Take first channel

    return samples, sample_rate, channels


def analyze_spectrum(
    samples: np.ndarray,
    sample_rate: int,
    band_start: float,
    band_end: float,
    noise_band_start: float = 100,
    noise_band_end: float = 15000,
) -> dict:
    """
    Analyze the frequency spectrum of a signal.

    Returns SNR, per-frequency power, and band-level statistics.
    """
    n = len(samples)
    fft_data = np.fft.rfft(samples)
    fft_freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    fft_magnitude = np.abs(fft_data) / n
    fft_power = fft_magnitude ** 2

    # Signal band: target ultrasonic region
    signal_mask = (fft_freqs >= band_start) & (fft_freqs <= band_end)
    # Noise band: below ultrasonic (avoiding DC and very low freq)
    noise_mask = (fft_freqs >= noise_band_start) & (fft_freqs <= noise_band_end)

    signal_power = float(np.mean(fft_power[signal_mask])) if np.any(signal_mask) else 0
    noise_power = float(np.mean(fft_power[noise_mask])) if np.any(noise_mask) else 1e-10

    snr_db = 10 * np.log10(signal_power / max(noise_power, 1e-10))

    # Peak frequency within signal band
    signal_freqs = fft_freqs[signal_mask]
    signal_powers = fft_power[signal_mask]
    peak_idx = np.argmax(signal_powers) if len(signal_powers) > 0 else 0
    peak_freq = float(signal_freqs[peak_idx]) if len(signal_freqs) > 0 else 0
    peak_power = float(signal_powers[peak_idx]) if len(signal_powers) > 0 else 0

    # Frequency response: power at 1 kHz intervals within signal band
    freq_response = []
    for f in range(int(band_start), int(band_end) + 1, 1000):
        band_mask = (fft_freqs >= f - 500) & (fft_freqs <= f + 500)
        band_power = float(np.mean(fft_power[band_mask])) if np.any(band_mask) else 0
        freq_response.append({
            "freq_hz": f,
            "power": round(band_power, 10),
            "power_db": round(10 * np.log10(max(band_power, 1e-15)), 2),
        })

    # Overall signal statistics
    rms = float(np.sqrt(np.mean(samples ** 2)))
    peak_amplitude = float(np.max(np.abs(samples)))
    crest_factor = peak_amplitude / max(rms, 1e-10)

    return {
        "snr_db": round(float(snr_db), 2),
        "signal_power": round(signal_power, 10),
        "noise_power": round(noise_power, 10),
        "peak_freq_hz": round(peak_freq, 1),
        "peak_power": round(peak_power, 10),
        "rms": round(rms, 6),
        "peak_amplitude": round(peak_amplitude, 6),
        "crest_factor_db": round(20 * np.log10(max(crest_factor, 1e-10)), 2),
        "freq_response": freq_response,
        "usable_bandwidth_hz": int(band_end - band_start),
        "sample_count": n,
        "duration_s": round(n / sample_rate, 3),
    }


def record_live(duration: float, sample_rate: int) -> np.ndarray:
    """Record audio from the default input device."""
    if sd is None:
        raise RuntimeError("sounddevice not installed. Run: pip install sounddevice")
    recording = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype="float32")
    sd.wait()
    return recording.flatten()


def main():
    parser = argparse.ArgumentParser(description="TPC SNR analysis probe")
    parser.add_argument("--input", type=str, help="Path to WAV file to analyze")
    parser.add_argument("--live", action="store_true", help="Record live audio for analysis")
    parser.add_argument("--duration", type=float, default=2.0, help="Recording duration (seconds)")
    parser.add_argument("--sample-rate", type=int, default=48000, help="Sample rate (Hz)")
    parser.add_argument("--band-start", type=float, default=17000, help="Signal band start (Hz)")
    parser.add_argument("--band-end", type=float, default=22000, help="Signal band end (Hz)")
    parser.add_argument("--noise-start", type=float, default=100, help="Noise band start (Hz)")
    parser.add_argument("--noise-end", type=float, default=15000, help="Noise band end (Hz)")
    args = parser.parse_args()

    result = {
        "probe": "analyze",
        "band_start_hz": args.band_start,
        "band_end_hz": args.band_end,
        "timestamp": time.time(),
    }

    try:
        if args.input:
            samples, sample_rate, _ = read_wav(args.input)
            result["source"] = args.input
            result["sample_rate"] = sample_rate
        elif args.live:
            if sd is None:
                result["success"] = False
                result["error"] = "sounddevice not installed. Run: pip install sounddevice"
                print(json.dumps(result, indent=2))
                return
            samples = record_live(args.duration, args.sample_rate)
            sample_rate = args.sample_rate
            result["source"] = "live_recording"
            result["sample_rate"] = sample_rate
        else:
            result["success"] = False
            result["error"] = "Provide --input WAV file or --live for microphone recording"
            print(json.dumps(result, indent=2))
            return

        analysis = analyze_spectrum(
            samples,
            sample_rate,
            args.band_start,
            args.band_end,
            args.noise_start,
            args.noise_end,
        )
        result.update(analysis)
        result["success"] = True

    except Exception as e:
        result["success"] = False
        result["error"] = str(e)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
