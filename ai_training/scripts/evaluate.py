#!/usr/bin/env python3
"""
Held-Out Test Set Evaluation for AgroAI MobileNetV2.

Evaluates the best checkpoint exclusively on the held-out test set.
Computes:
  - Overall Accuracy
  - Macro Precision, Macro Recall, Macro F1, Weighted F1
  - Per-Class Metrics (precision, recall, f1, support)
  - Confusion Matrix (plot and numerical)
  - Individual Test Predictions

Outputs:
  - outputs/per_class_metrics.csv
  - outputs/test_predictions.csv
  - outputs/plots/confusion_matrix.png
  - reports/evaluation_report.md
  - reports/evaluation_report.json
"""

import io
import os
import sys
import csv
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import numpy as np
from PIL import Image
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(WORKSPACE_ROOT))


class TestLeafDataset(Dataset):
    def __init__(self, records, transform=None):
        self.records = records
        self.transform = transform

    def __len__(self):
        return len(self.records)

    def __getitem__(self, index):
        row = self.records[index]
        image_path = row["image_path"]
        class_id = int(row["class_id"])

        try:
            with Image.open(image_path) as img:
                img = img.convert("RGB")
                tensor = self.transform(img) if self.transform else transforms.ToTensor()(img)
        except Exception:
            tensor = torch.zeros(3, 224, 224)

        return tensor, class_id, image_path, row.get("class_name", "")


def load_model(checkpoint_path, num_classes, device):
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model = models.mobilenet_v2(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_features, num_classes)
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()
    return model, checkpoint


