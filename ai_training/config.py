"""
Centralized Configuration for AgroAI Plant Disease Detection Model Training.

Isolated within ai_training/ - modifies no application code.
Supports both GPU (CUDA) and CPU environments seamlessly (e.g. local or Google Colab).
"""

import os
from pathlib import Path
import torch

# Base directories
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

# Data directories
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
EXTRACTED_DATA_DIR = DATA_DIR / "extracted"
MANIFESTS_DIR = DATA_DIR / "manifests"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

# Models and checkpoints
MODELS_DIR = BASE_DIR / "models"
BEST_MODEL_PATH = MODELS_DIR / "best_model.pth"
LAST_CHECKPOINT_PATH = MODELS_DIR / "last_checkpoint.pth"
CLASS_MAPPING_PATH = MODELS_DIR / "class_mapping.json"
MODEL_METADATA_PATH = MODELS_DIR / "model_metadata.json"

# Outputs and visualisations
OUTPUTS_DIR = BASE_DIR / "outputs"
PLOTS_DIR = OUTPUTS_DIR / "plots"
PREDICTIONS_DIR = OUTPUTS_DIR / "predictions"
SAMPLES_DIR = OUTPUTS_DIR / "samples"
TRAINING_HISTORY_CSV = OUTPUTS_DIR / "training_history.csv"
TRAINING_HISTORY_JSON = OUTPUTS_DIR / "training_history.json"
PER_CLASS_METRICS_CSV = OUTPUTS_DIR / "per_class_metrics.csv"
TEST_PREDICTIONS_CSV = OUTPUTS_DIR / "test_predictions.csv"
PACKAGE_MANIFEST_PATH = OUTPUTS_DIR / "model_package_manifest.json"

# Reports
REPORTS_DIR = BASE_DIR / "reports"
DATASET_REPORT_PATH = REPORTS_DIR / "dataset_report.md"
TRAINING_REPORT_PATH = REPORTS_DIR / "training_report.md"
EVALUATION_REPORT_PATH = REPORTS_DIR / "evaluation_report.md"
EVALUATION_REPORT_JSON = REPORTS_DIR / "evaluation_report.json"

# Dataset identification
KAGGLE_DATASET_OWNER = "karagwaanntreasure"
KAGGLE_DATASET_SLUG = "plant-disease-detection"
KAGGLE_DATASET_REF = f"{KAGGLE_DATASET_OWNER}/{KAGGLE_DATASET_SLUG}"
DATASET_URL = f"https://www.kaggle.com/datasets/{KAGGLE_DATASET_REF}"

# Manifest file paths
DATASET_MANIFEST_CSV = MANIFESTS_DIR / "dataset_manifest.csv"
DATASET_SPLIT_CSV = MANIFESTS_DIR / "dataset_split.csv"
TRAIN_MANIFEST_CSV = MANIFESTS_DIR / "train_manifest.csv"
VAL_MANIFEST_CSV = MANIFESTS_DIR / "validation_manifest.csv"
TEST_MANIFEST_CSV = MANIFESTS_DIR / "test_manifest.csv"
INVALID_IMAGES_CSV = MANIFESTS_DIR / "invalid_images.csv"
DUPLICATES_CSV = MANIFESTS_DIR / "duplicates.csv"
SPLIT_SUMMARY_JSON = REPORTS_DIR / "split_summary.json"
MANIFEST_CLASS_MAPPING = MANIFESTS_DIR / "class_mapping.json"

# Model architecture & image preprocessing
MODEL_NAME = "MobileNetV2"
IMAGE_SIZE = 224
NUM_CLASSES = 23
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

# Training hyperparameters
SEED = 42
BATCH_SIZE = int(os.environ.get("AGRO_BATCH_SIZE", 32))
EPOCHS = int(os.environ.get("AGRO_EPOCHS", 6))
STAGE1_EPOCHS = int(os.environ.get("AGRO_STAGE1_EPOCHS", 3))
STAGE2_EPOCHS = int(os.environ.get("AGRO_STAGE2_EPOCHS", 3))
LEARNING_RATE = float(os.environ.get("AGRO_LR", 1e-3))
FINE_TUNE_LR = float(os.environ.get("AGRO_FINE_TUNE_LR", 1e-4))
WEIGHT_DECAY = float(os.environ.get("AGRO_WEIGHT_DECAY", 1e-4))
PATIENCE = int(os.environ.get("AGRO_PATIENCE", 3))
CONFIDENCE_THRESHOLD = float(os.environ.get("AGRO_CONF_THRESH", 0.60))

# System & Hardware
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
NUM_WORKERS = int(os.environ.get("AGRO_WORKERS", 0 if os.name == "nt" else 4))

def ensure_directories():
    """Create all required workspace directories if not existing."""
    for directory in [
        RAW_DATA_DIR,
        EXTRACTED_DATA_DIR,
        MANIFESTS_DIR,
        PROCESSED_DATA_DIR,
        MODELS_DIR,
        OUTPUTS_DIR,
        PLOTS_DIR,
        PREDICTIONS_DIR,
        SAMPLES_DIR,
        REPORTS_DIR,
    ]:
        directory.mkdir(parents=True, exist_ok=True)
