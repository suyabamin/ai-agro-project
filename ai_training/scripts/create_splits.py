#!/usr/bin/env python3
"""
Create a reproducible, stratified, leakage-aware train/validation/test split.

Split Ratios:
  - Train: 70%
  - Validation: 15%
  - Test: 15%
Seed: 42

Leakage prevention:
Images that are exact duplicates (same sha256) or near-duplicates (perceptual hash
Hamming distance <= threshold) are grouped via Union-Find and kept in the SAME split.
No visually identical or near-identical image can cross between train, validation, and test.

Outputs:
  - data/manifests/train_manifest.csv
  - data/manifests/validation_manifest.csv
  - data/manifests/test_manifest.csv
  - data/manifests/dataset_split.csv
  - reports/split_summary.json
"""

import io
import os
import sys
import csv
import json
import random
from pathlib import Path
from collections import defaultdict

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(WORKSPACE_ROOT))

try:
    import config
    MANIFEST = config.DATASET_MANIFEST_CSV
    DUPLICATES = config.DUPLICATES_CSV
    OUT_MANIFEST = config.DATASET_SPLIT_CSV
    TRAIN_OUT = config.TRAIN_MANIFEST_CSV
    VAL_OUT = config.VAL_MANIFEST_CSV
    TEST_OUT = config.TEST_MANIFEST_CSV
    OUT_SUMMARY = config.SPLIT_SUMMARY_JSON
except ImportError:
    MANIFEST = WORKSPACE_ROOT / "data" / "manifests" / "dataset_manifest.csv"
    DUPLICATES = WORKSPACE_ROOT / "data" / "manifests" / "duplicates.csv"
    OUT_MANIFEST = WORKSPACE_ROOT / "data" / "manifests" / "dataset_split.csv"
    TRAIN_OUT = WORKSPACE_ROOT / "data" / "manifests" / "train_manifest.csv"
    VAL_OUT = WORKSPACE_ROOT / "data" / "manifests" / "validation_manifest.csv"
    TEST_OUT = WORKSPACE_ROOT / "data" / "manifests" / "test_manifest.csv"
    OUT_SUMMARY = WORKSPACE_ROOT / "reports" / "split_summary.json"

TRAIN_RATIO = 0.70
VAL_RATIO = 0.15
TEST_RATIO = 0.15
SEED = 42
NEAR_THRESHOLD = 4


class UnionFind:
    """Minimal union-find for grouping related images."""

    def __init__(self):
        self.parent = {}

    def find(self, item):
        self.parent.setdefault(item, item)
        root = item
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[item] != root:
            self.parent[item], item = root, self.parent[item]
        return root

    def union(self, a, b):
        root_a, root_b = self.find(a), self.find(b)
        if root_a != root_b:
            self.parent[root_b] = root_a


def load_manifest():
    rows = []
    with open(MANIFEST, "r", newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row.get("is_valid", "true").lower() == "true":
                rows.append(row)
    return rows


def load_duplicate_groups():
    pairs = []
    if not DUPLICATES.exists():
        return pairs
    with open(DUPLICATES, "r", newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if int(row.get("hamming_distance") or 0) <= NEAR_THRESHOLD:
                pairs.append((row["path_a"], row["path_b"]))
    return pairs


def main():
    print("=" * 70)
    print("STRATIFIED, LEAKAGE-AWARE TRAIN / VAL / TEST SPLIT (70 / 15 / 15)")
    print("=" * 70)

    if not MANIFEST.exists():
        print(f"[FAIL] Manifest not found: {MANIFEST}")
        return 1

    rows = load_manifest()
    print(f"[OK] Valid images loaded: {len(rows):,}")

    union = UnionFind()
    for row in rows:
        union.find(row["image_path"])

    pairs = load_duplicate_groups()
    for path_a, path_b in pairs:
        if path_a in union.parent and path_b in union.parent:
            union.union(path_a, path_b)
    print(f"[OK] Duplicate/near-duplicate pairs linked: {len(pairs):,}")

    groups = defaultdict(list)
    for row in rows:
        groups[union.find(row["image_path"])].append(row)
    print(f"[OK] Independent connected groups: {len(groups):,}")

    # Stratify by class, keeping entire groups intact
    by_class = defaultdict(list)
    for group in groups.values():
        class_name = group[0]["class_name"]
        by_class[class_name].append(group)

    rng = random.Random(SEED)
    assignments = {}
    split_counts = defaultdict(lambda: defaultdict(int))
    split_rows = {"train": [], "validation": [], "test": []}

    for class_name in sorted(by_class):
        class_groups = by_class[class_name][:]
        rng.shuffle(class_groups)

        total = sum(len(g) for g in class_groups)
        n_train = int(total * TRAIN_RATIO)
        n_val = int(total * VAL_RATIO)

        train_groups, val_groups, test_groups = [], [], []
        running = 0

        for group in class_groups:
            size = len(group)
            if running + size <= n_train:
                train_groups.append(group)
                running += size
            elif running < n_train + n_val:
                val_groups.append(group)
                running += size
            else:
                test_groups.append(group)

        # Backfill if rounding left train short
        for group in test_groups[:]:
            if running < n_train:
                train_groups.append(group)
                test_groups.remove(group)
                running += len(group)

        for name, group_list in (("train", train_groups), ("validation", val_groups), ("test", test_groups)):
            for group in group_list:
                for row in group:
                    assignments[row["image_path"]] = name
                    split_counts[name][class_name] += 1
                    row_with_split = {**row, "split": name}
                    split_rows[name].append(row_with_split)

    for name in ("train", "validation", "test"):
        total = sum(split_counts[name].values())
        pct = (total / len(rows)) * 100
        print(f"[OK] {name:<11}: {total:>6d} images ({pct:.1f}%)")

    # Leakage verification
    group_splits = defaultdict(set)
    for path, split in assignments.items():
        group_splits[union.find(path)].add(split)
    leaked = [g for g, splits in group_splits.items() if len(splits) > 1]
    print(f"[OK] Groups spanning multiple splits: {len(leaked)} (must be 0)")

    # Write combined split manifest
    OUT_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys()) + ["split"]
    with open(OUT_MANIFEST, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, "split": assignments[row["image_path"]]})

    # Write dedicated train, val, and test manifests
    for split_name, target_file in [("train", TRAIN_OUT), ("validation", VAL_OUT), ("test", TEST_OUT)]:
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with open(target_file, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for r in split_rows[split_name]:
                writer.writerow(r)
        print(f"[OK] Dedicated manifest written: {target_file.name} ({len(split_rows[split_name]):,} rows)")

    summary = {
        "seed": SEED,
        "ratios": {"train": TRAIN_RATIO, "validation": VAL_RATIO, "test": TEST_RATIO},
        "near_duplicate_hamming_threshold": NEAR_THRESHOLD,
        "total_images": len(rows),
        "independent_groups": len(groups),
        "linked_pairs": len(pairs),
        "groups_spanning_multiple_splits": len(leaked),
        "per_split_per_class": {k: dict(v) for k, v in split_counts.items()},
        "per_split_totals": {k: sum(v.values()) for k, v in split_counts.items()},
    }
    OUT_SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"\n[OK] Split summary written: {OUT_SUMMARY}")

    if leaked:
        print("\n[FAIL] Data leakage detected: some duplicate groups span splits")
        return 1

    print("\n[PASS] No duplicate group spans more than one split. Zero data leakage verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
