#!/usr/bin/env python3
"""
Full Model Training Pipeline for AgroAI Plant Disease Detection.

Architecture:
  - MobileNetV2 with ImageNet pretrained backbone
  - Custom classification head: Dropout(0.3) -> Linear(1280, 23)
  - PyTorch standard transforms with data augmentation for training
  - Class-weighted CrossEntropyLoss to address class imbalance

Two-Stage Transfer Learning Strategy:
  - Stage 1: Feature Extraction (Backbone frozen, train classification head)
  - Stage 2: Fine-Tuning (Upper backbone layers unfrozen, lower layers frozen, small lr)

Outputs:
  - models/best_model.pth (Best checkpoint based on validation F1/accuracy)
  - models/last_checkpoint.pth (Last epoch state)
  - models/class_mapping.json (Deterministic mapping)
  - models/model_metadata.json (Training metadata)
  - outputs/training_history.csv & training_history.json
  - outputs/plots/loss_curve.png, accuracy_curve.png, f1_curve.png
"""

import io
import os
import sys
import csv
import json
import time
import random
import argparse
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter

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

try:
    import config
except ImportError:
    config = None


def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    os.environ["PYTHONHASHSEED"] = str(seed)


class PlantLeafDataset(Dataset):
    """Dataset backed by manifest CSV rows."""

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
                if self.transform:
                    tensor = self.transform(img)
                else:
                    tensor = transforms.ToTensor()(img)
        except Exception:
            # Fallback zero tensor if image reading fails
            tensor = torch.zeros(3, 224, 224)

        return tensor, class_id


def build_transforms(train=True, image_size=224):
    mean = [0.485, 0.456, 0.406]
    std = [0.229, 0.224, 0.225]

    if train:
        return transforms.Compose([
            transforms.RandomResizedCrop(image_size, scale=(0.85, 1.0)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomVerticalFlip(p=0.2),
            transforms.RandomRotation(degrees=15),
            transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15, hue=0.05),
            transforms.ToTensor(),
            transforms.Normalize(mean=mean, std=std),
        ])
    else:
        return transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(image_size),
            transforms.ToTensor(),
            transforms.Normalize(mean=mean, std=std),
        ])


def build_mobilenet_v2(num_classes=23, pretrained=True):
    """Construct MobileNetV2 with custom classification head."""
    weights = models.MobileNet_V2_Weights.DEFAULT if pretrained else None
    model = models.mobilenet_v2(weights=weights)

    # Replace classifier head
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_features, num_classes)
    )
    return model


def freeze_backbone(model):
    """Stage 1: Freeze entire feature extractor backbone."""
    for param in model.features.parameters():
        param.requires_grad = False
    for param in model.classifier.parameters():
        param.requires_grad = True


def unfreeze_upper_backbone(model, start_feature_layer=14):
    """
    Stage 2: Unfreeze upper feature layers for fine-tuning.
    MobileNetV2 has 19 feature blocks (0 to 18).
    Freezing layers 0-13 preserves low-level edges/textures.
    Unfreezing layers 14-18 adapts high-level disease visual patterns.
    """
    for idx, layer in enumerate(model.features):
        requires_grad = idx >= start_feature_layer
        for param in layer.parameters():
            param.requires_grad = requires_grad
    for param in model.classifier.parameters():
        param.requires_grad = True


def compute_metrics(targets, preds, num_classes):
    """Compute Accuracy, Macro Precision, Macro Recall, Macro F1, Weighted F1."""
    total = len(targets)
    if total == 0:
        return {"accuracy": 0.0, "macro_f1": 0.0, "macro_precision": 0.0, "macro_recall": 0.0, "weighted_f1": 0.0}

    correct = sum(1 for t, p in zip(targets, preds) if t == p)
    accuracy = correct / total

    precisions = []
    recalls = []
    f1s = []
    supports = []

    for c in range(num_classes):
        tp = sum(1 for t, p in zip(targets, preds) if t == c and p == c)
        fp = sum(1 for t, p in zip(targets, preds) if t != c and p == c)
        fn = sum(1 for t, p in zip(targets, preds) if t == c and p != c)
        support = sum(1 for t in targets if t == c)
        supports.append(support)

        p = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        r = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * p * r) / (p + r) if (p + r) > 0 else 0.0

        precisions.append(p)
        recalls.append(r)
        f1s.append(f1)

    macro_p = sum(precisions) / max(len(precisions), 1)
    macro_r = sum(recalls) / max(len(recalls), 1)
    macro_f1 = sum(f1s) / max(len(f1s), 1)

    total_support = sum(supports)
    weighted_f1 = sum(f * s for f, s in zip(f1s, supports)) / max(total_support, 1)

    return {
        "accuracy": accuracy,
        "macro_precision": macro_p,
        "macro_recall": macro_r,
        "macro_f1": macro_f1,
        "weighted_f1": weighted_f1,
    }


