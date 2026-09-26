# AgroAI Plant Disease Detection — Model Training Workspace

Isolated, reproducible deep learning training suite for the AgroAI plant disease detection model using transfer learning with MobileNetV2 on leaf images.

> **CRITICAL ARCHITECTURAL ISOLATION RULE**:  
> All files in `ai_training/` operate independently of the core AgroAI web application. No application code, frontend components, FastAPI routes, or Firebase configurations are modified.

---

## 1. Directory Structure

```text
ai_training/
├── README.md                          # Workspace documentation & operational guide
├── requirements.txt                   # Isolated Python ML dependencies
├── config.py                          # Centralized hyperparameter & path configuration
├── .env.example                       # Kaggle API credentials template (safe placeholders)
├── .gitignore                         # Protects checkpoints, datasets, and secrets
│
├── scripts/
│   ├── download_dataset.py            # Kaggle API authenticated/cached dataset downloader
│   ├── inspect_dataset.py             # Generates comprehensive dataset analysis report
│   ├── validate_images.py             # Verifies file integrity, format, dimensions
│   ├── create_splits.py               # Leakage-aware 70/15/15 stratified train/val/test split
│   ├── prepare_dataset.py             # Master dataset prep pipeline
│   ├── train.py                       # Two-stage MobileNetV2 transfer learning & fine-tuning
│   ├── evaluate.py                    # Independent held-out test evaluation & confusion matrix
│   ├── inference.py                   # Production inference service with thresholding
│   └── test_pipeline.py               # 10-point validation suite & latency benchmark
│
├── data/
│   ├── raw/                           # Original Kaggle archive (plant-disease-detection.zip)
│   ├── extracted/                     # Extracted leaf image directories (23 classes)
│   └── manifests/                     # CSV manifests (train, val, test, duplicates, class mapping)
│
├── models/
│   ├── best_model.pth                 # Production model checkpoint
│   ├── last_checkpoint.pth            # Last epoch checkpoint
│   ├── class_mapping.json             # Deterministic 23-class index mapping
│   └── model_metadata.json            # Architecture, normalization, training metadata
│
├── outputs/
│   ├── plots/                         # Training curves (loss, accuracy, F1) & confusion matrix
│   ├── predictions/                   # Itemized prediction dumps
│   ├── per_class_metrics.csv          # Per-class precision, recall, and F1 scores
│   ├── test_predictions.csv           # Detailed predictions for the test set
│   └── model_package_manifest.json    # Deployment manifest
│
├── disease_information/
│   └── schema.json                    # Clean JSON schema decoupling CNN from treatment advice
│
└── reports/
    ├── dataset_report.md              # Detailed dataset distribution & class inventory
    ├── training_report.md             # In-depth training strategy & hyperparameter documentation
    └── evaluation_report.md           # Test metrics, confusion matrix breakdown, and limitations
```

---

## 2. Environment Setup

1. **Activate Python Virtual Environment**:
   ```bash
   # Windows PowerShell
   .venv\Scripts\Activate.ps1
   ```

2. **Install Required ML Dependencies**:
   ```bash
   pip install -r ai_training/requirements.txt
   ```

---

## 3. Kaggle Dataset Setup & Security

The dataset utilized is **`karagwaanntreasure/plant-disease-detection`**, containing 35,725 leaf images across 23 classes (Apple, Corn, Pepper, Potato, Tomato).

### Security Rules:
- Never hardcode or commit Kaggle keys.
- Store credentials in `ai_training/.env`:
  ```env
  KAGGLE_USERNAME=your_kaggle_username
  KAGGLE_KEY=your_kaggle_key
  ```
- Use `ai_training/.env.example` as a template.

### Download Dataset:
```bash
python ai_training/scripts/download_dataset.py
```
*Note: If the archive already exists in `data/raw/` and has been extracted to `data/extracted/`, the script skips redundant downloads.*

---

## 4. Dataset Validation & Leakage Prevention

1. **Validate Images**:
   ```bash
   python ai_training/scripts/validate_images.py
   ```
   Checks for corrupt bytes, unsupported formats, and abnormal dimensions without mutating the source dataset.

2. **Generate Leakage-Aware Stratified Splits**:
   ```bash
   python ai_training/scripts/create_splits.py
   ```
   - Stratifies 70% Train, 15% Validation, 15% Test with `SEED = 42`.
   - Groups exact and near-duplicates using Union-Find to guarantee **0 duplicate leakage** between splits.

---

## 5. Model Architecture & Training Strategy

### Architecture
- **Backbone**: MobileNetV2 with ImageNet pretrained weights.
- **Classification Head**: Adaptive pooling -> Dropout(0.3) -> Linear(1280, 23).
- **Resolution**: 224 × 224 RGB.
- **Normalization**: ImageNet mean `[0.485, 0.456, 0.406]`, std `[0.229, 0.224, 0.225]`.

### Two-Stage Transfer Learning
1. **Stage 1 (Feature Extraction)**:
   - Backbone is completely frozen (`requires_grad = False`).
   - Classifier head is trained with `AdamW` (`lr = 1e-3`, `weight_decay = 1e-4`).
   - Scheduler: `CosineAnnealingLR`.
2. **Stage 2 (Fine-Tuning)**:
   - Lower layers remain frozen to preserve foundational edge/texture filters.
   - Upper layers (feature blocks 14 through 18) are unfrozen.
   - Trained with reduced learning rate (`lr = 1e-4`).
3. **Class Imbalance Handling**:
   - Class-weighted CrossEntropyLoss: `weight[c] = N / (C * count[c])`.

### Run Training:
```bash
python ai_training/scripts/train.py
```

---

## 6. Evaluation & Benchmarking

### Test Evaluation:
```bash
python ai_training/scripts/evaluate.py
```
Evaluates the best checkpoint (`models/best_model.pth`) strictly on the held-out test split, generating:
- `outputs/per_class_metrics.csv`
- `outputs/test_predictions.csv`
- `outputs/plots/confusion_matrix.png`
- `reports/evaluation_report.md`

### Validation & Benchmark Suite:
```bash
python ai_training/scripts/test_pipeline.py
```
Runs the 10-point test suite, measures latency and throughput, and writes `outputs/model_package_manifest.json`.

---

## 7. Inference Service

Run single-image prediction from the command line:

```bash
python ai_training/scripts/inference.py --image path/to/leaf.jpg
```

Example Output:
```text
==================================================
AGROAI LEAF DISEASE INFERENCE RESULT
==================================================
Predicted class: Tomato - Late blight
Raw class ID   : Tomato_Late_blight (Index 19)
Confidence     : 94.21%
Status         : Diseased

Top Candidates:
  1. Tomato_Late_blight (94.21%)
  2. Tomato_Early_blight (3.12%)
  3. Tomato_Septoria_leaf_spot (1.05%)
==================================================
```

### JSON Mode:
```bash
python ai_training/scripts/inference.py --image path/to/leaf.jpg --json
```

---

## 8. Agricultural Advice & Disease Treatment

The CNN model functions solely as a visual classifier. Agronomic advice, cultural practices, and chemical recommendations are intentionally decoupled from the neural network and governed by `disease_information/schema.json` to prevent fabricated pesticide claims.
