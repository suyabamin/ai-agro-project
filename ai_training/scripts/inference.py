#!/usr/bin/env python3
"""
AgroAI Real Image Inference Service.

Takes a leaf image path and outputs:
  1. Predicted class name
  2. Status: "Healthy", "Diseased", or "Low confidence / uncertain"
  3. Prediction confidence percentage
  4. Predicted class index
  5. Top-3 class probabilities
  6. Structured prediction result suitable for future API integration

Handles low-confidence and out-of-distribution inputs via CONFIDENCE_THRESHOLD.
"""

import io
import os
import sys
import json
import argparse
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from PIL import Image
import torch
import torch.nn as nn
from torchvision import models, transforms

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parent
DEFAULT_MODEL = WORKSPACE_ROOT / "models" / "best_model.pth"
DEFAULT_MAPPING = WORKSPACE_ROOT / "models" / "class_mapping.json"
DEFAULT_CONF_THRESHOLD = 0.60

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def load_classifier(model_path=DEFAULT_MODEL, mapping_path=DEFAULT_MAPPING, device=None):
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    if not Path(model_path).exists():
        raise FileNotFoundError(f"Model checkpoint not found at: {model_path}")

    # Load mapping
    if Path(mapping_path).exists():
        with open(mapping_path, "r", encoding="utf-8") as f:
            mapping_data = json.load(f)
        class_dict = mapping_data.get("mapping", mapping_data)
        healthy_classes = set(mapping_data.get("healthy_classes", []))
    else:
        # Fallback to manifest mapping
        manifest_map = WORKSPACE_ROOT / "data" / "manifests" / "class_mapping.json"
        with open(manifest_map, "r", encoding="utf-8") as f:
            mapping_data = json.load(f)
        class_dict = mapping_data.get("mapping", mapping_data)
        healthy_classes = set(mapping_data.get("healthy_classes", []))

    num_classes = len(class_dict)
    class_names = [class_dict[str(i)] for i in range(num_classes)]

    # Initialize MobileNetV2
    checkpoint = torch.load(model_path, map_location=device, weights_only=False)
    model = models.mobilenet_v2(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_features, num_classes)
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device)
    model.eval()

    transform = transforms.Compose([
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ])

    return model, class_names, healthy_classes, transform, device


def predict_leaf(image_path, model, class_names, healthy_classes, transform, device, threshold=DEFAULT_CONF_THRESHOLD):
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")

    with Image.open(path) as img:
        img = img.convert("RGB")
        tensor = transform(img).unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(tensor)
        probs = torch.softmax(outputs, dim=1).squeeze(0)

    confidence, pred_idx = torch.max(probs, dim=0)
    conf_val = confidence.item()
    pred_idx_val = pred_idx.item()
    pred_class = class_names[pred_idx_val]

    # Top-3 predictions
    top_confs, top_indices = torch.topk(probs, k=min(3, len(class_names)))
    top_3 = [
        {"class": class_names[idx.item()], "confidence": round(conf.item(), 4)}
        for conf, idx in zip(top_confs, top_indices)
    ]

    # Clean display name & crop extraction
    crop, _, condition = pred_class.partition("___")
    if not condition:
        condition = pred_class

    display_name = f"{crop.replace('_', ' ')} - {condition.replace('_', ' ')}".strip()

    # Determine status
    is_healthy = pred_class in healthy_classes or "healthy" in pred_class.lower()
    if conf_val < threshold:
        status = "Low confidence / uncertain"
    elif is_healthy:
        status = "Healthy"
    else:
        status = "Diseased"

    return {
        "predicted_class": pred_class,
        "display_name": display_name,
        "crop": crop.replace("_", " ").strip(),
        "disease_or_condition": condition.replace("_", " ").strip(),
        "confidence": round(conf_val, 4),
        "confidence_percent": f"{conf_val * 100:.2f}%",
        "status": status,
        "class_index": pred_idx_val,
        "top_predictions": top_3,
        "is_low_confidence": conf_val < threshold,
        "threshold": threshold,
    }


def main():
    parser = argparse.ArgumentParser(description="AgroAI Leaf Disease Inference")
    parser.add_argument("--image", required=True, help="Path to leaf image file")
    parser.add_argument("--model", default=str(DEFAULT_MODEL), help="Path to model checkpoint")
    parser.add_argument("--mapping", default=str(DEFAULT_MAPPING), help="Path to class mapping json")
    parser.add_argument("--threshold", type=float, default=DEFAULT_CONF_THRESHOLD, help="Confidence threshold")
    parser.add_argument("--json", action="store_true", help="Output pure JSON")
    args = parser.parse_args()

    model, class_names, healthy_classes, transform, device = load_classifier(
        model_path=args.model,
        mapping_path=args.mapping,
    )

    result = predict_leaf(
        image_path=args.image,
        model=model,
        class_names=class_names,
        healthy_classes=healthy_classes,
        transform=transform,
        device=device,
        threshold=args.threshold,
    )

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("\n" + "=" * 50)
        print("AGROAI LEAF DISEASE INFERENCE RESULT")
        print("=" * 50)
        print(f"Predicted class: {result['display_name']}")
        print(f"Raw class ID   : {result['predicted_class']} (Index {result['class_index']})")
        print(f"Confidence     : {result['confidence_percent']}")
        print(f"Status         : {result['status']}")
        print("\nTop Candidates:")
        for rank, cand in enumerate(result['top_predictions'], 1):
            print(f"  {rank}. {cand['class']} ({cand['confidence']*100:.2f}%)")
        print("=" * 50)

    return 0


if __name__ == "__main__":
    sys.exit(main())
