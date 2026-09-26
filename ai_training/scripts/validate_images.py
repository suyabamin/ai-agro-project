#!/usr/bin/env python3
"""
Validate all extracted images safely.

Detects:
- corrupted images
- unreadable files
- zero-byte files
- invalid image formats
- abnormal dimensions (< 16px or > 20000px)

Outputs:
- data/manifests/invalid_images.csv
Does NOT delete or modify any file in the raw or extracted dataset.
"""

import io
import os
import sys
import csv
from pathlib import Path
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = False
Image.MAX_IMAGE_PIXELS = None

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(WORKSPACE_ROOT))

try:
    import config
    EXTRACTED_DIR = config.EXTRACTED_DATA_DIR
    INVALID_CSV = config.INVALID_IMAGES_CSV
except ImportError:
    EXTRACTED_DIR = WORKSPACE_ROOT / "data" / "extracted"
    INVALID_CSV = WORKSPACE_ROOT / "data" / "manifests" / "invalid_images.csv"

VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}
MIN_DIM = 16
MAX_DIM = 20000


def validate_image_file(path: Path):
    """Safely validate image readability, format, and dimensions."""
    try:
        size_bytes = path.stat().st_size
        if size_bytes == 0:
            return "zero_byte_file", "File size is 0 bytes", size_bytes

        if path.suffix.lower() not in VALID_EXTENSIONS:
            return "invalid_extension", f"Unsupported extension {path.suffix}", size_bytes

        with Image.open(path) as img:
            img.verify()

        with Image.open(path) as img:
            w, h = img.size
            if w < MIN_DIM or h < MIN_DIM:
                return "abnormal_dimensions", f"Dimensions {w}x{h} too small (<{MIN_DIM})", size_bytes
            if w > MAX_DIM or h > MAX_DIM:
                return "abnormal_dimensions", f"Dimensions {w}x{h} too large (>{MAX_DIM})", size_bytes

        return None, None, size_bytes
    except Exception as exc:
        return "corrupt_or_unreadable", str(exc), getattr(path.stat(), "st_size", 0)


def main():
    print("=" * 70)
    print("IMAGE VALIDATION PIPELINE")
    print("=" * 70)

    dataset_root = None
    for p in EXTRACTED_DIR.rglob("*"):
        if p.is_dir() and any(p.glob("*___*")):
            dataset_root = p
            break
        if p.is_dir() and p.name == "Dataset":
            dataset_root = p
            break

    if not dataset_root:
        dataset_root = EXTRACTED_DIR

    print(f"Scanning directory: {dataset_root}")
    image_files = [p for p in dataset_root.rglob("*") if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS]
    print(f"Total candidate image files found: {len(image_files):,}")

    invalid_records = []
    checked = 0

    for p in image_files:
        checked += 1
        if checked % 10000 == 0:
            print(f"  ... checked {checked:,}/{len(image_files):,} images")

        reason, err_msg, size_bytes = validate_image_file(p)
        if reason is not None:
            class_name = p.parent.name
            invalid_records.append({
                "path": str(p),
                "class_name": class_name,
                "reason": reason,
                "error": err_msg,
                "file_size": size_bytes,
            })

    INVALID_CSV.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["path", "class_name", "reason", "error", "file_size"]
    with open(INVALID_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in invalid_records:
            writer.writerow(r)

    print(f"[OK] Validation complete.")
    print(f"[OK] Total inspected: {checked:,}")
    print(f"[OK] Invalid images : {len(invalid_records)}")
    print(f"[OK] Manifest saved : {INVALID_CSV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
