#!/usr/bin/env python3
"""
Master Dataset Preparation Pipeline.

Sequentially executes:
1. Extraction & structure verification
2. Image integrity validation (validate_images.py)
3. Dataset inspection & reporting (inspect_dataset.py)
4. Leakage-aware 70/15/15 split generation (create_splits.py)
"""

import io
import os
import sys
import subprocess
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).resolve().parent
PYTHON_EXE = sys.executable

def run_step(step_name, script_name):
    print("\n" + "=" * 70)
    print(f"STEP: {step_name} ({script_name})")
    print("=" * 70)
    script_path = SCRIPT_DIR / script_name
    res = subprocess.run([PYTHON_EXE, str(script_path)])
    if res.returncode != 0:
        print(f"[FAIL] Step failed with code {res.returncode}")
        sys.exit(res.returncode)
    print(f"[PASS] {step_name} completed.")

def main():
    print("=" * 70)
    print("AGROAI PLANT DISEASE DATASET PREPARATION")
    print("=" * 70)

    run_step("1. Image Validation", "validate_images.py")
    run_step("2. Leakage-Aware Stratified Splitting", "create_splits.py")
    run_step("3. Dataset Inspection & Documentation", "inspect_dataset.py")

    print("\n" + "=" * 70)
    print("[ALL PASS] Dataset preparation successfully completed.")
    print("=" * 70)

if __name__ == "__main__":
    main()
