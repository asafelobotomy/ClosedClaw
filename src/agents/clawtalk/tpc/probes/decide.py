#!/usr/bin/env python3
"""
TPC Hardware Probe: Mode Decision Engine

Evaluates probe results and selects the optimal TPC transport mode.

Decision logic:
  1. If SNR > 20 dB and PER < 5%  → ultrasonic mode
  2. If SNR > 10 dB and PER < 20% → audible mode (1200/2400 Hz fallback)
  3. Otherwise                      → file mode (dead-drop, no audio)

Can run probes automatically or accept pre-computed results.

Outputs JSON to stdout for consumption by profile-selector.ts.

Dependencies: numpy, sounddevice (for auto-probe mode)

Usage:
    python3 decide.py --auto                    # Run full probe sequence
    python3 decide.py --snr 25.3 --per 0.02    # From pre-computed values
    python3 decide.py --sweep-result sweep.json --recv-result recv.json
"""

import argparse
import json
import subprocess
import os
import sys
import time


# Thresholds for mode selection
ULTRASONIC_SNR_THRESHOLD = 20.0   # dB
ULTRASONIC_PER_THRESHOLD = 0.05   # 5%
AUDIBLE_SNR_THRESHOLD = 10.0      # dB
AUDIBLE_PER_THRESHOLD = 0.20      # 20%

# Carrier frequencies for each mode
ULTRASONIC_FREQ0 = 18000  # Hz
ULTRASONIC_FREQ1 = 20000  # Hz
AUDIBLE_FREQ0 = 1200      # Hz
AUDIBLE_FREQ1 = 2400      # Hz