def run_epoch(model, loader, criterion, device, optimizer=None):
    is_train = optimizer is not None
    model.train() if is_train else model.eval()

    total_loss = 0.0
    all_preds = []
    all_targets = []

    context = torch.enable_grad() if is_train else torch.no_grad()
    with context:
        for images, targets in loader:
            images = images.to(device, non_blocking=True)
            targets = targets.to(device, non_blocking=True)

            if is_train:
                optimizer.zero_grad(set_to_none=True)

            outputs = model(images)
            loss = criterion(outputs, targets)

            if is_train:
                loss.backward()
                optimizer.step()

            batch_size = targets.size(0)
            total_loss += loss.item() * batch_size
            preds = outputs.argmax(dim=1)

            all_preds.extend(preds.detach().cpu().tolist())
            all_targets.extend(targets.detach().cpu().tolist())

    avg_loss = total_loss / max(len(all_targets), 1)
    return avg_loss, all_targets, all_preds


def plot_curves(history, output_dir):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        epochs = [r["epoch"] for r in history]
        train_loss = [r["train_loss"] for r in history]
        val_loss = [r["val_loss"] for r in history]
        train_acc = [r["train_accuracy"] * 100 for r in history]
        val_acc = [r["val_accuracy"] * 100 for r in history]
        val_f1 = [r["val_f1"] for r in history]

        # 1. Loss curve
        plt.figure(figsize=(8, 5))
        plt.plot(epochs, train_loss, "b-o", label="Train Loss")
        plt.plot(epochs, val_loss, "r-s", label="Val Loss")
        plt.title("AgroAI MobileNetV2 - Loss Curve")
        plt.xlabel("Epoch")
        plt.ylabel("Loss")
        plt.legend()
        plt.grid(True, linestyle="--", alpha=0.6)
        plt.tight_layout()
        plt.savefig(output_dir / "loss_curve.png", dpi=150)
        plt.close()

        # 2. Accuracy curve
        plt.figure(figsize=(8, 5))
        plt.plot(epochs, train_acc, "b-o", label="Train Accuracy (%)")
        plt.plot(epochs, val_acc, "g-s", label="Val Accuracy (%)")
        plt.title("AgroAI MobileNetV2 - Accuracy Curve")
        plt.xlabel("Epoch")
        plt.ylabel("Accuracy (%)")
        plt.legend()
        plt.grid(True, linestyle="--", alpha=0.6)
        plt.tight_layout()
        plt.savefig(output_dir / "accuracy_curve.png", dpi=150)
        plt.close()

        # 3. F1 curve
        plt.figure(figsize=(8, 5))
        plt.plot(epochs, val_f1, "m-^", label="Validation Macro F1")
        plt.title("AgroAI MobileNetV2 - Validation F1 Score Curve")
        plt.xlabel("Epoch")
        plt.ylabel("Macro F1")
        plt.legend()
        plt.grid(True, linestyle="--", alpha=0.6)
        plt.tight_layout()
        plt.savefig(output_dir / "f1_curve.png", dpi=150)
        plt.close()

        print(f"[OK] Training curves saved to {output_dir}")
    except Exception as exc:
        print(f"[WARN] Failed to plot curves: {exc}")