def main():
    parser = argparse.ArgumentParser(description="Evaluate best model on held-out test set")
    parser.add_argument("--model-path", default=str(WORKSPACE_ROOT / "models" / "best_model.pth"))
    parser.add_argument("--test-manifest", default=str(WORKSPACE_ROOT / "data" / "manifests" / "test_manifest.csv"))
    parser.add_argument("--class-mapping", default=str(WORKSPACE_ROOT / "data" / "manifests" / "class_mapping.json"))
    parser.add_argument("--output-dir", default=str(WORKSPACE_ROOT / "outputs"))
    parser.add_argument("--reports-dir", default=str(WORKSPACE_ROOT / "reports"))
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--max-samples", type=int, default=None)
    args = parser.parse_args()

    print("=" * 70)
    print("HELD-OUT TEST SET EVALUATION")
    print("=" * 70)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # Load class mapping
    with open(args.class_mapping, "r", encoding="utf-8") as f:
        mapping_data = json.load(f)
    class_dict = mapping_data.get("mapping", mapping_data)
    num_classes = len(class_dict)
    class_names = [class_dict[str(i)] for i in range(num_classes)]

    # Load model
    print(f"Loading checkpoint: {args.model_path}")
    model, checkpoint = load_model(args.model_path, num_classes, device)

    # Load test manifest
    records = []
    with open(args.test_manifest, "r", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            records.append(r)

    if args.max_samples and args.max_samples < len(records):
        records = records[:args.max_samples]

    print(f"Test samples to evaluate: {len(records):,}")

    test_transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    test_loader = DataLoader(
        TestLeafDataset(records, transform=test_transform),
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=0 if os.name == "nt" else 2,
    )

    all_preds = []
    all_targets = []
    all_confidences = []
    all_paths = []
    all_actual_names = []

    print("Running inference across test set...")
    with torch.no_grad():
        for images, targets, paths, actual_names in test_loader:
            images = images.to(device)
            outputs = model(images)
            probs = torch.softmax(outputs, dim=1)
            confs, preds = torch.max(probs, dim=1)

            all_preds.extend(preds.cpu().tolist())
            all_targets.extend(targets.cpu().tolist())
            all_confidences.extend(confs.cpu().tolist())
            all_paths.extend(paths)
            all_actual_names.extend(actual_names)

    total_test = len(all_targets)
    correct_count = sum(1 for t, p in zip(all_targets, all_preds) if t == p)
    accuracy = correct_count / max(total_test, 1)

    # Per-class metrics
    per_class = []
    precisions, recalls, f1s, supports = [], [], [], []

    for c in range(num_classes):
        cname = class_names[c]
        tp = sum(1 for t, p in zip(all_targets, all_preds) if t == c and p == c)
        fp = sum(1 for t, p in zip(all_targets, all_preds) if t != c and p == c)
        fn = sum(1 for t, p in zip(all_targets, all_preds) if t == c and p != c)
        support = sum(1 for t in all_targets if t == c)

        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        precisions.append(prec)
        recalls.append(rec)
        f1s.append(f1)
        supports.append(support)

        per_class.append({
            "class": cname,
            "support": support,
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
        })

    macro_precision = sum(precisions) / max(len(precisions), 1)
    macro_recall = sum(recalls) / max(len(recalls), 1)
    macro_f1 = sum(f1s) / max(len(f1s), 1)
    total_support = sum(supports)
    weighted_f1 = sum(f * s for f, s in zip(f1s, supports)) / max(total_support, 1)

    print("\n" + "=" * 70)
    print("TEST EVALUATION RESULTS")
    print("=" * 70)
    print(f"Overall Accuracy : {accuracy * 100:.2f}% ({correct_count}/{total_test})")
    print(f"Macro Precision  : {macro_precision:.4f}")
    print(f"Macro Recall     : {macro_recall:.4f}")
    print(f"Macro F1 Score   : {macro_f1:.4f}")
    print(f"Weighted F1 Score: {weighted_f1:.4f}")

    # Output directories
    out_dir = Path(args.output_dir)
    plots_dir = out_dir / "plots"
    reports_dir = Path(args.reports_dir)
    plots_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    # 1. Save per_class_metrics.csv
    per_class_csv = out_dir / "per_class_metrics.csv"
    with open(per_class_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["class", "support", "precision", "recall", "f1"])
        writer.writeheader()
        for r in per_class:
            writer.writerow(r)
    print(f"[OK] Per-class metrics saved: {per_class_csv}")

    # 2. Save test_predictions.csv
    test_pred_csv = out_dir / "test_predictions.csv"
    with open(test_pred_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["image_path", "actual_class", "predicted_class", "confidence", "correct"])
        writer.writeheader()
        for p, a, pred_idx, conf in zip(all_paths, all_actual_names, all_preds, all_confidences):
            pred_name = class_names[pred_idx]
            writer.writerow({
                "image_path": p,
                "actual_class": a,
                "predicted_class": pred_name,
                "confidence": round(conf, 4),
                "correct": 1 if a == pred_name else 0,
            })
    print(f"[OK] Test predictions saved : {test_pred_csv}")

    # 3. Compute and plot confusion matrix
    confusion_matrix = [[0] * num_classes for _ in range(num_classes)]
    for t, p in zip(all_targets, all_preds):
        confusion_matrix[t][p] += 1

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        matrix_np = np.array(confusion_matrix)
        plt.figure(figsize=(14, 12))
        plt.imshow(matrix_np, interpolation="nearest", cmap="Blues")
        plt.title("AgroAI MobileNetV2 - Test Set Confusion Matrix", fontsize=14)
        plt.colorbar(fraction=0.046, pad=0.04)
        tick_marks = np.arange(num_classes)
        plt.xticks(tick_marks, class_names, rotation=90, fontsize=7)
        plt.yticks(tick_marks, class_names, fontsize=7)
        plt.xlabel("Predicted Label", fontsize=11)
        plt.ylabel("True Label", fontsize=11)
        plt.tight_layout()
        conf_plot = plots_dir / "confusion_matrix.png"
        plt.savefig(conf_plot, dpi=150)
        plt.close()
        print(f"[OK] Confusion matrix plot  : {conf_plot}")
    except Exception as exc:
        print(f"[WARN] Failed to plot confusion matrix: {exc}")

    # 4. Save evaluation report JSON
    eval_json = reports_dir / "evaluation_report.json"
    eval_summary = {
        "model_name": "MobileNetV2",
        "evaluated_at_utc": datetime.now(timezone.utc).isoformat(),
        "total_test_samples": total_test,
        "correct_predictions": correct_count,
        "test_accuracy": round(accuracy, 4),
        "macro_precision": round(macro_precision, 4),
        "macro_recall": round(macro_recall, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "per_class": per_class,
        "confusion_matrix": confusion_matrix,
        "class_names": class_names,
    }
    with open(eval_json, "w", encoding="utf-8") as f:
        json.dump(eval_summary, f, indent=2)

    # 5. Save evaluation report MD
    eval_md = reports_dir / "evaluation_report.md"
    md_content = f"""# AgroAI MobileNetV2 - Model Evaluation Report

**Evaluation Date**: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}  
**Model Checkpoint**: `{args.model_path}`  
**Test Set Size**: {total_test:,} images across {num_classes} classes  

---

## 1. Overall Test Set Performance

| Metric | Score | Note |
| :--- | :--- | :--- |
| **Accuracy** | **{accuracy * 100:.2f}%** | {correct_count}/{total_test} correct classifications |
| **Macro Precision** | **{macro_precision:.4f}** | Unweighted average across all 23 classes |
| **Macro Recall** | **{macro_recall:.4f}** | Unweighted average sensitivity across classes |
| **Macro F1 Score** | **{macro_f1:.4f}** | Harmonic mean of macro precision and recall |
| **Weighted F1 Score** | **{weighted_f1:.4f}** | Support-weighted F1 reflecting dataset distribution |

---

## 2. Per-Class Metrics

| Class Name | Support | Precision | Recall | F1 Score |
| :--- | :---: | :---: | :---: | :---: |
"""
    for r in per_class:
        md_content += f"| `{r['class']}` | {r['support']} | {r['precision']:.4f} | {r['recall']:.4f} | {r['f1']:.4f} |\n"

    md_content += f"""
---

## 3. Artifacts Generated

- **Confusion Matrix Plot**: `outputs/plots/confusion_matrix.png`
- **Per-Class Metrics CSV**: `outputs/per_class_metrics.csv`
- **Itemized Predictions CSV**: `outputs/test_predictions.csv`
- **Evaluation Summary JSON**: `reports/evaluation_report.json`
"""
    with open(eval_md, "w", encoding="utf-8") as f:
        f.write(md_content)

    print(f"[OK] Evaluation report saved : {eval_md}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
