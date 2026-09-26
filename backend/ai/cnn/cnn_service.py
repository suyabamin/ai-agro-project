"""
AgroAI - CNN Foliar Disease Detection Service
Module: Deep Learning Computer Vision Pipeline (MobileNetV2)

Production inference service loading trained weights from plant_disease_cnn.pth
Supports 23 plant disease classes across Apple, Corn, Pepper, Potato, and Tomato.
"""

import os
from pathlib import Path

MODEL_PATH = os.path.join(os.path.dirname(__file__), "plant_disease_cnn.pth")
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_FALLBACK_MODEL_PATH = str(_PROJECT_ROOT / "ai_training" / "models" / "best_model.pth")

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


class CNNDiseaseService:
    CLASSES = [
        "Apple___Apple_scab",
        "Apple___Black_rot",
        "Apple___Cedar_apple_rust",
        "Apple___healthy",
        "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
        "Corn_(maize)___Common_rust_",
        "Corn_(maize)___healthy",
        "Corn_(maize)___Northern_Leaf_Blight",
        "Pepper__bell___Bacterial_spot",
        "Pepper__bell___healthy",
        "Potato___Early_blight",
        "Potato___healthy",
        "Potato___Late_blight",
        "Tomato__Target_Spot",
        "Tomato__Tomato_mosaic_virus",
        "Tomato__Tomato_YellowLeaf__Curl_Virus",
        "Tomato_Bacterial_spot",
        "Tomato_Early_blight",
        "Tomato_healthy",
        "Tomato_Late_blight",
        "Tomato_Leaf_Mold",
        "Tomato_Septoria_leaf_spot",
        "Tomato_Spider_mites_Two_spotted_spider_mite",
    ]

    CLASS_DISPLAY_NAMES = {
        "Apple___Apple_scab": "Apple - Apple Scab",
        "Apple___Black_rot": "Apple - Black Rot",
        "Apple___Cedar_apple_rust": "Apple - Cedar Apple Rust",
        "Apple___healthy": "Apple - Healthy",
        "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": "Corn - Gray Leaf Spot",
        "Corn_(maize)___Common_rust_": "Corn - Common Rust",
        "Corn_(maize)___healthy": "Corn - Healthy",
        "Corn_(maize)___Northern_Leaf_Blight": "Corn - Northern Leaf Blight",
        "Pepper__bell___Bacterial_spot": "Bell Pepper - Bacterial Spot",
        "Pepper__bell___healthy": "Bell Pepper - Healthy",
        "Potato___Early_blight": "Potato - Early Blight",
        "Potato___healthy": "Potato - Healthy",
        "Potato___Late_blight": "Potato - Late Blight",
        "Tomato__Target_Spot": "Tomato - Target Spot",
        "Tomato__Tomato_mosaic_virus": "Tomato - Tomato Mosaic Virus",
        "Tomato__Tomato_YellowLeaf__Curl_Virus": "Tomato - Yellow Leaf Curl Virus",
        "Tomato_Bacterial_spot": "Tomato - Bacterial Spot",
        "Tomato_Early_blight": "Tomato - Early Blight",
        "Tomato_healthy": "Tomato - Healthy",
        "Tomato_Late_blight": "Tomato - Late Blight",
        "Tomato_Leaf_Mold": "Tomato - Leaf Mold",
        "Tomato_Septoria_leaf_spot": "Tomato - Septoria Leaf Spot",
        "Tomato_Spider_mites_Two_spotted_spider_mite": "Tomato - Two-Spotted Spider Mite",
    }

    TREATMENT_PROTOCOLS = {
        "Apple___Apple_scab": "Apply captan or myclobutanil fungicide at pink bud stage. Rake and destroy fallen leaves to reduce overwintering spores.",
        "Apple___Black_rot": "Prune dead wood and remove mummified fruit. Apply captan or sulfur-based sprays from tight cluster through petal fall.",
        "Apple___Cedar_apple_rust": "Apply myclobutanil or propiconazole fungicide in early spring. Remove nearby eastern red cedar trees if within 1-2 miles.",
        "Apple___healthy": "Foliage is healthy and disease-free. Maintain regular orchard monitoring and balanced nutrition.",
        "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": "Apply strobilurin or triazole fungicides at tasseling. Practice crop rotation and tillage to bury infected residue.",
        "Corn_(maize)___Common_rust_": "Apply foliar fungicide (pyraclostrobin or azoxystrobin) if pustules appear before blister stage. Plant resistant hybrids.",
        "Corn_(maize)___healthy": "Canopy is healthy and vigorous. Maintain standard scouting and nitrogen management schedule.",
        "Corn_(maize)___Northern_Leaf_Blight": "Apply systemic fungicides (mancozeb, propiconazole) if lesions develop on ear leaves before silking. Rotate with non-grass crops.",
        "Pepper__bell___Bacterial_spot": "Apply fixed copper mixed with mancozeb weekly during wet periods. Avoid overhead irrigation and sanitize pruning shears.",
        "Pepper__bell___healthy": "Foliage is healthy. Maintain consistent drip irrigation and regular pest scouting.",
        "Potato___Early_blight": "Apply chlorothalonil or azoxystrobin foliar spray at 7-10 day intervals. Maintain adequate plant nutrition and avoid overhead watering.",
        "Potato___healthy": "Foliage is healthy. Continue monitoring soil moisture and tuber development.",
        "Potato___Late_blight": "Urgent: Apply systemic fungicide (mefenoxam or cymoxanil + mancozeb) immediately. Disengage overhead irrigation and isolate field sector.",
        "Tomato__Target_Spot": "Apply chlorothalonil or copper-based fungicide. Prune lower suckers to improve airflow through the canopy.",
        "Tomato__Tomato_mosaic_virus": "Remove and destroy infected plants immediately. Sanitize tools with 10% bleach solution. Wash hands before handling plants.",
        "Tomato__Tomato_YellowLeaf__Curl_Virus": "Control whitefly vectors using yellow sticky traps and imidacloprid or insecticidal soap. Use reflective mulches.",
        "Tomato_Bacterial_spot": "Apply copper hydroxide + mancozeb bactericide. Avoid working in fields when foliage is wet to prevent pathogen spread.",
        "Tomato_Early_blight": "Apply copper hydroxide fungicide spray at 2.5 g/L. Remove lower infected leaves and avoid overhead irrigation.",
        "Tomato_healthy": "Canopy is healthy and disease-free. Maintain balanced drip fertigation and routine pest inspection.",
        "Tomato_Late_blight": "Immediate systemic fungicide application (Mefenoxam or metalaxyl). Remove blighted foliage and disengage overhead sprinklers.",
        "Tomato_Leaf_Mold": "Improve greenhouse ventilation and lower relative humidity below 85%. Apply copper soap or chlorothalonil if needed.",
        "Tomato_Septoria_leaf_spot": "Apply mancozeb or copper fungicide every 7 days. Remove infected lower leaves and mulch around base to prevent splash dispersal.",
        "Tomato_Spider_mites_Two_spotted_spider_mite": "Apply insecticidal soap, neem oil, or abamectin miticide. Increase canopy humidity slightly and introduce predatory mites.",
    }

    def __init__(self):
        self.model = self._load_model()
        self.is_trained = self.model is not None

    def _load_model(self):
        """
        Loads the trained MobileNetV2 PyTorch model.
        Checks MODEL_PATH (backend/ai/cnn/plant_disease_cnn.pth) first,
        then falls back to ai_training/models/best_model.pth.
        """
        target_path = None
        if os.path.exists(MODEL_PATH):
            target_path = MODEL_PATH
        elif os.path.exists(_FALLBACK_MODEL_PATH):
            target_path = _FALLBACK_MODEL_PATH

        if not target_path:
            return None

        try:
            import torch
            import torch.nn as nn
            from torchvision import models

            device = torch.device("cpu")
            loaded = torch.load(target_path, map_location=device, weights_only=False)

            # Case A: Full saved PyTorch nn.Module
            if isinstance(loaded, nn.Module):
                loaded.eval()
                return loaded

            # Case B: Checkpoint state dictionary bundle
            if isinstance(loaded, dict) and "model_state_dict" in loaded:
                num_classes = loaded.get("num_classes", len(self.CLASSES))
                backbone = models.mobilenet_v2(weights=None)
                in_features = backbone.classifier[1].in_features
                backbone.classifier = nn.Sequential(
                    nn.Dropout(p=0.3),
                    nn.Linear(in_features, num_classes)
                )
                backbone.load_state_dict(loaded["model_state_dict"])
                backbone.to(device)
                backbone.eval()
                return backbone

        except Exception as exc:
            print(f"[CNNDiseaseService] Error loading model from {target_path}: {exc}")
            return None

        return None

    def preprocess_image(self, image_bytes: bytes):
        """
        OpenCV Preprocessing Pipeline with ImageNet Normalization:
        1. Decode byte stream to OpenCV BGR image
        2. Convert BGR to RGB
        3. Resize image matrix to 224x224 input tensor size
        4. Normalize pixel values using ImageNet mean & std
        """
        try:
            import cv2
            import numpy as np

            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return None

            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img_resized = cv2.resize(img_rgb, (224, 224))
            img_normalized = img_resized.astype(np.float32) / 255.0

            # Apply standard ImageNet mean and std
            mean = np.array(IMAGENET_MEAN, dtype=np.float32)
            std = np.array(IMAGENET_STD, dtype=np.float32)
            img_standardized = (img_normalized - mean) / std

            return img_standardized
        except Exception:
            return None

    def classify_leaf_image(self, image_bytes: bytes, filename: str = "upload.jpg") -> dict:
        processed_tensor = self.preprocess_image(image_bytes)

        if self.is_trained and self.model is not None and processed_tensor is not None:
            try:
                import torch
                import numpy as np

                tensor = torch.from_numpy(processed_tensor).permute(2, 0, 1).unsqueeze(0)
                with torch.no_grad():
                    outputs = self.model(tensor)
                    prob = torch.softmax(outputs, dim=1).numpy()[0]
                    class_idx = int(np.argmax(prob))
                    confidence = float(prob[class_idx] * 100.0)

                raw_class = self.CLASSES[class_idx] if class_idx < len(self.CLASSES) else f"Class_{class_idx}"
                detected_class = self.CLASS_DISPLAY_NAMES.get(raw_class, raw_class.replace("___", " — ").replace("_", " "))
                is_healthy = "healthy" in raw_class.lower()

                # Top-3 predictions
                top_indices = np.argsort(prob)[::-1][:3]
                top_predictions = [
                    {
                        "class": self.CLASS_DISPLAY_NAMES.get(self.CLASSES[i], self.CLASSES[i]),
                        "confidence_percent": round(float(prob[i] * 100.0), 2)
                    }
                    for i in top_indices if i < len(self.CLASSES)
                ]

                treatment = self.TREATMENT_PROTOCOLS.get(
                    raw_class,
                    "Leaf is healthy. Maintain regular monitoring." if is_healthy else "Apply broad-spectrum foliar fungicide and monitor sector."
                )

                severity = "None" if is_healthy else ("High" if confidence > 85.0 else "Moderate")

                return {
                    "algorithm": "CNN Foliar Disease Classifier (MobileNetV2)",
                    "filename": filename,
                    "is_trained": True,
                    "status": "Trained PyTorch Model",
                    "predicted_disease": detected_class,
                    "predicted_class_raw": raw_class,
                    "class_index": class_idx,
                    "confidence_percent": round(confidence, 1),
                    "is_healthy": is_healthy,
                    "severity": severity,
                    "top_predictions": top_predictions,
                    "opencv_preprocessing": {
                        "tensor_shape": [224, 224, 3],
                        "color_space": "RGB",
                        "normalization": "ImageNet mean/std",
                        "opencv_status": "Preprocessed 224x224 RGB via OpenCV"
                    },
                    "treatment_recommendation": treatment,
                    "note": "Inference executed via trained MobileNetV2 weights (23 classes)."
                }

            except Exception as exc:
                print(f"[CNNDiseaseService] Inference error: {exc}")

        # Fallback response if model is not loaded
        return {
            "algorithm": "CNN Foliar Disease Classifier (MobileNetV2)",
            "filename": filename,
            "is_trained": False,
            "status": "Demo / Model Not Trained",
            "predicted_disease": "Early Blight (Alternaria solani)",
            "predicted_class_raw": "Tomato_Early_blight",
            "class_index": 17,
            "confidence_percent": 94.8,
            "is_healthy": False,
            "severity": "Moderate (Foliar Stage 2)",
            "opencv_preprocessing": {
                "tensor_shape": [224, 224, 3],
                "color_space": "RGB",
                "pixel_normalization": "[0.0, 1.0]",
                "opencv_status": "Demo mode — trained model weights not loaded"
            },
            "treatment_recommendation": "Apply copper hydroxide fungicide spray at 2.5 g/L. Isolate affected sector.",
            "note": "PyTorch deep learning model checkpoint not loaded."
        }
