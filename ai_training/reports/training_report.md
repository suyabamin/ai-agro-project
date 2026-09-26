# AgroAI MobileNetV2 Plant Disease Classifier — Training Report

**Report Date**: 2026-09-26  
**Project**: AgroAI — Plant Disease Detection from Leaf Images  
**Workspace**: `ai_training/` (Isolated from main application)  
**Status**: COMPLETE  

---

## 1. Dataset Summary

- **Source Dataset**: `karagwaanntreasure/plant-disease-detection` on Kaggle
- **Total Dataset Size**: 35,725 verified RGB images (533.99 MB raw archive, 530.69 MB uncompressed)
- **Target Crops**: Apple, Corn (Maize), Bell Pepper, Potato, Tomato
- **Classes**: 23 classes total
  - **Healthy Classes (5)**: `Apple___healthy`, `Corn_(maize)___healthy`, `Pepper__bell___healthy`, `Potato___healthy`, `Tomato_healthy`
  - **Disease Classes (18)**: Apple scab, Apple Black rot, Apple Cedar rust, Corn Cercospora / Gray leaf spot, Corn Common rust, Corn Northern leaf blight, Pepper Bacterial spot, Potato Early blight, Potato Late blight, Tomato Target spot, Tomato Mosaic virus, Tomato Yellow leaf curl virus, Tomato Bacterial spot, Tomato Early blight, Tomato Late blight, Tomato Leaf mold, Tomato Septoria leaf spot, Tomato Spider mites.
- **Split Configuration**: Stratified 70% Train (24,997 images), 15% Validation (5,350 images), 15% Test (5,378 images).
- **Leakage Prevention**: Union-Find duplicate and perceptual near-duplicate grouping enforced prior to splitting. Duplicate groups spanning across splits: **0 (Zero data leakage)**.

---

## 2. Model Architecture

- **Backbone**: MobileNetV2 with ImageNet pretrained weights (`torchvision.models.mobilenet_v2`).
- **Input Dimensions**: 224 × 224 RGB.
- **Normalization**: Standard ImageNet channel normalization (`mean = [0.485, 0.456, 0.406]`, `std = [0.229, 0.224, 0.225]`).
- **Classification Head**:
  ```text
  AdaptiveAvgPool2d(1) -> Flatten() -> Dropout(p=0.3) -> Linear(1280, 23)
  ```
- **Total Parameters**: 2,253,335 parameters (8.83 MB checkpoint size).

---

## 3. Training Strategy & Hyperparameters

A disciplined **Two-Stage Transfer Learning** strategy was used to prevent catastrophic forgetting while adapting high-level disease visual representations:

### Stage 1: Feature Extraction (Epochs 1–3)
- Backbone layers 0–18 frozen (`requires_grad = False`).
- Only classification head trained (29,463 trainable parameters).
- **Optimizer**: AdamW (`lr = 0.001`, `weight_decay = 1e-4`).
- **LR Scheduler**: `CosineAnnealingLR` (T_max = 3, eta_min = 1e-6).
- **Loss Function**: CrossEntropyLoss with inverse class frequency weights to balance the 21x class imbalance.
- **Augmentations**: RandomResizedCrop (scale 0.85–1.0), RandomHorizontalFlip (0.5), RandomVerticalFlip (0.2), RandomRotation (15°), ColorJitter (0.15 brightness/contrast/saturation).

### Stage 2: Fine-Tuning (Epochs 4–6)
- Lower backbone layers 0–13 remain frozen to preserve low-level edge, contour, and texture representations.
- Upper backbone layers 14–18 unfrozen (1,710,807 trainable parameters).
- **Optimizer**: AdamW with reduced learning rate (`lr = 0.0001`, `weight_decay = 1e-4`).
- **LR Scheduler**: `CosineAnnealingLR`.

### Hardware Environment
- **Device**: CPU (AMD Ryzen 7 7700 8-Core, 16 Threads, 16 GB RAM).
- **Batch Size**: 32.
- **Execution Time**: ~100 seconds per epoch.

---

## 4. Training Progression

| Epoch | Stage | Train Loss | Train Acc (%) | Val Loss | Val Acc (%) | Val Macro F1 | Learning Rate | Duration |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | 1 (Head) | 2.0770 | 59.81% | 1.4460 | 77.42% | 0.7407 | 1.00e-3 | 91.8s |
| 2 | 1 (Head) | 1.1566 | 81.20% | 1.0911 | 80.93% | 0.7863 | 7.50e-4 | 91.0s |
| 3 | 1 (Head) | 0.9350 | 84.21% | 1.0215 | 82.43% | 0.8064 | 2.50e-4 | 96.6s |
| 4 | 2 (Fine-tune) | 0.5875 | 86.84% | 0.5137 | 87.08% | 0.8460 | 1.00e-4 | 101.0s |
| 5 | 2 (Fine-tune) | 0.3731 | 90.54% | 0.4183 | 89.19% | 0.8750 | 7.50e-5 | 103.7s |
| 6 | 2 (Fine-tune) | **0.3112** | **92.35%** | **0.4030** | **89.28%** | **0.8798** | 2.50e-5 | 104.9s |

*Best checkpoint automatically saved at Epoch 6 with validation Macro F1 score of **0.8798**.*

---

## 5. Actual Test Set Results (Held-Out Test Set)

Evaluated strictly on the held-out test split of **5,378 images** across all 23 classes:

| Metric | Score |
| :--- | :--- |
| **Overall Accuracy** | **89.14%** (4,794 / 5,378 correct) |
| **Macro Precision** | **0.8860** |
| **Macro Recall** | **0.8880** |
| **Macro F1 Score** | **0.8805** |
| **Weighted F1 Score** | **0.8905** |

### Per-Class Sample Results:
- `Apple___Apple_scab`: Precision 87.50%, Recall 97.03%, F1 92.02%
- `Apple___Black_rot`: Precision 90.91%, Recall 96.99%, F1 93.85%
- `Apple___Cedar_apple_rust`: Precision 97.72%, Recall 97.35%, F1 97.53%
- `Apple___healthy`: Precision 96.63%, Recall 99.01%, F1 97.80%
- `Tomato_Late_blight`: Precision 93.15%, Recall 91.15%, F1 92.14%
- `Tomato_healthy`: Precision 95.73%, Recall 98.12%, F1 96.91%

---

## 6. Benchmarking & Latency

- **Model Checkpoint Size**: 8.83 MB (`best_model.pth`)
- **CPU Inference Latency**: **7.22 ms / image** (~138.6 FPS on AMD Ryzen 7 7700)
- **Memory Footprint**: Under 150 MB RAM active during inference
- **Deployment Compatibility**: Fully ready for CPU or GPU edge deployment / server inference.

---

## 7. Model Limitations & Operational Boundaries

1. **Closed-Set Classification**: The model classifies among the 23 cataloged classes. It will not identify unrepresented crops (e.g. wheat, sugarcane) or diseases outside the 23 classes without returning low confidence.
2. **Confidence Thresholding**: Predictions with confidence below the configured threshold (`CONFIDENCE_THRESHOLD = 0.60`) are explicitly classified as `"Low confidence / uncertain"` rather than hallucinating false diagnostic certainty.
3. **Domain Shift**: Images taken under extreme lighting, shadow occlusions, or extreme camera angles outside the training distribution should be flagged for secondary review.
4. **Decoupled Treatment Advice**: The CNN outputs strictly visual disease identification. Agronomic treatments and pesticide recommendations are managed via external expert-verified schemas (`ai_training/disease_information/schema.json`) to prevent ungrounded chemical usage.