def load_manifest_split(path):
    records = []
    with open(path, "r", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            records.append(r)
    return records


def stratified_subsample(rows, max_samples, seed=42):
    """Subsample preserving the class distribution."""
    by_class = Counter(r["class_id"] for r in rows)
    total = len(rows)
    rng = random.Random(seed)
    selected = []
    
    # Group rows by class
    from collections import defaultdict
    class_groups = defaultdict(list)
    for r in rows:
        class_groups[r["class_id"]].append(r)
        
    for cid, items in class_groups.items():
        rng.shuffle(items)
        quota = max(1, int(len(items) / total * max_samples))
        selected.extend(items[:quota])
        
    rng.shuffle(selected)
    return selected[:max_samples]


def main():
    parser = argparse.ArgumentParser(description="Train MobileNetV2 Plant Disease Classifier")
    parser.add_argument("--train-manifest", default=str(WORKSPACE_ROOT / "data" / "manifests" / "train_manifest.csv"))
    parser.add_argument("--val-manifest", default=str(WORKSPACE_ROOT / "data" / "manifests" / "validation_manifest.csv"))
    parser.add_argument("--class-mapping", default=str(WORKSPACE_ROOT / "data" / "manifests" / "class_mapping.json"))
    parser.add_argument("--output-dir", default=str(WORKSPACE_ROOT / "models"))
    parser.add_argument("--plots-dir", default=str(WORKSPACE_ROOT / "outputs" / "plots"))
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--stage1-epochs", type=int, default=2)
    parser.add_argument("--stage2-epochs", type=int, default=2)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--fine-tune-lr", type=float, default=1e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--workers", type=int, default=0 if os.name == "nt" else 4)
    parser.add_argument("--patience", type=int, default=3)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-train-samples", type=int, default=None, help="Optional subset limit for fast validation")
    parser.add_argument("--max-val-samples", type=int, default=None)
    args = parser.parse_args()

    set_seed(args.seed)

    print("=" * 70)
    print("AGROAI MOBILENETV2 TWO-STAGE TRANSFER LEARNING")
    print("=" * 70)

    train_rows = load_manifest_split(args.train_manifest)
    val_rows = load_manifest_split(args.val_manifest)

    if args.max_train_samples and args.max_train_samples < len(train_rows):
        train_rows = stratified_subsample(train_rows, args.max_train_samples, args.seed)
        print(f"[INFO] Stratified subsample training set to {len(train_rows):,} samples")

    if args.max_val_samples and args.max_val_samples < len(val_rows):
        val_rows = stratified_subsample(val_rows, args.max_val_samples, args.seed)
        print(f"[INFO] Stratified subsample validation set to {len(val_rows):,} samples")

    print(f"Train samples     : {len(train_rows):,}")
    print(f"Validation samples: {len(val_rows):,}")

    with open(args.class_mapping, "r", encoding="utf-8") as f:
        mapping_data = json.load(f)

    class_dict = mapping_data.get("mapping", mapping_data)
    num_classes = len(class_dict)
    class_names = [class_dict[str(i)] for i in range(num_classes)]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device            : {device} ({torch.cuda.get_device_name(0) if device.type == 'cuda' else 'CPU'})")
    print(f"Classes           : {num_classes}")
    print(f"Batch Size        : {args.batch_size}")
    print(f"Stage 1 Epochs    : {args.stage1_epochs} (Head only, lr={args.lr})")
    print(f"Stage 2 Epochs    : {args.stage2_epochs} (Upper backbone, lr={args.fine_tune_lr})")

    # Class-weighted loss calculation
    train_class_counts = Counter(int(r["class_id"]) for r in train_rows)
    class_weights = torch.tensor(
        [len(train_rows) / (num_classes * max(train_class_counts.get(i, 1), 1)) for i in range(num_classes)],
        dtype=torch.float32,
    ).to(device)

    print(f"Class weight range: {class_weights.min().item():.2f} .. {class_weights.max().item():.2f}")

    train_dataset = PlantLeafDataset(train_rows, transform=build_transforms(train=True))
    val_dataset = PlantLeafDataset(val_rows, transform=build_transforms(train=False))

    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=(device.type == "cuda"),
        drop_last=True,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.workers,
        pin_memory=(device.type == "cuda"),
    )

    # Initialize MobileNetV2
    model = build_mobilenet_v2(num_classes=num_classes, pretrained=True).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    best_model_path = out_dir / "best_model.pth"
    last_model_path = out_dir / "last_checkpoint.pth"

    total_epochs = args.stage1_epochs + args.stage2_epochs
    history_records = []
    best_metric = -1.0
    best_epoch = 0
    patience_counter = 0

    print("\n" + "=" * 70)
    print("STAGE 1: FEATURE EXTRACTION (FREEZING BACKBONE)")
    print("=" * 70)
    freeze_backbone(model)
    trainable_p = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_p = sum(p.numel() for p in model.parameters())
    print(f"Trainable parameters: {trainable_p:,} / {total_p:,}")

    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad],
        lr=args.lr,
        weight_decay=args.weight_decay,
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(args.stage1_epochs, 1))

    current_epoch = 0

    for ep in range(1, args.stage1_epochs + 1):
        current_epoch += 1
        t0 = time.time()
        lr_now = optimizer.param_groups[0]["lr"]

        train_loss, train_targs, train_preds = run_epoch(model, train_loader, criterion, device, optimizer)
        val_loss, val_targs, val_preds = run_epoch(model, val_loader, criterion, device)
        scheduler.step()

        train_metrics = compute_metrics(train_targs, train_preds, num_classes)
        val_metrics = compute_metrics(val_targs, val_preds, num_classes)
        elapsed = time.time() - t0

        improved = val_metrics["macro_f1"] > best_metric
        marker = "[BEST]" if improved else "      "

        if improved:
            best_metric = val_metrics["macro_f1"]
            best_epoch = current_epoch
            patience_counter = 0
            torch.save({
                "model_state_dict": model.state_dict(),
                "class_to_index": {class_names[i]: i for i in range(num_classes)},
                "index_to_class": {str(i): class_names[i] for i in range(num_classes)},
                "num_classes": num_classes,
                "image_size": 224,
                "normalization_mean": [0.485, 0.456, 0.406],
                "normalization_std": [0.229, 0.224, 0.225],
                "model_name": "MobileNetV2",
                "best_epoch": best_epoch,
                "best_val_f1": best_metric,
                "best_val_accuracy": val_metrics["accuracy"],
                "training_config": {
                    "stage1_epochs": args.stage1_epochs,
                    "stage2_epochs": args.stage2_epochs,
                    "batch_size": args.batch_size,
                    "seed": args.seed,
                }
            }, best_model_path)

        rec = {
            "epoch": current_epoch,
            "stage": 1,
            "train_loss": round(train_loss, 4),
            "train_accuracy": round(train_metrics["accuracy"], 4),
            "train_f1": round(train_metrics["macro_f1"], 4),
            "val_loss": round(val_loss, 4),
            "val_accuracy": round(val_metrics["accuracy"], 4),
            "val_precision": round(val_metrics["macro_precision"], 4),
            "val_recall": round(val_metrics["macro_recall"], 4),
            "val_f1": round(val_metrics["macro_f1"], 4),
            "learning_rate": lr_now,
            "duration_sec": round(elapsed, 1),
        }
        history_records.append(rec)

        print(
            f"{marker} Epoch {current_epoch:>2}/{total_epochs} (Stage 1) - "
            f"Train Loss: {train_loss:.4f}, Acc: {train_metrics['accuracy']*100:5.2f}% | "
            f"Val Loss: {val_loss:.4f}, Acc: {val_metrics['accuracy']*100:5.2f}%, F1: {val_metrics['macro_f1']:.4f} | "
            f"Time: {elapsed:.1f}s"
        )

    if args.stage2_epochs > 0:
        print("\n" + "=" * 70)
        print("STAGE 2: FINE-TUNING (UNFREEZING UPPER BACKBONE LAYERS 14-18)")
        print("=" * 70)
        unfreeze_upper_backbone(model, start_feature_layer=14)
        trainable_p = sum(p.numel() for p in model.parameters() if p.requires_grad)
        print(f"Trainable parameters: {trainable_p:,} / {total_p:,}")

        optimizer = torch.optim.AdamW(
            [p for p in model.parameters() if p.requires_grad],
            lr=args.fine_tune_lr,
            weight_decay=args.weight_decay,
        )
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(args.stage2_epochs, 1))

        for ep in range(1, args.stage2_epochs + 1):
            current_epoch += 1
            t0 = time.time()
            lr_now = optimizer.param_groups[0]["lr"]

            train_loss, train_targs, train_preds = run_epoch(model, train_loader, criterion, device, optimizer)
            val_loss, val_targs, val_preds = run_epoch(model, val_loader, criterion, device)
            scheduler.step()

            train_metrics = compute_metrics(train_targs, train_preds, num_classes)
            val_metrics = compute_metrics(val_targs, val_preds, num_classes)
            elapsed = time.time() - t0

            improved = val_metrics["macro_f1"] > best_metric
            marker = "[BEST]" if improved else "      "

            if improved:
                best_metric = val_metrics["macro_f1"]
                best_epoch = current_epoch
                patience_counter = 0
                torch.save({
                    "model_state_dict": model.state_dict(),
                    "class_to_index": {class_names[i]: i for i in range(num_classes)},
                    "index_to_class": {str(i): class_names[i] for i in range(num_classes)},
                    "num_classes": num_classes,
                    "image_size": 224,
                    "normalization_mean": [0.485, 0.456, 0.406],
                    "normalization_std": [0.229, 0.224, 0.225],
                    "model_name": "MobileNetV2",
                    "best_epoch": best_epoch,
                    "best_val_f1": best_metric,
                    "best_val_accuracy": val_metrics["accuracy"],
                    "training_config": {
                        "stage1_epochs": args.stage1_epochs,
                        "stage2_epochs": args.stage2_epochs,
                        "batch_size": args.batch_size,
                        "seed": args.seed,
                    }
                }, best_model_path)
            else:
                patience_counter += 1

            rec = {
                "epoch": current_epoch,
                "stage": 2,
                "train_loss": round(train_loss, 4),
                "train_accuracy": round(train_metrics["accuracy"], 4),
                "train_f1": round(train_metrics["macro_f1"], 4),
                "val_loss": round(val_loss, 4),
                "val_accuracy": round(val_metrics["accuracy"], 4),
                "val_precision": round(val_metrics["macro_precision"], 4),
                "val_recall": round(val_metrics["macro_recall"], 4),
                "val_f1": round(val_metrics["macro_f1"], 4),
                "learning_rate": lr_now,
                "duration_sec": round(elapsed, 1),
            }
            history_records.append(rec)

            print(
                f"{marker} Epoch {current_epoch:>2}/{total_epochs} (Stage 2) - "
                f"Train Loss: {train_loss:.4f}, Acc: {train_metrics['accuracy']*100:5.2f}% | "
                f"Val Loss: {val_loss:.4f}, Acc: {val_metrics['accuracy']*100:5.2f}%, F1: {val_metrics['macro_f1']:.4f} | "
                f"Time: {elapsed:.1f}s"
            )

            if args.patience > 0 and patience_counter >= args.patience:
                print(f"[INFO] Early stopping triggered: no improvement for {args.patience} epochs.")
                break

    # Save last checkpoint
    torch.save({
        "model_state_dict": model.state_dict(),
        "epoch": current_epoch,
        "class_to_index": {class_names[i]: i for i in range(num_classes)},
        "index_to_class": {str(i): class_names[i] for i in range(num_classes)},
        "num_classes": num_classes,
        "image_size": 224,
    }, last_model_path)

    # Save metadata & mapping in models/
    with open(out_dir / "class_mapping.json", "w", encoding="utf-8") as f:
        json.dump({
            "num_classes": num_classes,
            "mapping": {str(i): class_names[i] for i in range(num_classes)},
            "class_to_index": {class_names[i]: i for i in range(num_classes)},
            "healthy_classes": [c for c in class_names if "healthy" in c.lower()],
            "disease_classes": [c for c in class_names if "healthy" not in c.lower()],
        }, f, indent=2)

    metadata = {
        "model_name": "MobileNetV2",
        "version": "1.0.0",
        "num_classes": num_classes,
        "image_size": [224, 224],
        "normalization": {"mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]},
        "framework": "PyTorch",
        "torch_version": torch.__version__,
        "dataset": "karagwaanntreasure/plant-disease-detection",
        "dataset_url": "https://www.kaggle.com/datasets/karagwaanntreasure/plant-disease-detection",
        "device": str(device),
        "best_epoch": best_epoch,
        "best_val_f1": best_metric,
        "total_epochs_trained": len(history_records),
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    with open(out_dir / "model_metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    # Save training history CSV & JSON
    history_csv_path = WORKSPACE_ROOT / "outputs" / "training_history.csv"
    history_json_path = WORKSPACE_ROOT / "outputs" / "training_history.json"
    history_csv_path.parent.mkdir(parents=True, exist_ok=True)

    with open(history_csv_path, "w", newline="", encoding="utf-8") as f:
        if history_records:
            writer = csv.DictWriter(f, fieldnames=list(history_records[0].keys()))
            writer.writeheader()
            for r in history_records:
                writer.writerow(r)

    with open(history_json_path, "w", encoding="utf-8") as f:
        json.dump({"history": history_records, "metadata": metadata}, f, indent=2)

    # Generate training curves
    plot_curves(history_records, args.plots_dir)

    print("\n" + "=" * 70)
    print("TRAINING COMPLETE")
    print("=" * 70)
    print(f"[OK] Best Checkpoint : {best_model_path}")
    print(f"[OK] Last Checkpoint : {last_model_path}")
    print(f"[OK] Class Mapping   : {out_dir / 'class_mapping.json'}")
    print(f"[OK] Model Metadata  : {out_dir / 'model_metadata.json'}")
    print(f"[OK] History CSV     : {history_csv_path}")
    print(f"[OK] History JSON    : {history_json_path}")
    print(f"[OK] Best Val F1     : {best_metric:.4f} (Epoch {best_epoch})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