def run_probe(script: str, args: list) -> dict:
    """Run a Python probe script and parse JSON output."""
    probe_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(probe_dir, script)

    if not os.path.exists(script_path):
        return {"success": False, "error": f"Probe script not found: {script_path}"}

    try:
        result = subprocess.run(
            [sys.executable, script_path] + args,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            return {
                "success": False,
                "error": f"Probe exited with code {result.returncode}: {result.stderr.strip()}",
            }
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Probe timed out after 60s"}
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"Invalid JSON from probe: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def decide_mode(snr_db: float, per: float) -> dict:
    """
    Select TPC transport mode based on SNR and PER.

    Returns the mode decision with recommended carrier frequencies.
    """
    if snr_db >= ULTRASONIC_SNR_THRESHOLD and per <= ULTRASONIC_PER_THRESHOLD:
        return {
            "mode": "ultrasonic",
            "freq0_hz": ULTRASONIC_FREQ0,
            "freq1_hz": ULTRASONIC_FREQ1,
            "baud_rate": 150,
            "reason": (
                f"Excellent ultrasonic channel: SNR={snr_db:.1f} dB "
                f"(>= {ULTRASONIC_SNR_THRESHOLD} dB), "
                f"PER={per*100:.1f}% (<= {ULTRASONIC_PER_THRESHOLD*100:.0f}%)"
            ),
            "confidence": min(1.0, snr_db / 40.0),  # Higher SNR = more confidence
        }
    elif snr_db >= AUDIBLE_SNR_THRESHOLD and per <= AUDIBLE_PER_THRESHOLD:
        return {
            "mode": "audible",
            "freq0_hz": AUDIBLE_FREQ0,
            "freq1_hz": AUDIBLE_FREQ1,
            "baud_rate": 300,
            "reason": (
                f"Audible fallback: SNR={snr_db:.1f} dB "
                f"(>= {AUDIBLE_SNR_THRESHOLD} dB, < {ULTRASONIC_SNR_THRESHOLD} dB), "
                f"PER={per*100:.1f}%"
            ),
            "confidence": min(1.0, snr_db / 30.0),
        }
    else:
        return {
            "mode": "file",
            "freq0_hz": None,
            "freq1_hz": None,
            "baud_rate": None,
            "reason": (
                f"File mode (no audio): SNR={snr_db:.1f} dB "
                f"(< {AUDIBLE_SNR_THRESHOLD} dB) or "
                f"PER={per*100:.1f}% (> {AUDIBLE_PER_THRESHOLD*100:.0f}%)"
            ),
            "confidence": 1.0,  # File mode always works
        }


def auto_probe(sample_rate: int = 48000) -> dict:
    """
    Run the full probe sequence automatically:
      1. Check audio devices
      2. Run frequency sweep with recording
      3. Run calibration TX/RX loop
      4. Analyze results and select mode
    """
    steps = []

    # Step 1: Check devices
    sweep_check = run_probe("sweep.py", ["--check-only"])
    steps.append({"step": "device_check", "result": sweep_check})

    if not sweep_check.get("devices") or "error" in sweep_check.get("devices", {}):
        return {
            "success": False,
            "error": "No audio devices available",
            "steps": steps,
            "decision": decide_mode(0, 1.0),
        }

    # Step 2: Frequency sweep with recording
    sweep_result = run_probe("sweep.py", [
        "--start", "17000",
        "--end", "22000",
        "--duration", "2.0",
        "--sample-rate", str(sample_rate),
        "--record",
    ])
    steps.append({"step": "sweep", "result": sweep_result})

    if not sweep_result.get("success"):
        return {
            "success": False,
            "error": f"Sweep failed: {sweep_result.get('error', 'unknown')}",
            "steps": steps,
            "decision": decide_mode(0, 1.0),
        }

    snr_db = sweep_result.get("snr_db", 0)

    # Step 3: Calibration TX → file → RX loopback
    # We write calibration packets to a WAV file, then analyze them
    import tempfile
    cal_wav = os.path.join(tempfile.gettempdir(), "tpc_calibration.wav")

    send_result = run_probe("send.py", [
        "--freq0", str(ULTRASONIC_FREQ0),
        "--freq1", str(ULTRASONIC_FREQ1),
        "--packets", "10",
        "--sample-rate", str(sample_rate),
        "--output", cal_wav,
    ])
    steps.append({"step": "send_calibration", "result": send_result})

    if not send_result.get("success"):
        # Can't send calibration — fall back to sweep SNR only
        return {
            "success": True,
            "snr_db": snr_db,
            "per": 1.0,
            "steps": steps,
            "decision": decide_mode(snr_db, 1.0),
        }

    # Analyze the calibration WAV with recv.py
    recv_result = run_probe("recv.py", [
        "--freq0", str(ULTRASONIC_FREQ0),
        "--freq1", str(ULTRASONIC_FREQ1),
        "--expected", "10",
        "--input", cal_wav,
    ])
    steps.append({"step": "recv_calibration", "result": recv_result})

    per = recv_result.get("per", 1.0) if recv_result.get("success") else 1.0

    # Cleanup
    try:
        os.unlink(cal_wav)
    except OSError:
        pass

    decision = decide_mode(snr_db, per)

    return {
        "success": True,
        "snr_db": snr_db,
        "per": per,
        "steps": steps,
        "decision": decision,
    }


def main():
    parser = argparse.ArgumentParser(description="TPC mode decision engine")
    parser.add_argument("--auto", action="store_true", help="Run full probe sequence automatically")
    parser.add_argument("--snr", type=float, help="Pre-computed SNR (dB)")
    parser.add_argument("--per", type=float, help="Pre-computed PER (0.0-1.0)")
    parser.add_argument("--sweep-result", type=str, help="JSON file from sweep.py")
    parser.add_argument("--recv-result", type=str, help="JSON file from recv.py")
    parser.add_argument("--sample-rate", type=int, default=48000, help="Sample rate (Hz)")
    args = parser.parse_args()

    result = {
        "probe": "decide",
        "timestamp": time.time(),
    }

    try:
        if args.auto:
            # Full auto-probe
            probe_result = auto_probe(args.sample_rate)
            result.update(probe_result)

        elif args.snr is not None and args.per is not None:
            # Direct values
            result["snr_db"] = args.snr
            result["per"] = args.per
            result["decision"] = decide_mode(args.snr, args.per)
            result["success"] = True

        elif args.sweep_result and args.recv_result:
            # Load from JSON files
            with open(args.sweep_result) as f:
                sweep = json.load(f)
            with open(args.recv_result) as f:
                recv = json.load(f)

            snr_db = sweep.get("snr_db", 0)
            per = recv.get("per", 1.0)
            result["snr_db"] = snr_db
            result["per"] = per
            result["sweep_result"] = sweep
            result["recv_result"] = recv
            result["decision"] = decide_mode(snr_db, per)
            result["success"] = True

        else:
            result["success"] = False
            result["error"] = (
                "Provide --auto, or --snr + --per, or --sweep-result + --recv-result"
            )

    except Exception as e:
        result["success"] = False
        result["error"] = str(e)

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
