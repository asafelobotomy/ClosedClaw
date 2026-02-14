#!/usr/bin/env python3
"""
TPC Hardware Probe: Frequency Sweep

Generates a chirp/sweep signal from start_freq to end_freq (default 17-22 kHz)
and plays it through the default audio output. Optionally records the loopback
via the default input device for subsequent SNR analysis.

Outputs JSON to stdout for consumption by profile-selector.ts.

Dependencies: numpy, sounddevice (pip install numpy sounddevice)

Usage:
    python3 sweep.py --start 17000 --end 22000 [--duration 2.0] [--record] [--output sweep.json]
"""

import argparse
import json
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
    print(json.dumps({"error": "sounddevice not installed. Run: pip install sounddevice"}), file=sys.stdout)
    sys.exit(1)


def generate_sweep(start_freq: float, end_freq: float, duration: float, sample_rate: int) -> np.ndarray:
    """Generate a linear frequency sweep (chirp) signal."""
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # Linear chirp: frequency increases linearly from start to end
    phase = 2 * np.pi * (start_freq * t + (end_freq - start_freq) / (2 * duration) * t ** 2)
    signal = 0.7 * np.sin(phase)  # 70% amplitude to avoid clipping
    return signal.astype(np.float32)


def get_device_info() -> dict:
    """Query available audio devices."""
    try:
        devices = sd.query_devices()
        default_input = sd.query_devices(kind="input")
        default_output = sd.query_devices(kind="output")
        return {
            "input": {
                "name": default_input["name"],
                "channels": int(default_input["max_input_channels"]),
                "sample_rate": int(default_input["default_samplerate"]),
            },
            "output": {
                "name": default_output["name"],
                "channels": int(default_output["max_output_channels"]),
                "sample_rate": int(default_output["default_samplerate"]),
            },
            "device_count": len(devices) if isinstance(devices, list) else len(devices),
        }
    except Exception as e:
        return {"error": str(e)}


def run_sweep(start_freq: float, end_freq: float, duration: float, sample_rate: int, record: bool) -> dict:
    """
    Run the frequency sweep probe.

    Returns a JSON-serializable dict with results.
    """
    result = {
        "probe": "sweep",
        "start_freq_hz": start_freq,
        "end_freq_hz": end_freq,
        "duration_s": duration,
        "sample_rate": sample_rate,
        "timestamp": time.time(),
    }

    # Check device capabilities
    device_info = get_device_info()
    result["devices"] = device_info

    if "error" in device_info:
        result["success"] = False
        result["error"] = f"Audio device error: {device_info['error']}"
        return result

    # Check if output device sample rate supports our frequency range
    # Nyquist: need at least 2x the max frequency
    output_sr = device_info["output"]["sample_rate"]
    if output_sr < end_freq * 2:
        result["success"] = False
        result["error"] = (
            f"Output device sample rate ({output_sr} Hz) too low for "
            f"{end_freq} Hz. Need at least {end_freq * 2} Hz."
        )
        return result

    # Generate sweep
    sweep_signal = generate_sweep(start_freq, end_freq, duration, sample_rate)
    result["signal_samples"] = len(sweep_signal)

    try:
        if record:
            # Play and record simultaneously
            recording = sd.playrec(
                sweep_signal.reshape(-1, 1),
                samplerate=sample_rate,
                channels=1,
                dtype="float32",
            )
            sd.wait()
            result["recorded_samples"] = len(recording)
            # Compute basic signal metrics
            rms = float(np.sqrt(np.mean(recording ** 2)))
            peak = float(np.max(np.abs(recording)))
            result["recording_rms"] = round(rms, 6)
            result["recording_peak"] = round(peak, 6)

            # Compute per-band power using FFT
            fft_data = np.fft.rfft(recording.flatten())
            fft_freqs = np.fft.rfftfreq(len(recording.flatten()), 1.0 / sample_rate)
            fft_power = np.abs(fft_data) ** 2

            # Band power: signal band vs noise floor
            signal_mask = (fft_freqs >= start_freq) & (fft_freqs <= end_freq)
            noise_mask = (fft_freqs > 100) & (fft_freqs < start_freq * 0.8)

            signal_power = float(np.mean(fft_power[signal_mask])) if np.any(signal_mask) else 0
            noise_power = float(np.mean(fft_power[noise_mask])) if np.any(noise_mask) else 1e-10

            snr_db = 10 * np.log10(signal_power / max(noise_power, 1e-10))
            result["signal_power"] = round(signal_power, 6)
            result["noise_power"] = round(noise_power, 6)
            result["snr_db"] = round(float(snr_db), 2)
        else:
            # Play only (no recording)
            sd.play(sweep_signal, samplerate=sample_rate)
            sd.wait()

        result["success"] = True

    except sd.PortAudioError as e:
        result["success"] = False
        result["error"] = f"PortAudio error: {str(e)}"
    except Exception as e:
        result["success"] = False
        result["error"] = str(e)

    return result


def main():
    parser = argparse.ArgumentParser(description="TPC frequency sweep probe")
    parser.add_argument("--start", type=float, default=17000, help="Start frequency (Hz)")
    parser.add_argument("--end", type=float, default=22000, help="End frequency (Hz)")
    parser.add_argument("--duration", type=float, default=2.0, help="Sweep duration (seconds)")
    parser.add_argument("--sample-rate", type=int, default=48000, help="Sample rate (Hz)")
    parser.add_argument("--record", action="store_true", help="Record loopback for analysis")
    parser.add_argument("--check-only", action="store_true", help="Only check device capabilities")
    args = parser.parse_args()

    if args.check_only:
        result = {
            "probe": "sweep",
            "mode": "check_only",
            "devices": get_device_info(),
            "timestamp": time.time(),
        }
        print(json.dumps(result, indent=2))
        return

    result = run_sweep(args.start, args.end, args.duration, args.sample_rate, args.record)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
