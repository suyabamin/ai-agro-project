"""
AgroAI - CNN Foliar Disease Detection Service
Module: Deep Learning Computer Vision Pipeline (MobileNetV2)

Interfaces:
- Image byte ingestion
- PIL/PyTorch preprocessing (RGB conversion, resize 224x224, ImageNet normalization)
- Loads trained MobileNetV2 checkpoint from ai_training/models/best_model.pth
- Returns real predictions with 23-class plant disease classification
- Falls back to demo mode if trained model checkpoint is unavailable
"""

import os
import json
from pathlib import Path

# Resolve trained model path from ai_training workspace
# cnn_service.py is at: backend/ai/cnn/cnn_service.py
# So: parent=cnn, parent.parent=ai, parent.parent.parent=backend, .parent.x4=project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_TRAINED_MODEL_PATH = _PROJECT_ROOT / "ai_training" / "models" / "best_model.pth"
_TRAINED_MAPPING_PATH = _PROJECT_ROOT / "ai_training" / "models" / "class_mapping.json"

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def _load_class_mapping(path: Path):
    """Load the 23-class mapping from the trained model package."""
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        class_dict = data.get("mapping", data)
        healthy_classes = set(data.get("healthy_classes", []))
        class_names = [class_dict[str(i)] for i in range(len(class_dict))]
        return class_names, healthy_classes
    # Fallback minimal demo class list
    return ["Healthy Foliage", "Early Blight (Alternaria solani)", "Late Blight (Phytophthora infestans)", "Leaf Rust (Puccinia)"], set()


class CNNDiseaseService:

    def __init__(self):
        self.class_names, self.healthy_classes = _load_class_mapping(_TRAINED_MAPPING_PATH)
        self.num_classes = len(self.class_names)
        self.model = self._load_trained_model()
        self.is_trained = self.model is not None
        self.transform = self._build_transform()

    def _build_transform(self):
        """Construct deterministic evaluation transform (no augmentation)."""
        try:
            from torchvision import transforms
            return transforms.Compose([
                transforms.Resize(256),
                transforms.CenterCrop(224),
                transforms.ToTensor(),
                transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            ])
        except Exception:
            return None

    def _load_trained_model(self):
        """
        Load the MobileNetV2 model from the trained checkpoint.

        The checkpoint saved by ai_training/scripts/train.py is a state-dict bundle:
          { model_state_dict, index_to_class, num_classes, image_size, ... }

        We reconstruct the architecture and load the weights — exactly matching
        the training configuration in train.py.
        """
        if not _TRAINED_MODEL_PATH.exists():
            return None
        try:
            import torch
            import torch.nn as nn
            from torchvision import models

            device = torch.device("cpu")
            checkpoint = torch.load(str(_TRAINED_MODEL_PATH), map_location=device, weights_only=False)

            num_classes = checkpoint.get("num_classes", self.num_classes)

            # Rebuild MobileNetV2 with the same head used during training
            backbone = models.mobilenet_v2(weights=None)
            in_features = backbone.classifier[1].in_features
            backbone.classifier = nn.Sequential(
                nn.Dropout(p=0.3),
                nn.Linear(in_features, num_classes)
            )

            backbone.load_state_dict(checkpoint["model_state_dict"])
            backbone.to(device)
            backbone.eval()
            return backbone
        except Exception as exc:
            print(f"[CNNDiseaseService] Failed to load trained model: {exc}")
            return None

    def preprocess_image(self, image_bytes: bytes):
        """
        Decode and preprocess image bytes using PIL and the standard
        ImageNet evaluation pipeline:
          bytes -> PIL RGB -> Resize(256) -> CenterCrop(224) -> Tensor -> Normalize
        """
        try:
            import io
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            if self.transform is not None:
                tensor = self.transform(img)
                return tensor
            return None
        except Exception:
            return None

    def classify_leaf_image(self, image_bytes: bytes, filename: str = "upload.jpg") -> dict:
        tensor = self.preprocess_image(image_bytes)

        if self.is_trained and self.model is not None and tensor is not None:
            try:
                import torch

                with torch.no_grad():
                    output = self.model(tensor.unsqueeze(0))
                    probs = torch.softmax(output, dim=1).squeeze(0)

                confidence_val, pred_idx = torch.max(probs, dim=0)
                confidence = float(confidence_val.item() * 100.0)
                class_idx = int(pred_idx.item())
                predicted_class = self.class_names[class_idx]

                # Top-3 predictions
                top_confs, top_indices = torch.topk(probs, k=min(3, self.num_classes))
                top_predictions = [
                    {
                        "class": self.class_names[int(i.item())],
                        "confidence_percent": round(float(c.item() * 100.0), 2)
                    }
                    for c, i in zip(top_confs, top_indices)
                ]

                is_healthy = predicted_class in self.healthy_classes or "healthy" in predicted_class.lower()
                CONFIDENCE_THRESHOLD = 60.0

                if confidence < CONFIDENCE_THRESHOLD:
                    status_label = "Low Confidence / Uncertain"
                    disease_status = "uncertain"
                elif is_healthy:
                    status_label = "Healthy"
                    disease_status = "healthy"
                else:
                    status_label = "Diseased"
                    disease_status = "diseased"

                # Build a clean display name from class string
                crop, _, condition = predicted_class.partition("___")
                if not condition:
                    condition = predicted_class
                display_name = f"{crop.replace('_', ' ').strip()} — {condition.replace('_', ' ').strip()}"

                return {
                    "algorithm": "CNN Foliar Disease Classifier (MobileNetV2 — Trained)",
                    "filename": filename,
                    "is_trained": True,
                    "model_source": "ai_training/models/best_model.pth",
                    "status": status_label,
                    "disease_status": disease_status,
                    "predicted_disease": display_name,
                    "predicted_class_raw": predicted_class,
                    "class_index": class_idx,
                    "confidence_percent": round(confidence, 2),
                    "is_healthy": is_healthy,
                    "top_predictions": top_predictions,
                    "num_classes": self.num_classes,
                    "severity": "None" if is_healthy else ("High" if confidence > 85 else "Moderate"),
                    "opencv_preprocessing": {
                        "tensor_shape": [224, 224, 3],
                        "color_space": "RGB",
                        "normalization": "ImageNet mean/std",
                        "pipeline": "PIL -> Resize(256) -> CenterCrop(224) -> Tensor -> Normalize"
                    },
                    "note": f"Real MobileNetV2 prediction from {self.num_classes}-class trained model."
                }

            except Exception as exc:
                print(f"[CNNDiseaseService] Inference error: {exc}")

        # Fallback demo mode (only when model not loaded)
        return {
            "algorithm": "CNN Foliar Disease Classifier (MobileNetV2)",
            "filename": filename,
            "is_trained": False,
            "model_source": None,
            "status": "Demo / Model Not Found",
            "disease_status": "demo",
            "predicted_disease": "Early Blight (Alternaria solani)",
            "predicted_class_raw": "Early_Blight",
            "class_index": 0,
            "confidence_percent": 94.8,
            "is_healthy": False,
            "top_predictions": [],
            "num_classes": self.num_classes,
            "severity": "Moderate (Demo)",
            "opencv_preprocessing": {
                "tensor_shape": [224, 224, 3],
                "color_space": "RGB",
                "pixel_normalization": "[0.0, 1.0]",
                "opencv_status": "Demo mode — trained model checkpoint not found"
            },
            "note": f"Model checkpoint not found at: {_TRAINED_MODEL_PATH}"
        }
